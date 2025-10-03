# RAG (Retrieval-Augmented Generation)

LLM Crafter implements a comprehensive RAG system that enables agents to search through indexed knowledge bases to provide context-aware responses. The system supports background indexing, multiple vector database providers, and advanced search capabilities.

## Overview

The RAG system provides:

- **Knowledge Indexing**: Convert JSON documents into searchable vector embeddings
- **Semantic Search**: Find relevant information using AI-powered similarity matching
- **Hybrid Search**: Combine semantic and keyword-based search for better results
- **Background Processing**: Non-blocking indexing for large document sets with progress tracking
- **Agent Integration**: Automatic knowledge retrieval during conversations via `rag_search` tool
- **Vector Database Support**: In-memory (development), Weaviate, and Pinecone
- **Multi-tenant**: Organization and project-scoped knowledge bases

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   JSON Data     │    │   RAG Service   │    │  Vector Store   │
│   Documents     │───►│   Processing    │───►│   (Configurable)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                        ┌─────────────────┐    ┌────────────────┐
                        │   OpenAI        │    │  - Memory      │
                        │   Embeddings    │    │  - Weaviate    │
                        └─────────────────┘    │  - Pinecone    │
                                │              └────────────────┘
                        ┌─────────────────┐
                        │   Background    │
                        │   Job Queue     │
                        └─────────────────┘
                                │
                        ┌─────────────────┐
                        │   Agent Tool    │
                        │   Integration   │
                        └─────────────────┘
```

## Components

### 1. RAG Service (`src/services/ragService.js`)

- Document processing: Converts JSON to searchable chunks
- Embedding generation: Creates vector representations using OpenAI
- Search logic: Semantic, keyword, and hybrid search
- Statistics: Knowledge base metrics

### 2. RAG Controller (`src/controllers/ragController.js`)

- REST API endpoints for managing documents
- Background vs synchronous processing control
- Validation and error handling
- Organization-scoped access control

### 3. Vector Database Service (`src/services/vectorDatabaseService.js`)

- Unified interface for multiple vector database providers
- Provider implementations: Memory, Weaviate, Pinecone
- Connection management and testing

### 4. Vector Database Controller (`src/controllers/vectorDatabaseController.js`)

- Vector database configuration management
- Connection testing and validation
- Provider information and statistics

### 5. Indexing Job Processor (`src/services/indexingJobProcessor.js`)

- Background job queue management
- Progress tracking and status updates
- Concurrent job processing
- Error handling and retries

### 6. RAG Tool (in `src/services/toolService.js`)

- Agent integration via `rag_search` tool
- Per-agent RAG configuration
- Automatic knowledge retrieval

## Vector Database Configuration

### Supported Providers

#### 1. In-Memory Storage (Development)

Default for testing and development. Data is not persistent.

```json
{
  "provider": "memory",
  "config": {
    "maxDocuments": 10000
  }
}
```

**Features:**

- No setup required
- Fast local development
- Not persistent (data lost on restart)

#### 2. Weaviate

Open-source vector database with GraphQL API.

```json
{
  "provider": "weaviate",
  "config": {
    "endpoint": "https://my-cluster.weaviate.network",
    "apiKey": "your-weaviate-api-key",
    "scheme": "https",
    "className": "LLMCrafterDocument"
  }
}
```

**Features:**

- Production-ready
- Scalable and persistent
- GraphQL API
- Hybrid search support
- Advanced filtering

**Setup:**

```bash
npm install weaviate-ts-client
```

#### 3. Pinecone

Managed vector database service.

```json
{
  "provider": "pinecone",
  "config": {
    "apiKey": "your-pinecone-api-key",
    "environment": "us-east1-gcp",
    "indexName": "llm-crafter"
  }
}
```

**Features:**

- Fully managed service
- Scalable and reliable
- Pay-as-you-go pricing
- Filtering support

**Setup:**

```bash
npm install @pinecone-database/pinecone
```

### Configure Vector Database

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/vector-databases`

**Request:**

```json
{
  "name": "Production Vector DB",
  "description": "Main vector database for production",
  "provider": "weaviate",
  "config": {
    "endpoint": "https://my-cluster.weaviate.network",
    "apiKey": "your-api-key",
    "scheme": "https"
  },
  "is_default": true
}
```

**Response:**

```json
{
  "success": true,
  "configuration": {
    "_id": "config_123",
    "name": "Production Vector DB",
    "provider": "weaviate",
    "is_default": true,
    "is_active": true,
    "created_at": "2025-01-01T10:00:00Z"
  },
  "connection_test": {
    "success": true,
    "latency_ms": 45,
    "provider_version": "1.24.0"
  }
}
```

### Get Configurations

**Endpoint:** `GET /api/v1/organizations/:orgId/projects/:projectId/vector-databases`

### Test Connection

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/test`

### Set Default

**Endpoint:** `PUT /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/default`

### Get Supported Providers

**Endpoint:** `GET /api/v1/vector-databases/providers`

## Document Indexing

### Background Indexing (Recommended)

For large document sets, background indexing provides a non-blocking experience:

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/rag/index`

**Request:**

```json
{
  "documents": [
    {
      "id": "doc1",
      "title": "Product Review: Tesla Model S",
      "brand": "Tesla",
      "model": "Model S",
      "content": "Detailed review content...",
      "pros": ["Fast acceleration", "Long range"],
      "cons": ["High price", "Limited service centers"],
      "themes": ["performance", "luxury", "electric"],
      "rating": "9/10"
    }
  ],
  "api_key_id": "api-key-id",
  "process_in_background": true // Default: true
}
```

**Response:**

```json
{
  "success": true,
  "background_processing": true,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "estimated_time": "~30 seconds",
  "document_count": 1,
  "status_endpoint": "/api/v1/organizations/org/projects/proj/rag/jobs/job-id",
  "message": "Documents queued for background indexing..."
}
```

### Synchronous Indexing

For small documents or when immediate results are needed:

**Request:**

```json
{
  "documents": [
    {
      /* document data */
    }
  ],
  "api_key_id": "api-key-id",
  "process_in_background": false
}
```

**Response:**

```json
{
  "success": true,
  "background_processing": false,
  "indexed_count": 5,
  "indexed_ids": ["chunk1", "chunk2", "chunk3", "chunk4", "chunk5"],
  "message": "Successfully indexed 5 document chunks"
}
```

### JSON Document Format

Your documents should follow this flexible structure:

```json
{
  "id": "doc_123",
  "title": "Article Title",
  "url": "https://example.com/article",
  "brand": "Brand Name",
  "model": "Product Model",
  "year": "2024",
  "rating": "8.5/10",
  "summary": "Brief summary...",
  "content": "Full article content...",
  "pros": ["Advantage 1", "Advantage 2"],
  "cons": ["Disadvantage 1", "Disadvantage 2"],
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
  "themes": ["performance", "luxury", "technology"]
}
```

**Document Processing:**

The system automatically creates multiple searchable chunks:

1. **Main Content**: Title + Summary + Content
2. **Structured Data**: Arrays (pros/cons) and nested objects (technical_specs)
3. **Raw JSON**: Complete document for exact searches

## Background Job Management

### Job Lifecycle

**Job Statuses:**

- `pending`: Queued and waiting to be processed
- `processing`: Currently being processed
- `completed`: Finished successfully
- `failed`: Encountered an error

**Job Types:**

- `single`: Regular document indexing request
- `batch`: Batch document indexing with multiple sets

### Get Job Status

**Endpoint:** `GET /api/v1/organizations/:orgId/projects/:projectId/rag/jobs/:jobId`

**Response:**

```json
{
  "success": true,
  "job": {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "single",
    "status": "completed",
    "progress": {
      "total_documents": 5,
      "processed_documents": 5,
      "successful_documents": 5,
      "failed_documents": 0,
      "indexed_chunks": 25
    },
    "created_at": "2025-01-01T10:00:00.000Z",
    "started_at": "2025-01-01T10:00:05.000Z",
    "completed_at": "2025-01-01T10:01:30.000Z",
    "processing_time_ms": 85000,
    "results": {
      "indexed_count": 25,
      "indexed_ids": ["chunk1", "chunk2", "..."],
      "errors": []
    }
  }
}
```

### List Jobs

**Endpoint:** `GET /api/v1/organizations/:orgId/projects/:projectId/rag/jobs?limit=50`

**Response:**

```json
{
  "success": true,
  "jobs": [
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "batch",
      "status": "completed",
      "progress": {
        "total_documents": 10,
        "processed_documents": 10,
        "indexed_chunks": 50
      },
      "created_at": "2025-01-01T10:00:00.000Z",
      "processing_time_ms": 85000
    }
  ],
  "total": 1
}
```

### Get Job Statistics

**Endpoint:** `GET /api/v1/organizations/:orgId/projects/:projectId/rag/jobs/stats`

**Response:**

```json
{
  "success": true,
  "stats": [
    {
      "_id": "completed",
      "count": 15,
      "total_processing_time": 450000,
      "total_chunks_indexed": 1250
    },
    {
      "_id": "failed",
      "count": 2,
      "total_processing_time": 5000,
      "total_chunks_indexed": 0
    }
  ]
}
```

### Cancel Job

**Endpoint:** `DELETE /api/v1/organizations/:orgId/projects/:projectId/rag/jobs/:jobId`

**Response:**

```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

### Job Processor Configuration

The background processor can be configured in `IndexingJobProcessor`:

```javascript
{
  pollInterval: 5000,        // Check for new jobs every 5 seconds
  maxConcurrentJobs: 3,      // Process up to 3 jobs simultaneously
  retryAttempts: 3,          // Retry failed jobs 3 times
  retryDelay: 30000          // 30 seconds between retries
}
```

## Searching Documents

### Search Types

#### 1. Semantic Search

Uses AI embeddings to find conceptually similar content.

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/rag/search`

**Request:**

```json
{
  "query": "What are the benefits of electric vehicles?",
  "search_type": "semantic",
  "limit": 5,
  "threshold": 0.7,
  "api_key_id": "api-key-id",
  "include_metadata": true
}
```

#### 2. Keyword Search

Traditional text-based search with metadata filtering.

**Request:**

```json
{
  "query": "Tesla performance",
  "search_type": "keyword",
  "limit": 5,
  "brands": ["Tesla"],
  "themes": ["performance"],
  "api_key_id": "api-key-id"
}
```

#### 3. Hybrid Search (Recommended)

Combines semantic and keyword search for best results.

**Request:**

```json
{
  "query": "luxury car comfort features",
  "search_type": "hybrid",
  "limit": 5,
  "semantic_weight": 0.7,
  "keyword_weight": 0.3,
  "api_key_id": "api-key-id"
}
```

**Search Response:**

```json
{
  "success": true,
  "query": "luxury car comfort features",
  "results": [
    {
      "id": "chunk_123",
      "content": "The luxury sedan features premium leather seats...",
      "similarity": 0.89,
      "metadata": {
        "title": "Luxury Car Review",
        "brand": "Mercedes",
        "model": "S-Class",
        "themes": ["luxury", "comfort"]
      }
    }
  ],
  "total_results": 5,
  "search_method": "hybrid"
}
```

### Filtering Options

Apply filters to narrow down search results:

```json
{
  "query": "fast cars",
  "brands": ["Tesla", "BMW"], // Filter by brand
  "models": ["Model S", "i8"], // Filter by model
  "themes": ["performance", "luxury"], // Filter by themes
  "sentiment": "positive", // Filter by sentiment
  "limit": 10, // Maximum results
  "threshold": 0.7 // Minimum similarity (0-1)
}
```

## Knowledge Base Management

### Get Statistics

**Endpoint:** `GET /api/v1/organizations/:orgId/projects/:projectId/rag/stats`

**Response:**

```json
{
  "success": true,
  "stats": {
    "total_documents": 150,
    "brands": ["Tesla", "BMW", "Audi"],
    "themes": ["performance", "luxury", "technology"],
    "content_types": ["main_content", "pros_cons", "technical_specs"],
    "indexed_range": {
      "oldest": "2024-01-01T00:00:00Z",
      "newest": "2024-12-01T00:00:00Z"
    }
  }
}
```

### Clear Knowledge Base

**Endpoint:** `DELETE /api/v1/organizations/:orgId/projects/:projectId/rag`

**Response:**

```json
{
  "success": true,
  "message": "Cleared 150 documents from knowledge base",
  "deleted_count": 150
}
```

### Batch Index Multiple Files

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/rag/batch-index`

Process multiple document batches with background processing.

## Agent Integration

### Configure Agent with RAG Tool

Add the `rag_search` tool when creating or updating an agent:

```json
{
  "name": "Knowledge Assistant",
  "type": "chatbot",
  "tools": ["rag_search"],
  "system_prompt": "You are a helpful assistant with access to a knowledge base."
}
```

### RAG Tool Configuration

The `rag_search` tool automatically:

1. Detects when user asks knowledge-based questions
2. Searches the knowledge base using semantic search
3. Retrieves relevant information
4. Uses retrieved context to provide accurate responses
5. Cites sources with metadata

**Example Agent Conversation:**

```
User: "What are the main advantages of the Polestar 4?"

Agent: Based on our knowledge base, the Polestar 4 has several key advantages:

1. Digital Rearview Mirror: Provides a wider field of view and eliminates
   glare from other vehicles
2. Sharp Image Quality: Especially clear vision at night with HD display
3. Spacious Interior: Particularly generous legroom for rear passengers
4. Advanced Technology: 2.5-megapixel camera system for enhanced visibility

Source: "Getest: Zo goed (of slecht) werkt de digitale achteruitkijkspiegel
van de Polestar 4" by Joram Van Acker
```

## Frontend Integration

### Background Indexing with Status Polling

```javascript
// Index documents in background
const response = await fetch(
  '/api/v1/organizations/org/projects/proj/rag/index',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      documents: documents,
      api_key_id: 'api-key-id',
      process_in_background: true,
    }),
  }
);

const result = await response.json();
const jobId = result.job_id;

// Poll for status updates
const checkStatus = async () => {
  const statusResponse = await fetch(
    `/api/v1/organizations/org/projects/proj/rag/jobs/${jobId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const statusData = await statusResponse.json();

  const job = statusData.job;
  console.log(`Status: ${job.status}`);
  console.log(
    `Progress: ${job.progress.processed_documents}/${job.progress.total_documents}`
  );

  if (job.status === 'completed') {
    console.log('Indexing completed!', job.results);
  } else if (job.status === 'processing') {
    setTimeout(checkStatus, 5000); // Check again in 5 seconds
  }
};

checkStatus();
```

### Synchronous Processing

For smaller documents or immediate results:

```javascript
const response = await fetch(
  '/api/v1/organizations/org/projects/proj/rag/index',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      documents: documents,
      api_key_id: 'api-key-id',
      process_in_background: false,
    }),
  }
);

const result = await response.json();
console.log('Indexed chunks:', result.indexed_count);
```

## Performance Optimization

### Embedding Efficiency

- **Batch Processing**: Index multiple documents simultaneously
- **Model Selection**: Uses `text-embedding-3-small` for optimal cost/performance
- **Caching**: Vector database caching for repeated queries

### Search Optimization

- **Threshold Tuning**: Adjust similarity thresholds (0.5-0.9)
- **Result Limiting**: Configure result counts per query
- **Hybrid Ranking**: Combines semantic + keyword for best results

### Vector Database Selection

- **Development**: Use in-memory storage
- **Production**: Use Weaviate or Pinecone for scalability
- **Connection Pooling**: Cached connections per org/project

## Configuration

### Environment Variables

```bash
# RAG Configuration (optional)
RAG_DEFAULT_THRESHOLD=0.7
RAG_MAX_RESULTS=20
RAG_EMBEDDING_MODEL=text-embedding-3-small

# Vector Database (if using Weaviate)
WEAVIATE_ENDPOINT=https://my-cluster.weaviate.network
WEAVIATE_API_KEY=your-api-key

# Vector Database (if using Pinecone)
PINECONE_API_KEY=your-api-key
PINECONE_ENVIRONMENT=us-east1-gcp
PINECONE_INDEX=llm-crafter
```

### Background Job Processor

Configure in `src/services/indexingJobProcessor.js`:

```javascript
const config = {
  pollInterval: 5000, // Poll interval in ms
  maxConcurrentJobs: 3, // Max concurrent jobs
  retryAttempts: 3, // Retry failed jobs
  retryDelay: 30000, // Delay between retries (ms)
};
```

## Monitoring and Logging

### Console Logging

The system provides detailed logging:

```
🚀 Starting IndexingJobProcessor...
📋 Queuing indexing job 550e8400-e29b-41d4-a716-446655440000 (single)
📋 Processing 1 pending indexing jobs...
🔄 Starting indexing job 550e8400-e29b-41d4-a716-446655440000...
📄 Single document processed: 5 chunks
✅ Completed indexing job 550e8400-e29b-41d4-a716-446655440000: 5 chunks indexed
```

### Usage Statistics

Track vector database usage via configuration stats:

```javascript
{
  "usage_stats": {
    "total_requests": 1250,
    "successful_requests": 1200,
    "failed_requests": 50,
    "total_documents_indexed": 5000,
    "total_searches": 800
  },
  "performance_metrics": {
    "avg_index_time_ms": 450,
    "avg_search_time_ms": 125,
    "avg_latency_ms": 45
  }
}
```

## Error Handling

### Indexing Errors

- Individual document failures don't stop the entire job
- Failed jobs are marked with detailed error information
- Retry logic for transient failures

### Search Errors

- Graceful fallback to keyword search if semantic search fails
- Detailed error messages with error codes
- Connection health checks

### Common Issues

**Documents not indexing:**

- Verify API key has OpenAI credits
- Check document format matches expected JSON structure
- Ensure vector database connection is active

**Search returns no results:**

- Lower similarity threshold (try 0.5 instead of 0.7)
- Verify documents indexed for correct org/project
- Use hybrid search instead of semantic-only

**Poor search quality:**

- Add more context to search queries
- Try hybrid search with weighted parameters
- Ensure indexed content is well-written

## API Reference Summary

### Document Management

- `POST /api/v1/organizations/:orgId/projects/:projectId/rag/index` - Index documents
- `POST /api/v1/organizations/:orgId/projects/:projectId/rag/search` - Search documents
- `GET /api/v1/organizations/:orgId/projects/:projectId/rag/stats` - Get statistics
- `DELETE /api/v1/organizations/:orgId/projects/:projectId/rag` - Clear knowledge base
- `POST /api/v1/organizations/:orgId/projects/:projectId/rag/batch-index` - Batch index

### Job Management

- `GET /api/v1/organizations/:orgId/projects/:projectId/rag/jobs/:jobId` - Get job status
- `GET /api/v1/organizations/:orgId/projects/:projectId/rag/jobs` - List jobs
- `GET /api/v1/organizations/:orgId/projects/:projectId/rag/jobs/stats` - Job statistics
- `DELETE /api/v1/organizations/:orgId/projects/:projectId/rag/jobs/:jobId` - Cancel job

### Vector Database Configuration

- `GET /api/v1/organizations/:orgId/projects/:projectId/vector-databases` - List configurations
- `POST /api/v1/organizations/:orgId/projects/:projectId/vector-databases` - Create configuration
- `PUT /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId` - Update configuration
- `DELETE /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId` - Delete configuration
- `POST /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/test` - Test connection
- `PUT /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/default` - Set default
- `GET /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/stats` - Get statistics
- `GET /api/v1/vector-databases/providers` - Get supported providers

## Production Deployment

### Scaling Considerations

- **Embedding Costs**: Monitor OpenAI API usage and costs
- **Search Performance**: Implement caching for frequent queries
- **Document Limits**: Set reasonable indexing limits per organization
- **Rate Limiting**: Implement search rate limits

### Vector Database Selection

- **Small Scale (<10K docs)**: In-memory or Weaviate
- **Medium Scale (10K-1M docs)**: Weaviate
- **Large Scale (>1M docs)**: Pinecone

### Monitoring

- Track embedding generation costs
- Monitor search latency
- Analyze search accuracy metrics
- Log usage patterns per organization

## Best Practices

1. **Use Background Processing**: For document sets larger than 10 documents
2. **Hybrid Search**: Generally provides better results than semantic-only
3. **Tune Thresholds**: Start with 0.7, adjust based on results
4. **Vector Database**: Use Weaviate or Pinecone in production
5. **Monitor Costs**: Track OpenAI embedding API usage
6. **Regular Cleanup**: Remove outdated documents periodically
7. **Test Connections**: Validate vector database connectivity regularly

## See Also

- [RAG Search Tool](/tools/rag-search) - Agent tool documentation
- [API Keys](/api/api-keys) - Managing LLM provider API keys
- [Vector Database Setup](/features/vector-database-setup) - Detailed vector DB configuration
