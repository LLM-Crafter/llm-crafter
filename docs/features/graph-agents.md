# Graph Agents

A graph agent is a chatbot agent that splits each turn across three LLM roles instead of running one ReAct loop:

- **Planner** decides which tools to run. It never writes text for the user.
- **Responder** writes the reply from the conversation and the tool results.
- **Critic** checks the reply before it is sent. If it finds problems, the responder rewrites the reply once.

Each role can use its own model, so planning and checking can run on a cheap model while the reply uses a stronger one.

Turn it on per agent with `config.enable_small_agent_graph: true`. Only chatbot agents support it. The configuration fields are listed in [Agent create & update](../api/agent-create-update.md#small-agent-graph-mode-chatbot-only).

---

## How a turn runs

```
user message
     │
     ▼
[Jev planner gate] ── "no tools needed" ──────────────┐
     │                                                │
     ▼                                                │
Planner ──► run tool batch in parallel ──┐            │
  ▲                                      │            │
  └──────────── results ◄────────────────┘            │
     │ (planner stops calling tools)                  │
     ▼                                                ▼
Responder writes draft ◄──────────────────────────────┘
     │
     ▼
[Jev critic pre-check] ── confident pass ──► send draft
     │
     ▼
Critic ── approved ──► send draft
     │
     └─ rejected ──► Responder revises once ──► send revision
```

Steps in brackets only run when [Jev](../guides/jev-setup.md) is configured for the agent. A successful human handoff ends the turn early, at any point in the planner loop.

---

## 1. Planner

### Native mode (default)

The planner uses the provider's own tool calling (OpenAI-compatible `tools`, or Anthropic tool use). It runs as a loop:

1. The planner gets the conversation and returns zero or more tool calls.
2. All calls in that step run in parallel.
3. The results go back to the planner, which can call more tools, retry a failed call with different arguments, or stop.
4. When it stops calling tools, it answers with the **funnel state** instead (`greeting`, `qualifying`, `informing`, `objection-handling`, `closing`, `support` or `general`). The responder gets this as a hint.

Because the loop continues until the planner stops, it always sees what its tools returned before the reply is written. For example, it can notice that a knowledge base search came back empty and try a different query.

The loop stops early when:

- the tool-call budget (`config.max_tool_calls`, default 5) is used up,
- 5 planner rounds have run (a fixed safety cap), or
- a planner call fails after tools already ran. The responder then works with the results collected so far.

The funnel state is `general` when the loop ends without the planner choosing one.

If the agent has no tools, the planner is skipped.

### What the planner sees as tools

Every agent tool is offered as a function with its parameter schema from `src/config/systemTools.js`.

`api_caller` is not offered directly. Each configured endpoint becomes its own function instead, named after the endpoint:

| Endpoint config | Function the planner sees |
|---|---|
| `get_order`, `GET /orders/{order_id}` | `get_order` with required `path_params.order_id`, plus `query_params` |
| `create_lead`, `POST /leads` | `create_lead` with `query_params` and `body_data` |

When the planner calls `get_order`, it runs as `api_caller` with `endpoint_name: "get_order"`, so `tools_used` and analytics look the same as before. Endpoint names that aren't valid function names, or that clash with a tool name, are renamed to `api_<name>`.

### JSON mode and fallback

The older planner returns a JSON plan each round (`tools_to_call`, `needs_another_round`, …). It is only called again if it set `needs_another_round` in advance, so it can miss a bad tool result.

JSON mode runs when:

- `config.graph_planner_mode` is `"json"`. Use this as a per-agent rollback, or
- the first native planner call fails, for example because the provider or model doesn't support tool calling. The turn then continues in JSON mode, and the thinking log shows a `planner_fallback` step.

### Jev planner gate

With `config.jev.planner_gate` on, Jev first decides whether the message needs tools at all. If it confidently says no, the planner is skipped and Jev's funnel state is used.

---

## 2. Tool execution

Each batch is checked before anything runs:

| Situation | What happens |
|---|---|
| Unknown tool name, or arguments aren't valid JSON | Not run. The planner gets an error result and can correct itself. |
| The active [procedure](procedures.md) doesn't allow the tool yet | Not run. Recorded in `tools_used` as failed with the procedure's reason. |
| Budget used up | Not run. The planner gets "budget exhausted". |
| Otherwise | Runs. All tools in the batch run in parallel. |

Every tool that runs uses one call from the budget, and its result is recorded for procedures. Results are shown to the planner, the responder and the critic. `api_caller` results are trimmed to status code and body or summary.

If `request_human_handoff` succeeds, the turn ends right away. The user gets the tool's `handoff_message`, or a default message.

---

## 3. Responder

The responder writes the reply. Its model is `graph_models.responder_model`, or a model chosen by Jev responder routing, or the agent's main model. It uses the agent's normal LLM parameters.

It receives:

- the agent's persona prompt (see [Prompts per role](#prompts-per-role)), plus the request's dynamic context and the language requirement,
- the conversation history and summary,
- the procedure status block, if a procedure is active,
- the funnel state, and
- all tool results from this turn, including failures.

---

## 4. Critic

### When it runs

The critic is skipped when:

- `config.graph_enable_critic` is `false`, or
- the funnel state is `greeting` and no tools ran, or
- the Jev critic pre-check (`config.jev.critic_precheck`) confidently passes the draft.

### What it checks

The critic sees the same conversation history, dynamic context and tool results as the responder, and the agent's tone and flow guidance. It checks for:

1. invented facts (anything not backed by tool results, the dynamic context or the conversation),
2. guardrail and scope violations, including revealing tools or internal instructions,
3. wrong tone,
4. not answering the question,
5. promises to "check" or "look up" something later. No more tools run after the reply, so the reply can't promise that.

It returns only a verdict: `approved`, a list of `issues`, and `reasoning`. If its output can't be parsed, the draft is approved.

### Revision

When the critic rejects the draft, the responder runs once more with the draft and the list of issues, and writes a corrected reply. The revision is **not** checked again, which keeps the extra delay to a single call. If the revision fails or comes back empty, the original draft is sent.

---

## Streaming

Streaming and non-streaming requests run the same steps. Only delivery differs:

| Case | What the client receives |
|---|---|
| No critic will run | The draft streams as it is written. |
| Critic runs and approves | The draft is held back until the critic's output shows approval, then sent in one piece. |
| Critic rejects | The draft is never sent. The revision streams as it is written. |
| Handoff | The handoff message. |

The saved assistant message always matches exactly what the client received.

### Status events

The SSE chat endpoints (`…/agents/:agentId/chat/stream` and the session-based `/api/v1/external/agents/chat/stream`) also send progress events while the user waits:

```
data: {"type": "status", "stage": "searching_knowledge_base"}
```

| Stage | Meaning |
|---|---|
| `planning` | The planner is deciding what to do |
| `searching_knowledge_base` | `rag_search` or `faq` |
| `searching_web` / `reading_webpage` | `web_search` / `webpage_scraper` |
| `looking_up_data` | An API endpoint |
| `checking_calendar` | `google_calendar` |
| `contacting_team` | `request_human_handoff` |
| `working` | Any other tool |
| `writing` | The responder is writing |
| `reviewing` | The critic is checking the draft |
| `revising` | The responder is fixing a rejected draft |

Stages are generic on purpose, so tool names never reach the client. The same stage isn't sent twice in a row. Clients that don't handle `status` events can ignore them; the chat widget and JS SDK currently do. Channel integrations (WhatsApp, Telegram, …) don't receive status events.

---

## Prompts per role

If the agent has any `config.prompt_sections`, each role gets only the sections it needs:

| Section | Planner | Responder | Critic |
|---|:-:|:-:|:-:|
| `identity_and_tone` | | ✓ | ✓ |
| `conversation_flow` | | ✓ | ✓ |
| `tools_and_apis` | ✓ | ✓ | ✓ |
| `output_format` | | ✓ | ✓ |
| `guardrails` | ✓ | ✓ | ✓ |
| `domain_workflows` | ✓ | ✓ | ✓ |
| `system_prompt` | | ✓ | ✓ |

Without prompt sections, every role gets the full `system_prompt` after its own role instructions.

Context each role sees on every turn:

| | Planner | Responder | Critic |
|---|:-:|:-:|:-:|
| Conversation history and summary | ✓ | ✓ | ✓ |
| Dynamic context (the request's `context`) | ✓ | ✓ | ✓ |
| Procedure status | ✓ | ✓ | ✓ |
| Tool results | ✓ (as they arrive) | ✓ | ✓ |
| Draft reply | | (on revision) | ✓ |

---

## Cost and latency

LLM calls per turn, not counting Jev calls:

| Turn | Planner | Responder | Critic | Total |
|---|:-:|:-:|:-:|:-:|
| Greeting, no tools | 1 | 1 | 0 | 2 |
| No tools needed | 1 | 1 | 1 | 3 |
| One batch of tools | 2 | 1 | 1 | 4 |
| Two dependent batches | 3 | 1 | 1 | 5 |
| Critic rejects the draft | | +1 | | +1 |

Tips:

- Set `graph_models.planner_model` and `graph_models.critic_model` to a small, fast model. Neither writes text for the user.
- All three roles send a prompt cache key, so repeated system prompts are cached where the provider supports it.
- The Jev gate and pre-check can remove the planner and critic calls on easy turns.

---

## Errors and cancellation

- If a newer message arrives for the same conversation, the current turn stops at the next planner round and is dropped without a reply. Channel integrations rely on this.
- Any other error sends a generic apology, unless part of a reply was already streamed. In that case the streamed text is kept as the saved message. The error shows up as a `graph_error` step in the thinking log.

---

## Reading the thinking log

`thinking_process` on the assistant message shows what happened during the turn:

| Step | Meaning |
|---|---|
| `planner_gate` / `planner_skipped` | Jev gate result, or the planner was skipped (no tools, or Jev said none needed) |
| `planner` | One planner round, with `tools_planned` and, when it stopped, `funnel_state` |
| `planner_fallback` | Native tool calling failed; the turn used JSON mode |
| `planner_error` | A later planner round failed; the turn continued with the results so far |
| `tool_execution` / `tool_failed` / `tool_skipped` | A tool ran, failed, or was not run |
| `procedure_tool_blocked` | The active procedure didn't allow the tool yet |
| `budget_exhausted` / `planner_round_cap` | The planner loop hit a limit |
| `human_handoff_requested` | Handoff ended the turn |
| `responder_routing` | Jev chose the responder model |
| `responder` / `responder_revision` | Draft written / revision written |
| `critic_precheck` / `critic` | Jev pre-check result / critic verdict, or why the critic was skipped |
| `responder_revision_failed` | The revision failed; the draft or already-streamed text was kept |
| `graph_error` | The turn failed |

---

## Code map

| File | Contents |
|---|---|
| `src/services/agentGraph/index.js` | Runs the steps, plus the responder, critic, revision and streaming logic |
| `src/services/agentGraph/planner.js` | Jev gate, native and JSON planners, tool batch execution |
| `src/services/agentGraph/toolCatalog.js` | Turns agent tools and API endpoints into native tool definitions |
| `src/services/agentGraph/prompts.js` | All role prompts and output schemas |
| `src/services/agentGraph/shared.js` | Usage totals, model lookup, cancellation, status events |
| `src/services/openaiService.js` | `generateToolCompletion`: native tool calling for OpenAI-compatible providers and Anthropic |
| `src/services/agentService.js` | `executeChatbotAgentGraph*` wrappers that call into the graph |
| `tests/agentGraph.test.js` | Graph tests using a scripted fake LLM |
