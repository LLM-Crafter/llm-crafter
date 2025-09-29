# Internet Search Tool - Configuration Guide

This guide demonstrates how to configure and use the internet search tool with different providers in LLM Crafter.

## Quick Start

### 1. Set up API Keys

First, obtain API keys from your preferred search providers:

**Brave Search:**
- Visit: https://api.search.brave.com/
- Sign up and get your API key
- Note: Brave Search offers independent, privacy-focused search results

**Tavily Search:**
- Visit: https://tavily.com/
- Sign up and get your API key
- Note: Tavily is optimized for AI applications

### 2. Add API Key to Project

Add your search API key to your LLM Crafter project:

```bash
# Via API
curl -X POST "https://your-domain.com/api/organizations/{orgId}/projects/{projectId}/api-keys" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Brave Search API",
    "provider": "brave_search",
    "key": "your_brave_search_api_key_here"
  }'
```

### 3. Configure Agent with Search Tool

When creating or updating an agent, include the web search tool with your configuration:

```json
{
  "name": "Research Assistant",
  "description": "AI assistant with internet search capabilities",
  "system_prompt": "You are a helpful research assistant that can search the internet for current information.",
  "api_key": "your_llm_api_key_id",
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for information using a search engine (Brave Search or Tavily)",
      "parameters": {
        "search_provider": "brave",
        "search_api_key_id": "your_search_api_key_id"
      },
      "enabled": true
    }
  ]
}
```

### 4. Use the Search Tool

Once configured, the agent can use the search tool:

```javascript
// Example agent prompt that will trigger search
const response = await agent.chat("What are the latest developments in AI for 2024?");

// The agent will automatically use the web_search tool:
// - Query: "latest developments AI 2024"
// - Provider: brave (as configured)
// - Results: Real-time web search results
```

## Advanced Configuration

### Provider-Specific Configuration

**Brave Search Configuration:**
```json
{
  "name": "web_search",
  "parameters": {
    "search_provider": "brave",
    "search_api_key_id": "brave_api_key_id",
    "default_max_results": 10,
    "safe_search": true
  }
}
```

**Tavily Search Configuration:**
```json
{
  "name": "web_search",
  "parameters": {
    "search_provider": "tavily",
    "search_api_key_id": "tavily_api_key_id",
    "default_max_results": 8,
    "search_depth": "basic"
  }
}
```

### Multiple Search Providers

You can configure different agents with different search providers:

```json
{
  "agents": [
    {
      "name": "Fast Researcher",
      "tools": [{
        "name": "web_search",
        "parameters": {
          "search_provider": "brave",
          "search_api_key_id": "brave_key_id"
        }
      }]
    },
    {
      "name": "AI-Optimized Researcher", 
      "tools": [{
        "name": "web_search",
        "parameters": {
          "search_provider": "tavily",
          "search_api_key_id": "tavily_key_id"
        }
      }]
    }
  ]
}
```

### Tool Parameters

The web search tool accepts these parameters during execution:

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "required search query",
    "max_results": 5,
    "provider": "brave"
  }
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | The search query |
| `max_results` | number | ❌ | 5 | Number of results (1-20) |
| `provider` | string | ❌ | brave | Search provider (brave/tavily) |

## API Examples

### Creating an Agent with Search

```bash
curl -X POST "https://your-domain.com/api/organizations/{orgId}/projects/{projectId}/agents" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Search-Enabled Assistant",
    "system_prompt": "You are a research assistant with internet search capabilities.",
    "api_key": "llm_api_key_id",
    "tools": [
      {
        "name": "web_search",
        "parameters": {
          "search_provider": "brave",
          "search_api_key_id": "search_api_key_id"
        }
      }
    ]
  }'
```

### Direct Tool Execution

```bash
curl -X POST "https://your-domain.com/api/tools/web_search/execute" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "query": "latest JavaScript frameworks 2024",
      "max_results": 8,
      "provider": "tavily"
    }
  }'
```

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

## Troubleshooting

### Common Issues

1. **No search results / placeholder results**
   - Check that your search API key is properly configured
   - Verify the API key is active and has remaining quota
   - Ensure the agent's tool configuration includes `search_api_key_id`

2. **"Unsupported search provider" error**
   - Use only supported providers: `brave` or `tavily`
   - Check spelling in configuration

3. **Rate limiting errors**
   - Monitor your API usage in provider dashboards
   - Consider upgrading subscription plans
   - Implement proper error handling in your application

### Testing Configuration

Test your search configuration:

```bash
# Test with Node.js
node -e "
const toolService = require('./src/services/toolService');
toolService.executeToolWithConfig('web_search', {
  query: 'test search'
}, {
  search_api_key_id: 'your_key_id',
  search_provider: 'brave'
}).then(console.log).catch(console.error);
"
```

## Best Practices

1. **Provider Selection:**
   - Use Brave Search for general web search needs
   - Use Tavily for AI-optimized, content-focused searches

2. **Error Handling:**
   - Always handle potential search failures gracefully
   - Consider fallback mechanisms for critical applications

3. **Cost Management:**
   - Monitor API usage regularly
   - Set appropriate `max_results` limits
   - Consider caching frequently searched queries

4. **Security:**
   - Store API keys securely in the LLM Crafter key management system
   - Regularly rotate API keys
   - Monitor for unusual usage patterns