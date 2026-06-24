'use strict';

/**
 * JobQueueService — enqueue/claim/worker primitives over the `JobQueue`
 * MongoDB collection. See models/JobQueue.js for schema details.
 *
 * Multi-instance safe: every claim is an atomic `findOneAndUpdate`, so any
 * number of replicas can call `runWorker` for the same queue and each job
 * will be processed by exactly one worker.
 */

const JobQueue = require('../models/JobQueue');
const lockService = require('./distributedLockService');

// How long a worker may hold a job before it is considered crashed and
// becomes eligible for stealing. Tune per-queue if needed (most workloads
// finish within seconds — 5 minutes is a generous safety net).
const DEFAULT_CLAIM_TTL_MS = 5 * 60 * 1000;

// Default poll interval when no jobs are immediately available. Kept short
// because the cost of one indexed Mongo query is negligible.
const DEFAULT_POLL_INTERVAL_MS = 2000;

class JobQueueService {
  constructor() {
    this.workers = new Map(); // queueName → { stop }
  }

  /**
   * Enqueue a new job. If `dedupKey` is provided and a job with the same
   * (queue, dedupKey) already exists, the call is silently ignored and `null`
   * is returned — perfect for retried webhook deliveries.
   *
   * @param {string} queue
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.dedupKey]
   * @param {number} [opts.delayMs]
   * @param {number} [opts.maxAttempts]
   * @param {Object} [opts.context]   - free-form context for observability
   */
  async enqueue(queue, payload, opts = {}) {
    const {
      dedupKey = null,
      delayMs = 0,
      maxAttempts = 5,
      context = {},
    } = opts;

    try {
      const job = await JobQueue.create({
        queue,
        payload,
        dedup_key: dedupKey,
        state: 'pending',
        available_at: new Date(Date.now() + delayMs),
        max_attempts: maxAttempts,
        context,
      });
      return job;
    } catch (e) {
      if (e.code === 11000) {
        // Already enqueued with the same dedup_key — that's fine.
        return null;
      }
      throw e;
    }
  }

  /**
   * Atomically claim the next runnable job for `queue`, returning `null` if
   * none is available. Selects:
   *   - pending jobs whose `available_at` has elapsed
   *   - OR processing jobs whose `claimed_at` is older than `claimTtlMs`
   *     (recovery for crashed workers)
   */
  async claimNext(queue, claimTtlMs = DEFAULT_CLAIM_TTL_MS) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - claimTtlMs);

    return JobQueue.findOneAndUpdate(
      {
        queue,
        $or: [
          { state: 'pending', available_at: { $lte: now } },
          { state: 'processing', claimed_at: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          state: 'processing',
          claimed_by: lockService.instanceId,
          claimed_at: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { available_at: 1 }, new: true }
    );
  }

  /** Mark a job as completed. */
  async complete(jobId) {
    await JobQueue.updateOne(
      { _id: jobId },
      { $set: { state: 'done', completed_at: new Date(), last_error: null } }
    );
  }

  /**
   * Mark a job as failed. If `attempts < max_attempts` the job is requeued
   * with an exponential backoff. Otherwise it transitions to `failed`.
   */
  async fail(job, error) {
    const errMsg = (error && error.message) || String(error);
    const shouldRetry = job.attempts < job.max_attempts;

    if (shouldRetry) {
      const delayMs = Math.min(
        2000 * Math.pow(2, job.attempts),
        30 * 60 * 1000
      );
      await JobQueue.updateOne(
        { _id: job._id },
        {
          $set: {
            state: 'pending',
            available_at: new Date(Date.now() + delayMs),
            claimed_by: null,
            claimed_at: null,
            last_error: errMsg,
          },
        }
      );
    } else {
      await JobQueue.updateOne(
        { _id: job._id },
        { $set: { state: 'failed', last_error: errMsg } }
      );
    }
  }

  /**
   * Start a worker loop that processes jobs from `queue`. Returns a handle
   * with `stop()` to gracefully shut down the loop (waits for the current
   * iteration to finish).
   *
   * Call this once per process per queue. Multiple instances may call it for
   * the same queue — they will share the work.
   *
   * @param {string}   queue
   * @param {(payload: any, job: any) => Promise<void>} handler
   * @param {Object}   [opts]
   * @param {number}   [opts.pollIntervalMs]
   * @param {number}   [opts.claimTtlMs]
   * @param {number}   [opts.concurrency]   - max jobs in-flight per process
   */
  runWorker(queue, handler, opts = {}) {
    if (this.workers.has(queue)) {
      console.warn(`[JobQueue] Worker for "${queue}" already running.`);
      return this.workers.get(queue);
    }

    const {
      pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
      claimTtlMs = DEFAULT_CLAIM_TTL_MS,
      concurrency = 1,
    } = opts;

    let stopped = false;
    let inFlight = 0;
    let activeLoops = 0;

    const tick = async () => {
      activeLoops++;
      try {
        while (!stopped) {
          if (inFlight >= concurrency) {
            await sleep(pollIntervalMs);
            continue;
          }
          const job = await this.claimNext(queue, claimTtlMs).catch(err => {
            console.error(`[JobQueue:${queue}] claim error:`, err.message);
            return null;
          });
          if (!job) {
            await sleep(pollIntervalMs);
            continue;
          }

          inFlight++;
          // Fire-and-track so concurrency > 1 can pipeline.
          this._runOne(queue, job, handler).finally(() => {
            inFlight--;
          });
        }
      } finally {
        activeLoops--;
      }
    };

    // Spawn one tick loop. With concurrency > 1 the single loop schedules
    // multiple parallel handlers (it only blocks when inFlight hits the cap).
    tick().catch(err =>
      console.error(`[JobQueue:${queue}] worker loop crashed:`, err)
    );

    const handle = {
      queue,
      async stop() {
        stopped = true;
        // Wait for in-flight jobs to drain (best effort, capped).
        const deadline = Date.now() + 30_000;
        while ((inFlight > 0 || activeLoops > 0) && Date.now() < deadline) {
          await sleep(200);
        }
      },
    };

    this.workers.set(queue, handle);
    console.log(
      `[JobQueue] Worker started: queue="${queue}" concurrency=${concurrency} instance=${lockService.instanceId}`
    );
    return handle;
  }

  async _runOne(queue, job, handler) {
    try {
      await handler(job.payload, job);
      await this.complete(job._id);
    } catch (err) {
      console.error(
        `[JobQueue:${queue}] job ${job._id} failed (attempt ${job.attempts}/${job.max_attempts}):`,
        err.message
      );
      await this.fail(job, err).catch(e =>
        console.error(`[JobQueue:${queue}] fail() error:`, e.message)
      );
    }
  }

  /**
   * Stop all workers spawned by this process. Useful for graceful shutdown.
   */
  async stopAll() {
    await Promise.all(
      Array.from(this.workers.values()).map(w => w.stop().catch(() => {}))
    );
    this.workers.clear();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = new JobQueueService();
