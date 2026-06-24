const mongoose = require('mongoose');

/**
 * DistributedLock — TTL-based mutex keyed by an arbitrary string.
 *
 * Each lock is a single document keyed on the lock name. Acquisition is
 * an atomic upsert that succeeds only when the existing lock is either
 * absent or expired (`expires_at < now`). Locks self-heal: if the holder
 * crashes, the next caller can steal the lock once the TTL elapses.
 */
const distributedLockSchema = new mongoose.Schema(
  {
    // The lock key, e.g. "imap_poll:<accountId>" or "cron:renew_watches".
    _id: { type: String },
    holder: { type: String, required: true },
    acquired_at: { type: Date, required: true },
    expires_at: { type: Date, required: true },
  },
  { timestamps: false }
);

// Used by lock acquisition / reaping logic.
distributedLockSchema.index({ expires_at: 1 });

module.exports = mongoose.model('DistributedLock', distributedLockSchema);
