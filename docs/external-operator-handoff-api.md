# External Operator Handoff API

This document describes the new API endpoints and changes to existing endpoints that support **external (3rd-party) operator handoffs**. All new endpoints require an API key with the `handoffs:manage` scope.

## Authentication

All endpoints use API key authentication via the `X-API-Key` header or `Authorization: Bearer <key>`.

```
X-API-Key: your-api-key-here
```

The API key must have the **`handoffs:manage`** scope (new scope added to the system).

---

## 1. External Operator Management

Base path: `GET/PUT/PATCH/DELETE /api/v1/external/organizations/:orgId/projects/:projectId/operators`

### 1.1 Register or Update an Operator

Upserts an operator by `external_id`. If the operator already exists (same `external_id` + project), it updates; otherwise it creates.

```
PUT /api/v1/external/organizations/:orgId/projects/:projectId/operators
```

**Request Body:**

```json
{
  "external_id": "operator_jane_123",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "avatar_url": "https://example.com/avatars/jane.jpg",
  "skills": ["billing", "technical"],
  "status": "online",
  "metadata": {
    "department": "support",
    "language": "en"
  }
}
```

- `external_id` (string, **required**) — Your system's unique ID for this operator.
- `name` (string, **required**) — Display name.
- `email` (string, optional) — Operator email.
- `avatar_url` (string, optional) — URL to the operator's avatar image (for chat widgets).
- `skills` (string[], optional) — Tags for skill-based routing.
- `status` (string, optional) — `"online"`, `"offline"`, or `"busy"`. Defaults to `"offline"`.
- `metadata` (object, optional) — Arbitrary key-value data.

**Response (200):**

```json
{
  "success": true,
  "operator": {
    "_id": "uuid-here",
    "external_id": "operator_jane_123",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "avatar_url": "https://example.com/avatars/jane.jpg",
    "skills": ["billing", "technical"],
    "status": "online",
    "metadata": { "department": "support", "language": "en" },
    "organization": "org-id",
    "project": "project-id",
    "created_at": "2026-04-18T10:00:00.000Z",
    "updated_at": "2026-04-18T10:00:00.000Z"
  }
}
```

---

### 1.2 List Operators

```
GET /api/v1/external/organizations/:orgId/projects/:projectId/operators
```

**Query Parameters (all optional):**

| Param    | Type   | Description                                   |
| -------- | ------ | --------------------------------------------- |
| `status` | string | Filter by status: `online`, `offline`, `busy` |
| `skill`  | string | Filter by skill tag                           |

**Response (200):**

```json
{
  "success": true,
  "operators": [
    {
      "_id": "uuid",
      "external_id": "operator_jane_123",
      "name": "Jane Smith",
      "status": "online",
      "skills": ["billing", "technical"],
      "email": "jane@example.com",
      "metadata": {},
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

---

### 1.3 Get Single Operator

```
GET /api/v1/external/organizations/:orgId/projects/:projectId/operators/:externalId
```

**Response (200):**

```json
{
  "success": true,
  "operator": { ... }
}
```

**Response (404):**

```json
{ "error": "Operator not found" }
```

---

### 1.4 Update Operator Status

```
PATCH /api/v1/external/organizations/:orgId/projects/:projectId/operators/:externalId/status
```

**Request Body:**

```json
{ "status": "online" }
```

Valid values: `"online"`, `"offline"`, `"busy"`.

**Response (200):**

```json
{
  "success": true,
  "operator": { ... }
}
```

---

### 1.5 Bulk Update Statuses

Useful for marking all operators offline at end-of-day, or setting a batch online.

```
PATCH /api/v1/external/organizations/:orgId/projects/:projectId/operators/bulk/status
```

**Request Body:**

```json
{
  "operator_ids": ["operator_jane_123", "operator_bob_456"],
  "status": "offline"
}
```

- `operator_ids` (string[], optional) — If omitted, updates **all** operators in the project.
- `status` (string, **required**) — `"online"`, `"offline"`, or `"busy"`.

**Response (200):**

```json
{
  "success": true,
  "modified_count": 2
}
```

---

### 1.6 Delete Operator

```
DELETE /api/v1/external/organizations/:orgId/projects/:projectId/operators/:externalId
```

**Response (200):**

```json
{ "success": true, "message": "Operator deleted" }
```

---

## 2. Handoff Conversation Endpoints (API Key Auth)

These are **new API-key-authenticated versions** of the existing JWT handoff endpoints, designed for 3rd-party integrations.

Base path: `/api/v1/external/organizations/:orgId/projects/:projectId/`

---

### 2.1 Get Pending Handoffs

```
GET /api/v1/external/organizations/:orgId/projects/:projectId/handoffs/pending
```

**Query Parameters (all optional):**

| Param     | Type   | Description                                |
| --------- | ------ | ------------------------------------------ |
| `urgency` | string | Filter by urgency: `low`, `medium`, `high` |
| `page`    | number | Page number (default: 1)                   |
| `limit`   | number | Results per page (default: 20)             |

**Response (200):**

```json
{
  "conversations": [
    {
      "_id": "conv-uuid",
      "agent": { "_id": "agent-id", "name": "Support Bot", "type": "chatbot" },
      "status": "handoff_requested",
      "handoff_info": {
        "requested_by": "agent",
        "requested_at": "2026-04-18T10:30:00.000Z",
        "reason": "Customer wants to negotiate pricing",
        "urgency": "medium",
        "handoff_message": "Summary of conversation..."
      },
      "user_identifier": "user@example.com",
      "channel": "website",
      "messages": [ ... ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "pages": 1
  }
}
```

---

### 2.2 Take Over a Conversation

```
POST /api/v1/external/organizations/:orgId/projects/:projectId/conversations/:conversationId/takeover
```

**Request Body:**

```json
{
  "external_operator": {
    "external_id": "operator_jane_123",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "avatar_url": "https://example.com/avatars/jane.jpg"
  },
  "message": "Hi! I'm Jane, I'll be helping you from here."
}
```

- `external_operator` (object, optional) — If provided, assigns to this external operator. If omitted, assigns to the authenticated internal user (backwards compatible).
  - `external_id` (string, **required**) — Your system's ID for the operator.
  - `name` (string, **required**) — Display name shown to the end user.
  - `email` (string, optional) — Operator email.
  - `avatar_url` (string, optional) — URL to operator's avatar image.
- `message` (string, optional) — Initial message to send to the user upon takeover.

> **Note:** The external operator does NOT need to be pre-registered via the operators API. Inline identity works. If the `external_id` matches a registered operator, the registered data is used for enrichment.

**Response (200):**

```json
{
  "success": true,
  "conversation": { ... },
  "operator": {
    "type": "external",
    "id": "operator_jane_123",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "avatar_url": "https://example.com/avatars/jane.jpg"
  },
  "message": "Conversation taken over successfully"
}
```

**Error (400):**

```json
{ "error": "external_operator requires at least external_id and name" }
```

**Error (400):**

```json
{ "error": "Conversation already under human control" }
```

---

### 2.3 Send Message as Operator

```
POST /api/v1/external/organizations/:orgId/projects/:projectId/conversations/:conversationId/message
```

**Request Body:**

```json
{
  "message": "Let me look into that for you.",
  "external_operator_id": "operator_bob_456"
}
```

- `message` (string, **required**) — The message content.
- `external_operator_id` (string, optional) — If provided, the message is attributed to this operator. **If omitted, the message is attributed to the operator who took over** (either the external operator from takeover or the internal user).

**Message attribution priority:**

1. `external_operator_id` in request body (explicit override)
2. The external operator who took over the conversation (from `handoff_info.assigned_external_operator`)
3. The authenticated internal user (`req.user`) — backwards compatible

**Response (200):**

```json
{
  "success": true,
  "message": "Message sent successfully",
  "conversation": { ... }
}
```

---

### 2.4 Hand Back to Agent

```
POST /api/v1/external/organizations/:orgId/projects/:projectId/conversations/:conversationId/handback
```

**Request Body:**

```json
{
  "external_operator_id": "operator_jane_123"
}
```

- `external_operator_id` (string, optional) — If the conversation was taken by an external operator, pass their ID for authorization. If omitted, authorizes against the internal user or allows handback for externally-assigned conversations.

**Response (200):**

```json
{
  "success": true,
  "message": "Conversation handed back to agent",
  "conversation": { ... }
}
```

---

### 2.5 Get Conversations for an Operator

```
GET /api/v1/external/organizations/:orgId/projects/:projectId/handoffs/my-conversations?external_operator_id=operator_jane_123
```

**Query Parameters:**

| Param                  | Type   | Description                    |
| ---------------------- | ------ | ------------------------------ |
| `external_operator_id` | string | Filter by external operator ID |
| `page`                 | number | Page number (default: 1)       |
| `limit`                | number | Results per page (default: 20) |

**Response (200):**

```json
{
  "conversations": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "pages": 1
  }
}
```

---

### 2.6 Get Conversation Details

```
GET /api/v1/external/organizations/:orgId/projects/:projectId/conversations/:conversationId
```

**Response (200):**

```json
{
  "success": true,
  "conversation": {
    "_id": "conv-uuid",
    "status": "human_controlled",
    "current_handler": "human",
    "handoff_info": {
      "assigned_external_operator": {
        "external_id": "operator_jane_123",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "handed_off_at": "2026-04-18T10:35:00.000Z",
      "reason": "...",
      "urgency": "medium"
    },
    "messages": [
      {
        "role": "user",
        "content": "I need help with my billing",
        "timestamp": "..."
      },
      {
        "role": "human_operator",
        "content": "Hi! I'm Jane, I'll help you.",
        "timestamp": "...",
        "handler_info": {
          "external_operator": {
            "external_id": "operator_jane_123",
            "name": "Jane Smith",
            "email": "jane@example.com",
            "avatar_url": "https://example.com/avatars/jane.jpg",
            "timestamp": "..."
          }
        }
      }
    ]
  }
}
```

---

### 2.7 Stream Conversation Updates (SSE)

```
GET /api/v1/external/organizations/:orgId/projects/:projectId/conversations/:conversationId/stream
```

Returns Server-Sent Events. Events:

- `{"type": "connected"}` — Initial connection confirmation.
- `{"type": "new_messages", "messages": [...], "conversation_status": "...", "current_handler": "..."}` — New messages arrived.
- `{"type": "status_update", "conversation_status": "...", "current_handler": "...", "message_count": N}` — Periodic status.

---

## 3. Agent Configuration — `require_online_operator`

New boolean field in the agent's `config.handoff_config`:

```json
{
  "config": {
    "handoff_config": {
      "require_online_operator": true
    }
  }
}
```

When `true`, the AI agent's `request_human_handoff` tool will **only trigger** if at least one external operator with `status: "online"` exists for the agent's project. If no operators are online, the tool returns a soft failure and the agent continues the conversation:

```json
{
  "success": false,
  "result": "No human operators are currently available. Please try again later or continue the conversation with the AI assistant.",
  "handoff_requested": false,
  "gated": true
}
```

When `false` (default), handoff works as before — no online check is performed.

---

## 4. Data Model Changes

### Message `handler_info` — new `external_operator` field

Messages from external operators now have:

```json
{
  "handler_info": {
    "external_operator": {
      "external_id": "operator_jane_123",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "avatar_url": "https://example.com/avatars/jane.jpg",
      "timestamp": "2026-04-18T10:35:00.000Z"
    }
  }
}
```

Internal operator messages continue to use:

```json
{
  "handler_info": {
    "human_operator": {
      "user_id": "internal-user-id",
      "name": "John Doe",
      "email": "john@company.com",
      "timestamp": "..."
    }
  }
}
```

**Frontend should check for both** `handler_info.external_operator` and `handler_info.human_operator` when rendering operator messages.

### Conversation `handoff_info` — new `assigned_external_operator` field

```json
{
  "handoff_info": {
    "assigned_external_operator": {
      "external_id": "operator_jane_123",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "avatar_url": "https://example.com/avatars/jane.jpg"
    },
    "handed_off_at": "2026-04-18T10:35:00.000Z",
    "reason": "...",
    "urgency": "medium"
  }
}
```

- `assigned_human` (string) — Still used for internal users (unchanged).
- `assigned_external_operator` (object) — Used when an external operator takes over.
- Only one of the two will be set for a given conversation.

---

## 5. Backwards Compatibility

All existing endpoints and behaviors are fully preserved:

- The existing JWT-authenticated `/api/v1/handoffs/*` routes work exactly as before.
- `takeoverConversation` without `external_operator` in the body assigns the authenticated internal user (same as before).
- `sendHumanMessage` without `external_operator_id` uses the internal user (same as before).
- `handBackToAgent` without `external_operator_id` checks the internal user (same as before).
- `require_online_operator` defaults to `false`, so existing agents are unaffected.
- The `handoffs:manage` scope is new — existing API keys won't have it unless explicitly added.

---

## 6. Typical Integration Flow

```
1. Register operators on startup:
   PUT /operators  →  { external_id: "jane", name: "Jane", status: "online", skills: ["billing"] }

2. Update status when operators come online/offline:
   PATCH /operators/jane/status  →  { status: "online" }

3. Poll for pending handoffs:
   GET /handoffs/pending

4. Take over a conversation:
   POST /conversations/:id/takeover  →  { external_operator: { external_id: "jane", name: "Jane" } }

5. Send messages:
   POST /conversations/:id/message  →  { message: "How can I help?" }
   (defaults to Jane since she took over; or pass external_operator_id to override)

6. Hand back when done:
   POST /conversations/:id/handback  →  { external_operator_id: "jane" }
```
