# Email Answer Gate

Triage decides whether an email is **in scope** for the agent. The answer
gate is a second stage for the emails that pass triage. It decides how
**confident** we are that the agent should answer, and what happens next:

| Level    | Meaning (you define it per mailbox)                                   |
| -------- | --------------------------------------------------------------------- |
| `high`   | Every check passed.                                                   |
| `medium` | A check that caps at `medium` failed, and no check that caps at `low` did. |
| `low`    | At least one check that caps at `low` failed.                         |

Each level maps to an action:

| Action          | Result                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| `reply`         | Follow `reply_policy` as usual (draft, or send in `auto_send` / `confidence_based`). |
| `draft`         | Always a draft. `auto_send` is downgraded to a draft (`reason: 'answer_gate'`). |
| `draft_flagged` | A draft tagged for human review (`reason: 'answer_gate'`).                    |
| `skip`          | No draft at all. The thread is left for a person to answer.                  |

The gate is opt-in and configured per `MailAccount` in `answer_gate`. It
works with every `reply_policy.mode`. In `draft_only`, this is how you get
"only draft the replies we're confident about".

---

## How it works

The gate runs in `emailAnswerGateService`, in two phases:

```
triage ─▶ recipient resolution ─▶ inbound phase ─▶ agent reasoning ─▶ reply phase ─▶ reply_policy
                                    (signals)                        (signals +
                                                                      criteria)
```

1. **Inbound phase** runs before the agent writes anything. It checks the
   signals that only need the inbound email and the triage result. If the
   level already lands on one that would skip, and every level below it
   would skip too, processing stops here. The (costly) reasoning call never
   runs.
2. **Reply phase** runs after the agent has written its reply, before the
   reply is stored. It adds the reply signals and the criteria verdict to the
   inbound checks.

Every check that fails **caps** the level at `medium` or `low`. The final
level is the lowest cap hit.

### Signals (free, deterministic)

| `type`                     | `value`                          | Fires when                                                          | Phase   |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------- | ------- |
| `triage_confidence_below`  | number                           | Triage confidence is below `value`. Ignored when triage is disabled. | inbound |
| `triage_topic_in`          | `[topic]`                        | The triage topic is in the list.                                    | inbound |
| `triage_intent_in`         | `[intent]`                       | The triage intent is in the list.                                   | inbound |
| `sender_has_prior_threads` | min threads (default `1`)        | The customer has at least `value` other email threads with this agent. | inbound |
| `thread_messages_above`    | number                           | The thread has more than `value` customer messages.                 | inbound |
| `has_attachments`          | —                                | The email has attachments.                                          | inbound |
| `tool_failed`              | —                                | Any tool call during reasoning failed.                              | reply   |
| `tool_not_called`          | `[tool name]` (empty = any tool) | None of the listed tools was called successfully.                   | reply   |
| `handoff_requested`        | —                                | The agent asked for a human handoff.                                | reply   |

`sender_has_prior_threads` uses the reply recipient. For lead notifications
that [recipient resolution](email-recipient-resolution.md) redirected, it
also counts earlier replies sent to that address.

### Criteria (judged)

Criteria are plain-English rules the drafted reply must meet. The judge sees:

- the agent's system prompt
- the last few messages of the thread
- the tool results from this reasoning run, including `rag_search` knowledge-base hits
- the drafted reply

The judge is configurable:

| `provider` | Judge                                                                                                                                                                    | `model`                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `llm`      | Structured-output LLM call through `OpenAIService`. Uses the agent's API key, or `api_key` (another LLM key in the same project, e.g. an OpenAI key when the agent runs on another provider). | `null` = cheapest model for the key's provider (same as triage) |
| `jev`      | One Jev call, with each criterion asked as a yes/no (`noul`) question. A criterion passes when its probability is at least `min_confidence`. Needs `config.jev.api_key` on the agent. | `null` = the agent's `config.jev.model`                         |

When Jev fails or isn't configured, the gate falls back to the LLM judge. The
fallback uses the default model, because `model` names a Jev model. A judge
that errors outright fails closed: a `judge_error` check caps the level at
`low`. A criterion the judge doesn't answer counts as failed.

---

## Configuration

```json
"answer_gate": {
  "enabled": true,
  "enforce": true,
  "provider": "llm",
  "model": "gpt-5.4-mini",
  "api_key": null,
  "min_confidence": null,
  "custom_prompt": "Bob answers on behalf of the dealership. Be strict about prices and availability.",
  "actions": { "high": "reply", "medium": "skip", "low": "skip" },
  "signals": [
    { "id": "unclear_intent", "type": "triage_confidence_below", "value": 0.6, "caps_at": "low" },
    { "id": "restricted_topic", "type": "triage_topic_in", "value": ["price_negotiation", "trade_in", "finance", "legal", "complaint"], "caps_at": "low" },
    { "id": "returning_customer", "type": "sender_has_prior_threads", "caps_at": "medium" },
    { "id": "tool_error", "type": "tool_failed", "caps_at": "medium" }
  ],
  "criteria": [
    {
      "id": "grounded",
      "description": "Every fact (vehicles, prices, availability, opening hours, policies) comes from the stock feed, FAQ or Knowledge results. Nothing is invented or assumed.",
      "caps_at": "low"
    },
    {
      "id": "no_authority",
      "description": "The reply does not negotiate price, value a trade-in, give finance specifics, comment on legal matters or handle a complaint.",
      "caps_at": "low"
    },
    {
      "id": "no_deferral",
      "description": "The reply does not defer any part to the dealer (e.g. 'I'll check with the team and get back to you').",
      "caps_at": "medium",
      "reason": "Bob deferred part of the answer to the dealer."
    },
    {
      "id": "fully_answered",
      "description": "Every question in the customer's email is fully answered.",
      "caps_at": "medium"
    }
  ]
}
```

| Field            | Default                                                    | Notes                                                                                     |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `enabled`        | `false`                                                    |                                                                                           |
| `enforce`        | `true`                                                     | `false` = **shadow mode**: evaluate and record every result, but never change the outcome. |
| `provider`       | `llm`                                                      | `llm` or `jev`.                                                                           |
| `model`          | `null`                                                     | See the judge table above.                                                                |
| `api_key`        | `null`                                                     | `llm` only. Must be an active, non-Jev key in the same project.                           |
| `min_confidence` | `null`                                                     | `jev` only. `null` = the agent's `config.jev.min_confidence`.                             |
| `custom_prompt`  | `null`                                                     | Extra guidance for the judge.                                                             |
| `actions`        | `{ high: "reply", medium: "draft_flagged", low: "skip" }`  |                                                                                           |
| `signals[]`      | `[]`                                                       | `{ id, type, value, caps_at, reason }`. `caps_at` defaults to `low`.                      |
| `criteria[]`     | `[]`                                                       | `{ id, description, caps_at, reason }`. `id` must be unique. `caps_at` defaults to `low`. |

`reason` is the text staff see when a check fails. Leave it out to use the
generated signal reason, or the judge's own reason for a criterion.

Saving a config is rejected with `400` in three cases:
- two criteria share an `id`
- `provider` is `jev` but the agent has no Jev key
- `api_key` isn't a usable LLM key in the project

**Start in shadow mode.** Run with `enforce: false` for a while, then compare
the recorded levels against what staff actually did with the drafts.
`OutboundEmail.was_edited` shows which drafts went out unchanged.

---

## What gets recorded

**When the gate skips** (`enforce: true`, action `skip`):

- No `OutboundEmail` row and no assistant message. The inbound email stays
  on the thread.
- A system message is added with `code: 'ANSWER_GATE_SKIPPED'`, for example
  `No reply was drafted: answer confidence is medium. Bob deferred part of the answer to the dealer.`
  Its `metadata.answer_gate` holds the full result, plus `discarded_reply` (the
  text the agent had written, or `null` when the inbound phase skipped before
  reasoning).
- `ProcessedEmail.outcome = 'skipped_answer_gate'`.

**Otherwise:** the gate result is stored on `OutboundEmail.metadata.answer_gate`.
This includes shadow-mode results. When the gate changed the decision,
`OutboundEmail.reason` is `answer_gate` and `metadata.decision.answer_gate_level`
holds the level.

The result has this shape:

```json
{
  "level": "medium",
  "action": "skip",
  "enforced": true,
  "phase": "reply",
  "reasons": ["Bob deferred part of the answer to the dealer."],
  "checks": [
    { "id": "returning_customer", "kind": "signal", "type": "sender_has_prior_threads", "passed": true, "caps_at": "medium", "reason": null },
    { "id": "grounded", "kind": "criterion", "passed": true, "caps_at": "low", "score": null, "judge_reason": "Price and availability match the stock feed.", "reason": null },
    { "id": "no_deferral", "kind": "criterion", "passed": false, "caps_at": "medium", "score": null, "judge_reason": "Says the sales team will confirm the trade-in value.", "reason": "Bob deferred part of the answer to the dealer." }
  ],
  "judge": { "provider": "llm", "model": "gpt-5.4-mini", "fallback": false },
  "usage": { "prompt_tokens": 1830, "completion_tokens": 120, "total_tokens": 1950, "cost": 0.0004 },
  "evaluated_at": "2026-10-22T10:15:00.000Z"
}
```

With Jev, `score` is the probability Jev returned for each criterion. The
judge's cost (and, on a reply-phase skip, the reasoning cost) is added to the
conversation's `metadata.total_cost`.
