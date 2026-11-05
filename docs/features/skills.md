# Skills

A skill is a set of task instructions that a [graph agent](graph-agents.md) loads only on the turns that need it. Use skills to move "how to handle X" text out of a large system prompt, so the agent reads only what applies to the current conversation.

Skills only run on chatbot agents with `config.enable_small_agent_graph: true`. Agents without skills behave exactly as before.

## Skills, procedures or the system prompt?

| Put it in | When | Enforcement |
|---|---|---|
| **System prompt** or `prompt_sections` | It applies to every turn: identity, tone, guardrails | Always loaded |
| **Skill** | It applies to one kind of task: "if the customer asks about X, do this" | Guidance the model follows |
| **[Procedure](procedures.md)** | Steps must happen in order, or a tool must stay blocked until they do | Tools are blocked in code |
| **Knowledge base** | It's a fact the agent looks up | Retrieved on demand |

**Don't put guardrails in a skill.** If the skill isn't selected, its rules don't apply. A skill also never grants access to a tool or authorizes an action, and customers can influence which skills get selected by what they write. Anything that must hold belongs in a procedure or in your tool's own checks.

## Configuration

Skills are part of the agent and are read and written through the existing agent endpoints:

```
POST  /api/v1/organizations/:orgId/projects/:projectId/agents
PUT   /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId
```

`PUT` replaces the whole array, so always send every skill the agent should have.

```json
{
  "skills": [
    {
      "name": "refunds",
      "description": "The customer wants a refund, a return or their money back, including complaints about a faulty item.",
      "not_for": "Questions about where an order is, or about delivery times.",
      "instructions": "1. Look up the order with get_order before answering.\n2. Orders under 30 days old qualify for a full refund.\n3. Otherwise, offer store credit."
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | no | Stable identifier, assigned if omitted. Letters, numbers, `_` and `-`, up to 64 characters. Keep it the same across updates, because conversations refer to skills by `id`. |
| `name` | string | yes | Unique within the agent. Letters, numbers, `_` and `-`, up to 64 characters. |
| `description` | string | yes | When to use the skill, up to 1,024 characters. The selector reads this and not the instructions. |
| `not_for` | string | no | Near-misses the skill should not be selected for, up to 1,024 characters. |
| `instructions` | string | yes | What the agent should do, up to 20,000 characters. |
| `enabled` | boolean | no | Defaults to `true`. Disabled skills are never selected and stop applying straight away. |

An agent can have up to 50 skills. Invalid skills return `400` with the reason, for example `skills[0]: description is required`.

## How it works

On each turn, before the planner runs:

1. If a [procedure](procedures.md) is running, skills are suspended for that turn and nothing is selected. A procedure that starts on this message wins the same way.
2. A selector decides which skills fit the latest message.
3. The planner, responder and critic all receive the same text for each active skill, so the critic judges the reply against what the responder was told.

### The selector

| Setup | What happens |
|---|---|
| `config.jev.skill_selection` on | Jev answers one yes/no question per skill and returns a probability for each. |
| Otherwise | A small model chooses from the agent's skills. |

Jev's probabilities are handled like this:

| Probability | Result |
|---|---|
| At or above `yes_threshold` (0.7) | The skill is selected |
| At or below `no_threshold` (0.3) | The skill is not selected |
| Any skill in between | The small model judges every skill and has the final say. It can choose several skills, one or none, and can overrule a clear answer from Jev |

The model always sees every skill, because shown only the unclear ones it tends to accept them without seeing that another skill fits better.

If Jev fails, the small model decides in the same way. If the small model also fails, the main model is tried. If that fails too, Jev's clear answers still apply, and with none the turn continues with the skills that were already active.

The small model is `config.graph_models.selector_model` if set. Otherwise it depends on the agent's provider, using the same models as language detection. Providers not listed, or models the provider no longer offers, use the agent's main model:

| Provider | Small model |
|---|---|
| `openai` | `gpt-6-luna` |
| `anthropic` | `claude-haiku-5-5` |
| `google` | `gemini-2.0-flash` |
| `deepseek` | `deepseek-chat` |
| `xai` | `grok-4.20-0309-non-reasoning` |
| `openrouter` | `deepseek/deepseek-chat` |

### How long a skill stays active

A selected skill stays active on later turns, so a short reply like "yes" or an order number doesn't lose its instructions. It's released when any of these happen:

- it hasn't been selected for `idle_turns` turns (default 6),
- `idle_hours` have passed since it was last selected (default 24),
- more than `max_active` skills are active (default 3), in which case the least recently selected goes first, or
- it's deleted or disabled.

Turns where a procedure runs don't count towards `idle_turns`.

The conversation stores only skill ids and timestamps in `skill_state`. **Edits to a skill apply from the next turn**, including in conversations already using it. There is no version history for skills.

## Writing good skills

The description decides whether the skill gets used, so most problems start there.

- **Describe the situation, not the skill.** "The customer wants their money back" works better than "Refund handling".
- **Include how customers really say it**, such as "this arrived broken" for a refund skill.
- **Use `not_for` for near-misses.** If "where's my order?" keeps selecting your refunds skill, say so there.
- **Keep overlapping skills apart.** If two descriptions could match the same message, merge them or make the boundary explicit.
- **Keep each skill to one task.** Up to three can be active at once, and each one is sent on every LLM call of the turn.
- **State the tool order explicitly** when it matters, using the tool or endpoint names the agent has.

If your steps must happen in order every time, and getting them wrong has consequences, use a procedure instead.

## Checking what happened

The `thinking_process` on each assistant message shows the selection:

| Step | Meaning |
|---|---|
| `skill_selection` | Jev's probabilities or the model's choice, and which skills are active |
| `skills_suspended` | A procedure was running, so skills were not used |

If a skill isn't being selected, look at these first, then adjust its `description` or `not_for`.

## Cost and latency

- Agents with skills make a selection call on each turn, except while a procedure is running.
- Selection runs before the planner, so it adds to the wait before the reply starts. Streaming clients get the `planning` status before it starts.
- Each active skill's instructions are sent on every LLM call of the turn. Moving text into skills doesn't guarantee lower token use, especially if a skill is active on most turns. Skills that apply to nearly every conversation are better left in the system prompt.

## Limitations

- Skills only apply to the graph's chat turns. They are not used by ReAct agents, staff-requested messages, reply regeneration or the email pipeline, because those run through the ReAct loop. If you move instructions from the system prompt into skills, those paths no longer see them.
- Jev is trained mainly on English. Other languages are accepted but have lower accuracy, so check selection on your own traffic if most of it isn't in English.
- The default thresholds are starting points. Tune them on your own conversations.
- Selection isn't a security boundary. See [Skills, procedures or the system prompt?](#skills-procedures-or-the-system-prompt)
