const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * OutboundEmail — every reply (auto-sent OR draft) lives here.
 *
 * Why a dedicated model instead of just sending and forgetting:
 *   - State machine (`queued → sending → sent | failed | drafted`) lets a
 *     worker safely retry without double-sending. The state transition is
 *     done by an atomic `findOneAndUpdate` so multi-instance is safe.
 *   - UI needs to surface drafts for human approval.
 *   - Per-thread rate limit (`max_replies_per_thread_per_day`) is computed
 *     by counting sent rows here.
 *   - Stamping our own `Message-Id` before send means a retried delivery
 *     gets deduped by the recipient's MTA.
 */
const outboundEmailSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    mail_account: { type: String, ref: 'MailAccount', required: true, index: true },
    agent: { type: String, ref: 'Agent', required: true, index: true },
    conversation: { type: String, ref: 'Conversation', default: null, index: true },

    // Recipients
    to: { type: [String], required: true },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },

    // Composed content (rendered, signature already merged in)
    from_email: { type: String, required: true },
    from_name: { type: String, default: null },
    reply_to: { type: String, default: null },
    subject: { type: String, default: '' },
    text: { type: String, default: '' },
    html: { type: String, default: null },

    // Threading headers
    message_id: { type: String, required: true, unique: true }, // self-stamped
    in_reply_to: { type: String, default: null },
    references: { type: [String], default: [] },

    // State machine
    state: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'failed', 'drafted', 'cancelled'],
      default: 'queued',
      index: true,
    },
    // Why this row was produced (audit trail).
    reason: {
      type: String,
      enum: ['auto_send', 'draft_only', 'low_confidence', 'human_review', 'escalated', 'manual'],
      default: 'auto_send',
    },
    confidence: { type: Number, default: null, min: 0, max: 1 },

    // Concurrency control
    claimed_by: { type: String, default: null },
    claimed_at: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    max_attempts: { type: Number, default: 3 },
    last_error: { type: String, default: null },

    // Outcome
    provider_message_id: { type: String, default: null },
    provider_draft_id: { type: String, default: null },
    provider_thread_id: { type: String, default: null },
    sent_at: { type: Date, default: null },
    // UID of the IMAP APPEND'd draft in the remote Drafts folder.
    // null until we successfully append; set so we never double-append on retry.
    imap_draft_uid: { type: Number, default: null },

    // Free-form for observability (triage decision, planner output, etc.)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Per-thread, per-day count for the rate-limit guard.
outboundEmailSchema.index({ mail_account: 1, in_reply_to: 1, createdAt: -1 });
// Workers claim by state + age.
outboundEmailSchema.index({ state: 1, claimed_at: 1 });

module.exports = mongoose.model('OutboundEmail', outboundEmailSchema);
