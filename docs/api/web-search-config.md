# Web Search Configuration API

This API allows you to configure web search capabilities for individual agents. Each agent can have its own search provider (Brave Search or Tavily) and encrypted API key.

## Overview

The web search configuration system provides:

- **Per-agent search configuration**: Each agent can use different search providers
- **Encrypted API key storage**: Search API keys are encrypted at rest using AES-256
- **Multiple search providers**: Support for Brave Search and Tavily
- **Secure key management**: API keys are never exposed in responses

## Prerequisites

Before configuring web search:

1. The agent must have the `web_search` tool configured
2. You must have a valid API key from either Brave Search or Tavily
3. You must have appropriate permissions (member role or higher)

## API Endpoints

### Configure Web Search

Configure search provider and API key for an agent.

```http
POST /api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config
```

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
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

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `provider` | string | No | Search provider: `brave` or `tavily` (default: `brave`) |
| `api_key` | string | No | Search API key (will be encrypted) |
| `default_max_results` | number | No | Default maximum results (1-20, default: 5) |

**Response (200 OK):**
```json
{
  "message": "Web search configuration updated successfully",
  "provider": "brave",
  "has_api_key": true,
  "default_max_results": 10
}
```

### Get Web Search Configuration

Retrieve the current search configuration for an agent.

```http
GET /api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config
```

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Response (200 OK):**
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

**Note:** The actual API key is never returned for security reasons, only whether one is configured.

## Usage Examples

### Configure Brave Search

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

### Configure Tavily Search

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

### Update Only Provider (Keep Existing API Key)

```bash
curl -X POST "https://your-domain.com/api/organizations/org_123/projects/proj_456/agents/agent_789/web-search-config" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "tavily",
    "default_max_results": 12
  }'
```

## JavaScript SDK Usage

```javascript
const agent = new Agent('agent_789');

// Configure search
await agent.configureWebSearch({
  provider: 'brave',
  api_key: 'BSAabc123...',
  default_max_results: 10
});

// Get current configuration
const config = await agent.getWebSearchConfig();
console.log('Provider:', config.provider);
console.log('Has API key:', config.has_api_key);
```

## Security Features

### Encryption at Rest

- All API keys are encrypted using AES-256-GCM encryption directly in the agent's tool configuration
- Keys are automatically encrypted when saved
- Decryption only happens when the search tool is executed
- Encrypted keys are never exposed in API responses
- No dependency on external Provider models - search configuration is self-contained

### Simple and Secure Storage

- API keys are stored encrypted directly in the agent's `web_search` tool parameters
- No additional database tables or complex relationships required
- Each agent's search configuration is completely independent
- Easy to backup and restore with agent data

### Access Control

- Only users with 'member' role or higher can configure search
- Configuration is scoped to the specific agent
- Keys are never exposed in API responses

## How the Web Search Tool Uses Configuration

When an agent uses the `web_search` tool:

1. The tool reads the agent's web search configuration
2. Retrieves and decrypts the API key
3. Uses the configured provider and settings
4. Falls back to placeholder results if no API key is configured

Example agent execution:

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "latest AI developments",
    "max_results": 5
  }
}
```

The tool will automatically use:
- The agent's configured search provider
- The agent's encrypted API key  
- The agent's default max results (if not specified in parameters)

## Error Responses

### Agent Not Found
```json
{
  "error": "Agent not found"
}
```

### Missing Web Search Tool
```json
{
  "error": "Agent does not have web_search tool configured"
}
```

### Invalid Provider
```json
{
  "error": "Provider must be brave or tavily"
}
```

### Insufficient Permissions
```json
{
  "error": "Insufficient permissions"
}
```

## Integration with Existing Agents

To add web search to an existing agent:

1. **Add the web search tool** to your agent:
   ```json
   {
     "tools": [
       {
         "name": "web_search",
         "description": "Search the web for information",
         "enabled": true
       }
     ]
   }
   ```

2. **Configure the search provider** using the API endpoints above

3. **The agent can now use web search** in conversations and tasks

## Best Practices

### API Key Management

- **Use separate API keys** for different environments (dev, staging, prod)
- **Rotate API keys regularly** for security
- **Monitor API usage** through your search provider dashboard
- **Set appropriate rate limits** with your search provider

### Provider Selection

- **Brave Search**: Good for general web search, privacy-focused
- **Tavily Search**: Optimized for AI applications, structured results

### Configuration Updates

- **Update configuration** when switching providers
- **Test search functionality** after configuration changes
- **Monitor search results quality** and adjust providers as needed

## Migration from Legacy Configuration

If you previously configured search through other means:

1. **Remove old configuration** from agent tools parameters
2. **Use the new API endpoints** to configure search
3. **Verify functionality** with test queries
4. **Update documentation** for your team

The new system provides better security, per-agent configuration, and improved management capabilities.