# Agent Create / Update API

## Endpoints

```
POST   /api/v1/organizations/:orgId/projects/:projectId/agents
PUT    /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId
```

All fields marked **required** apply to `POST`. For `PUT` every field is optional — only the fields you include are updated (shallow merge for `llm_settings` and `config`).

---

## Request Body

### Top-level fields

| Field           | Type     | Required | Description                                                                                                                                                  |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`          | string   | yes      | Unique within the project. Allowed characters: `a-z A-Z 0-9 _ -`                                                                                             |
| `description`   | string   | no       | Free-text description                                                                                                                                        |
| `type`          | string   | yes      | `"chatbot"` \| `"task"` \| `"workflow"` \| `"api"`. Defaults to `"chatbot"`                                                                                  |
| `system_prompt` | string   | yes\*    | The agent's system instruction. \*Not required when `config.enable_small_agent_graph` is `true` and at least one `config.prompt_sections` field is non-empty |
| `api_key`       | string   | yes      | ID of an API key that belongs to the project                                                                                                                 |
| `tools`         | string[] | no       | List of tool names to enable (e.g. `["web_search", "faq"]`). Tool parameters are set separately via their own endpoints                                      |
| `is_active`     | boolean  | no       | Soft-enable/disable the agent. Default: `true`. Update only                                                                                                  |

---

### `llm_settings`

| Field                                       | Type    | Required | Default | Constraints                                     |
| ------------------------------------------- | ------- | -------- | ------- | ----------------------------------------------- |
| `llm_settings.model`                        | string  | yes      | —       | Must belong to the provider linked to `api_key` |
| `llm_settings.parameters.temperature`       | number  | no       | `0.7`   | `0` – `2`                                       |
| `llm_settings.parameters.max_tokens`        | integer | no       | `1000`  | ≥ 1                                             |
| `llm_settings.parameters.top_p`             | number  | no       | `1`     | `0` – `1`                                       |
| `llm_settings.parameters.frequency_penalty` | number  | no       | `0`     | `-2` – `2`                                      |
| `llm_settings.parameters.presence_penalty`  | number  | no       | `0`     | `-2` – `2`                                      |

---

### `config`

#### Chatbot behaviour

| Field                     | Type    | Default      | Description                                                                  |
| ------------------------- | ------- | ------------ | ---------------------------------------------------------------------------- |
| `max_conversation_length` | integer | `50`         | Maximum number of messages kept in a conversation                            |
| `auto_end_after_minutes`  | integer | `30`         | Idle minutes before a conversation is auto-ended                             |
| `context_window_strategy` | string  | `"truncate"` | How to handle context overflow: `"truncate"` \| `"summarize"` \| `"sliding"` |

#### Tool-call limits (task agents)

| Field             | Type    | Default | Description                |
| ----------------- | ------- | ------- | -------------------------- |
| `timeout_seconds` | integer | `300`   | Max execution time per run |
| `max_tool_calls`  | integer | `10`    | Max tool calls per run     |

#### General

| Field                        | Type     | Default   | Description                                                                                      |
| ---------------------------- | -------- | --------- | ------------------------------------------------------------------------------------------------ |
| `enable_thinking`            | boolean  | `true`    | Enable chain-of-thought reasoning                                                                |
| `thinking_depth`             | string   | `"basic"` | `"basic"` \| `"detailed"` \| `"verbose"`                                                         |
| `enable_streaming`           | boolean  | `false`   | Stream responses via SSE                                                                         |
| `enforce_language_detection` | boolean  | `true`    | Detect and match the user's language                                                             |
| `required_languages`         | string[] | `[]`      | ISO 639-1 codes for which conversation titles/summaries are also translated. E.g. `["nl", "fr"]` |

#### Small agent graph mode (chatbot only)

| Field                          | Type    | Default | Description                                                                                      |
| ------------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------ |
| `enable_small_agent_graph`     | boolean | `false` | Route reasoning through a planner → responder → critic pipeline instead of the single ReAct loop |
| `graph_enable_critic`          | boolean | `true`  | Run the critic validation step after the responder (only relevant when graph mode is on)         |
| `graph_models.planner_model`   | string  | `null`  | Model override for the planner step. Falls back to `llm_settings.model` when `null`              |
| `graph_models.responder_model` | string  | `null`  | Model override for the responder step                                                            |
| `graph_models.critic_model`    | string  | `null`  | Model override for the critic step                                                               |

##### `config.prompt_sections` (graph mode)

When any section is non-empty and `enable_small_agent_graph` is `true`, the pipeline derives role-specific prompts from these sections instead of `system_prompt`.

| Field               | Type   | Default | Description                                |
| ------------------- | ------ | ------- | ------------------------------------------ |
| `identity_and_tone` | string | `""`    | Who the agent is and how it speaks         |
| `tools_and_apis`    | string | `""`    | Which tools to use and when                |
| `conversation_flow` | string | `""`    | Turn-by-turn interaction rules             |
| `output_format`     | string | `""`    | Response structure / formatting guidelines |
| `guardrails`        | string | `""`    | Topics to avoid, safety rules              |
| `domain_workflows`  | string | `""`    | Domain-specific procedures or scripts      |

#### Human handoff (`config.handoff_config`)

| Field                      | Type     | Default       | Description                                                                                             |
| -------------------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `allow_agent_handoff`      | boolean  | `true`        | Allow the agent to request a human handoff                                                              |
| `auto_handoff_triggers`    | string[] | `[]`          | Keywords that automatically trigger a handoff                                                           |
| `handoff_message_template` | string   | _(see below)_ | Message shown to the user when a handoff is requested                                                   |
| `max_failed_attempts`      | integer  | `3`           | Auto-trigger handoff after this many failed AI attempts                                                 |
| `require_online_operator`  | boolean  | `false`       | Only allow handoff if at least one external operator has `status: "online"`                             |
| `webhook_url`              | string   | `null`        | URL called (HTTP POST) when a handoff is requested                                                      |
| `webhook_secret`           | string   | `null`        | HMAC-SHA256 secret; when set, requests include `X-Webhook-Signature`                                    |
| `fallback_timeout_seconds` | integer  | `null`        | Seconds to wait for a human to join before the AI sends a holding message. `null` = disabled. Min: `10` |
| `fallback_prompt`          | string   | _(see below)_ | Instruction used to generate the holding message                                                        |
| `max_fallback_attempts`    | integer  | `1`           | Maximum number of AI holding messages to send while waiting. Min: `1`                                   |

Default `handoff_message_template`:

> "I understand this requires specialized assistance. Let me connect you with one of our team members who can better help you with this. Please wait a moment."

Default `fallback_prompt`:

> "The human operator has not joined yet. Politely let the user know you are still waiting for an operator to connect, apologise for the delay, and offer to help with anything you can in the meantime."

---

### `question_suggestions`

Automatically generate follow-up question suggestions after each AI reply.

| Field           | Type    | Required when enabled | Default | Description                                                                   |
| --------------- | ------- | --------------------- | ------- | ----------------------------------------------------------------------------- |
| `enabled`       | boolean | —                     | `false` | Turn suggestions on/off                                                       |
| `count`         | integer | no                    | `3`     | Number of suggestions to generate. `1` – `5`                                  |
| `api_key`       | string  | yes (when enabled)    | —       | ID of the API key used for suggestions (can differ from the agent's main key) |
| `model`         | string  | yes (when enabled)    | —       | Model used for suggestions; must belong to the `api_key`'s provider           |
| `custom_prompt` | string  | no                    | `null`  | Override the built-in suggestion generation prompt                            |

---

### `gdpr`

| Field              | Type            | Default | Description                                                              |
| ------------------ | --------------- | ------- | ------------------------------------------------------------------------ |
| `encrypt_messages` | boolean         | `false` | Encrypt message content at rest with AES-256                             |
| `retention_days`   | integer \| null | `null`  | Auto-delete conversations older than N days. `null` = disabled. Min: `1` |

---

## Full example

```json
{
  "name": "support-bot",
  "description": "Customer support chatbot",
  "type": "chatbot",
  "system_prompt": "You are a helpful support assistant.",
  "api_key": "key_abc123",
  "llm_settings": {
    "model": "gpt-4.1",
    "parameters": {
      "temperature": 0.5,
      "max_tokens": 800
    }
  },
  "tools": ["web_search", "faq"],
  "config": {
    "max_conversation_length": 40,
    "auto_end_after_minutes": 20,
    "context_window_strategy": "summarize",
    "enable_thinking": true,
    "thinking_depth": "detailed",
    "enable_streaming": true,
    "enforce_language_detection": true,
    "required_languages": ["nl", "fr"],
    "enable_small_agent_graph": false,
    "handoff_config": {
      "allow_agent_handoff": true,
      "auto_handoff_triggers": ["speak to a human", "real person"],
      "require_online_operator": true,
      "webhook_url": "https://your-system.example.com/webhooks/handoff",
      "webhook_secret": "whsec_...",
      "fallback_timeout_seconds": 60,
      "max_fallback_attempts": 2
    }
  },
  "question_suggestions": {
    "enabled": true,
    "count": 3,
    "api_key": "key_suggestions456",
    "model": "gpt-4.1-mini"
  },
  "gdpr": {
    "encrypt_messages": true,
    "retention_days": 90
  }
}
```

---

## Error responses

| Status | Error                                                               | Cause                                                            |
| ------ | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `400`  | `Agent name already exists in this project`                         | Duplicate `name`                                                 |
| `400`  | `Invalid model for selected provider`                               | `llm_settings.model` not in the provider's model list            |
| `400`  | `Invalid tools: <names>`                                            | Tool name(s) not recognised                                      |
| `400`  | `API key and model are required when enabling question suggestions` | `question_suggestions.enabled: true` without `api_key` / `model` |
| `400`  | `gdpr.retention_days must be a positive integer or null`            | Invalid retention value                                          |
| `404`  | `API key not found in this project`                                 | `api_key` does not belong to the project                         |
| `500`  | `Failed to create agent` / `Failed to update agent`                 | Unexpected server error                                          |
