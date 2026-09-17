# Message Hooks API

Hooks are lightweight background processors that run on every message — regardless of whether the conversation is agent-controlled, human-controlled, or in a handoff state. They are designed for tasks like lead capture, CRM sync, sentiment tracking, and more.

## Configure Hooks

```
POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/hooks
```

**Body:**

```json
{
  "hooks": [
    {
      "name": "lead_capture",
      "type": "llm",
      "trigger": "every_message",
      "enabled": true,
      "prompt": "Extract customer contact details and call the api_caller tool...",
      "model": "gpt-4.1-nano",
      "context_messages": 5
    },
    {
      "name": "crm_sync",
      "type": "webhook",
      "trigger": "human_controlled_only",
      "enabled": true,
      "webhook_url": "https://your-crm.com/api/conversations",
      "webhook_secret": "your-hmac-secret"
    }
  ]
}
```

> **Note:** This endpoint replaces all hooks on the agent. To add a hook, include the existing hooks plus the new one.

## Get Hooks

```
GET /api/organizations/:orgId/projects/:projectId/agents/:agentId/hooks
```

**Response:**

```json
{
  "hooks": [...]
}
```

---

## Hook Fields

| Field                  | Type    | Required     | Description                                                                                                            |
| ---------------------- | ------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `name`                 | string  | Yes          | Unique identifier for the hook                                                                                         |
| `type`                 | string  | Yes          | `"llm"`, `"webhook"`, or `"regenerate_title"`                                                                          |
| `trigger`              | string  | Yes          | When the hook fires (see Triggers below)                                                                               |
| `enabled`              | boolean | No           | Default `true`. Set `false` to disable without removing                                                                |
| `prompt`               | string  | LLM only     | System prompt for the background LLM call                                                                              |
| `model`                | string  | No           | Model override (e.g. `"gpt-4.1-nano"`). Falls back to agent's model                                                    |
| `context_messages`     | number  | No           | Number of recent messages to include as context (1–50, default 5)                                                      |
| `webhook_url`          | string  | Webhook only | URL to POST the payload to                                                                                             |
| `webhook_secret`       | string  | No           | HMAC-SHA256 secret for signing webhook payloads                                                                        |
| `inactivity_seconds`   | number  | No           | Seconds of inactivity before the hook fires (min 10, default 60). Only used with `inactivity` trigger                  |
| `inactivity_condition` | string  | No           | Only fire if conversation is in this state: `"any"` (default), `"human_controlled_only"`, or `"agent_controlled_only"` |

## Triggers

| Trigger                 | Fires when                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `every_message`         | Any message is received (user or operator)                                                                                                            |
| `user_message_only`     | Only when the end-user sends a message                                                                                                                |
| `human_controlled_only` | Only when the conversation is under human/operator control                                                                                            |
| `new_conversation`      | A brand new conversation is created (fires once)                                                                                                      |
| `inactivity`            | After `inactivity_seconds` of no messages in the conversation. Respects `inactivity_condition`                                                        |
| `email_draft_ready`     | An email agent finishes composing a reply that is stored as a draft (`draft_only` or `human_review` reply policy outcome), instead of being auto-sent |

---

## Hook Types

### LLM Hook (`type: "llm"`)

Runs a lightweight LLM call with the hook's `prompt` as the system instruction. The LLM has access to the **same tools** as the main agent (e.g. `api_caller`, `faq`, `rag_search`). It can execute up to 3 tool calls per hook invocation.

The LLM hook runs in the background and does **not** produce any user-facing response. It is designed for silent data extraction and tool execution.

### Webhook Hook (`type: "webhook"`)

Sends an HTTP POST to the configured `webhook_url` with the message content and conversation context. No LLM call is involved.

### Regenerate Title Hook (`type: "regenerate_title"`)

Regenerates the conversation title using the same AI title-generation logic the agent normally uses after every 2nd/5th message (including `title_generation_prompt` and `required_languages` translations, when configured). No `prompt` is required. An optional `model` overrides the default cost-effective model used for title generation.

This is commonly paired with the `inactivity` trigger, e.g. refresh the title after 10 minutes of silence:

```json
{
  "name": "refresh_title_after_inactivity",
  "type": "regenerate_title",
  "trigger": "inactivity",
  "inactivity_seconds": 600,
  "inactivity_condition": "any"
}
```

---

## Inactivity Trigger

The `inactivity` trigger fires after a configurable period of silence in a conversation. Every new message resets the timer. When the timer expires, the hook checks the fresh conversation state against `inactivity_condition` before executing.

**Example: Notify CRM when a human operator hasn't responded in 2 minutes:**

```json
{
  "name": "operator_timeout_alert",
  "type": "webhook",
  "trigger": "inactivity",
  "inactivity_seconds": 120,
  "inactivity_condition": "human_controlled_only",
  "webhook_url": "https://your-crm.com/api/alerts/operator-timeout"
}
```

**Example: Auto-extract lead data after 60s of silence:**

```json
{
  "name": "post_silence_lead_extract",
  "type": "llm",
  "trigger": "inactivity",
  "inactivity_seconds": 60,
  "inactivity_condition": "human_controlled_only",
  "model": "gpt-4.1-nano",
  "prompt": "Review the full conversation and extract any customer details (name, email, phone). Call api_caller with endpoint collect_lead if details are found."
}
```

**Important notes:**

- Timers are in-memory only — they do not survive server restarts.
- Each new message resets (not stacks) the timer.
- The conversation state is re-checked from the database when the timer fires, so if the conversation ended or changed handler in the meantime, the condition is evaluated against the current state.
- Inactivity hooks work with both `llm` and `webhook` hook types.

---

## Email Draft Ready Trigger

The `email_draft_ready` trigger fires only for **email-channel agents**, right after a reply is composed and persisted as an `OutboundEmail` in the `drafted` state (i.e. the mail account's `reply_policy` resolved to `draft_only` or `human_review` instead of auto-sending). It does not fire for auto-sent replies.

This is typically paired with `type: "webhook"` to notify an inbox/approval UI that a draft is waiting for review.

**Example: Notify an external system when a draft needs approval:**

```json
{
  "name": "notify_draft_ready",
  "type": "webhook",
  "trigger": "email_draft_ready",
  "webhook_url": "https://your-app.com/api/email-drafts/notify",
  "webhook_secret": "your-hmac-secret"
}
```

When this trigger fires, the webhook payload's `event` field is `"email_draft_ready"` and includes an additional `email_draft` object (see [Webhook Payload Format](#webhook-payload-format) below).

---

## Webhook Payload Format

When a webhook hook fires, it sends a `POST` request with `Content-Type: application/json`.

### Headers

| Header                | Description                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Type`        | `application/json`                                                                                                                    |
| `X-Webhook-Signature` | HMAC-SHA256 hex digest of the raw JSON body, using the hook's `webhook_secret`. **Only present when `webhook_secret` is configured.** |

### Body

```json
{
  "event": "message_hook",
  "hook_name": "crm_sync",
  "timestamp": "2026-05-05T14:32:01.123Z",
  "agent_id": "abc-123",
  "conversation_id": "conv-456",
  "user_identifier": "user@example.com",
  "message": {
    "role": "user",
    "content": "Hi, my name is John and my email is john@acme.com"
  },
  "conversation_status": "human_controlled",
  "current_handler": "human",
  "external_operator": {
    "external_id": "op-789",
    "name": "Jane Support",
    "email": "jane@company.com"
  }
}
```

For an `email_draft_ready` hook, `event` is `"email_draft_ready"` and the payload also includes an `email_draft` object:

```json
{
  "event": "email_draft_ready",
  "hook_name": "notify_draft_ready",
  "timestamp": "2026-05-05T14:32:01.123Z",
  "agent_id": "abc-123",
  "conversation_id": "conv-456",
  "user_identifier": "customer@example.com",
  "message": {
    "role": "assistant",
    "content": "Hi, thanks for reaching out..."
  },
  "conversation_status": "active",
  "current_handler": "agent",
  "email_draft": {
    "outbound_id": "outbound-789",
    "mail_account_id": "account-123",
    "to": ["customer@example.com"],
    "cc": [],
    "subject": "Re: Question about my order",
    "text": "Hi, thanks for reaching out...",
    "html": "<p>Hi, thanks for reaching out...</p>",
    "state": "drafted",
    "reason": "low_confidence",
    "confidence": 0.62,
    "in_reply_to": "<original-message-id@customer.com>"
  }
}
```

### Field Reference

| Field                           | Type   | Always present | Description                                                                                     |
| ------------------------------- | ------ | -------------- | ----------------------------------------------------------------------------------------------- |
| `event`                         | string | Yes            | `"message_hook"` for all triggers except `email_draft_ready`, which sends `"email_draft_ready"` |
| `hook_name`                     | string | Yes            | Name of the hook that fired                                                                     |
| `timestamp`                     | string | Yes            | ISO 8601 timestamp of when the hook fired                                                       |
| `agent_id`                      | string | Yes            | ID of the agent the hook belongs to                                                             |
| `conversation_id`               | string | Yes            | ID of the conversation                                                                          |
| `user_identifier`               | string | Yes            | The end-user's identifier (e.g. email, phone, session ID)                                       |
| `message.role`                  | string | Yes            | `"user"` or `"human_operator"`                                                                  |
| `message.content`               | string | Yes            | The raw message text                                                                            |
| `conversation_status`           | string | Yes            | One of: `active`, `agent_controlled`, `human_controlled`, `handoff_requested`, `ended`          |
| `current_handler`               | string | Yes            | `"agent"` or `"human"`                                                                          |
| `external_operator`             | object | No             | **Only present when an external operator has taken over the conversation**                      |
| `external_operator.external_id` | string | —              | The operator's external ID                                                                      |
| `external_operator.name`        | string | —              | The operator's display name                                                                     |
| `external_operator.email`       | string | —              | The operator's email address                                                                    |
| `email_draft`                   | object | No             | **Only present for the `email_draft_ready` trigger**                                            |
| `email_draft.outbound_id`       | string | —              | ID of the `OutboundEmail` row holding the draft                                                 |
| `email_draft.mail_account_id`   | string | —              | ID of the mail account the draft belongs to                                                     |
| `email_draft.to`                | array  | —              | Recipient email address(es)                                                                     |
| `email_draft.cc`                | array  | —              | CC email address(es)                                                                            |
| `email_draft.subject`           | string | —              | Draft email subject                                                                             |
| `email_draft.text`              | string | —              | Plain-text draft body                                                                           |
| `email_draft.html`              | string | —              | HTML draft body                                                                                 |
| `email_draft.state`             | string | —              | Always `"drafted"` for this trigger                                                             |
| `email_draft.reason`            | string | —              | Why the reply was drafted instead of auto-sent (e.g. `"low_confidence"`, `"human_review"`)      |
| `email_draft.confidence`        | number | —              | Triage/responder confidence score used in the decision, if any                                  |
| `email_draft.in_reply_to`       | string | —              | `Message-Id` of the inbound email this draft replies to                                         |

### Verifying the Signature

If you configured a `webhook_secret`, verify the `X-Webhook-Signature` header to ensure the request came from Crafter:

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected)
  );
}
```

### Timeout & Error Handling

- Webhook requests have a **10-second timeout**.
- If the endpoint returns a non-2xx status code, the hook is considered failed and an error is logged server-side.
- Hook failures **never** block the conversation flow or the user's response.
- There are no automatic retries. If reliability is critical, use a queue on the receiving end.
