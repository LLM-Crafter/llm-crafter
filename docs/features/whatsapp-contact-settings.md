# WhatsApp Welcome Message and Ignored Contacts

Two per-agent WhatsApp settings, stored in the `whatsapp` block of the channel configuration:

- `welcome_message`: sent before the first AI reply of a number's first-ever conversation with the agent.
- `ignored_contacts`: numbers the agent never answers. Their conversations go to your team.

Both are set with `PUT /api/v1/channels/organizations/:orgId/projects/:projectId/agents/:agentId/channels` and returned by the matching `GET`.

```json
{
  "whatsapp": {
    "welcome_message": {
      "enabled": true,
      "image_url": "https://cdn.example.com/welcome.jpg",
      "text": "Optional text"
    },
    "ignored_contacts": [
      { "phone_e164": "+351912345678", "note": "Supplier" }
    ]
  }
}
```

Invalid values are rejected with `400`, and nothing in the request is saved:

```json
{
  "error": "welcome_message needs an image_url or a text when enabled",
  "code": "INVALID_WHATSAPP_SETTINGS",
  "field": "whatsapp.welcome_message"
}
```

## Welcome message

| Field       | Type    | Description                                                                                                                       |
| ----------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`   | boolean | Default `false`                                                                                                                   |
| `image_url` | string  | Public HTTPS URL. Meta fetches it when sending, so it must be reachable from the internet (JPEG or PNG, at most 5 MB)              |
| `text`      | string  | The caption when `image_url` is set (at most 1024 characters, Meta's limit), otherwise a text message (at most 4096 characters) |

At least one of `image_url` and `text` is required when `enabled` is `true`. Fields left out of an update keep their stored value, and `null` clears a field.

### Who gets it

The welcome message goes out on the first turn of a conversation when both of these are true:

- the agent has no other WhatsApp conversation with this number, of any age or status
- the conversation has no earlier messages

A number that wrote to the agent before the setting was switched on already has a conversation, so it is not greeted. The welcome message is not sent:

- to ignored contacts
- when the agent or the WhatsApp channel is disabled
- when the conversation is with a human

It is sent at most once per conversation, even with several app instances, and a failed send is not retried.

### What is sent

| Configuration  | WhatsApp message               |
| -------------- | ------------------------------ |
| Image only     | Image, no caption              |
| Image and text | Image with the text as caption |
| Text only      | Text message                   |

The welcome message is sent after the user's message is stored and before the agent reasons. The agent's normal reply to the same message follows.

### History

The welcome message is stored as an assistant message right after the user message it answers:

```json
{
  "role": "assistant",
  "content": "",
  "channel_info": {
    "channel": "whatsapp",
    "message_id": "wamid.HBgM...",
    "media": [{ "type": "image", "url": "https://cdn.example.com/welcome.jpg", "stored": false }]
  },
  "metadata": { "kind": "welcome_message" }
}
```

`content` holds the text, if there is any. The image is referenced by its public URL, not copied to storage.

### Failures

If Meta rejects the send, the error is logged with `Welcome message failed` and the agent, conversation and recipient. Nothing is stored, and the agent reply still goes out.

Meta can accept a send and fail to deliver it later, for example when it can't download the image. It reports that in a status webhook. Crafter logs it with `failed to deliver` and the message ID, and marks the stored message:

```json
"metadata": {
  "kind": "welcome_message",
  "delivery_status": "failed",
  "delivery_errors": [{ "code": 131053, "title": "Media upload error", "details": "..." }],
  "delivery_failed_at": "2026-11-09T10:00:00.000Z"
}
```

This applies to any message Crafter sent on WhatsApp, not only the welcome message.

## Ignored contacts

| Field        | Type   | Description                                                 |
| ------------ | ------ | ----------------------------------------------------------- |
| `phone_e164` | string | Phone number in E.164 format. Stored as `+` and digits only |
| `note`       | string | Optional, at most 200 characters                            |

Up to 500 entries per agent. Each update sends the full list, which replaces the stored one, and `[]` clears it. Duplicate numbers are collapsed.

Numbers are compared with the sender's WhatsApp ID (`wa_id`), ignoring `+`, spaces, other non-digits and leading zeros. `+351 912 345 678`, `00351912345678` and `351912345678` all match.

::: warning
In some countries the `wa_id` differs from the dialled number, for example older Brazilian mobile numbers without the extra 9. List the number in the form WhatsApp reports it.
:::

### When a listed number writes

1. The message is stored as usual, including media. Media is not run through the attachment interpreter.
2. The agent doesn't run: no LLM call, no tools and no welcome message.
3. The conversation becomes `human_controlled` (`current_handler: "human"`), with `ai_disabled_reason: "ignored_contact"`.
4. The agent's message hooks fire as for any message on a human-controlled conversation. That includes `human_controlled_only` hooks. The webhook payload includes `ai_disabled_reason`.

`ai_disabled_reason` is returned by the conversation detail and list endpoints and by `GET .../messages/latest`. It is `null` on other conversations.

Operators reply with `POST /api/v1/handoffs/conversations/:conversationId/message`, as for any human-controlled conversation.

### Adding and removing numbers

- **Adding a number** that has an open AI conversation: the next inbound message follows the rules above. That includes a message received just before the number was added that is still waiting in the debounce buffer.
- **Removing a number** doesn't change open conversations. They stay human-controlled until they're handed back.

### Handback

Handing back a conversation whose number is still listed is refused:

```json
HTTP 409
{
  "error": "This number is on the agent's ignored contacts list. Remove it from whatsapp.ignored_contacts before handing the conversation back.",
  "code": "CONTACT_IGNORED"
}
```

Remove the number from `ignored_contacts` first, then call handback. A successful handback clears `ai_disabled_reason`.
