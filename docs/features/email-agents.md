# Email Agents

Run an LLM-powered agent against a real mailbox: pull messages over IMAP,
let the agent reason about them, and send replies or queue drafts for
human review — all multi-instance safe with **no Redis required** (Mongo
is the coordination substrate).

This guide walks you from zero to a working email bot.

---

## 1. How it fits together

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ IMAP Poller  │ ─▶ │ email.ingest    │ ─▶ │ Ingest Worker    │
│ (scheduler)  │    │ Mongo job queue │    │ → triage         │
└──────────────┘    └─────────────────┘    │ → agent reason   │
                                            │ → outbound row   │
                                            └────────┬─────────┘
                                                     │
                                            ┌────────▼─────────┐
                                            │ Outbound Worker  │
                                            │ (claims queued)  │ ─▶ SMTP
                                            └──────────────────┘
```

Key components (all live in `src/services/email/`):

| Piece                            | Purpose                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pollers/imapPollerScheduler.js` | Per-replica ticker that picks accounts due for polling.                                                                                   |
| `pollers/imapPoller.js`          | Connects to one mailbox, finds new UIDs, enqueues raw RFC822 onto the `email.ingest` queue.                                               |
| `workers/ingestWorker.js`        | Drains `email.ingest`: parses MIME, runs triage, hands off to the agent orchestrator.                                                     |
| `emailAgentService.js`           | Resolves/creates a `Conversation`, calls `agentService.executeAgentReasoning`, writes an `OutboundEmail` row (`drafted` or `queued`).     |
| `emailTriageService.js`          | Deterministic guards (loop headers, list-unsubscribe, auto-submitted, etc.) + LLM in-scope classifier.                                    |
| `workers/outboundWorker.js`      | Atomically claims `state='queued'` rows, sends via SMTP, marks `sent`. A reaper requeues stale `sending` claims.                          |
| `transports/smtpTransport.js`    | Nodemailer wrapper. Stamps `X-LLMCrafter-Agent` / `X-LLMCrafter-Outbound-Id` headers and self-generates `Message-Id` for clean threading. |

Coordination primitives (`src/services/`):

- `distributedLockService.js` — TTL mutex backed by `DistributedLock` collection.
- `jobQueueService.js` — atomic `findOneAndUpdate` claim against `JobQueue`.

Both are pure Mongo. **No Redis. No SQS. No external broker.**

---

## 2. Environment configuration

The pipeline is opt-in. Add to your `.env`:

```bash
# Master switch — must be 'true' for any email worker to run
EMAIL_PIPELINE_ENABLED=true

# Sub-toggles (default to value of EMAIL_PIPELINE_ENABLED if unset)
EMAIL_INGEST_WORKER_ENABLED=true
EMAIL_OUTBOUND_WORKER_ENABLED=true
EMAIL_IMAP_SCHEDULER_ENABLED=true

# Concurrency knobs
EMAIL_INGEST_CONCURRENCY=3
EMAIL_OUTBOUND_CONCURRENCY=1

# Required for storing IMAP/SMTP credentials at rest
ENCRYPTION_KEY=<at least 32 chars>
```

### Single-instance deployment

Set all four toggles to `true` on the single replica. Done.

### Multi-instance deployment

Set all four toggles to `true` on **every** replica. Locks ensure exactly-once
per account / per outbound row regardless of how many replicas you run.

For very large fleets you can split workloads:

| Replica group | EMAIL_IMAP_SCHEDULER_ENABLED | EMAIL_INGEST_WORKER_ENABLED | EMAIL_OUTBOUND_WORKER_ENABLED |
| ------------- | ---------------------------- | --------------------------- | ----------------------------- |
| Web/API only  | `false`                      | `false`                     | `false`                       |
| Worker pool   | `true`                       | `true`                      | `true`                        |

The REST endpoints work on any replica regardless of toggles — they just
write to Mongo.

---

## 3. The provider preset cheat sheet

These are the values you'll put into the `credentials.imap` and
`credentials.smtp` objects.

### Gmail / Google Workspace

> Requires an [App Password](https://myaccount.google.com/apppasswords) with 2-Step Verification enabled, **or** OAuth (not covered in this MVP).

```json
{
  "imap": {
    "host": "imap.gmail.com",
    "port": 993,
    "secure": true,
    "username": "you@example.com",
    "password": "<16-char app password>",
    "mailbox": "INBOX"
  },
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 465,
    "secure": true,
    "username": "you@example.com",
    "password": "<16-char app password>"
  }
}
```

### Microsoft 365 / Outlook.com

> Requires "Authenticated SMTP" enabled and an [app password](https://account.microsoft.com/security) (or OAuth — not covered here).

```json
{
  "imap": {
    "host": "outlook.office365.com",
    "port": 993,
    "secure": true,
    "username": "you@yourdomain.com",
    "password": "<app password>",
    "mailbox": "INBOX"
  },
  "smtp": {
    "host": "smtp.office365.com",
    "port": 587,
    "secure": false,
    "requireTLS": true,
    "username": "you@yourdomain.com",
    "password": "<app password>"
  }
}
```

### Yahoo Mail

```json
{
  "imap": {
    "host": "imap.mail.yahoo.com",
    "port": 993,
    "secure": true,
    "...": "..."
  },
  "smtp": {
    "host": "smtp.mail.yahoo.com",
    "port": 465,
    "secure": true,
    "...": "..."
  }
}
```

### Generic IMAP/SMTP

Anything else — Fastmail, Zoho, ProtonMail Bridge, self-hosted Dovecot —
plug in the values your provider gave you.

---

## 4. Step-by-step: build an email bot

> **Auth**: every endpoint below requires a Bearer JWT from `/api/v1/auth/login`.
> **Scope**: replace `{orgId}` / `{projectId}` / `{agentId}` with your IDs.

### Step 1 — Create (or reuse) an Agent

You need an agent in your org/project with `type: chatbot`. If you don't
have one, follow the existing
[Getting Started → Create Agent](getting-started.md) flow. Capture its
`_id` — you'll need it as `{agentId}`.

The agent's `system_prompt`, tools, RAG config, etc. are reused as-is.
The email pipeline calls `agentService.executeAgentReasoning(agent, conv, …)`
unchanged.

### Step 2 — POST a MailAccount

`POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts`

```json
{
  "display_name": "Support inbox (Gmail)",
  "provider": "imap",
  "ingest_mode": "imap_poll",

  "credentials": {
    "imap": {
      "host": "imap.gmail.com",
      "port": 993,
      "secure": true,
      "username": "support@example.com",
      "password": "abcd efgh ijkl mnop",
      "mailbox": "INBOX"
    },
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 465,
      "secure": true,
      "username": "support@example.com",
      "password": "abcd efgh ijkl mnop"
    }
  },

  "send_profile": {
    "from_email": "support@example.com",
    "from_name": "Acme Support",
    "reply_to": "support@example.com",
    "default_cc": ["sales@example.com"],
    "default_bcc": [],
    "signature_html": "<p>—<br/>Acme Support<br/><a href=\"https://example.com\">example.com</a></p>",
    "signature_text": "--\nAcme Support\nhttps://example.com"
  },

  "reply_policy": {
    "mode": "draft_only",
    "auto_send_min_confidence": 0.85,
    "escalate_intents": ["billing", "legal", "cancel"],
    "max_replies_per_thread_per_day": 5
  },

  "triage": {
    "allow_topics": ["support", "product", "account"],
    "deny_topics": ["spam", "marketing", "unsubscribe"],
    "min_confidence_to_process": 0.5,
    "custom_prompt": "Only handle inbound questions about the Acme product. Skip newsletters and sales pitches."
  },

  "poll_config": {
    "interval_seconds": 60,
    "max_messages_per_cycle": 25,
    "initial_lookback_hours": 24
  },

  "is_active": true,
  "is_paused": false
}
```

**Always start with `reply_policy.mode = "draft_only"`** so you can review
every generated reply before it goes out. Promote to `auto_send` or
`confidence_based` once you're satisfied.

The response redacts every encrypted field — IMAP/SMTP passwords, OAuth
tokens, webhook secrets all come back as `"<encrypted>"`.

The configured signatures are materialized when a draft is created. The
complete editable body is stored in `OutboundEmail.text` with
`signature_text` and in `OutboundEmail.html` with `signature_html`; sending
does not append the signature again. Existing drafts therefore keep their
own copy and can be edited independently of later `send_profile` changes.

### Step 3 — Verify the credentials

`POST /…/mail-accounts/{accountId}/test`

```json
{
  "ok": true,
  "results": {
    "imap": {
      "ok": true,
      "mailbox": "INBOX",
      "messages": 12345,
      "uidValidity": 7,
      "uidNext": 12346
    },
    "smtp": { "ok": true }
  }
}
```

If `imap.ok` or `smtp.ok` is `false`, check the `error` string. Common ones:

- `Invalid credentials` — wrong app password, or 2FA not enabled.
- `Connection timed out` — host/port wrong, or firewall blocking outbound.
- `STARTTLS required` — set `secure: false` on port 587 and provider will auto-upgrade.

### Step 4 — Wait for the first poll (or trigger it)

The scheduler tick runs every ~15s. Once `last_polled_at + interval_seconds`
is in the past, it picks the account up. To go faster, call:

`POST /…/mail-accounts/{accountId}/poll`

```json
{
  "ok": true,
  "result": { "enqueued": 3, "uid_range": "12346:*", "last_uid": 12348 }
}
```

This runs inside the same lock the scheduler uses, so it won't race.

> **First poll behaviour**: `initial_lookback_hours` decides how far back
> we sweep on a fresh account. Default 24h. If you set it to 0, only
> messages arriving _after_ the account is created are picked up.

### Step 5 — Inspect the queue and drafts

`GET /…/mail-accounts/{accountId}/processed` — see what came in, what triage decided:

```json
{
  "items": [
    { "external_id": "7:12346", "outcome": "drafted", "subject": "Question about pricing", ... },
    { "external_id": "7:12347", "outcome": "filtered_out_of_scope", "subject": "Black Friday sale!", ... }
  ]
}
```

`GET /…/mail-accounts/{accountId}/outbound?state=drafted` — see the AI's drafted replies:

```json
{
  "items": [
    {
      "_id": "abc...",
      "state": "drafted",
      "subject": "Re: Question about pricing",
      "to": [{ "address": "alice@customer.com", "name": "Alice" }],
      "cc": [{ "address": "sales@example.com" }],
      "html": "<p>Hi Alice, ...</p>",
      "text": "Hi Alice, ...",
      "in_reply_to": "<...>",
      "references": ["<...>"],
      "confidence": 0.72,
      "reason": "draft_only",
      "createdAt": "2025-..."
    }
  ]
}
```

The corresponding assistant entry in `conversation.messages` exposes the
same complete draft. Use `content` for signed plain text and
`channel_info.email.body_html` for signed HTML so the frontend can display
and edit the signature before sending.

### Step 6 — Edit & send a draft

Edit only the content (subject/text/html/cc/bcc — addressing & threading are locked):

`PUT /…/mail-accounts/{accountId}/outbound/{outboundId}`

```json
{
  "text": "Hi Alice, here are the prices we discussed: ...",
  "html": "<p>Hi Alice, here are the prices we discussed: ...</p>",
  "cc": [{ "address": "manager@example.com" }]
}
```

For rich-text editors, submit both `text` and `html`. The draft record,
provider-native draft, and matching conversation message are updated with
those exact values; no account-level signature is appended during update or
send.

Approve & send:

`POST /…/mail-accounts/{accountId}/outbound/{outboundId}/send`

This flips state `drafted → queued` atomically (`findOneAndUpdate({state:'drafted'})`),
so two simultaneous "Send" clicks can't both succeed. The outbound worker
on any replica claims it on its next poll, calls SMTP, and marks `sent`.

Cancel a draft (drafted or queued only):

`POST /…/mail-accounts/{accountId}/outbound/{outboundId}/cancel`

Retry a failed send (only allowed when `state='failed'`):

`POST /…/mail-accounts/{accountId}/outbound/{outboundId}/retry`

### Step 7 — Graduate to auto-send (when ready)

Update the mail account once you trust the agent on this inbox:

`PUT /…/mail-accounts/{accountId}`

```json
{
  "reply_policy": {
    "mode": "confidence_based",
    "auto_send_min_confidence": 0.85,
    "escalate_intents": ["billing", "legal", "cancel"]
  }
}
```

Modes:

| Mode               | Behaviour                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft_only`       | Every reply becomes a `drafted` row. Nothing is sent automatically.                                                                                  |
| `auto_send`        | Every reply is `queued` immediately and SMTP-sent.                                                                                                   |
| `confidence_based` | If triage `confidence ≥ auto_send_min_confidence` and the detected intent is not in `escalate_intents`, the reply is queued. Otherwise it's drafted. |
| `human_review`     | Same shape as `draft_only`, but the metadata is tagged so a UI can route it to a reviewer queue.                                                     |

`escalate_intents` always wins. If triage labels an email as `billing` and
you've listed `billing` in `escalate_intents`, the reply is drafted even
in `auto_send` mode.

---

## 5. Lifecycle controls

```
POST /…/mail-accounts/{accountId}/pause     → stops polling, keeps row
POST /…/mail-accounts/{accountId}/resume    → unpauses
DELETE /…/mail-accounts/{accountId}         → permanent
PUT /…/mail-accounts/{accountId}            → patch any field; credentials too
```

`is_active=false` disables the account entirely (won't appear in scheduler
queries). `is_paused=true` keeps it listed but skipped — better when you
expect to flip it back on soon.

---

## 6. How threading works

Every outbound row stamps:

- A self-generated `Message-Id` of the form `<{uuid}@{your-from-domain}>`. We
  generate it before sending so we can recognise our own replies if they
  ever loop back through the mailbox.
- `In-Reply-To`: copied from the inbound message's `Message-Id`.
- `References`: the inbound's `References` chain plus the inbound's
  `Message-Id`.

When an inbound arrives we compute `thread_id` as:

```
thread_id = references[0] || in_reply_to || message_id
```

and `Conversation.channel_metadata.email.thread_id` is keyed off this.
The orchestrator uses atomic `findOneAndUpdate({upsert:true})` so even if
two ingest workers race on the same thread, only one Conversation is created.

---

## 7. Loop protection

Every outbound message includes:

```
X-LLMCrafter-Agent: <agentId>
X-LLMCrafter-Outbound-Id: <outboundEmailId>
```

`emailTriageService` rejects any inbound whose `X-LLMCrafter-Agent` header
matches **this** agent's id — eliminating the classic "bot replies to its
own auto-reply" loop. It also short-circuits on:

- `Auto-Submitted` header (RFC 3834: `auto-replied`, `auto-generated`)
- `List-Id` / `List-Unsubscribe` (mailing lists)
- `Precedence: bulk | list | junk`
- From-address local-parts `mailer-daemon`, `postmaster`, `no-reply`,
  `noreply`, `do-not-reply`
- Inbound where `From` == the account's own `send_profile.from_email`

When all guards pass it runs the LLM classifier (cheapest model per
provider — `gpt-5.1-nano`, `claude-3-5-haiku`, `gemini-2.0-flash`, etc.)
with a structured-output schema returning `{in_scope, topic, intent,
confidence, reasons}`. Failure fails closed (= dropped, not replied to).

---

## 8. Triage tuning

Inside `triage`:

- `allow_topics` — whitelist. If non-empty, only matching topics proceed.
- `deny_topics` — blacklist. Wins over `allow_topics` if both match.
- `min_confidence_to_process` — drop if classifier confidence is below this.
- `custom_prompt` — appended to the classifier's system prompt; use it to
  describe what this inbox is for in plain English.

Example for a sales inbox:

```json
{
  "allow_topics": ["sales", "pricing", "demo", "trial"],
  "deny_topics": ["support", "bug", "refund"],
  "min_confidence_to_process": 0.6,
  "custom_prompt": "Only respond to genuine sales enquiries. Route support tickets and refund requests away."
}
```

---

## 9. Rate limiting per thread

`reply_policy.max_replies_per_thread_per_day` caps how many times the bot
will respond to the same thread in a 24h window. Counted via:

```js
OutboundEmail.countDocuments({
  mail_account: account._id,
  in_reply_to: <thread message-id>,
  createdAt: { $gte: now - 24h }
})
```

Hitting the cap converts the reply into a `drafted` row with
`reason: 'human_review'`.

---

## 10. Observability

| Field                                | Where               | Meaning                                                          |
| ------------------------------------ | ------------------- | ---------------------------------------------------------------- |
| `state.last_uid`                     | `MailAccount.state` | Highest IMAP UID we've processed.                                |
| `state.uid_validity`                 | `MailAccount.state` | UIDVALIDITY snapshot. If it rotates we re-anchor on next poll.   |
| `state.last_polled_at`               | `MailAccount.state` | Last successful tick.                                            |
| `state.consecutive_failures`         | `MailAccount.state` | Increments on poll errors.                                       |
| `JobQueue` collection                | Mongo               | Pending/processing/done/failed jobs with `last_error` strings.   |
| `ProcessedEmail.outcome`             | per inbound         | `replied` / `drafted` / `filtered_*` / `rate_limited` / `error`. |
| `OutboundEmail.state` + `last_error` | per outbound        | Send progress.                                                   |

Tail in Mongo:

```js
db.jobqueues
  .find({ queue: 'email.ingest', state: 'failed' })
  .sort({ _id: -1 })
  .limit(20);
db.outboundemails.find({ state: 'failed' }).sort({ _id: -1 }).limit(20);
db.mailaccounts.find({}, { display_name: 1, state: 1 });
```

---

## 11. REST endpoint summary

All endpoints are mounted under `/api/v1` and require `Authorization: Bearer <jwt>`.

### MailAccount

| Method   | Path                                                                         | Role   |
| -------- | ---------------------------------------------------------------------------- | ------ |
| `GET`    | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts` | viewer |
| `POST`   | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts` | admin  |
| `GET`    | `/…/mail-accounts/{accountId}`                                               | viewer |
| `PUT`    | `/…/mail-accounts/{accountId}`                                               | admin  |
| `DELETE` | `/…/mail-accounts/{accountId}`                                               | admin  |
| `POST`   | `/…/mail-accounts/{accountId}/pause`                                         | member |
| `POST`   | `/…/mail-accounts/{accountId}/resume`                                        | member |
| `POST`   | `/…/mail-accounts/{accountId}/test`                                          | member |
| `POST`   | `/…/mail-accounts/{accountId}/poll`                                          | member |
| `GET`    | `/…/mail-accounts/{accountId}/processed?outcome=&limit=`                     | viewer |

### Outbound / drafts

| Method | Path                                                                           | Role   |
| ------ | ------------------------------------------------------------------------------ | ------ |
| `GET`  | `/…/mail-accounts/{accountId}/outbound?state=&since=&limit=`                   | viewer |
| `GET`  | `/…/mail-accounts/{accountId}/outbound/{outboundId}`                           | viewer |
| `PUT`  | `/…/mail-accounts/{accountId}/outbound/{outboundId}` (only when state=drafted) | member |
| `POST` | `/…/mail-accounts/{accountId}/outbound/{outboundId}/send`                      | member |
| `POST` | `/…/mail-accounts/{accountId}/outbound/{outboundId}/cancel`                    | member |
| `POST` | `/…/mail-accounts/{accountId}/outbound/{outboundId}/retry`                     | member |

---

## 12. Future ingestion modes

The pipeline plumbing (job queue, ingest worker, agent orchestrator) is
provider-agnostic. To add a new ingress, write a single function that
produces the same `email.ingest` job payload:

```json
{
  "mailAccountId": "...",
  "external_id": "<provider-unique-key>",
  "raw_base64": "<full RFC822>",
  "received_at": "<ISO>"
}
```

Planned providers (pre-wired in `MailAccount.provider` enum):

- **Gmail watch + Pub/Sub** (`provider: gmail`, `ingest_mode: oauth_push`)
- **Microsoft Graph subscriptions** (`provider: graph`, `ingest_mode: oauth_push`)
- **SendGrid Inbound Parse webhook** (`provider: sendgrid_inbound`, `ingest_mode: webhook`)
- **Mailgun Routes webhook** (`provider: mailgun`, `ingest_mode: webhook`)
- **Amazon SES inbound → SNS → HTTP** (`provider: ses`, `ingest_mode: webhook`)

All of those drop into the same orchestrator and reply flow.

---

## 13. Cheat sheet — minimum viable bot in 4 calls

```bash
# 1. Create
curl -X POST $API/api/v1/organizations/$ORG/projects/$PROJ/agents/$AGENT/mail-accounts \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d @mail-account.json
# → { "_id": "$ACC", ... }

# 2. Verify
curl -X POST $API/api/v1/organizations/$ORG/projects/$PROJ/agents/$AGENT/mail-accounts/$ACC/test \
  -H "Authorization: Bearer $JWT"

# 3. Force a poll
curl -X POST $API/api/v1/organizations/$ORG/projects/$PROJ/agents/$AGENT/mail-accounts/$ACC/poll \
  -H "Authorization: Bearer $JWT"

# 4. See drafts the agent produced
curl "$API/api/v1/organizations/$ORG/projects/$PROJ/agents/$AGENT/mail-accounts/$ACC/outbound?state=drafted" \
  -H "Authorization: Bearer $JWT"
```

Send any time you like — atomically, from any replica, with no shared
lock service. Welcome to email bots.
