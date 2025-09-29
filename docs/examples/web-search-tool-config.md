# Web Search Tool Configuration Examples

This document shows examples of how the web search tool configuration is stored in the agent's tool parameters after using the web search configuration API.

## Agent Tool Configuration Structure

When you configure web search for an agent, the configuration is stored directly in the agent's `tools` array under the `web_search` tool parameters.

### Example: Agent with Brave Search Configured

```json
{
  "_id": "agent_123",
  "name": "Research Assistant",
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for information using a search engine (Brave Search or Tavily)",
      "parameters": {
        "provider": "brave",
        "encrypted_api_key": "U2FsdGVkX1+vupppZksvRf5pq5g5XjFRIipRkwB0K1Y96Qsv2Lm+31cmzaAILwyt...",
        "default_max_results": 10
      },
      "enabled": true
    }
  ]
}
```

### Example: Agent with Tavily Search Configured

```json
{
  "_id": "agent_456",
  "name": "AI Research Bot",
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for information using a search engine (Brave Search or Tavily)",
      "parameters": {
        "provider": "tavily",
        "encrypted_api_key": "U2FsdGVkX19FtqgO9YFTnY6gR8Lp3VzN7lKm1cFr9Qx42NsP8tY7jNvKzUoQ3mWp...",
        "default_max_results": 5
      },
      "enabled": true
    }
  ]
}
```

### Example: Agent with Only Provider Configured (No API Key)

```json
{
  "_id": "agent_789",
  "name": "Demo Assistant",
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for information using a search engine (Brave Search or Tavily)",
      "parameters": {
        "provider": "brave",
        "default_max_results": 8
      },
      "enabled": true
    }
  ]
}
```

## Configuration Parameters

| Parameter             | Type   | Description                                      | Example            |
| --------------------- | ------ | ------------------------------------------------ | ------------------ |
| `provider`            | string | Search provider to use (`brave` or `tavily`)     | `"brave"`          |
| `encrypted_api_key`   | string | Base64 encrypted API key for the search provider | `"U2FsdGVkX1+..."` |
| `default_max_results` | number | Default maximum results to return (1-20)         | `10`               |

## Security Notes

### API Key Encryption

- The `encrypted_api_key` field contains the search API key encrypted using AES-256-GCM
- The encryption uses the same system encryption key as other sensitive data in the application
- The key can only be decrypted by the application when executing the search tool
- Never store plain text API keys in the database

### Fallback Behavior

If no `encrypted_api_key` is present, the web search tool will:

1. Return placeholder search results
2. Include a message indicating that search configuration is needed
3. Allow the agent to continue functioning without real search capabilities

## Migration from Other Approaches

If you were previously storing search configuration in other ways:

### From Global Configuration

```json
// OLD: Global search config
{
  "search_provider": "brave",
  "search_api_key_id": "key_123"
}

// NEW: Per-agent tool config
{
  "provider": "brave",
  "encrypted_api_key": "U2FsdGVkX1+..."
}
```

### From External API Key References

```json
// OLD: Reference to ApiKey model
{
  "api_key_id": "key_123",
  "search_provider": "brave"
}

// NEW: Encrypted key in tool config
{
  "provider": "brave",
  "encrypted_api_key": "U2FsdGVkX1+..."
}
```

## Tool Execution Examples

When the agent uses the web search tool, it will automatically use the configured settings:

### With API Key Configured

```javascript
// Agent executes search
const result = await toolService.executeTool(
  'web_search',
  {
    query: 'latest AI developments',
  },
  {
    provider: 'brave', // from tool config
    encrypted_api_key: 'U2FsdGVkX1+...', // from tool config
    default_max_results: 10, // from tool config
  }
);

// Real search results returned
console.log(result.results); // Array of search results
```

### Without API Key Configured

```javascript
// Agent executes search without API key
const result = await toolService.executeTool(
  'web_search',
  {
    query: 'latest AI developments',
  },
  {
    provider: 'brave',
    default_max_results: 10,
    // No encrypted_api_key
  }
);

// Placeholder results returned
console.log(result.provider); // 'placeholder'
console.log(result.results[0].snippet); // "Configure a search API key to enable real search"
```

## Database Queries

### Find Agents with Search Configured

```javascript
// Find agents with web search API keys configured
const agentsWithSearch = await Agent.find({
  'tools.name': 'web_search',
  'tools.parameters.encrypted_api_key': { $exists: true },
});
```

### Find Agents by Search Provider

```javascript
// Find agents using Brave Search
const braveAgents = await Agent.find({
  'tools.name': 'web_search',
  'tools.parameters.provider': 'brave',
});

// Find agents using Tavily Search
const tavilyAgents = await Agent.find({
  'tools.name': 'web_search',
  'tools.parameters.provider': 'tavily',
});
```

### Update Search Configuration

```javascript
// Update search provider for an agent
await Agent.updateOne(
  {
    _id: 'agent_123',
    'tools.name': 'web_search',
  },
  {
    $set: {
      'tools.$.parameters.provider': 'tavily',
      'tools.$.parameters.default_max_results': 8,
    },
  }
);
```

This approach provides a clean, self-contained way to manage web search configuration per agent without depending on external models or complex relationships.
