# Automatic Conversation Summarization

LLM Crafter provides automatic conversation summarization to maintain context while optimizing token usage and costs.

## Overview

The summarization system automatically:

- Triggers when conversations reach specific thresholds
- Extracts structured information (topics, decisions, issues, preferences)
- Uses cost-effective models to generate summaries
- Performs incremental updates to existing summaries
- Tracks token savings and performance metrics

## How It Works

### Automatic Triggers

The system checks three conditions to determine when to summarize:

1. **Metadata Flag**: `requires_summarization` is set to `true`
2. **Message Threshold**: 15+ messages since last summary
3. **No Summary**: 20+ total messages with no existing summary

### Message Selection

**Logic:**

- If summary exists: Process messages after `last_summary_index`
- If no summary: Process all messages except the last 5 (keep recent context)
- If fewer than 10 messages: Skip summarization (insufficient data)

### Summary Structure

Summaries extract five types of information:

- **key_topics**: Main subjects discussed (max 5 topics)
- **important_decisions**: Concrete decisions made or agreed upon
- **unresolved_issues**: Questions or problems that need follow-up
- **user_preferences**: User's stated preferences, constraints, or requirements
- **context_data**: Important facts, numbers, names, or references

## Model Selection

LLM Crafter automatically selects cost-effective models for summarization:

| Agent Model   | Summarization Model | Cost Savings      |
| ------------- | ------------------- | ----------------- |
| gpt-4o        | gpt-4o-mini         | ~95%              |
| gpt-5         | gpt-5-mini          | ~95%              |
| gpt-4-turbo   | gpt-4o-mini         | ~95%              |
| o3            | o3-mini             | ~90%              |
| o1            | o1-mini             | ~90%              |
| deepseek-chat | deepseek-chat       | Already efficient |

Default fallback: `gpt-4o-mini`

## Summarization Parameters

The summarization process uses these optimized parameters:

- **temperature**: 0.3 (lower for consistency)
- **max_tokens**: 6000 (limit summary length)
- **top_p**: 0.9 (slightly reduced for focus)

## Incremental Summarization

When a summary already exists:

1. Existing summary is included in the prompt context
2. Only new messages (since last summary) are analyzed
3. LLM merges new information with existing summary
4. Preserves important historical context while adding new details

Benefits:

- Maintains continuity across multiple summarization events
- Prevents information loss
- Reduces token usage (only summarize new messages)

## Conversation Updates

After summarization, the conversation metadata is updated with:

- `has_summary`: Boolean flag indicating summary exists
- `messages_count`: Total messages in conversation
- `messages_since_last_summary`: Messages added since last summary
- `last_summary_index`: Index of last message included in summary
- `summary_version`: Incremental version number
- `requires_summarization`: Flag to force summarization
- `estimated_token_savings`: Estimated tokens saved

## Integration Flow

The summarization system integrates into the agent service:

1. Check if summarization is needed
2. Get messages to summarize
3. Call summarization service with existing summary
4. Update conversation with new summary
5. Log metrics for monitoring
6. Return result (or null on failure)

Error handling: Failures don't stop conversation execution.

## API Endpoints

### Manual Summarization

Force summarization of a conversation:

```
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations/{conversationId}/summarize
```

### Get Summary Status

Check if a conversation has been summarized:

```
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations/{conversationId}/summary
```

## Configuration

### Global Configuration

Environment variables for system-wide defaults:

```
SUMMARIZATION_MESSAGE_THRESHOLD=15
SUMMARIZATION_TOKEN_THRESHOLD=4000
SUMMARIZATION_TIME_THRESHOLD=3600000
SUMMARIZATION_MODEL=gpt-4o-mini
SUMMARIZATION_MAX_TOKENS=800
SUMMARIZATION_TEMPERATURE=0.3
```

### Agent-Level Configuration

Configure summarization per agent using the agent configuration API.

## Best Practices

### Focus by Use Case

**Customer Support:**
Focus on customer issue description, troubleshooting steps, resolution status, and satisfaction.

**Sales Conversations:**
Focus on customer needs, budget, decision timeline, objections, and next steps.

**Technical Consultations:**
Focus on technical requirements, proposed solutions, limitations, and implementation decisions.

### Performance Optimization

1. Adjust message thresholds based on conversation patterns
2. Use efficient models for routine summaries
3. Keep message truncation at 500 characters
4. Always include existing summary for continuity
5. Never let summarization failures stop conversations

### Quality Assurance

1. Validate JSON responses
2. Monitor parsing errors
3. Review generated summaries periodically
4. Update prompts based on usage patterns
5. Track token savings and compression ratios

## Performance Example

**Before Summarization:**

- Conversation: 25 messages, 4,500 tokens
- Context per request: 4,500 tokens

**After Summarization:**

- Summary: 200 tokens
- Recent messages: 5 messages, 800 tokens
- Context per request: 1,000 tokens
- Token savings: 3,500 tokens (78% reduction)
- Cost savings: ~$0.035 per request (GPT-4 pricing)

## Troubleshooting

### Summaries not generating

- Check `metadata.requires_summarization` flag
- Check message count thresholds
- Verify agent API key is valid
- Review error logs for parsing failures

### Poor summary quality

- Adjust system prompt focus areas
- Increase `max_tokens` parameter
- Review message truncation settings
- Try different summarization models

### High costs

- Verify model selection mapping
- Check summarization triggers (too frequent?)
- Adjust message thresholds
- Monitor token usage metrics

### Context loss

- Enable incremental summarization
- Review `last_summary_index` tracking
- Verify existing summary is included in prompts
- Check parse validation is not failing

## Summary

LLM Crafter's automatic summarization system:

- Reduces token usage by 70-90% for long conversations
- Maintains context through structured information extraction
- Optimizes costs by using efficient models
- Scales automatically with configurable triggers
- Preserves quality through incremental updates
- Tracks performance with detailed metrics
- Handles errors gracefully without breaking conversations

By intelligently summarizing conversations, LLM Crafter enables agents to handle longer, more complex interactions while keeping costs manageable and response times fast.
