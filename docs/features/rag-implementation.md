# RAG (Retrieval-Augmented Generation) Implementation

This document describes the RAG implementation in LLM Crafter, which allows agents to search through indexed knowledge bases to provide context-aware responses.

## 🎯 Overview

The RAG system enables:
- **Knowledge Indexing**: Convert JSON documents into searchable vector embeddings
- **Semantic Search**: Find relevant information using AI-powered similarity matching
- **Hybrid Search**: Combine semantic and keyword-based search for better results
- **Agent Integration**: Automatic knowledge retrieval during conversations
- **Multi-tenant**: Organization and project-scoped knowledge bases

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   JSON Data     │    │   RAG Service   │    │  Vector Store   │
│   Documents     │───►│   Processing    │───►│   (In-Memory)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                        ┌─────────────────┐
                        │   OpenAI        │
                        │   Embeddings    │
                        └─────────────────┘
                                │
                        ┌─────────────────┐
                        │   Agent Tool    │
                        │   Integration   │
                        └─────────────────┘
```

## 📦 Components

### 1. RAG Service (`src/services/ragService.js`)
- **Document Processing**: Converts JSON to searchable chunks
- **Embedding Generation**: Creates vector representations
- **Search Logic**: Semantic, keyword, and hybrid search
- **Statistics**: Knowledge base metrics

### 2. RAG Controller (`src/controllers/ragController.js`)
- **API Endpoints**: REST API for managing documents
- **Validation**: Input validation and error handling
- **Authentication**: Organization-scoped access control

### 3. RAG Tool (`src/services/toolService.js`)
- **Agent Integration**: `rag_search` tool for agents
- **Configuration**: Per-agent RAG settings
- **Context Injection**: Automatic knowledge retrieval

### 4. Data Model (`src/models/RagDocument.js`)
- **Document Storage**: MongoDB model for indexed documents
- **Metadata Management**: Rich document metadata
- **Usage Tracking**: Search statistics and analytics

## 🚀 Getting Started

### 1. Prerequisites
```bash
# Ensure you have:
- Node.js 18+
- MongoDB running
- Valid OpenAI API key
- LLM Crafter server running
```

### 2. Index Your First Documents

```bash
# Run the demo script
node examples/rag-demo.js

# Or use the API directly:
curl -X POST "http://localhost:3000/api/v1/organizations/{org_id}/projects/{project_id}/rag/index" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "title": "Product Review",
        "brand": "Tesla",
        "model": "Model S",
        "content": "Detailed review content...",
        "pros": ["Fast", "Efficient"],
        "cons": ["Expensive"],
        "themes": ["performance", "luxury"]
      }
    ],
    "api_key_id": "your-api-key-id"
  }'
```

### 3. Search Documents

```bash
curl -X POST "http://localhost:3000/api/v1/organizations/{org_id}/projects/{project_id}/rag/search" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the pros and cons of Tesla?",
    "search_type": "hybrid",
    "limit": 5,
    "api_key_id": "your-api-key-id"
  }'
```

### 4. Configure Agent with RAG

```javascript
// When creating/updating an agent
{
  "name": "Knowledge Assistant",
  "type": "chatbot",
  "tools": ["rag_search"],
  "tool_configs": {
    "rag_search": {
      "organization_id": "your-org-id",
      "project_id": "your-project-id",
      "semantic_weight": 0.7,
      "keyword_weight": 0.3,
      "include_stats": false
    }
  }
}
```

## 📊 JSON Document Format

Your JSON documents should follow this structure:

```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "brand": "Brand Name",
  "model": "Product Model",
  "year": "2024",
  "rating": "8.5/10",
  "summary": "Brief summary...",
  "content": "Full article content...",
  "pros": [
    "Advantage 1",
    "Advantage 2"
  ],
  "cons": [
    "Disadvantage 1",
    "Disadvantage 2"
  ],
  "technical_specs": {
    "engine": "V8",
    "power": "500 hp",
    "fuel_consumption": "12L/100km",
    "price": "$50,000",
    "transmission": "Automatic"
  },
  "price_info": "Starting at $50,000",
  "author": "John Doe",
  "date_published": "01/01/2024",
  "sentiment": "positive",
  "themes": [
    "performance",
    "luxury",
    "technology"
  ]
}
```

## 🔍 Search Types

### 1. Semantic Search
Uses AI embeddings to find conceptually similar content.

```javascript
{
  "query": "What are the benefits of electric vehicles?",
  "search_type": "semantic",
  "threshold": 0.7
}
```

### 2. Keyword Search
Traditional text-based search with metadata filtering.

```javascript
{
  "query": "Tesla performance",
  "search_type": "keyword",
  "brands": ["Tesla"],
  "themes": ["performance"]
}
```

### 3. Hybrid Search
Combines semantic and keyword search for best results.

```javascript
{
  "query": "luxury car comfort features",
  "search_type": "hybrid",
  "semantic_weight": 0.7,
  "keyword_weight": 0.3
}
```

## 🛠️ Advanced Features

### Document Processing
The system automatically creates multiple searchable chunks from each document:
- **Main Content**: Title + Summary + Content
- **Pros/Cons**: Structured advantage/disadvantage information
- **Technical Specs**: Product specifications and details

### Filtering Options
```javascript
{
  "brands": ["Tesla", "BMW"],          // Filter by brand
  "models": ["Model S", "i8"],         // Filter by model
  "themes": ["performance", "luxury"],  // Filter by themes
  "sentiment": "positive",             // Filter by sentiment
  "limit": 10,                        // Maximum results
  "threshold": 0.7                    // Minimum similarity
}
```

### Statistics and Analytics
```bash
GET /api/v1/organizations/{org_id}/projects/{project_id}/rag/stats
```

Returns:
```json
{
  "total_documents": 150,
  "brands": ["Tesla", "BMW", "Audi"],
  "themes": ["performance", "luxury", "technology"],
  "content_types": ["main_content", "pros_cons", "technical_specs"],
  "indexed_range": {
    "oldest": "2024-01-01T00:00:00Z",
    "newest": "2024-12-01T00:00:00Z"
  }
}
```

## 🤖 Agent Integration

### Automatic RAG Usage
When an agent has the `rag_search` tool configured, it will automatically:

1. **Detect Knowledge Queries**: Identify when user asks questions that might benefit from knowledge base search
2. **Search Relevant Information**: Query the knowledge base using the user's question
3. **Contextualize Response**: Use retrieved information to provide accurate, detailed answers
4. **Cite Sources**: Include metadata about where information came from

### Example Agent Conversation
```
User: "What are the main advantages of the Polestar 4?"

Agent: Based on our knowledge base, the Polestar 4 has several key advantages:

1. **Digital Rearview Mirror**: Provides a wider field of view and eliminates glare from other vehicles
2. **Sharp Image Quality**: Especially clear vision at night with HD display
3. **Spacious Interior**: Particularly generous legroom for rear passengers
4. **Advanced Technology**: 2.5-megapixel camera system for enhanced visibility

*Source: "Getest: Zo goed (of slecht) werkt de digitale achteruitkijkspiegel van de Polestar 4" by Joram Van Acker*
```

## 📈 Performance Optimization

### Embedding Efficiency
- **Batch Processing**: Index multiple documents simultaneously
- **Model Selection**: Uses `text-embedding-3-small` for optimal cost/performance
- **Caching**: Reuses embeddings for similar content

### Search Optimization
- **Threshold Tuning**: Adjustable similarity thresholds
- **Result Limiting**: Configurable result counts
- **Hybrid Ranking**: Combines multiple search methods

### Memory Management
- **In-Memory Storage**: Fast retrieval (suitable for development)
- **Production Scaling**: Ready for vector database integration (Pinecone, Weaviate)

## 🔧 Configuration

### Environment Variables
```bash
# Add to your .env file
RAG_DEFAULT_THRESHOLD=0.7
RAG_MAX_RESULTS=20
RAG_EMBEDDING_MODEL=text-embedding-3-small
```

### Agent Configuration
```json
{
  "tool_configs": {
    "rag_search": {
      "organization_id": "org_123",
      "project_id": "proj_456", 
      "semantic_weight": 0.7,
      "keyword_weight": 0.3,
      "include_stats": false,
      "default_limit": 5,
      "default_threshold": 0.7
    }
  }
}
```

## 📚 API Reference

### Index Documents
```
POST /api/v1/organizations/{orgId}/projects/{projectId}/rag/index
```

### Search Documents
```
POST /api/v1/organizations/{orgId}/projects/{projectId}/rag/search
```

### Get Statistics
```
GET /api/v1/organizations/{orgId}/projects/{projectId}/rag/stats
```

### Clear Knowledge Base
```
DELETE /api/v1/organizations/{orgId}/projects/{projectId}/rag
```

### Batch Index
```
POST /api/v1/organizations/{orgId}/projects/{projectId}/rag/batch-index
```

## 🚀 Production Deployment

### Vector Database Integration
For production use, replace the in-memory storage with a proper vector database:

```javascript
// Example: Pinecone integration
const { PineconeClient } = require('@pinecone-database/pinecone');

const pinecone = new PineconeClient();
await pinecone.init({
  environment: process.env.PINECONE_ENVIRONMENT,
  apiKey: process.env.PINECONE_API_KEY,
});
```

### Scaling Considerations
- **Embedding Costs**: Monitor OpenAI API usage
- **Search Performance**: Implement caching for frequent queries
- **Document Limits**: Set reasonable indexing limits per organization
- **Rate Limiting**: Implement search rate limits

### Monitoring
- Track embedding generation costs
- Monitor search latency
- Analyze search accuracy metrics
- Log usage patterns per organization

## 🔍 Troubleshooting

### Common Issues

**Documents not indexing:**
- Verify API key has sufficient credits
- Check document format matches expected JSON structure
- Ensure organization/project IDs are correct

**Search returns no results:**
- Lower the similarity threshold (try 0.5 instead of 0.7)
- Check if documents were indexed for the correct org/project
- Verify search query is meaningful

**Poor search quality:**
- Try hybrid search instead of semantic-only
- Add more context to search queries
- Ensure indexed content is relevant and well-written

### Debug Mode
Enable detailed logging by setting:
```bash
NODE_ENV=development
DEBUG=rag:*
```

## 🤝 Contributing

To contribute to the RAG implementation:

1. **Add New Search Methods**: Implement additional similarity algorithms
2. **Vector Database Connectors**: Add support for different vector databases  
3. **Document Processors**: Support additional document formats
4. **Performance Optimizations**: Improve search speed and accuracy
5. **Analytics**: Enhanced usage tracking and insights

## 📄 License

This RAG implementation is part of LLM Crafter and follows the same MIT license.
