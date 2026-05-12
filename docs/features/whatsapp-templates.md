# WhatsApp Template Messages

## The Problem

WhatsApp enforces a **24-hour messaging window**: after a customer's last message, you can only send free-form replies for 24 hours. After that, the only way to reach the customer is via **pre-approved template messages**.

This is a problem for human handoff scenarios — e.g. a bot escalates on Friday afternoon, but the human operator only replies on Monday. By then the window is closed and Meta rejects the message with error `131047`.

## Solution Overview

1. **Track the messaging window** — store `last_customer_message_at` on each conversation
2. **Expose window status** — the frontend polling endpoint returns whether the window is open or closed
3. **Register templates with Meta** — templates are created via our API, which registers them directly with Meta's Business Management API
4. **Operator sends template** — when the window is expired, the operator picks an approved template from the UI and sends it
5. **Customer replies** — the window reopens and free-form messaging works again

## Setup

### 1. Add the WABA ID to channel config

Each agent's WhatsApp channel configuration needs the `waba_id` (WhatsApp Business Account ID). This is required for template management.

You can find it in [Meta Business Manager](https://business.facebook.com/) → WhatsApp Manager → Account Overview.

Update the agent's channel config:

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "meta",
    "credentials": {
      "phone_number_id": "123456789",
      "waba_id": "987654321",
      "access_token": "EAAx..."
    }
  }
}
```

### 2. Create a template

Templates must follow Meta's naming rules: **lowercase, alphanumeric, underscores only**.

```bash
POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/templates

{
  "name": "support_followup",
  "language": "en_US",
  "category": "UTILITY",
  "label": "Support Follow-up",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, a support agent is ready to help you. Please reply to this message to continue the conversation."
    }
  ]
}
```

This does two things:

- Registers the template with Meta (via the Business Management API)
- Saves it locally with `status: "PENDING"`

Meta reviews and approves templates (usually within minutes for UTILITY templates).

### 3. Sync template statuses

After creating templates, sync their approval status from Meta:

```bash
POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/templates/sync
```

Returns which templates were updated:

```json
{
  "success": true,
  "total_from_meta": 5,
  "local_templates": 3,
  "updated": [
    { "name": "support_followup", "language": "en_US", "status": "APPROVED" }
  ]
}
```

### 4. Multi-language templates

Register the same template in multiple languages:

```bash
POST .../templates
{ "name": "support_followup", "language": "pt_BR", "category": "UTILITY", ... }

POST .../templates
{ "name": "support_followup", "language": "es", "category": "UTILITY", ... }
```

Each language variant is a separate record with its own approval status.

## Frontend Integration

### Detecting an expired window

The polling endpoint (`GET /api/v1/conversations/:conversationId/messages/latest`) and the conversation details endpoint both return a `messaging_window` object for WhatsApp conversations:

```json
{
  "conversation_id": "abc-123",
  "new_messages": [],
  "messaging_window": {
    "last_customer_message_at": "2026-05-09T14:30:00.000Z",
    "expires_at": "2026-05-10T14:30:00.000Z",
    "is_open": false
  }
}
```

- `is_open: true` → operator can send free-form messages normally
- `is_open: false` → operator must send a template message first
- `messaging_window: null` → not a WhatsApp conversation (no restriction)

### Sending a template

When the window is expired:

1. **Fetch available templates** (filter by approved + conversation language):

   ```bash
   GET .../agents/:agentId/templates?status=APPROVED&language=en_US
   ```

2. **Show template picker** in the UI

3. **Send the selected template**:

   ```bash
   POST .../agents/:agentId/templates/:templateId/send
   {
     "conversationId": "abc-123",
     "parameters": [
       {
         "type": "body",
         "parameters": [
           { "type": "text", "text": "John" }
         ]
       }
     ]
   }
   ```

4. **Customer replies** → `last_customer_message_at` updates → `is_open` becomes `true` → operator can type freely again

## API Reference

All endpoints are under:

```
/api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/templates
```

| Method   | Path                | Role   | Description                                              |
| -------- | ------------------- | ------ | -------------------------------------------------------- |
| `GET`    | `/`                 | viewer | List templates. Query: `?status=APPROVED&language=en_US` |
| `GET`    | `/:templateId`      | viewer | Get a single template                                    |
| `POST`   | `/`                 | member | Create + register with Meta                              |
| `DELETE` | `/:templateId`      | admin  | Delete from Meta + local                                 |
| `POST`   | `/sync`             | member | Sync statuses from Meta                                  |
| `POST`   | `/:templateId/send` | member | Send template to a conversation                          |

## Template Component Format

Components follow [Meta's template component format](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components):

```json
{
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Order Update"
    },
    {
      "type": "BODY",
      "text": "Hi {{1}}, your order {{2}} has been updated. Please reply to continue."
    },
    {
      "type": "FOOTER",
      "text": "Powered by YourBrand"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Continue" },
        {
          "type": "URL",
          "text": "View Order",
          "url": "https://example.com/orders/{{1}}"
        }
      ]
    }
  ]
}
```

### Variable substitution when sending

Variables (`{{1}}`, `{{2}}`) are filled via the `parameters` field when sending:

```json
{
  "parameters": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "John" },
        { "type": "text", "text": "ORD-4521" }
      ]
    }
  ]
}
```

## System Messages

When a template is sent, a system message is recorded in the conversation:

```json
{
  "role": "system",
  "content": "Template message sent: Support Follow-up (en_US)",
  "code": "TEMPLATE_SENT",
  "channel_info": {
    "channel": "whatsapp",
    "message_id": "wamid.xxx"
  }
}
```

The `code: "TEMPLATE_SENT"` field lets the frontend render this however it wants (e.g. a small notice instead of a full message bubble).

## Error Handling

If a template send fails (e.g. template not approved, invalid parameters), the API returns the Meta error:

```json
{
  "error": "Failed to send template via Meta API",
  "meta_error": {
    "code": 100,
    "message": "Invalid parameter",
    "error_subcode": 2388023
  }
}
```

Common Meta error codes:

- `131047` — 24h window expired (shouldn't happen with templates, but can occur with invalid template)
- `132000` — Template not found or parameters mismatch
- `132001` — Template not approved
- `132005` — Template paused by Meta
