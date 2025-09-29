# Internet Search Configuration

LLM Crafter supports internet search capabilities through multiple search providers. This document explains how to configure and use internet search in your agents.

## Supported Search Providers

### Brave Search

**Provider ID:** `brave`

**Description:** Brave Search provides independent search results with strong privacy protections. It offers a robust web search API suitable for agent interactions.

**API Documentation:** https://api.search.brave.com/app/documentation/web-search/get-started

**Getting an API Key:**
1. Visit https://api.search.brave.com/
2. Sign up for an account
3. Create a new subscription
4. Copy your API key from the dashboard

**Features:**
- Web search results with title, URL, and description
- Safe search filtering
- High-quality results
- Rate limits: Varies by subscription plan

### Tavily Search

**Provider ID:** `tavily`

**Description:** Tavily Search is designed specifically for AI applications, providing optimized search results for agent use cases.

**API Documentation:** https://docs.tavily.com/

**Getting an API Key:**
1. Visit https://tavily.com/
2. Sign up for an account
3. Navigate to the API keys section
4. Generate a new API key

**Features:**
- AI-optimized search results
- Content filtering for agent consumption
- Answer-focused results
- Rate limits: Varies by subscription plan

## Configuration

### Agent-Level Configuration

To configure search for an agent, you need to:

1. **Add an API Key** to your project for the search provider
2. **Configure the agent** to use the search tool with your preferred provider

#### Step 1: Add Search API Key

Navigate to your project's API Keys section and add a new key:

```json
{
  "name": "Brave Search API",
  "provider": "brave_search",
  "key": "your_brave_search_api_key_here"
}
```

#### Step 2: Configure Agent Tools

When creating or updating an agent, include the web search tool with your preferred configuration:

```json
{
  "tools": [
    {
      "name": "web_search",
      "enabled": true,
      "parameters": {
        "search_provider": "brave",
        "search_api_key_id": "your_api_key_id"
      }
    }
  ]
}
```

### Tool Parameters

The web search tool accepts the following parameters:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | The search query to execute |
| `max_results` | number | No | 5 | Maximum number of results (1-20) |
| `provider` | string | No | brave | Search provider to use (`brave` or `tavily`) |

### Response Format

The web search tool returns results in the following format:

```json
{
  "query": "artificial intelligence trends",
  "provider": "brave",
  "results": [
    {
      "title": "AI Trends for 2024",
      "url": "https://example.com/ai-trends",
      "snippet": "Latest developments in artificial intelligence..."
    }
  ],
  "total_results": 10,
  "search_time_ms": 245,
  "error": null
}
```

## Usage Examples

### Basic Search

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "latest JavaScript frameworks 2024"
  }
}
```

### Search with Specific Provider

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "machine learning tutorials",
    "provider": "tavily",
    "max_results": 10
  }
}
```

### Programming Example

```javascript
// Execute search through agent
const result = await agent.executeTool('web_search', {
  query: 'climate change research papers',
  provider: 'brave',
  max_results: 5
});

console.log(`Found ${result.total_results} results:`);
result.results.forEach(item => {
  console.log(`- ${item.title}: ${item.url}`);
});
```

## Fallback Behavior

If no search API key is configured, the web search tool will return placeholder results with a message indicating that search configuration is needed. This ensures agents continue to function even without search capabilities.

## Rate Limits and Costs

Both search providers have rate limits and costs associated with API usage:

- **Brave Search**: Check your subscription plan for limits
- **Tavily Search**: Check your subscription plan for limits

Monitor your API usage through the respective provider dashboards to avoid unexpected costs or rate limit errors.

## Troubleshooting

### Common Issues

1. **"API key is required" error**
   - Ensure you have added a search API key to your project
   - Verify the API key is active and correctly configured

2. **"Unsupported search provider" error**
   - Check that you're using a supported provider: `brave` or `tavily`
   - Verify the provider name is spelled correctly

3. **Rate limit errors**
   - Check your API usage in the provider dashboard
   - Consider upgrading your subscription plan
   - Implement retry logic with backoff in your application

4. **Empty search results**
   - Verify your search query is appropriate
   - Check if the provider is experiencing issues
   - Try a different search provider

### Testing Search Configuration

You can test your search configuration using the test script:

```bash
cd /path/to/llm-crafter
node /tmp/test-internet-search.js
```

This will verify that the search service is properly configured and can handle requests.