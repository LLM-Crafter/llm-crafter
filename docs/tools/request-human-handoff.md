# Request Human Handoff Tool

Request human operator to take over the conversation when the agent cannot adequately help the user.

## Overview

The Request Human Handoff tool enables agents to seamlessly transfer conversations to human operators when encountering situations requiring human intervention, judgment, or expertise.

## Configuration

**Category:** Communication  
**Tool Name:** `request_human_handoff`

## Parameters

| Parameter         | Type   | Required | Default  | Description                                           |
| ----------------- | ------ | -------- | -------- | ----------------------------------------------------- |
| `reason`          | string | Yes      | -        | Detailed explanation why human intervention is needed |
| `urgency`         | string | No       | `medium` | Priority level: `low`, `medium`, `high`               |
| `context_summary` | string | No       | -        | Brief summary for the human operator                  |

## When to Use

Agents should request human handoff in these situations:

### High Priority

- User is frustrated or upset
- Complex technical issues beyond agent capabilities
- Requests involving money, refunds, or sensitive transactions
- Potential safety or legal concerns
- Escalation explicitly requested by user

### Medium Priority

- Multi-step troubleshooting unsuccessful after several attempts
- Ambiguous requests requiring human judgment
- Policy exceptions or special accommodations
- Account-specific issues requiring verification

### Low Priority

- General inquiries that could benefit from personal touch
- Feedback or suggestions for improvement
- Non-urgent follow-up requests

## Usage Example

```json
{
  "tool_name": "request_human_handoff",
  "parameters": {
    "reason": "User is experiencing a billing issue with duplicate charges totaling $500. They've provided screenshots and are requesting immediate refund. This requires verification of payment records and manager approval.",
    "urgency": "high",
    "context_summary": "Duplicate charge issue: 2x $250 charges on Dec 1st. User has screenshots. Requesting refund."
  }
}
```

## Response Format

```json
{
  "success": true,
  "result": "Human handoff requested successfully. A support agent will take over shortly.",
  "handoff_requested": true,
  "conversation_status": "handoff_requested"
}
```

## Conversation States

After handoff request:

### `handoff_requested`

- Handoff has been requested
- Waiting for human operator assignment
- Agent stops responding to user messages
- User receives notification about pending handoff

### `human_controlled`

- Human operator has been assigned
- Human operator is handling the conversation
- Agent responses are disabled
- All messages go to/from human operator

## User Experience

### Before Handoff

Agent operates normally, responding to user messages.

### During Request

```
Agent: I understand this requires specialized assistance. Let me connect
you with one of our team members who can better help you with this.
Please wait a moment.
```

### After Request

```
System: Your request has been forwarded to a human operator.
Please wait for assistance.
```

### When Human Takes Over

```
Human Operator (Sarah): Hi! I'm Sarah from the support team.
I see you're having an issue with duplicate charges.
I'm here to help resolve this for you.
```

## Configuration in Agents

### Support Agent Example

```json
{
  "name": "support_agent",
  "type": "chatbot",
  "tools": ["faq", "rag_search", "request_human_handoff"],
  "system_prompt": "You are a customer support agent. Try to help users with FAQ and knowledge base first. If the issue is complex, user is frustrated, or involves billing/refunds, use request_human_handoff tool with appropriate urgency level."
}
```

### Technical Support Example

```json
{
  "name": "technical_support",
  "type": "chatbot",
  "tools": ["web_search", "rag_search", "request_human_handoff"],
  "system_prompt": "You provide technical support. After 3 unsuccessful troubleshooting attempts, or if the issue requires system access, use request_human_handoff with medium urgency."
}
```

## Best Practices

### Writing Good Reasons

- **Be Specific**: Clearly state what the issue is
- **Include Context**: Mention what was already tried
- **Note User State**: Mention if user is frustrated/upset
- **Add Details**: Include relevant information (order numbers, error codes)

### Good Example

```
"User's account is locked after 5 failed login attempts. They don't have access to recovery email (changed 6 months ago). Attempted password reset but recovery email is no longer valid. User is unable to access account for important work deadline today."
```

### Poor Example

```
"User needs help with account"
```

### Setting Urgency Levels

**High Urgency:**

- Financial issues (duplicate charges, unauthorized transactions)
- Account security breaches
- Service outages affecting business operations
- User is very frustrated or threatening to cancel
- Time-sensitive issues (deadlines, events)

**Medium Urgency:**

- Technical issues not resolved after multiple attempts
- Account access problems
- Feature requests requiring approval
- Moderate user frustration

**Low Urgency:**

- General questions
- Feature explanations
- Non-critical feedback
- Routine follow-ups

### Context Summary Tips

- Keep it brief (1-2 sentences)
- Include key facts (numbers, dates, error codes)
- Mention what was already attempted
- Note any commitments made to user

## Human Operator Workflow

### For Human Operators

When a handoff is requested, operators see:

**Handoff Alert:**

```json
{
  "conversation_id": "conv_123",
  "user": "user@example.com",
  "urgency": "high",
  "reason": "Billing issue with duplicate charges...",
  "context_summary": "Duplicate charge issue: 2x $250...",
  "requested_at": "2025-10-03T15:30:00Z",
  "conversation_preview": [
    "User: I was charged twice for my subscription...",
    "Agent: Let me help you with that..."
  ]
}
```

### Taking Over

```
POST /api/v1/handoff/conversations/{conversationId}/accept
```

### Returning to Agent

```
POST /api/v1/handoff/conversations/{conversationId}/handback
```

## Limitations

- **Chatbot Agents Only**: Handoff only works for chatbot agents (not task agents)
- **Conversation Required**: Requires active conversation context
- **No Auto-Assignment**: Human operators must manually accept handoffs
- **One-Way Transfer**: Once handed off, agent cannot automatically resume

## Error Handling

- **No Conversation**: Returns error if not in conversation context
- **Already Handed Off**: Prevents duplicate handoff requests
- **Invalid Parameters**: Returns error for missing required fields

## API Endpoints

### Get Pending Handoffs

```
GET /api/v1/handoff/pending
```

### Accept Handoff

```
POST /api/v1/handoff/conversations/{conversationId}/accept
```

### Return to Agent

```
POST /api/v1/handoff/conversations/{conversationId}/handback
```

### Get Handoff History

```
GET /api/v1/handoff/conversations/{conversationId}/history
```

## Monitoring

Track handoff metrics:

- Number of handoff requests
- Urgency distribution
- Average time to human takeover
- Common handoff reasons
- Resolution time by urgency

## Related Documentation

- [Human Handoff Feature](/features/human-handoff) - Complete implementation details
- [Conversation Management](/concepts/conversations) - Conversation states and lifecycle
- [Agent Configuration](/concepts/agents) - Agent setup and tools

## Related Tools

- [FAQ](/tools/faq) - Answer common questions before handoff
- [RAG Search](/tools/rag-search) - Search knowledge base before handoff
- [Web Search](/tools/web-search) - Find information before escalating
