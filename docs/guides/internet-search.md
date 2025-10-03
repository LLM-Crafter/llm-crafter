# Internet Search Tool

Complete guide for configuring and using internet search capabilities in LLM Crafter agents.

## Overview

LLM Crafter provides built-in web search capabilities through multiple search providers, allowing your AI agents to access current information from the internet. The search configuration is stored securely per-agent with encrypted API keys.

### Key Features

- **Multiple Providers**: Support for Brave Search and Tavily
- **Encrypted Storage**: API keys encrypted with AES-256-GCM
- **Per-Agent Configuration**: Each agent can use different providers
- **Fallback Behavior**: Graceful degradation without API keys
- **Simple Integration**: Easy to configure and use

### Supported Search Providers

| Provider         | Best For                              | Documentation                                                                                 |
| ---------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Brave Search** | General web search, privacy-focused   | [api.search.brave.com](https://api.search.brave.com/app/documentation/web-search/get-started) |
| **Tavily**       | AI-optimized results, content-focused | [docs.tavily.com](https://docs.tavily.com/)                                                   |

## Quick Start

### Step 1: Get API Keys

Choose and sign up for a search provider:

**Brave Search:**

1. Visit https://api.search.brave.com/
2. Sign up for an account
3. Create a new subscription
4. Copy your API key from the dashboard

**Tavily Search:**

1. Visit https://tavily.com/
2. Sign up for an account
3. Navigate to the API keys section
4. Generate a new API key

### Step 2: Configure Agent with Search Tool

When creating or updating an agent, include the `web_search` tool:

```bash
curl -X POST "https://your-domain.com/api/organizations/{orgId}/projects/{projectId}/agents" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Research Assistant",
    "description": "AI assistant with internet search capabilities",
    "system_prompt": "You are a helpful research assistant that can search the internet for current information.",
    "api_key": "your_llm_api_key_id",
    "tools": [
      {
        "name": "web_search",
        "description": "Search the web for information",
        "enabled": true
      }
    ]
  }'
```

### Step 3: Configure Search Provider

Add the search API key to your agent:

```bash
curl -X POST "https://your-domain.com/api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "brave",
    "api_key": "your-search-api-key-here",
    "default_max_results": 10
  }'
```

### Step 4: Use Search in Conversations

Once configured, the agent automatically uses search when needed:

```javascript
// The agent will use search to answer current questions
const response = await agent.chat(
  'What are the latest developments in AI for 2024?'
);

// The web_search tool is called automatically by the LLM
// Results are incorporated into the response
```

## API Reference

### Configure Web Search

Configure or update search settings for an agent.

```http
POST /api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config
```

**Request Body:**

```json
{
  "provider": "brave",
  "api_key": "your-search-api-key-here",
  "default_max_results": 10
}
```

**Parameters:**

| Parameter             | Type   | Required | Description                                             |
| --------------------- | ------ | -------- | ------------------------------------------------------- |
| `provider`            | string | No       | Search provider: `brave` or `tavily` (default: `brave`) |
| `api_key`             | string | No       | Search API key (will be encrypted)                      |
| `default_max_results` | number | No       | Default maximum results (1-20, default: 5)              |

**Response:**

```json
{
  "message": "Web search configuration updated successfully",
  "provider": "brave",
  "has_api_key": true,
  "default_max_results": 10
}
```

### Get Web Search Configuration

Retrieve current search configuration.

```http
GET /api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config
```

**Response:**

```json
{
  "success": true,
  "data": {
    "provider": "brave",
    "default_max_results": 10,
    "has_api_key": true
  }
}
```

**Note:** The actual API key is never returned for security reasons.

## Configuration Examples

### Brave Search Configuration

```bash
curl -X POST "https://your-domain.com/api/organizations/org_123/projects/proj_456/agents/agent_789/web-search-config" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "brave",
    "api_key": "BSAabc123...",
    "default_max_results": 8
  }'
```

### Tavily Search Configuration

```bash
curl -X POST "https://your-domain.com/api/organizations/org_123/projects/proj_456/agents/agent_789/web-search-config" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "tavily",
    "api_key": "tvly-abc123...",
    "default_max_results": 5
  }'
```

### Update Provider Without Changing API Key

```bash
curl -X POST "https://your-domain.com/api/organizations/org_123/projects/proj_456/agents/agent_789/web-search-config" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "tavily",
    "default_max_results": 12
  }'
```

## Tool Parameters

When the agent executes a search, these parameters can be used:

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "latest JavaScript frameworks 2024",
    "max_results": 8,
    "provider": "brave"
  }
}
```

| Parameter     | Type   | Required | Default | Description                  |
| ------------- | ------ | -------- | ------- | ---------------------------- |
| `query`       | string | ✅       | -       | The search query             |
| `max_results` | number | ❌       | 5       | Number of results (1-20)     |
| `provider`    | string | ❌       | brave   | Override configured provider |

## Response Format

The search tool returns structured results:

```json
{
  "query": "latest JavaScript frameworks 2024",
  "provider": "brave",
  "results": [
    {
      "title": "Top JavaScript Frameworks in 2024",
      "url": "https://example.com/js-frameworks-2024",
      "snippet": "React, Vue, Angular, and new emerging frameworks..."
    }
  ],
  "total_results": 15,
  "search_time_ms": 245
}
```

## Security

### Encryption

- API keys are encrypted using AES-256-GCM
- Keys are stored directly in agent tool configuration
- Decryption only happens during search execution
- Encrypted keys are never exposed in API responses

### Access Control

- Only users with 'member' role or higher can configure search
- Configuration is scoped to specific agents
- API keys are never returned in GET requests

## How It Works

### Storage Structure

Search configuration is stored in the agent's tools array:

```json
{
  "_id": "agent_123",
  "name": "Research Assistant",
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for information",
      "parameters": {
        "provider": "brave",
        "encrypted_api_key": "U2FsdGVkX1+...",
        "default_max_results": 10
      },
      "enabled": true
    }
  ]
}
```

### Execution Flow

1. Agent receives a query requiring current information
2. LLM decides to use the `web_search` tool
3. Tool service retrieves agent's search configuration
4. API key is decrypted
5. Search request is made to the configured provider
6. Results are returned to the LLM
7. LLM incorporates results into response

### Fallback Behavior

If no API key is configured:

1. Search tool returns placeholder results
2. Includes message indicating configuration needed
3. Agent continues functioning without real search
4. No errors are thrown

```json
{
  "provider": "placeholder",
  "results": [
    {
      "title": "Search Configuration Required",
      "snippet": "Configure a search API key to enable real search results."
    }
  ]
}
```

## Troubleshooting

### No search results / Placeholder results

**Cause:** No API key configured or key is invalid

**Solution:**

- Verify API key is configured: `GET /agents/{agentId}/web-search-config`
- Check API key is valid in provider dashboard
- Reconfigure with: `POST /agents/{agentId}/web-search-config`

### "Unsupported search provider" error

**Cause:** Invalid provider name

**Solution:**

- Use only: `brave` or `tavily`
- Check spelling in configuration

### Rate limiting errors

**Cause:** Exceeded provider's rate limits

**Solution:**

- Check usage in provider dashboard
- Upgrade subscription plan
- Implement retry logic with backoff
- Reduce `default_max_results`

### API key not being used

**Cause:** Tool not properly configured

**Solution:**

- Ensure agent has `web_search` tool enabled
- Verify tool parameters include encrypted key
- Check agent document in database

## Best Practices

### Provider Selection

- **Brave Search**: Use for general web search needs, privacy-focused results
- **Tavily**: Use for AI-optimized, content-focused searches

### Cost Management

1. Monitor API usage regularly through provider dashboards
2. Set appropriate `default_max_results` limits
3. Consider caching frequently searched queries
4. Use different API keys for dev/staging/production

### Security

1. Rotate API keys periodically
2. Use separate keys per environment
3. Monitor for unusual usage patterns
4. Store configuration backups securely

### Testing

Test search configuration after setup:

```bash
# Create a test conversation
curl -X POST "https://your-domain.com/api/agents/{agentId}/chat" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the current weather in New York?",
    "user_identifier": "test_user"
  }'
```

## Rate Limits and Costs

Both providers have usage-based pricing and rate limits:

### Brave Search

- Free tier: Limited requests per month
- Paid tiers: Varies by subscription
- Rate limits: Depends on plan
- Check: https://api.search.brave.com/pricing

### Tavily

- Free tier: Available with limits
- Paid tiers: Based on usage
- Rate limits: Varies by plan
- Check: https://tavily.com/pricing

## Advanced Usage

### Multiple Agents with Different Providers

```javascript
// Research Agent with Brave
await configureAgent('research_agent', {
  provider: 'brave',
  api_key: 'brave_key',
  default_max_results: 10,
});

// Content Agent with Tavily
await configureAgent('content_agent', {
  provider: 'tavily',
  api_key: 'tavily_key',
  default_max_results: 5,
});
```

### Dynamic Provider Selection

Agents can override the configured provider at execution time:

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "specific search",
    "provider": "tavily" // Override default
  }
}
```

### Integration with Other Tools

Combine search with other tools for powerful workflows:

```javascript
// Agent system prompt
"You are a research assistant. When asked about current events:
1. Use web_search to find recent information
2. Use api_caller to fetch additional data if needed
3. Synthesize and present findings clearly"
```

## Migration Guide

### From Global Configuration

If you previously used global search configuration:

```javascript
// OLD: Global config in environment variables
SEARCH_PROVIDER=brave
SEARCH_API_KEY=your_key

// NEW: Per-agent configuration
POST /agents/{agentId}/web-search-config
{
  "provider": "brave",
  "api_key": "your_key"
}
```

### From External API Key References

If you used referenced API keys:

```javascript
// OLD: Reference to ApiKey collection
{
  "tools": [{
    "name": "web_search",
    "parameters": {
      "api_key_id": "key_123"
    }
  }]
}

// NEW: Encrypted key in tool config
{
  "tools": [{
    "name": "web_search",
    "parameters": {
      "encrypted_api_key": "U2FsdGVkX1+...",
      "provider": "brave"
    }
  }]
}
```

## Additional Resources

- [Brave Search API Docs](https://api.search.brave.com/app/documentation/web-search/get-started)
- [Tavily API Docs](https://docs.tavily.com/)
- [LLM Crafter Tools Documentation](/features/system-tools)
- [Agent Configuration Guide](/concepts/agents)
