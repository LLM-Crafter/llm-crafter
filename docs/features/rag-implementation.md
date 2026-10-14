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

### Documents (pre-chunked, client-owned)

Use these when you chunk documents yourself and need to replace or delete
them later. The document ID is yours; LLM Crafter stores each chunk as
`{documentId}#{i}` and tracks the document in a registry, so deletes and
re-indexes never depend on searching the vector store.

```
PUT    /api/v1/organizations/{orgId}/projects/{projectId}/rag/documents/{documentId}
GET    /api/v1/organizations/{orgId}/projects/{projectId}/rag/documents/{documentId}
GET    /api/v1/organizations/{orgId}/projects/{projectId}/rag/documents
DELETE /api/v1/organizations/{orgId}/projects/{projectId}/rag/documents/{documentId}
```

Pass `knowledge_base_id` in the body for `PUT`, and as a query parameter for
`GET` and `DELETE`. Leave it out to use the project-wide knowledge base.

> **Response wrapping.** Every response has a top-level `success` boolean.
> Single-document reads are wrapped in a `document` key, and job reads in a
> `job` key. Read `body.document.status`, not `body.status`.

#### The document object

`GET .../rag/documents/{documentId}` returns this object under `document`.
`GET .../rag/documents` returns a list of them under `documents`.

```json
{
  "document_id": "3f9c2b1e-...",
  "knowledge_base_id": null,
  "status": "indexed",
  "revision": 3,
  "chunk_count": 12,
  "metadata": { "file_name": "handbook.pdf", "type": "document" },
  "job_id": "7d2e...-uuid",
  "error": null,
  "indexed_at": "2026-10-14T09:12:44.120Z",
  "updated_at": "2026-10-14T09:12:44.131Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `document_id` | string | Your ID, exactly as sent. |
| `knowledge_base_id` | string \| null | `null` for the project-wide knowledge base. |
| `status` | string | `pending`, `indexing`, `indexed`, `failed` or `deleting`. See below. |
| `revision` | number | Goes up on every `PUT` and `DELETE`. |
| `chunk_count` | number | Chunks in the last successfully indexed version. `0` until the first index finishes. |
| `metadata` | object | Document-level metadata. |
| `job_id` | string \| null | Background job of the latest `PUT`. `null` when it was processed inline. |
| `error` | string \| null | Set only when `status` is `failed`. |
| `indexed_at` | string \| null | ISO 8601 time of the last successful index. |
| `updated_at` | string | ISO 8601 time of the last change to this document. |

| `status` | Meaning | Final? |
|---|---|---|
| `pending` | Queued, not started yet | no |
| `indexing` | Embedding and writing chunks | no |
| `indexed` | Searchable | yes |
| `failed` | Indexing failed; see `error`. Send the document again to retry | yes |
| `deleting` | A delete is in progress | no |

A deleted document isn't returned: `GET` responds `404`.

#### `PUT .../rag/documents/{documentId}`: index or replace

Indexes the document, or replaces it. Chunks past the new chunk count are
removed, and identical content isn't re-embedded. Metadata values must be
strings, numbers, booleans or string arrays; anything else is dropped.

Request:

```json
{
  "api_key_id": "<embedding api key id>",
  "knowledge_base_id": "<optional>",
  "process_in_background": true,
  "metadata": { "file_name": "handbook.pdf" },
  "chunks": [
    {
      "content": "Chunk text returned by search",
      "embed_text": "Optional text to embed instead, e.g. generated context + chunk",
      "metadata": { "page_number": 3 }
    }
  ]
}
```

`202 Accepted`: queued for background indexing (the default):

```json
{
  "success": true,
  "document_id": "3f9c2b1e-...",
  "knowledge_base_id": null,
  "revision": 3,
  "status": "pending",
  "background_processing": true,
  "job_id": "7d2e...-uuid",
  "status_endpoint": "/api/v1/organizations/{orgId}/projects/{projectId}/rag/documents/3f9c2b1e-..."
}
```

`200 OK`: the content is identical to what's already indexed, so no job is
created and `job_id` is absent:

```json
{
  "success": true,
  "document_id": "3f9c2b1e-...",
  "knowledge_base_id": null,
  "revision": 2,
  "status": "indexed",
  "unchanged": true,
  "chunk_count": 12,
  "message": "Document content is unchanged; nothing to re-index"
}
```

`200 OK`: processed inline (`"process_in_background": false`):

```json
{
  "success": true,
  "document_id": "3f9c2b1e-...",
  "knowledge_base_id": null,
  "revision": 3,
  "status": "indexed",
  "background_processing": false,
  "chunk_count": 12,
  "vector_ids": ["3f9c2b1e-...#0", "3f9c2b1e-...#1"]
}
```

Here `status` can also be `superseded`: a newer `PUT` or a `DELETE` for the same
document arrived while this one was running, and that newer request is the one
that counts.

#### `GET .../rag/documents/{documentId}`: document status

`200 OK`:

```json
{
  "success": true,
  "document": { "document_id": "3f9c2b1e-...", "status": "indexed", "...": "see the document object" }
}
```

`404 Not Found`: the document was never indexed, or it was deleted:

```json
{ "success": false, "error": "Document not found" }
```

To track a background `PUT`, poll this endpoint until `document.status` is
`indexed` or `failed`. Polling the job (`GET .../rag/jobs/{jobId}`) also works,
but the job only reports progress. The document's `status` is the source of
truth.

#### `GET .../rag/documents`: list documents

Query parameters: `status` (one of the values above), `limit` (1–200, default
50), `skip` (default 0). Deleted documents are never listed. The list is sorted
by most recently updated.

`200 OK`:

```json
{
  "success": true,
  "documents": [ { "document_id": "3f9c2b1e-...", "status": "indexed", "...": "see the document object" } ],
  "total": 37
}
```

`total` counts every match, not just the returned page.

#### `DELETE .../rag/documents/{documentId}`: delete every chunk

A delete also stops an index job that is still running for the document.

`200 OK`:

```json
{
  "success": true,
  "message": "Deleted 12 document chunks",
  "deleted_count": 12,
  "document_id": "3f9c2b1e-...",
  "knowledge_base_id": null
}
```

- Deleting a document that is already deleted returns `200` with
  `"deleted_count": 0` and `"message": "Document was already deleted"`.
- `deleted_count` is `null` only for a document indexed before the registry
  existed, on Pinecone, where the number of removed chunks can't be counted.

`404 Not Found`: no such document in this project or knowledge base:

```json
{
  "success": false,
  "error": "Document not found",
  "document_id": "3f9c2b1e-...",
  "knowledge_base_id": null
}
```

Treat `404` as "already gone": it's safe to remove your own record.

#### `GET .../rag/jobs/{jobId}`: job status

Wrapped in `job`:

```json
{
  "success": true,
  "job": {
    "job_id": "7d2e...-uuid",
    "type": "document",
    "status": "completed",
    "knowledge_base_id": null,
    "progress": {
      "total_documents": 1,
      "processed_documents": 1,
      "successful_documents": 1,
      "failed_documents": 0,
      "indexed_chunks": 12,
      "completion_percentage": 100
    },
    "created_at": "2026-10-14T09:12:40.002Z",
    "started_at": "2026-10-14T09:12:41.510Z",
    "completed_at": "2026-10-14T09:12:44.140Z",
    "processing_time_ms": 2630,
    "is_active": false,
    "results": { "indexed_count": 12, "indexed_ids": ["..."], "errors": [] }
  }
}
```

Job `status` is `pending`, `processing`, `completed` or `failed`. These are
different values from the document `status`. `results` is present only when
the job is `completed`; `error` (a string) only when it is `failed`. If every
document in a job fails, the job is `failed`.

#### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "errors": [{ "msg": "...", "path": "chunks", ... }] }` | Request validation failed. Note: no `success` field. |
| `400` | `{ "success": false, "error": "..." }` | Invalid document content, or no embedding API key |
| `404` | `{ "success": false, "error": "Knowledge base not found" }` | `knowledge_base_id` doesn't exist in this project |
| `500` | `{ "success": false, "error": "..." }` | Unexpected failure; safe to retry |

#### Pre-chunked items on `POST /rag/index`

Items sent to `POST /rag/index` that carry `metadata.document_id` are treated as
chunks of that document and go through the same registry. The document can
then be read with `GET .../rag/documents/{document_id}` and deleted with
`DELETE`. If an item's `content` starts with its `metadata.chunk_context`, the
context is embedded but not returned by search.

The response is unchanged, plus a `document_ids` list:

```json
{
  "success": true,
  "background_processing": true,
  "job_id": "7d2e...-uuid",
  "knowledge_base_id": null,
  "estimated_time": "~24 seconds",
  "message": "Documents queued for background indexing. Use job ID 7d2e...-uuid to check status.",
  "document_count": 12,
  "document_ids": ["3f9c2b1e-..."],
  "status_endpoint": "/api/v1/organizations/{orgId}/projects/{projectId}/rag/jobs/7d2e...-uuid"
}
```

`document_count` is the number of items sent (chunks), not the number of
documents.

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
