# RAG Search Tool

Search through indexed knowledge base using semantic similarity and keyword matching for retrieval-augmented generation (RAG).

## Overview

The RAG Search tool enables agents to search through a vector database of indexed content using semantic similarity, keyword matching, or hybrid approaches. Perfect for large knowledge bases, product catalogs, and documentation.

## Configuration

**Category:** Knowledge  
**Tool Name:** `rag_search`

## Parameters

| Parameter          | Type    | Required | Default    | Description                                            |
| ------------------ | ------- | -------- | ---------- | ------------------------------------------------------ |
| `query`            | string  | Yes      | -          | The search query                                       |
| `limit`            | number  | No       | 10         | Maximum results to return (1-20)                       |
| `threshold`        | number  | No       | 0.7        | Minimum similarity threshold (0-1)                     |
| `search_type`      | string  | No       | `semantic` | Search type: `semantic`, `hybrid`, `keyword`           |
| `brands`           | array   | No       | `[]`       | Filter by brands                                       |
| `models`           | array   | No       | `[]`       | Filter by models                                       |
| `themes`           | array   | No       | `[]`       | Filter by themes/topics                                |
| `sentiment`        | string  | No       | -          | Filter by sentiment: `positive`, `negative`, `neutral` |
| `include_metadata` | boolean | No       | true       | Include metadata in results                            |

## Search Types

### Semantic Search

Uses vector embeddings for meaning-based search:

```json
{
  "query": "comfortable running shoes",
  "search_type": "semantic"
}
```

Finds results based on meaning, not just keywords.

### Keyword Search

Traditional keyword matching:

```json
{
  "query": "Nike Air Max",
  "search_type": "keyword"
}
```

Finds exact keyword matches.

### Hybrid Search

Combines semantic and keyword (default weights: 70% semantic, 30% keyword):

```json
{
  "query": "best laptop for programming",
  "search_type": "hybrid"
}
```

Best balance of accuracy and coverage.

## Usage Example

```json
{
  "tool_name": "rag_search",
  "parameters": {
    "query": "best wireless headphones for travel",
    "limit": 5,
    "threshold": 0.7,
    "search_type": "semantic",
    "brands": ["Sony", "Bose"],
    "themes": ["noise-cancellation"]
  }
}
```

## Response Format

```json
{
  "query": "best wireless headphones for travel",
  "results": [
    {
      "id": "doc_123",
      "content": "The Sony WH-1000XM5 offers excellent noise cancellation...",
      "similarity": 0.89,
      "metadata": {
        "type": "review",
        "url": "https://example.com/reviews/sony-xm5",
        "title": "Sony WH-1000XM5 Review",
        "brand": "Sony",
        "model": "WH-1000XM5",
        "author": "TechReviewer",
        "themes": ["noise-cancellation", "travel", "bluetooth"],
        "pros": ["Excellent ANC", "Long battery life", "Comfortable"],
        "cons": ["Expensive", "Bulky case"]
      }
    }
  ],
  "total_results": 12,
  "search_method": "semantic",
  "execution_time_ms": 45,
  "success": true
}
```

## Metadata Fields

Results can include rich metadata:

- **type**: Content type (review, article, doc, etc.)
- **url**: Source URL
- **title**: Content title
- **brand**: Product brand
- **model**: Product model
- **author**: Content author
- **themes**: Content themes/topics
- **pros**: Positive aspects (for reviews)
- **cons**: Negative aspects (for reviews)
- **sentiment**: Overall sentiment

## Filtering

### By Brand

```json
{
  "query": "best smartphones",
  "brands": ["Apple", "Samsung"]
}
```

### By Themes

```json
{
  "query": "gaming laptops",
  "themes": ["gaming", "high-performance"]
}
```

### By Sentiment

```json
{
  "query": "customer reviews",
  "sentiment": "positive"
}
```

### Combined Filters

```json
{
  "query": "noise cancelling headphones",
  "brands": ["Sony", "Bose"],
  "themes": ["travel", "noise-cancellation"],
  "sentiment": "positive",
  "threshold": 0.8
}
```

## Common Use Cases

- **Product Recommendations**: Search product catalogs
- **Customer Support**: Find relevant help articles
- **Documentation Search**: Search technical documentation
- **Content Discovery**: Find related articles/content
- **Knowledge Base**: Search company knowledge base
- **Review Analysis**: Find product reviews and feedback

## Configuration in Agents

```json
{
  "name": "product_assistant",
  "type": "chatbot",
  "tools": ["rag_search", "web_search"],
  "system_prompt": "You help users find products. Use rag_search to find relevant products from our catalog..."
}
```

## Setup Requirements

### 1. Vector Database

RAG search requires a configured vector database. See [Vector Database Setup](/features/vector-database-setup).

Supported databases:

- Pinecone
- Weaviate
- Qdrant
- Milvus

### 2. Content Indexing

Index your content using the background indexing system. See [RAG Background Indexing](/features/rag-background-indexing).

### 3. API Key with Embeddings

The agent's API key must support embeddings for semantic search.

## Best Practices

- **Clear Queries**: Use descriptive search queries
- **Appropriate Limits**: Request only needed results (5-10 typically sufficient)
- **Threshold Tuning**: Adjust threshold based on accuracy needs
- **Use Filters**: Apply filters to narrow results
- **Hybrid Search**: Use hybrid for best balance
- **Include Metadata**: Enable metadata for richer context

## Performance Optimization

- **Semantic Weight**: Adjust for your use case (default: 0.7)
- **Keyword Weight**: Complements semantic (default: 0.3)
- **Result Limits**: Lower limits = faster responses
- **Threshold**: Higher threshold = fewer but better results

## Error Handling

- **Vector DB Not Configured**: Returns error
- **No API Key**: Returns error for semantic search
- **No Results**: Returns empty results array
- **Index Not Ready**: Returns error if indexing in progress

## Advanced Configuration

Configure RAG settings at the project level:

```json
{
  "semantic_weight": 0.7,
  "keyword_weight": 0.3,
  "default_threshold": 0.7,
  "max_results": 20,
  "include_stats": false
}
```

## Integration with Other Tools

### With Web Search

```json
// Step 1: Search internal knowledge
{
  "tool_name": "rag_search",
  "parameters": {
    "query": "product installation guide"
  }
}

// Step 2: If no results, search web
{
  "tool_name": "web_search",
  "parameters": {
    "query": "product installation guide"
  }
}
```

### With JSON Processor

```json
// Step 1: RAG search
{
  "tool_name": "rag_search",
  "parameters": {
    "query": "pricing information"
  }
}

// Step 2: Extract specific fields
{
  "tool_name": "json_processor",
  "parameters": {
    "data": "<<RAG_RESULTS>>",
    "operation": "extract",
    "path": "results.0.metadata.price"
  }
}
```

## Related Tools

- [FAQ](/tools/faq) - For frequently asked questions
- [Web Search](/tools/web-search) - For external information
- [JSON Processor](/tools/json-processor) - Process search results
- [LLM Prompt](/tools/llm-prompt) - Generate responses from search results

## Related Documentation

- [RAG Implementation](/features/rag-implementation) - Implementation details
- [RAG Background Indexing](/features/rag-background-indexing) - Content indexing
- [Vector Database Setup](/features/vector-database-setup) - Database configuration
