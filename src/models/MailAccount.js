const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * MailAccount — a single mailbox owned by a customer that an Agent is
 * authorised to read from and reply to.
 *
 * Why this is separate from `ChannelConfig.email`:
 *   - One Agent may manage multiple mailboxes (e.g. support@, sales@).
 *   - Ingestion mode varies per mailbox (IMAP/SMTP, OAuth push, webhook).
 *   - Email-specific behaviour (triage, reply policy, signature, CC, drafts)
 *     belongs with the mailbox, not muddled into the generic channel blob.
 *
 * Multi-instance safety:
 *   - `state.poll_lock_*` columns are written through `distributedLockService`
 *     (we use the separate DistributedLock collection — fields here are kept
 *     for observability only).
 *   - Idempotency for inbound messages lives on `ProcessedEmail`.
 *   - OAuth token refresh races are protected by `withLock('oauth:<id>')`.
 *
 * All credential fields are stored encrypted. Use the helper methods on the
 * instance to read decrypted values rather than touching the fields directly.
 */

const encryption = require('../utils/encryption');

const REDACTED = '***REDACTED***';

const mailAccountSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },

    organization: {
      type: String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    project: {
      type: String,
      ref: 'Project',
      required: true,
      index: true,
    },
    agent: {
      type: String,
      ref: 'Agent',
      required: true,
      index: true,
    },

    // Friendly label shown in the UI (e.g. "Acme support inbox").
    display_name: { type: String, required: true, trim: true },

    // Provider used to ingest incoming mail. Outbound provider can differ
    // (see `send_profile`). For the IMAP-first MVP only `imap` is implemented.
    provider: {
      type: String,
      enum: ['imap', 'gmail', 'graph', 'sendgrid_inbound', 'mailgun', 'ses'],
      required: true,
    },

    // How mail arrives. Controls which background process is responsible for
    // pulling/listening for new messages.
    ingest_mode: {
      type: String,
      enum: ['imap_poll', 'oauth_push', 'webhook'],
      required: true,
    },

    // ── Credentials (all encrypted at rest) ──────────────────────────────
    credentials: {
      // IMAP for inbound — paired with `smtp` for outbound when ingest_mode='imap_poll'
      imap: {
        host: { type: String, default: null },
        port: { type: Number, default: 993 },
        secure: { type: Boolean, default: true }, // implicit TLS on connect
        username: { type: String, default: null },
        password: { type: String, default: null }, // encrypted
        mailbox: { type: String, default: 'INBOX' },
        // Folder where AI drafts are saved. Common values:
        //   Gmail:   '[Gmail]/Drafts'
        //   Outlook: 'Drafts'
        //   Generic: 'Drafts'
        drafts_folder: { type: String, default: 'Drafts' },
        // Folder where the operator's manual sent mail lives.
        // Gmail: '[Gmail]/Sent Mail'  Outlook: 'Sent Items'  Generic: 'Sent'
        sent_folder: { type: String, default: 'Sent' },
        // Use TLS even on plaintext port (STARTTLS)
        starttls: { type: Boolean, default: false },
      },
      smtp: {
        host: { type: String, default: null },
        port: { type: Number, default: 587 },
        secure: { type: Boolean, default: false }, // true for 465
        username: { type: String, default: null },
        password: { type: String, default: null }, // encrypted
      },
      // OAuth credentials used by provider-native APIs.
      oauth: {
        access_token: { type: String, default: null }, // encrypted
        refresh_token: { type: String, default: null }, // encrypted
        expires_at: { type: Date, default: null },
        scope: { type: String, default: null },
        token_type: { type: String, default: null },
      },
      // Webhook providers (SendGrid/Mailgun/SES) verify inbound calls with
      // a shared secret stored here.
      webhook: {
        signing_secret: { type: String, default: null }, // encrypted
      },
    },

    // ── Send profile — applied when composing outbound mail ─────────────
    send_profile: {
      from_email: { type: String, required: true, trim: true, lowercase: true },
      from_name: { type: String, default: null, trim: true },
      reply_to: { type: String, default: null, trim: true },
      default_cc: { type: [String], default: [] },
      default_bcc: { type: [String], default: [] },
      signature_html: { type: String, default: null },
      signature_text: { type: String, default: null },
    },

    // ── Reply policy ─────────────────────────────────────────────────────
    // Controls what happens once the agent has produced a draft reply.
    reply_policy: {
      mode: {
        type: String,
        enum: ['draft_only', 'auto_send', 'confidence_based', 'human_review'],
        default: 'draft_only',
      },
      // Used when mode='confidence_based'.
      auto_send_min_confidence: { type: Number, default: 0.85, min: 0, max: 1 },
      // When the responder confidence is below auto_send_min_confidence we
      // still want a draft created so a human can review and send.
      draft_below_confidence: { type: Boolean, default: true },
      // Intents that should always be escalated to a human regardless of mode.
      escalate_intents: { type: [String], default: [] },
      // Safety rails — refuse to send more than N replies on the same thread
      // within a 24h sliding window. Prevents auto-reply loops with broken
      // counterparts.
      max_replies_per_thread_per_day: { type: Number, default: 3, min: 1 },
    },

    // ── Triage ───────────────────────────────────────────────────────────
    // Cheap pre-filter that decides whether a given email is worth handling
    // at all. The actual classifier runs in emailTriageService — config here.
    triage: {
      enabled: { type: Boolean, default: true },
      // ISO codes — defaults to the agent's required_languages when null.
      allow_topics: { type: [String], default: [] }, // empty = allow all
      deny_topics: { type: [String], default: ['spam', 'newsletter', 'bounce'] },
      allow_domains: { type: [String], default: [] }, // empty = allow all
      deny_domains: { type: [String], default: [] },
      allow_senders: { type: [String], default: [] }, // exact match emails
      deny_senders: { type: [String], default: [] },
      // Optional steering prompt passed to the classifier LLM.
      custom_prompt: { type: String, default: null },
      // Inbound classification confidence required before processing.
      min_confidence_to_process: {
        type: Number,
        default: 0.6,
        min: 0,
        max: 1,
      },
    },

    // ── Polling configuration (only used when ingest_mode='imap_poll') ──
    poll_config: {
      interval_seconds: { type: Number, default: 60, min: 15 },
      // Maximum messages to fetch in a single poll cycle. Prevents a backlog
      // from melting the worker.
      max_messages_per_cycle: { type: Number, default: 50, min: 1, max: 500 },
      // Initial back-fill window when first connecting. Older messages are
      // skipped (we still ingest replies to them via threading on UID > N).
      initial_lookback_hours: { type: Number, default: 0, min: 0 },
    },

    // ── Runtime state ────────────────────────────────────────────────────
    state: {
      // Highest UID seen in the last successful poll cycle (IMAP).
      last_uid: { type: Number, default: 0 },
      // Same watermark for the SENT folder (operator-manual-reply capture).
      sent_last_uid: { type: Number, default: 0 },
      // Gmail History API cursor and watch lifecycle. History IDs are strings
      // because they can exceed JavaScript's safe integer range.
      gmail_history_id: { type: String, default: null },
      gmail_watch_expiration: { type: Date, default: null },
      gmail_last_synced_at: { type: Date, default: null },
      gmail_last_watch_error: { type: String, default: null },
      // IMAP UIDVALIDITY — if this changes the mailbox was reset and we
      // must drop our cached `last_uid` and reseed.
      uid_validity: { type: Number, default: null },
      last_polled_at: { type: Date, default: null },
      last_event_at: { type: Date, default: null },
      last_error: { type: String, default: null },
      last_error_at: { type: Date, default: null },
      consecutive_failures: { type: Number, default: 0 },
    },

    // Operational flags.
    is_active: { type: Boolean, default: true, index: true },
    // Pause polling/sending without deleting the account.
    is_paused: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Each (agent, from_email) pair must be unique — avoids two configs fighting
// over the same mailbox.
mailAccountSchema.index({ agent: 1, 'send_profile.from_email': 1 }, { unique: true });

// Convenient sweep for the IMAP scheduler.
mailAccountSchema.index({ provider: 1, ingest_mode: 1, is_active: 1, is_paused: 1 });

// ─── Encrypt sensitive fields on save ───────────────────────────────────
mailAccountSchema.pre('save', function preSave(next) {
  try {
    const encryptIfNeeded = value => {
      if (!value || typeof value !== 'string') return value;
      return encryption.isEncrypted(value) ? value : encryption.encrypt(value);
    };

    if (this.credentials?.imap?.password) {
      this.credentials.imap.password = encryptIfNeeded(
        this.credentials.imap.password
      );
    }
    if (this.credentials?.smtp?.password) {
      this.credentials.smtp.password = encryptIfNeeded(
        this.credentials.smtp.password
      );
    }
    if (this.credentials?.oauth?.access_token) {
      this.credentials.oauth.access_token = encryptIfNeeded(
        this.credentials.oauth.access_token
      );
    }
    if (this.credentials?.oauth?.refresh_token) {
      this.credentials.oauth.refresh_token = encryptIfNeeded(
        this.credentials.oauth.refresh_token
      );
    }
    if (this.credentials?.webhook?.signing_secret) {
      this.credentials.webhook.signing_secret = encryptIfNeeded(
        this.credentials.webhook.signing_secret
      );
    }
    next();
  } catch (e) {
    next(e);
  }
});

/**
 * Return decrypted credentials. The returned object is a shallow clone with
 * cleartext values — never persist it back to Mongo.
 */
mailAccountSchema.methods.getDecryptedCredentials = function getDecryptedCredentials() {
  const safe = data =>
    data && encryption.isEncrypted(data) ? encryption.decrypt(data) : data;
  return {
    imap: {
      ...(this.credentials?.imap?.toObject?.() || this.credentials?.imap || {}),
      password: safe(this.credentials?.imap?.password),
    },
    smtp: {
      ...(this.credentials?.smtp?.toObject?.() || this.credentials?.smtp || {}),
      password: safe(this.credentials?.smtp?.password),
    },
    oauth: {
      ...(this.credentials?.oauth?.toObject?.() || this.credentials?.oauth || {}),
      access_token: safe(this.credentials?.oauth?.access_token),
      refresh_token: safe(this.credentials?.oauth?.refresh_token),
    },
    webhook: {
      ...(this.credentials?.webhook?.toObject?.() ||
        this.credentials?.webhook ||
        {}),
      signing_secret: safe(this.credentials?.webhook?.signing_secret),
    },
  };
};

/** Redact secrets when serialising for API responses. */
mailAccountSchema.set('toJSON', {
  transform(_, ret) {
    if (ret.credentials?.imap?.password) ret.credentials.imap.password = REDACTED;
    if (ret.credentials?.smtp?.password) ret.credentials.smtp.password = REDACTED;
    if (ret.credentials?.oauth?.access_token)
      ret.credentials.oauth.access_token = REDACTED;
    if (ret.credentials?.oauth?.refresh_token)
      ret.credentials.oauth.refresh_token = REDACTED;
    if (ret.credentials?.webhook?.signing_secret)
      ret.credentials.webhook.signing_secret = REDACTED;
    return ret;
  },
});

module.exports = mongoose.model('MailAccount', mailAccountSchema);
