# Procedures

Procedures let a chatbot agent follow a deterministic, multi-step flow — like a refund request — instead of relying entirely on the LLM to remember what to ask, in what order, and when it's safe to act.

They are configured on the agent (`Agent.procedures`) and executed automatically on every turn of the chatbot reasoning engine, for both the standard ReAct loop and the small agent graph (planner/responder/critic) mode. No separate endpoint call is needed to run them — they use the existing chat endpoints.

## Endpoints

Procedures are part of the agent configuration and are read/written through the existing agent endpoints — there is no separate CRUD API for them.

```
POST  /api/v1/organizations/:orgId/projects/:projectId/agents
PUT   /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId
```

Send a `procedures` array in the request body (see [schema](#procedure-schema) below). `PUT` replaces the entire array — always send the full list of procedures you want the agent to have.

Chat requests are unchanged:

```
POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/chat
POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/chat/stream
```

The response body gains no new top-level fields today — a running procedure's progress is visible on the conversation document as `procedure_state` (see [Inspecting progress](#inspecting-progress)).

## How it works

Each incoming user message goes through this pipeline (in `procedureService.processTurn`, called right after language detection, before reasoning starts):

1. **Match** — if no procedure is currently active on the conversation, the user's message is compared (via an LLM call) against every enabled procedure's `trigger.description` / `trigger.examples`. Matching is semantic, not keyword-based — "will you pay for a broken pipe" can match a refund procedure even without the word "refund". At most one procedure can be active per conversation at a time.
2. **Snapshot** — once a procedure matches, its definition is copied onto the conversation as `procedure_state.procedure_snapshot`. Later edits to the agent's `procedures` never change an already-running conversation.
3. **Extract** — the user's message (plus recent history) is sent through a structured-output LLM call that extracts values for any pending `collect`/`ask` steps. Only fields the user actually provided are returned.
4. **Validate** — if a step has a `validation_tool` (e.g. `api_caller`), the extracted value is passed to that tool. The field is only marked satisfied if the tool call succeeds.
5. **Check attachments** — `request_document` steps are marked complete once a stored attachment (photo, file) has arrived in the conversation since the procedure started.
6. **Recompute status** — steps whose `condition` no longer applies are marked `skipped`; once every required, currently-applicable step is `completed`/`skipped`, the run's status flips to `completed`.
7. **Guide the LLM** — a short status block (which steps are done, which is next) is injected into both the planner/responder prompts (graph mode) and the reasoning-loop prompt (standard mode), so the model naturally asks for what's missing next.
8. **Gate tools** — any tool call the LLM attempts is checked against the active procedure before it runs. A tool bound to a step via `gated_tool` (e.g. `request_human_handoff`, or an `api_caller` endpoint that finalizes the refund) is rejected — with the reason fed back to the model — until every preceding required step is `completed`.

Steps 7 and 8 are the two enforcement mechanisms, and they are not equally strict:

| Mechanism                                                     | Enforcement                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool gating (`gated_tool`)                                    | **Hard** — the tool simply does not execute; this is deterministic code, not a suggestion to the LLM.                                                                                                                                                                   |
| "Don't answer yet" (`response_policy: collect_before_answer`) | **Soft** — the model is strongly instructed not to resolve the user's request yet, but nothing blocks the free-text response itself. Use `gated_tool` on any step whose completion actually matters (payouts, approvals, escalation) rather than relying on this alone. |

## Procedure schema

Each entry in `agent.procedures[]`:

| Field                 | Type     | Default                 | Description                                                                                    |
| --------------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                  | string   | auto-generated          | Stable identifier. Auto-assigned if omitted.                                                   |
| `name`                | string   | —                       | Required. Shown in the prompt directive and step status.                                       |
| `description`         | string   | `""`                    | Free-text notes.                                                                               |
| `enabled`             | boolean  | `true`                  | Disabled procedures are never matched.                                                         |
| `trigger.description` | string   | `""`                    | Semantic "when to use this" text the matcher LLM reads.                                        |
| `trigger.examples`    | string[] | `[]`                    | Example phrases, shown for context (not exact-match keywords).                                 |
| `response_policy`     | string   | `collect_before_answer` | `collect_before_answer` \| `answer_while_collecting` — see [enforcement](#how-it-works) above. |
| `steps`               | array    | —                       | Required, non-empty. Executed in array order.                                                  |

Each entry in `steps[]`:

| Field                                      | Type         | Default        | Description                                                                                                                   |
| ------------------------------------------ | ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`                                       | string       | auto-generated | Stable identifier.                                                                                                            |
| `type`                                     | string       | —              | Required. `collect` \| `ask` \| `request_document` \| `answer` \| `tool_action` \| `escalate`.                                |
| `name`                                     | string       | —              | Required. Short label (e.g. "Order number").                                                                                  |
| `description`                              | string       | `""`           | Question text / explanation shown to the LLM.                                                                                 |
| `required`                                 | boolean      | `true`         | Non-required steps don't block completion or gated tools.                                                                     |
| `field_key`                                | string       | `null`         | Required for `collect`/`ask` steps — the key the extracted value is stored under.                                             |
| `field_type`                               | string       | `string`       | `string` \| `number` \| `boolean`. Used for extraction typing.                                                                |
| `condition.field_key` / `condition.equals` | string / any | `null`         | Step only applies when a previously collected field equals this value (e.g. only request a photo when `reason === "damage"`). |
| `validation_tool`                          | string       | `null`         | Name of an agent tool used to validate the extracted value server-side.                                                       |
| `validation_parameters`                    | object       | `{}`           | Parameters passed to `validation_tool`. Supports `{{field_key}}` substitution against collected values.                       |
| `gated_tool`                               | string       | `null`         | For `tool_action`/`escalate` steps — the agent tool this step authorizes. Blocked until prior required steps complete.        |

## Example: refund request

Matches the "Refund requests" flow — collect an order number (validated against a catalog lookup), collect a reason, request a photo only when the reason is damage, then hand off to a human with a summary.

```json
{
  "procedures": [
    {
      "name": "Refund requests",
      "trigger": {
        "description": "The customer wants a refund, return, or money back for an order — including implicit phrasing like complaints about broken/faulty items.",
        "examples": ["refund", "money back", "return", "faulty"]
      },
      "response_policy": "collect_before_answer",
      "steps": [
        {
          "type": "collect",
          "name": "Order number",
          "description": "Ask for the order number.",
          "field_key": "order_number",
          "field_type": "string",
          "validation_tool": "api_caller",
          "validation_parameters": {
            "endpoint_name": "get_order",
            "method": "GET",
            "path_params": { "order_id": "{{order_number}}" }
          }
        },
        {
          "type": "collect",
          "name": "Reason for the return",
          "description": "Ask why the customer wants to return the item.",
          "field_key": "reason",
          "field_type": "string"
        },
        {
          "type": "request_document",
          "name": "Photo of the item",
          "description": "Ask for a photo showing the damage.",
          "condition": { "field_key": "reason", "equals": "damage" }
        },
        {
          "type": "escalate",
          "name": "Hand to the team with a summary",
          "description": "Escalate to a human operator once the order, reason, and (if needed) photo are confirmed.",
          "gated_tool": "request_human_handoff"
        }
      ]
    }
  ]
}
```

With this configuration, `request_human_handoff` will be rejected by the runtime — and the LLM told why — until `order_number` validates successfully, `reason` is collected, and (only when `reason` is `"damage"`) a photo has been received.

## Inspecting progress

A third-party UI can poll or read the conversation document (via the existing conversation endpoints) and inspect `procedure_state`:

```json
{
  "procedure_state": {
    "procedure_id": "b2d1...",
    "status": "active",
    "started_at": "2026-09-07T10:00:00.000Z",
    "collected_fields": {
      "order_number": { "value": "12345", "validated": true },
      "reason": { "value": "damage", "validated": true }
    },
    "step_status": [
      { "step_id": "s1", "status": "completed" },
      { "step_id": "s2", "status": "completed" },
      { "step_id": "s3", "status": "pending" },
      { "step_id": "s4", "status": "pending" }
    ]
  }
}
```

`status` is `active` while steps remain, `completed` once every required step is done or skipped. `procedure_snapshot` (omitted above) holds the pinned definition the run started with.

## Validation errors

Create/update requests validate `procedures` and return `400` with one of:

| Error                                                                                                       | Cause                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `procedures must be an array`                                                                               | `procedures` was not an array            |
| `procedures[i]: name is required`                                                                           | Missing procedure name                   |
| `procedures[i]: duplicate procedure id`                                                                     | Two procedures share an `id`             |
| `procedures[i]: response_policy must be one of collect_before_answer, answer_while_collecting`              | Invalid `response_policy`                |
| `procedures[i]: steps must be a non-empty array`                                                            | Missing/empty `steps`                    |
| `procedures[i].steps[j]: name is required`                                                                  | Missing step name                        |
| `procedures[i].steps[j]: duplicate step id`                                                                 | Two steps share an `id`                  |
| `procedures[i].steps[j]: type must be one of collect, ask, request_document, answer, tool_action, escalate` | Invalid step `type`                      |
| `procedures[i].steps[j]: field_key is required for '<type>' steps`                                          | `collect`/`ask` step missing `field_key` |

## Limitations

- One active procedure per conversation. If a second trigger matches while one is active, it's ignored until the current run completes.
- Field extraction and matching require a model that supports structured outputs; on models that don't, matching/extraction is skipped (no procedure activates).
- `answer_while_collecting` and `collect_before_answer` only affect prompt guidance for free-text responses — pair any step whose completion must be guaranteed with `gated_tool`.
- Task agents don't run procedures — they're chatbot-only (procedures rely on a persisted `Conversation`).
