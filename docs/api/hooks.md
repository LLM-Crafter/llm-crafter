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
| `type`                 | string  | Yes          | `"llm"` or `"webhook"`                                                                                                 |
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

| Trigger                 | Fires when                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `every_message`         | Any message is received (user or operator)                                                     |
| `user_message_only`     | Only when the end-user sends a message                                                         |
| `human_controlled_only` | Only when the conversation is under human/operator control                                     |
| `new_conversation`      | A brand new conversation is created (fires once)                                               |
| `inactivity`            | After `inactivity_seconds` of no messages in the conversation. Respects `inactivity_condition` |

---

## Hook Types

### LLM Hook (`type: "llm"`)

Runs a lightweight LLM call with the hook's `prompt` as the system instruction. The LLM has access to the **same tools** as the main agent (e.g. `api_caller`, `faq`, `rag_search`). It can execute up to 3 tool calls per hook invocation.

The LLM hook runs in the background and does **not** produce any user-facing response. It is designed for silent data extraction and tool execution.

### Webhook Hook (`type: "webhook"`)

Sends an HTTP POST to the configured `webhook_url` with the message content and conversation context. No LLM call is involved.

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

### Field Reference

| Field                           | Type   | Always present | Description                                                                            |
| ------------------------------- | ------ | -------------- | -------------------------------------------------------------------------------------- |
| `event`                         | string | Yes            | Always `"message_hook"`                                                                |
| `hook_name`                     | string | Yes            | Name of the hook that fired                                                            |
| `timestamp`                     | string | Yes            | ISO 8601 timestamp of when the hook fired                                              |
| `agent_id`                      | string | Yes            | ID of the agent the hook belongs to                                                    |
| `conversation_id`               | string | Yes            | ID of the conversation                                                                 |
| `user_identifier`               | string | Yes            | The end-user's identifier (e.g. email, phone, session ID)                              |
| `message.role`                  | string | Yes            | `"user"` or `"human_operator"`                                                         |
| `message.content`               | string | Yes            | The raw message text                                                                   |
| `conversation_status`           | string | Yes            | One of: `active`, `agent_controlled`, `human_controlled`, `handoff_requested`, `ended` |
| `current_handler`               | string | Yes            | `"agent"` or `"human"`                                                                 |
| `external_operator`             | object | No             | **Only present when an external operator has taken over the conversation**             |
| `external_operator.external_id` | string | —              | The operator's external ID                                                             |
| `external_operator.name`        | string | —              | The operator's display name                                                            |
| `external_operator.email`       | string | —              | The operator's email address                                                           |

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
