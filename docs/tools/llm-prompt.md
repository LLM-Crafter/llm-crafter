# LLM Prompt Tool

Execute prompts using LLM providers with full control over model selection and parameters.

## Overview

The LLM Prompt tool allows agents to make additional LLM calls with different models, parameters, or prompts. This enables complex reasoning patterns, specialized tasks, and multi-model workflows.

## Configuration

**Category:** LLM  
**Tool Name:** `llm_prompt`

## Parameters

| Parameter       | Type   | Required | Default       | Description                       |
| --------------- | ------ | -------- | ------------- | --------------------------------- |
| `prompt`        | string | Yes      | -             | The prompt to send to the LLM     |
| `api_key_id`    | string | Yes      | -             | API key ID to use for the request |
| `system_prompt` | string | No       | -             | Optional system prompt            |
| `model`         | string | No       | `gpt-4o-mini` | Model to use                      |
| `temperature`   | number | No       | 0.7           | Temperature (0-2)                 |
| `max_tokens`    | number | No       | 1000          | Maximum tokens in response        |

## Usage Example

```json
{
  "tool_name": "llm_prompt",
  "parameters": {
    "prompt": "Summarize the key points from this text: ...",
    "api_key_id": "key_abc123",
    "model": "gpt-4o-mini",
    "temperature": 0.3,
    "max_tokens": 500
  }
}
```

## Response Format

```json
{
  "prompt": "Summarize the key points...",
  "response": "The key points are: 1) ...",
  "model": "gpt-4o-mini",
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 123,
    "total_tokens": 168,
    "cost": 0.0025
  },
  "finish_reason": "stop"
}
```

## Use Cases

### Specialized Analysis

Use different models for specific tasks:

```json
{
  "prompt": "Analyze this code for security vulnerabilities...",
  "model": "gpt-4o",
  "temperature": 0.1
}
```

### Creative Generation

Use higher temperature for creative tasks:

```json
{
  "prompt": "Write a creative story about...",
  "model": "gpt-4o",
  "temperature": 1.2
}
```

### Data Extraction

Use low temperature for consistent extraction:

```json
{
  "prompt": "Extract all email addresses from: ...",
  "model": "gpt-4o-mini",
  "temperature": 0.0
}
```

### Translation

```json
{
  "prompt": "Translate to Spanish: Hello, how are you?",
  "system_prompt": "You are a professional translator.",
  "model": "gpt-4o-mini"
}
```

## Common Patterns

### Chain of Thought Reasoning

```json
// Step 1: Break down problem
{
  "prompt": "Break this complex problem into steps: ...",
  "model": "gpt-4o"
}

// Step 2: Solve each step
{
  "prompt": "Solve step 1: ...",
  "model": "gpt-4o"
}
```

### Multi-Model Workflow

```json
// Step 1: Generate with creative model
{
  "prompt": "Generate ideas for...",
  "model": "gpt-4o",
  "temperature": 1.0
}

// Step 2: Refine with analytical model
{
  "prompt": "Evaluate and refine these ideas: ...",
  "model": "gpt-4o",
  "temperature": 0.3
}
```

### Specialized Tasks

```json
// Code generation
{
  "prompt": "Write Python function to...",
  "model": "gpt-4o",
  "temperature": 0.2
}

// Content summarization
{
  "prompt": "Summarize in 3 bullet points: ...",
  "model": "gpt-4o-mini",
  "temperature": 0.3
}
```

## Configuration in Agents

```json
{
  "name": "advanced_assistant",
  "type": "chatbot",
  "tools": ["llm_prompt"],
  "system_prompt": "You can delegate specialized tasks to other LLMs..."
}
```

## Best Practices

- **Model Selection**: Choose appropriate model for task complexity
- **Temperature Control**: Lower for factual, higher for creative
- **Token Limits**: Set reasonable max_tokens to control costs
- **System Prompts**: Use system prompts for consistent behavior
- **API Key Management**: Use project-specific API keys
- **Cost Awareness**: Monitor token usage and costs

## Model Recommendations

| Task Type        | Recommended Model | Temperature |
| ---------------- | ----------------- | ----------- |
| Code generation  | gpt-4o            | 0.1-0.3     |
| Creative writing | gpt-4o            | 0.9-1.2     |
| Data extraction  | gpt-4o-mini       | 0.0-0.1     |
| Analysis         | gpt-4o            | 0.3-0.5     |
| Translation      | gpt-4o-mini       | 0.3         |
| Summarization    | gpt-4o-mini       | 0.3-0.5     |

## Error Handling

- **Invalid API Key**: Returns error if API key not found or invalid
- **Model Not Available**: Returns error if model not accessible
- **Rate Limiting**: Respects provider rate limits
- **Token Limit Exceeded**: Returns error if prompt too long

## Cost Management

- Use `gpt-4o-mini` for simple tasks
- Set appropriate `max_tokens` limits
- Monitor usage with response `usage` object
- Consider caching for repeated prompts

## Related Tools

- [Calculator](/tools/calculator) - For mathematical operations
- [JSON Processor](/tools/json-processor) - For structured data extraction
- [Web Search](/tools/web-search) - For information retrieval
