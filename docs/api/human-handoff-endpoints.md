# Human Handoff API Endpoints

This document outlines the API endpoints for the human intervention/handoff system that allows human operators to take over conversations from AI agents.

## Base URL
All endpoints are prefixed with `/api/v1/handoffs`

## Authentication
All endpoints require authentication. Include the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Get Pending Handoff Requests

**Endpoint:** `GET /api/v1/handoffs/pending`

**Description:** Retrieve all conversations that are awaiting human takeover.

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20)
- `urgency` (optional): Filter by urgency level (`low`, `medium`, `high`)

**Request Example:**
```http
GET /api/v1/handoffs/pending?page=1&limit=10&urgency=high
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response Format:**
```json
{
  "conversations": [
    {
      "_id": "conv_123456",
      "agent": {
        "_id": "agent_789",
        "name": "Customer Support Bot",
        "type": "chatbot"
      },
      "user_identifier": "user@example.com",
      "title": "Product Return Issue",
      "status": "handoff_requested",
      "current_handler": "agent",
      "handoff_info": {
        "requested_by": "agent",
        "requested_at": "2025-09-25T10:30:00.000Z",
        "reason": "User is frustrated and requires complex policy explanation",
        "urgency": "high",
        "handoff_message": "User wants to return a product after 60 days but policy allows only 30 days"
      },
      "messages": [
        {
          "role": "user",
          "content": "I want to return this product I bought 60 days ago",
          "timestamp": "2025-09-25T10:25:00.000Z"
        }
      ],
      "createdAt": "2025-09-25T10:20:00.000Z",
      "updatedAt": "2025-09-25T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "pages": 2
  }
}
```

### 2. Get My Active Conversations

**Endpoint:** `GET /api/v1/handoffs/my-conversations`

**Description:** Get conversations currently handled by the authenticated human operator.

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20)

**Request Example:**
```http
GET /api/v1/handoffs/my-conversations?page=1&limit=5
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response Format:**
```json
{
  "conversations": [
    {
      "_id": "conv_789012",
      "agent": {
        "_id": "agent_456",
        "name": "Technical Support Bot",
        "type": "chatbot"
      },
      "user_identifier": "tech-user@example.com",
      "status": "human_controlled",
      "current_handler": "human",
      "handoff_info": {
        "assigned_human": "operator_123",
        "handed_off_at": "2025-09-25T11:00:00.000Z",
        "reason": "Complex technical issue requiring human expertise"
      },
      "messages": [...],
      "createdAt": "2025-09-25T10:45:00.000Z",
      "updatedAt": "2025-09-25T11:05:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 3,
    "pages": 1
  }
}
```

### 3. Get Conversation Details

**Endpoint:** `GET /api/v1/handoffs/conversations/:conversationId`

**Description:** Get full details of a specific conversation.

**Path Parameters:**
- `conversationId`: The ID of the conversation

**Request Example:**
```http
GET /api/v1/handoffs/conversations/conv_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response Format:**
```json
{
  "success": true,
  "conversation": {
    "_id": "conv_123456",
    "agent": {
      "_id": "agent_789",
      "name": "Customer Support Bot",
      "type": "chatbot",
      "description": "Handles general customer inquiries"
    },
    "user_identifier": "user@example.com",
    "title": "Product Return Issue",
    "status": "handoff_requested",
    "current_handler": "agent",
    "handoff_info": {
      "requested_by": "agent",
      "requested_at": "2025-09-25T10:30:00.000Z",
      "reason": "User is frustrated and requires complex policy explanation",
      "urgency": "high",
      "handoff_message": "User wants to return a product after 60 days but policy allows only 30 days"
    },
    "messages": [
      {
        "role": "user",
        "content": "I want to return this product I bought 60 days ago",
        "timestamp": "2025-09-25T10:25:00.000Z"
      },
      {
        "role": "assistant",
        "content": "I understand you'd like to return a product. Let me check our return policy for you.",
        "timestamp": "2025-09-25T10:26:00.000Z",
        "handler_info": {
          "agent_id": "agent_789"
        }
      },
      {
        "role": "user",
        "content": "This is ridiculous! I should be able to return it after 60 days!",
        "timestamp": "2025-09-25T10:28:00.000Z"
      },
      {
        "role": "assistant",
        "content": "I understand this requires specialized assistance. Let me connect you with one of our team members who can better help you with this. Please wait a moment.",
        "timestamp": "2025-09-25T10:30:00.000Z",
        "handler_info": {
          "agent_id": "agent_789"
        }
      }
    ],
    "metadata": {
      "total_tokens_used": 150,
      "total_cost": 0.0023,
      "last_activity": "2025-09-25T10:30:00.000Z"
    },
    "createdAt": "2025-09-25T10:20:00.000Z",
    "updatedAt": "2025-09-25T10:30:00.000Z"
  }
}
```

### 4. Take Over Conversation

**Endpoint:** `POST /api/v1/handoffs/conversations/:conversationId/takeover`

**Description:** Take over a conversation as a human operator.

**Path Parameters:**
- `conversationId`: The ID of the conversation to take over

**Request Body:**
```json
{
  "message": "Hello! I'm Sarah from the support team. I'll be happy to help you with your return request."
}
```

**Request Example:**
```http
POST /api/v1/handoffs/conversations/conv_123456/takeover
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "message": "Hello! I'm Sarah from the support team. I'll be happy to help you with your return request."
}
```

**Response Format:**
```json
{
  "success": true,
  "conversation": {
    "_id": "conv_123456",
    "status": "human_controlled",
    "current_handler": "human",
    "handoff_info": {
      "assigned_human": "operator_123",
      "handed_off_at": "2025-09-25T11:00:00.000Z"
    },
    "messages": [
      {
        "role": "system",
        "content": "You are now connected with Sarah from our support team.",
        "timestamp": "2025-09-25T11:00:00.000Z"
      },
      {
        "role": "human_operator",
        "content": "Hello! I'm Sarah from the support team. I'll be happy to help you with your return request.",
        "timestamp": "2025-09-25T11:00:15.000Z",
        "handler_info": {
          "human_operator": {
            "user_id": "operator_123",
            "name": "Sarah",
            "email": "sarah@company.com",
            "timestamp": "2025-09-25T11:00:15.000Z"
          }
        }
      }
    ]
  },
  "message": "Conversation taken over successfully"
}
```

### 5. Send Message as Human Operator

**Endpoint:** `POST /api/v1/handoffs/conversations/:conversationId/message`

**Description:** Send a message as the assigned human operator.

**Path Parameters:**
- `conversationId`: The ID of the conversation

**Request Body:**
```json
{
  "message": "I've reviewed your case and I can make an exception for your return. Let me process this for you."
}
```

**Request Example:**
```http
POST /api/v1/handoffs/conversations/conv_123456/message
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "message": "I've reviewed your case and I can make an exception for your return. Let me process this for you."
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "conversation": {
    "_id": "conv_123456",
    "status": "human_controlled",
    "messages": [
      {
        "role": "human_operator",
        "content": "I've reviewed your case and I can make an exception for your return. Let me process this for you.",
        "timestamp": "2025-09-25T11:05:00.000Z",
        "handler_info": {
          "human_operator": {
            "user_id": "operator_123",
            "name": "Sarah",
            "email": "sarah@company.com",
            "timestamp": "2025-09-25T11:05:00.000Z"
          }
        }
      }
    ]
  }
}
```

### 6. Hand Back to Agent

**Endpoint:** `POST /api/v1/handoffs/conversations/:conversationId/handback`

**Description:** Hand the conversation back to the AI agent.

**Path Parameters:**
- `conversationId`: The ID of the conversation

**Request Example:**
```http
POST /api/v1/handoffs/conversations/conv_123456/handback
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response Format:**
```json
{
  "success": true,
  "message": "Conversation handed back to agent",
  "conversation": {
    "_id": "conv_123456",
    "status": "agent_controlled",
    "current_handler": "agent",
    "messages": [
      {
        "role": "system",
        "content": "You are now back with our AI assistant.",
        "timestamp": "2025-09-25T11:10:00.000Z"
      }
    ]
  }
}
```

### 7. Stream Conversation Updates (Server-Sent Events)

**Endpoint:** `GET /api/v1/handoffs/conversations/:conversationId/stream`

**Description:** Real-time stream of conversation updates for human operators.

**Path Parameters:**
- `conversationId`: The ID of the conversation to monitor

**Request Example:**
```http
GET /api/v1/handoffs/conversations/conv_123456/stream
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: text/event-stream
```

**Response Format (Server-Sent Events):**
```
data: {"type": "connected"}

data: {"type": "new_messages", "messages": [{"role": "user", "content": "Thank you so much!", "timestamp": "2025-09-25T11:12:00.000Z"}], "conversation_status": "human_controlled", "current_handler": "human"}

data: {"type": "status_update", "conversation_status": "human_controlled", "current_handler": "human", "message_count": 8}
```

**Event Types:**
- `connected`: Connection established
- `new_messages`: New messages added to conversation
- `status_update`: Periodic status updates
- `error`: Error occurred

## System Tool for Agents

### Human Handoff Tool

**Tool Name:** `request_human_handoff`

**Description:** AI agents can use this tool to request human intervention when they cannot adequately help the user.

**Parameters:**
```json
{
  "reason": "Detailed explanation of why human intervention is needed",
  "urgency": "low|medium|high (optional, default: medium)",
  "context_summary": "Brief summary of the conversation and current situation for the human operator (optional)"
}
```

**Tool Response:**
```json
{
  "success": true,
  "result": "Human handoff requested successfully",
  "handoff_requested": true,
  "conversation_status": "handoff_requested"
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- `400`: Bad Request (missing required parameters)
- `401`: Unauthorized (invalid or missing authentication)
- `403`: Forbidden (not authorized to perform action)
- `404`: Not Found (conversation not found)
- `500`: Internal Server Error

## Integration Notes for UI

### Real-time Updates
- Use Server-Sent Events for real-time conversation monitoring
- Handle connection drops gracefully and reconnect as needed
- Display conversation status changes to operators

### User Experience
- Show urgency levels with appropriate visual indicators (colors, icons)
- Display conversation context and handoff reason prominently
- Provide easy access to full conversation history
- Enable quick message composition and sending

### State Management
- Track conversation states: `handoff_requested`, `human_controlled`, `agent_controlled`
- Update UI based on current handler (`agent` vs `human`)
- Handle transitions between states smoothly

### Notifications
- Notify operators of new handoff requests
- Show real-time message notifications
- Indicate when conversations are handed back to agents

This API provides a complete human handoff system that integrates seamlessly with your existing agent infrastructure while maintaining a smooth user experience.
