const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * ProcessedEmail — append-only idempotency ledger.
 *
 * Every inbound message we ever look at is recorded here keyed by
 * (mail_account, external_id). The unique index makes duplicate processing
 * impossible: a second insert raises duplicate-key and the worker bails out
 * BEFORE any LLM call is made.
 *
 * `external_id` is provider-specific:
 *   - IMAP:    UID prefixed with uidvalidity (`<uidvalidity>:<uid>`)
 *   - Gmail:   the message id from the Gmail API
 *   - Graph:   the message id from Microsoft Graph
 *   - Webhook: the RFC822 `Message-Id` header
 *
 * A TTL index expires old rows so the collection does not grow forever.
 * 90 days is more than enough to dedup retries / webhook replays.
 */
const TTL_DAYS = parseInt(process.env.PROCESSED_EMAIL_TTL_DAYS, 10) || 90;

const processedEmailSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    mail_account: { type: String, ref: 'MailAccount', required: true },
    external_id: { type: String, required: true },
    // RFC822 Message-Id — used for cross-provider dedup and loop protection.
    message_id: { type: String, default: null },
    // Outcome of processing — useful for debugging and UI dashboards.
    outcome: {
      type: String,
      enum: [
        'pending',     // recorded, not yet processed
        'processed',   // handed to the agent
        'skipped_triage', // triage said no
        'skipped_loop',   // detected as our own outbound or auto-reply
        'skipped_dup',    // dedup hit (rare — usually we error on insert)
        'failed',         // unrecoverable
      ],
      default: 'pending',
      index: true,
    },
    // Free-form context useful for ops dashboards.
    from_email: { type: String, default: null },
    subject: { type: String, default: null },
    conversation_id: { type: String, default: null },
    error: { type: String, default: null },
    processed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hard idempotency guarantee.
processedEmailSchema.index(
  { mail_account: 1, external_id: 1 },
  { unique: true }
);
// Helpful secondary lookups.
processedEmailSchema.index({ mail_account: 1, message_id: 1 });

// TTL — drop old rows after TTL_DAYS days.
processedEmailSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 }
);

module.exports = mongoose.model('ProcessedEmail', processedEmailSchema);
