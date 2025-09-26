# Human Handoff Feature Documentation

## Overview

The Human Handoff feature allows AI agents to seamlessly transfer conversations to human operators when they encounter situations requiring human intervention. This system supports both agent-initiated handoffs and manual takeovers by human operators.

## Architecture

### Database Changes

#### Conversation Model Updates

The `Conversation` model has been extended with the following fields:

```javascript
// Updated status enum
status: {
  type: String,
  enum: ['active', 'ended', 'timeout', 'error', 'agent_controlled', 'human_controlled', 'handoff_requested', 'archived'],
  default: 'agent_controlled'
}

// Handler tracking
current_handler: {
  type: String,
  enum: ['agent', 'human'],
  default: 'agent'
}

// Handoff metadata
handoff_info: {
  requested_by: String,      // 'agent' or human operator user ID
  requested_at: Date,
  reason: String,
  assigned_human: String,    // User ID of assigned human operator
  handed_off_at: Date,
  handoff_message: String,
  urgency: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
}
```

#### Message Schema Updates

Messages now support a `human_operator` role and handler information:

```javascript
// Updated role enum
role: {
  type: String,
  enum: ['user', 'assistant', 'system', 'tool', 'human_operator'],
  required: true
}

// Handler information
handler_info: {
  agent_id: String,          // If message was from agent
  human_operator: {          // If message was from human
    user_id: String,
    name: String,
    email: String,
    timestamp: Date
  }
}
```

### New Conversation Methods

```javascript
// Request handoff from agent
conversation.requestHandoff(requestedBy, reason, urgency, contextSummary)

// Assign human operator
conversation.assignHuman(humanUserId, humanName, humanEmail)

// Return to agent control
conversation.handBackToAgent()
```

## System Tools

### Human Handoff Tool

A new system tool `request_human_handoff` has been added:

```javascript
{
  name: 'request_human_handoff',
  description: 'Request human operator to take over the conversation when the agent cannot adequately help the user. Use this when encountering complex issues, frustrated users, or requests requiring human judgment.',
  parameters: {
    reason: 'string (required) - Detailed explanation of why human intervention is needed',
    urgency: 'string (optional) - Priority level: low, medium, high',
    context_summary: 'string (optional) - Brief summary for the human operator'
  }
}
```

## API Endpoints

All handoff endpoints are available under `/api/v1/handoffs/`:

### GET /api/v1/handoffs/pending

Get conversations awaiting human handoff.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `urgency` (optional): Filter by urgency (low, medium, high)

**Response:**
```json
{
  "conversations": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

### GET /api/v1/handoffs/my-conversations

Get conversations currently handled by the authenticated operator.

**Response:**
```json
{
  "conversations": [...],
  "pagination": {...}
}
```

### GET /api/v1/handoffs/conversations/:id

Get detailed information about a specific conversation.

**Response:**
```json
{
  "success": true,
  "conversation": {
    "_id": "conversation-id",
    "status": "handoff_requested",
    "current_handler": "agent",
    "handoff_info": {...},
    "messages": [...],
    "agent": {...}
  }
}
```

### POST /api/v1/handoffs/conversations/:id/takeover

Take control of a conversation as a human operator.

**Request Body:**
```json
{
  "message": "Optional initial message from human operator"
}
```

**Response:**
```json
{
  "success": true,
  "conversation": {...},
  "message": "Conversation taken over successfully"
}
```

### POST /api/v1/handoffs/conversations/:id/message

Send a message as a human operator in an active handoff.

**Request Body:**
```json
{
  "message": "Message content from human operator"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "conversation": {...}
}
```

### POST /api/v1/handoffs/conversations/:id/handback

Return conversation control to the AI agent.

**Response:**
```json
{
  "success": true,
  "message": "Conversation handed back to agent",
  "conversation": {...}
}
```

### GET /api/v1/handoffs/conversations/:id/stream

Server-Sent Events stream for real-time conversation updates.

**Event Types:**
- `connected`: Connection established
- `new_messages`: New messages in conversation
- `status_update`: Conversation status changes
- `error`: Stream errors

## Agent Integration

### Streaming Behavior

When a conversation is under human control or has a pending handoff:

1. Agent execution is bypassed
2. Handoff notification is sent instead of agent response
3. Streaming continues to work for human messages

### Agent Configuration

Agents can be configured with handoff settings:

```javascript
config: {
  handoff_config: {
    allow_agent_handoff: true,           // Enable agent-initiated handoffs
    auto_handoff_triggers: [...],        // Keywords that trigger handoff
    handoff_message_template: "...",     // Custom handoff message
    max_failed_attempts: 3               // Auto-handoff after failures
  }
}
```

## Usage Examples

### Agent-Initiated Handoff

When an agent determines it needs human help:

```javascript
// Agent uses the tool
{
  "tool_name": "request_human_handoff",
  "tool_parameters": {
    "reason": "User has complex billing dispute requiring account access",
    "urgency": "high",
    "context_summary": "Customer has been charged incorrectly for 3 months, needs immediate refund processing"
  }
}
```

### Human Operator Workflow

1. **Monitor pending handoffs:**
   ```bash
   GET /api/v1/handoffs/pending?urgency=high
   ```

2. **Take over conversation:**
   ```bash
   POST /api/v1/handoffs/conversations/123/takeover
   {
     "message": "Hi! I'm here to help with your billing issue."
   }
   ```

3. **Continue conversation:**
   ```bash
   POST /api/v1/handoffs/conversations/123/message
   {
     "message": "I've reviewed your account and I can process the refund immediately."
   }
   ```

4. **Return to agent:**
   ```bash
   POST /api/v1/handoffs/conversations/123/handback
   ```

### Streaming Integration

```javascript
// Client receives handoff notification instead of agent response
{
  "type": "handoff_notification",
  "conversation_id": "123",
  "handoff_status": "handoff_requested",
  "current_handler": "agent",
  "message": "Your request has been forwarded to a human operator..."
}
```

## Testing

### Manual Testing Steps

1. **Setup:**
   - Start the server
   - Create an agent with the `request_human_handoff` tool
   - Authenticate as a user and as an operator

2. **Test Agent Handoff:**
   - Send a message that should trigger handoff (complex issue, frustration)
   - Verify conversation status changes to `handoff_requested`
   - Check that the conversation appears in pending handoffs

3. **Test Operator Takeover:**
   - Authenticate as human operator
   - Get pending handoffs
   - Take over the conversation
   - Send messages as operator
   - Verify streaming still works

4. **Test Handback:**
   - Return conversation to agent
   - Verify agent can continue normally

### Error Scenarios

- Unauthorized takeover attempts
- Taking over already controlled conversations
- Sending messages without proper permissions
- Network failures during handoffs

## Security Considerations

1. **Authentication:** All handoff endpoints require proper authentication
2. **Authorization:** Operators can only control assigned conversations
3. **Audit Logging:** All handoff activities should be logged
4. **Rate Limiting:** Takeover attempts should be rate-limited
5. **Data Access:** Operators should only see conversations they're authorized for

## Monitoring and Analytics

Consider tracking these metrics:
- Handoff request frequency by agent
- Average resolution time for human handoffs
- Common handoff reasons
- Customer satisfaction post-handoff
- Operator workload and response times

## Future Enhancements

1. **WebSocket Integration:** Real-time bidirectional communication
2. **Operator Queuing:** Intelligent assignment based on expertise
3. **Escalation Workflows:** Multi-tier human support
4. **Analytics Dashboard:** Handoff metrics and trends
5. **Mobile Operator App:** Native mobile interface for operators
6. **AI Assistance:** Suggested responses for human operators
7. **Voice/Video Support:** Multimedia handoff capabilities

## Deployment Notes

1. Ensure proper database migrations for conversation schema changes
2. Update existing agent configurations to include handoff settings
3. Train human operators on the new interface and workflows
4. Monitor system performance with increased database operations
5. Set up proper logging and alerting for handoff failures
