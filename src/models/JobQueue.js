const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * JobQueue — a MongoDB-backed distributed job queue.
 *
 * Jobs are claimed via atomic `findOneAndUpdate`, so multiple application
 * instances can safely pull from the same queue without coordination.
 *
 * The queue supports:
 *   - delayed execution (`available_at`)
 *   - idempotent enqueue (`dedup_key` unique per queue)
 *   - exponential backoff on failure
 *   - automatic recovery of jobs whose worker crashed
 *     (stale `claimed_at` is treated as expired)
 */
const jobQueueSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    queue: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Optional idempotency key. Combined with `queue` it is unique.
    dedup_key: { type: String, default: null },
    state: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    // Earliest time this job becomes eligible to run.
    available_at: { type: Date, default: () => new Date() },
    // Worker instance that currently holds the job.
    claimed_by: { type: String, default: null },
    claimed_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    max_attempts: { type: Number, default: 5 },
    last_error: { type: String, default: null },
    // Free-form context for observability (e.g. account_id, message_id)
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Composite index used by the claim query: pending jobs ordered by availability.
jobQueueSchema.index({ queue: 1, state: 1, available_at: 1 });

// Dedup: same (queue, dedup_key) cannot exist twice.
// Sparse so jobs without a dedup_key do not collide with each other.
jobQueueSchema.index(
  { queue: 1, dedup_key: 1 },
  { unique: true, partialFilterExpression: { dedup_key: { $type: 'string' } } }
);

// Recovery query: find stale processing jobs.
jobQueueSchema.index({ state: 1, claimed_at: 1 });

module.exports = mongoose.model('JobQueue', jobQueueSchema);
