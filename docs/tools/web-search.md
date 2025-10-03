# Web Search Tool

Search the web for information using Brave Search or Tavily search engines.

## Overview

The Web Search tool enables agents to search the internet for real-time information, news, facts, and data. It supports multiple search providers and returns structured results with titles, URLs, and snippets.

## Configuration

**Category:** Web  
**Tool Name:** `web_search`

## Parameters

| Parameter     | Type   | Required | Default | Description                                 |
| ------------- | ------ | -------- | ------- | ------------------------------------------- |
| `query`       | string | Yes      | -       | The search query to execute                 |
| `max_results` | number | No       | 5       | Maximum number of results to return (1-20)  |
| `provider`    | string | No       | `brave` | Search provider to use: `brave` or `tavily` |

## Usage Example

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "latest developments in artificial intelligence 2025",
    "max_results": 5,
    "provider": "brave"
  }
}
```

## Response Format

```json
{
  "query": "latest developments in artificial intelligence 2025",
  "provider": "brave",
  "results": [
    {
      "title": "AI Breakthroughs in 2025",
      "url": "https://example.com/ai-2025",
      "snippet": "Recent developments in AI include..."
    }
  ],
  "total_results": 156,
  "search_time_ms": 234
}
```

## Search Providers

### Brave Search

**Setup:**

1. Get API key from [Brave Search API](https://brave.com/search/api/)
2. Configure via API endpoint:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config
```

**Request Body:**

```json
{
  "provider": "brave",
  "api_key": "your-brave-api-key",
  "default_max_results": 10
}
```

**Features:**

- Fast and privacy-focused
- No user tracking
- High-quality results
- Free tier: 2,000 queries per month

### Tavily Search

**Setup:**

1. Get API key from [Tavily](https://tavily.com/)
2. Configure via API endpoint:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config
```

**Request Body:**

```json
{
  "provider": "tavily",
  "api_key": "your-tavily-api-key",
  "default_max_results": 10
}
```

**Features:**

- AI-optimized search
- Enhanced result quality
- Structured data extraction

**Note:** API keys are encrypted using AES-256-GCM encryption before storage. Get the configuration:

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/web-search-config
```

## Best Practices

- **Be Specific**: Use clear, specific queries for better results
- **Limit Results**: Request only the number of results you need (3-5 typically sufficient)
- **Provider Selection**: Use Brave for general searches, Tavily for AI-optimized results
- **Error Handling**: Handle cases where no results are found gracefully

## Common Use Cases

- **Real-time Information**: Current events, news, weather
- **Fact Checking**: Verify information and claims
- **Research**: Gather information on specific topics
- **Product Information**: Find details about products and services
- **Technical Documentation**: Search for APIs, libraries, and frameworks

## Configuration in Agents

To enable web search for an agent:

```json
{
  "name": "research_assistant",
  "type": "chatbot",
  "tools": ["web_search"],
  "system_prompt": "You are a research assistant with access to web search..."
}
```

## Error Handling

The tool handles various error scenarios:

- **API Key Missing**: Returns error if provider API key not configured
- **Rate Limiting**: Respects provider rate limits
- **Network Errors**: Gracefully handles connection issues
- **No Results**: Returns empty results array with success flag

## Related Tools

- [Webpage Scraper](/tools/webpage-scraper) - Extract content from specific URLs
- [RAG Search](/tools/rag-search) - Search through indexed knowledge base
