# Webpage Scraper Tool

Extract and scrape content from web pages using local scraper or Tavily extract API.

## Overview

The Webpage Scraper tool allows agents to extract clean, readable content from web pages. It removes ads, navigation, and other clutter to provide the main content in a structured format.

## Configuration

**Category:** Web  
**Tool Name:** `webpage_scraper`

## Parameters

| Parameter  | Type   | Required | Default | Description                           |
| ---------- | ------ | -------- | ------- | ------------------------------------- |
| `url`      | string | Yes      | -       | The URL of the webpage to scrape      |
| `provider` | string | No       | `local` | Scraper provider: `local` or `tavily` |

## Usage Example

```json
{
  "tool_name": "webpage_scraper",
  "parameters": {
    "url": "https://example.com/article",
    "provider": "local"
  }
}
```

## Response Format

```json
{
  "url": "https://example.com/article",
  "provider": "local",
  "content": "The main content of the webpage...",
  "title": "Article Title",
  "success": true,
  "scrape_time_ms": 456
}
```

## Scraping Providers

### Local Scraper

**Features:**

- No API key required
- Fast local processing
- Basic content extraction
- Works with most websites

**Best For:**

- Simple content extraction
- High-volume scraping
- Cost-sensitive applications

### Tavily Scraper

**Setup:**

1. Get API key from [Tavily](https://tavily.com/)
2. Configure via API endpoint:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/webpage-scraper-config
```

**Request Body:**

```json
{
  "provider": "tavily",
  "api_key": "your-tavily-api-key"
}
```

**Features:**

- AI-powered content extraction
- Better handling of complex layouts
- JavaScript-rendered content support
- Enhanced content cleaning

**Best For:**

- Complex websites
- JavaScript-heavy sites
- High-quality extraction needs

**Note:** For local scraper (default), no API key needed:

```json
{
  "provider": "local"
}
```

Get the configuration:

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/webpage-scraper-config
```

## Best Practices

- **Valid URLs**: Always verify URL format before scraping
- **Rate Limiting**: Be respectful of target websites
- **Error Handling**: Handle failures gracefully (sites may block scrapers)
- **Content Size**: Be aware that large pages may take longer to process

## Common Use Cases

- **Article Extraction**: Extract news articles and blog posts
- **Documentation**: Scrape technical documentation
- **Product Information**: Extract product details from e-commerce sites
- **Research**: Gather content from multiple sources
- **Content Analysis**: Extract text for processing or analysis

## Configuration in Agents

To enable webpage scraping for an agent:

```json
{
  "name": "research_assistant",
  "type": "chatbot",
  "tools": ["web_search", "webpage_scraper"],
  "system_prompt": "You can search the web and extract content from specific pages..."
}
```

## Workflow Example

Combine with web search for comprehensive research:

1. Use `web_search` to find relevant URLs
2. Use `webpage_scraper` to extract content from those URLs
3. Process and analyze the extracted content

```json
// Step 1: Search
{
  "tool_name": "web_search",
  "parameters": {
    "query": "AI best practices 2025"
  }
}

// Step 2: Scrape top result
{
  "tool_name": "webpage_scraper",
  "parameters": {
    "url": "https://example.com/ai-best-practices"
  }
}
```

## Error Handling

Common error scenarios:

- **Invalid URL**: Returns error for malformed URLs
- **Access Denied**: Some sites block scraping
- **Timeout**: Large pages may timeout
- **Content Not Found**: Some pages may have no extractable content

## Limitations

- Some websites block automated scraping
- JavaScript-heavy sites may require Tavily provider
- Rate limiting may apply based on provider
- Large files (PDFs, videos) are not supported

## Related Tools

- [Web Search](/tools/web-search) - Find URLs to scrape
- [JSON Processor](/tools/json-processor) - Process scraped structured data
