'use strict';

/**
 * DistributedLockService — `withLock(key, ttlMs, fn)` primitive.
 *
 * Backed by the `DistributedLock` collection (see model). Designed to run
 * safely across multiple application instances without Redis or any external
 * coordination service.
 *
 * Locks self-heal: if a holder crashes, the next attempt that arrives after
 * `ttlMs` can steal the lock. Choose a TTL longer than the worst-case work
 * duration. If you need a longer-running critical section, add a heartbeat
 * (not implemented here — keep things simple).
 */

const os = require('os');
const { v4: uuidv4 } = require('uuid');
const DistributedLock = require('../models/DistributedLock');

// Stable per-process identifier so we can recognise locks we own.
const INSTANCE_ID = `${os.hostname()}:${process.pid}:${uuidv4().slice(0, 8)}`;

class DistributedLockService {
  /**
   * Try to acquire a lock. Returns true on success, false if someone else
   * holds an unexpired lock.
   *
   * @param {string} key
   * @param {number} ttlMs
   * @param {string} [holder] - override instance id (mostly for tests)
   */
  async tryAcquire(key, ttlMs, holder = INSTANCE_ID) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // First attempt: pure insert. Wins when no lock exists.
    try {
      await DistributedLock.create({
        _id: key,
        holder,
        acquired_at: now,
        expires_at: expiresAt,
      });
      return true;
    } catch (e) {
      if (e.code !== 11000) throw e;
      // Lock document exists — try to steal it iff expired.
      const res = await DistributedLock.updateOne(
        { _id: key, expires_at: { $lt: now } },
        {
          $set: {
            holder,
            acquired_at: now,
            expires_at: expiresAt,
          },
        }
      );
      return res.modifiedCount === 1;
    }
  }

  /**
   * Release a lock that this instance holds. No-op if the lock has already
   * been stolen by another holder.
   */
  async release(key, holder = INSTANCE_ID) {
    await DistributedLock.deleteOne({ _id: key, holder });
  }

  /**
   * Execute `fn` while holding the lock. Returns `null` if the lock could
   * not be acquired (someone else owns it). Otherwise returns whatever `fn`
   * returns. The lock is always released on success and on error.
   *
   * Usage:
   *   await lock.withLock('imap_poll:abc', 60_000, () => pollAccount(acc));
   *
   * @param {string} key
   * @param {number} ttlMs
   * @param {() => Promise<any>} fn
   */
  async withLock(key, ttlMs, fn) {
    const acquired = await this.tryAcquire(key, ttlMs);
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      await this.release(key).catch(err => {
        // Releasing is best-effort; the TTL will reclaim it eventually.
        console.error(`[DistributedLock] release ${key} failed:`, err.message);
      });
    }
  }

  /** Expose the instance id for logging / observability. */
  get instanceId() {
    return INSTANCE_ID;
  }
}

module.exports = new DistributedLockService();
