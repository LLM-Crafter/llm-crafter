# Jev (TypeSafe) Setup

Jev is TypeSafe's "System One" classifier. It does not generate text. It answers typed questions (yes/no probability, multiple choice) in one fast call, and LLM Crafter uses it to skip or replace some LLM calls on a chatbot turn.

Every Jev feature is optional and fails open. If Jev is not configured, errors, times out (4 s), or answers below `min_confidence`, the agent runs its normal LLM path.

Setup takes three API calls:

1. Look up the `typesafe` provider ID.
2. Store a TypeSafe API key in the project.
3. Turn on Jev in the agent's `config.jev`.

All endpoints need a user JWT (`Authorization: Bearer <token>`).

---

## 1. Get the TypeSafe provider ID

```http
GET /api/v1/providers
```

The `typesafe` provider is created at server startup by `initializeDefaultProviders()` (see `src/config/defaultProviders.js`). Find it in the response:

```json
[
  {
    "_id": "665f1c...a1",
    "name": "typesafe",
    "models": ["jev-latest", "jev-preview", "jev-1.13.0"]
  }
]
```

If it is missing, restart the server once so the provider gets seeded.

---

## 2. Add the TypeSafe API key to the project

```http
POST /api/v1/organizations/{orgId}/projects/{projectId}/api-keys
Content-Type: application/json
```

Requires the `member` role. Rate limit: 20 requests per 15 minutes.

```json
{
  "name": "TypeSafe Jev",
  "key": "ts_live_xxxxxxxxxxxxxxxx",
  "provider": "665f1c...a1"
}
```

Response `201`:

```json
{
  "id": "6660aa...b2",
  "name": "TypeSafe Jev",
  "provider": "665f1c...a1",
  "project": "{projectId}",
  "created_at": "2026-10-01T09:00:00.000Z"
}
```

Save the `id`. It goes into `config.jev.api_key` in the next step. The key is stored encrypted and is never returned.

| Status | Error | Cause |
| --- | --- | --- |
| 400 | `API key already exists in this project` | The same key string is already stored in the project |
| 404 | `Provider not found` | Wrong `provider` ID |
| 404 | `Project not found` | Wrong `projectId` |

To list the project's keys later (without the secret), call `GET /api/v1/organizations/{orgId}/projects/{projectId}`. The `apiKeys` array includes each key's populated `provider`.

To remove a key: `DELETE /api/v1/organizations/{orgId}/projects/{projectId}/api-keys/{apiKeyId}` (requires the `admin` role).

> A TypeSafe key can **only** be used as `config.jev.api_key`. If you pass it as the agent's main `api_key`, the request fails with `400 TypeSafe keys can only be used for Jev (config.jev.api_key), not as the agent LLM key`.

---

## 3. Configure Jev on a chatbot

Use the normal agent update endpoint:

```http
PUT /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}
Content-Type: application/json
```

Requires the `member` role. To create a new agent with Jev already on, send the same `config.jev` block to `POST .../agents`.

### Example: turn on every chatbot feature

```json
{
  "config": {
    "jev": {
      "api_key": "6660aa...b2",
      "model": "jev-latest",
      "min_confidence": 0.85,
      "critic_precheck": true,
      "planner_gate": true,
      "language_detection": true,
      "procedure_matching": true,
      "email_triage": false,
      "responder_routing": {
        "enabled": true,
        "fast_model": "gpt-4.1-mini",
        "powerful_model": null
      }
    }
  }
}
```

The response is the updated agent document.

> **Always send the whole `jev` object.** The update merges `config` one level deep (`{ ...agent.config, ...req.body.config }`). Other `config` keys are kept, but `config.jev` is replaced as a whole. Any field you leave out falls back to its schema default (for example, features turn off).

### `config.jev` fields

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `api_key` | ApiKey ID | `null` | Required when any feature is on. Must be a `typesafe` key in the same project. |
| `model` | string | `jev-latest` | Must be one of the `typesafe` provider's models. |
| `min_confidence` | number 0.5–1 | `0.85` | Jev answers below this value are ignored, and the LLM path runs instead. |
| `critic_precheck` | bool | `false` | Graph mode. Jev checks the draft reply (grounded, addresses the user, within guardrails, no false promises, correct language). If every check passes, the LLM critic is skipped. Has no effect when `graph_enable_critic` is `false`. |
| `planner_gate` | bool | `false` | Graph mode, agents with tools. If Jev is confident that no tool is needed, the planner is skipped. |
| `language_detection` | bool | `false` | Jev detects the user's language before the LLM detector runs. |
| `procedure_matching` | bool | `false` | Jev picks the matching procedure (or none) before the LLM matcher runs. |
| `email_triage` | bool | `false` | Email agents only. Jev classifies incoming email (in scope, topic, intent) before the LLM triage runs. |
| `responder_routing.enabled` | bool | `false` | Graph mode. Jev picks the `fast` or `powerful` responder model per turn. |
| `responder_routing.fast_model` | string | `null` | Required when routing is on. Must be a model of the agent's **main** provider. |
| `responder_routing.powerful_model` | string | `null` | `null` uses the graph responder model. Must be a model of the agent's main provider. |

`critic_precheck`, `planner_gate` and `responder_routing` only run when the agent uses graph mode (`config.enable_small_agent_graph: true`). On a ReAct agent, only `language_detection` and `procedure_matching` (and `email_triage` for email agents) have an effect.

### Minimal example: language detection only

```json
{
  "config": {
    "jev": {
      "api_key": "6660aa...b2",
      "language_detection": true
    }
  }
}
```

### Turn Jev off

```json
{ "config": { "jev": { "api_key": null } } }
```

When `api_key` is `null`, every feature is off, whatever the flags say.

### Validation errors

| Status | Error |
| --- | --- |
| 400 | `config.jev.api_key is required when enabling Jev features` |
| 404 | `Jev API key not found in this project` |
| 400 | `config.jev.api_key must be a TypeSafe API key` |
| 400 | `Invalid Jev model for the TypeSafe provider` |
| 400 | `config.jev.min_confidence must be a number between 0.5 and 1` |
| 400 | `config.jev.responder_routing.fast_model is required when routing is enabled` |
| 400 | `Invalid responder routing model "<model>" for the agent's provider` |

---

## Verifying it works

- **Thinking process.** Graph turns add steps such as `Jev: no tools needed (p=0.93, 120ms …). Planner skipped.`, `Approved by Jev pre-check (…). LLM critic skipped.` and `Jev routed responder to "fast" tier …`.
- **Request log.** Every Jev call logs one line: `[Jev] <use case> agent=<id> model=<model> <ms>ms in=<tokens> out=<tokens> → <answers>`. Set `JEV_LOG_PAYLOADS=true` in `.env` to also log the full request state, the questions and the raw response. These include user messages, so leave it off in production.
- **Server logs.** Look for lines prefixed with `[Jev]`, `[Graph Critic] Jev pre-check`, `[LanguageDetection] Jev detected` and `[Procedure] Jev match`.
- **Fallback warnings.** `[Jev] … references a missing, inactive or non-TypeSafe API key` means the key ID is wrong or the key is inactive. `[Jev] Request failed (HTTP 401 …)` means TypeSafe rejected the key.
- **Usage.** Jev tokens and cost ($0.042 per million input tokens) are added to the turn's token usage.
