# RAG Background Indexing

The RAG (Retrieval-Augmented Generation) system now supports background indexing for improved user experience when processing large document sets. This feature allows the UI to remain responsive while documents are being indexed in the background.

## Overview

Background indexing provides the following benefits:

- **Non-blocking UI**: Users don't need to wait for large document sets to be processed
- **Progress tracking**: Real-time status updates and progress monitoring  
- **Job management**: View, monitor, and cancel indexing jobs
- **Logging and statistics**: Comprehensive logging and job statistics
- **Backward compatibility**: Synchronous processing is still available when needed

## How It Works

1. **Job Queue**: When documents are submitted for indexing, a job is created and queued for background processing
2. **Background Processor**: A background service polls for pending jobs and processes them asynchronously
3. **Status Tracking**: Jobs are tracked through their lifecycle: pending → processing → completed/failed
4. **Progress Updates**: Real-time progress updates including documents processed and chunks indexed

## API Endpoints

### Index Documents (Background)

**POST** `/api/v1/organizations/:orgId/projects/:projectId/rag/index`

```json
{
  "documents": [
    {
      "id": "doc1",
      "title": "Document Title",
      "content": "Document content...",
      "category": "Category"
    }
  ],
  "api_key_id": "api-key-id",
  "process_in_background": true  // Default: true
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

### Get Job Status

**GET** `/api/v1/organizations/:orgId/projects/:projectId/rag/jobs/:jobId`

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

**GET** `/api/v1/organizations/:orgId/projects/:projectId/rag/jobs?limit=50`

**Response:**
```json
{
  "success": true,
  "jobs": [
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "batch",
      "status": "completed",
      "progress": { "..." },
      "created_at": "2025-01-01T10:00:00.000Z",
      "processing_time_ms": 85000
    }
  ],
  "total": 1
}
```

### Get Job Statistics

**GET** `/api/v1/organizations/:orgId/projects/:projectId/rag/jobs/stats`

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

**DELETE** `/api/v1/organizations/:orgId/projects/:projectId/rag/jobs/:jobId`

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

## Job Lifecycle

### Job Statuses

- **pending**: Job is queued and waiting to be processed
- **processing**: Job is currently being processed in the background
- **completed**: Job finished successfully with results
- **failed**: Job encountered an error and could not complete

### Job Types

- **single**: Regular document indexing request
- **batch**: Batch document indexing request with multiple document sets

## Configuration

The background processor can be configured in the `IndexingJobProcessor` class:

```javascript
this.config = {
  pollInterval: 5000,        // Check for new jobs every 5 seconds
  maxConcurrentJobs: 3,      // Process up to 3 jobs simultaneously  
  retryAttempts: 3,          // Number of retry attempts for failed jobs
  retryDelay: 30000          // 30 seconds between retries
};
```

## Usage Examples

### Frontend Integration

```javascript
// Index documents in background
const response = await fetch('/api/v1/organizations/org/projects/proj/rag/index', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documents: documents,
    api_key_id: 'api-key-id',
    process_in_background: true
  })
});

const result = await response.json();
const jobId = result.job_id;

// Poll for status updates
const checkStatus = async () => {
  const statusResponse = await fetch(`/api/v1/organizations/org/projects/proj/rag/jobs/${jobId}`);
  const statusData = await statusResponse.json();
  
  const job = statusData.job;
  console.log(`Status: ${job.status}`);
  console.log(`Progress: ${job.progress.processed_documents}/${job.progress.total_documents}`);
  
  if (job.status === 'completed') {
    console.log('Indexing completed!', job.results);
  } else if (job.status === 'processing') {
    setTimeout(checkStatus, 5000); // Check again in 5 seconds
  }
};

checkStatus();
```

### Synchronous Processing (when needed)

For smaller documents or when immediate results are required:

```javascript
const response = await fetch('/api/v1/organizations/org/projects/proj/rag/index', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documents: documents,
    api_key_id: 'api-key-id',
    process_in_background: false  // Process synchronously
  })
});

const result = await response.json();
console.log('Indexed chunks:', result.indexed_count);
```

## Monitoring and Logging

### Console Logging

The system provides detailed console logging:

```
🚀 Starting IndexingJobProcessor...
📋 Queuing indexing job 550e8400-e29b-41d4-a716-446655440000 (single)
📋 Processing 1 pending indexing jobs...
🔄 Starting indexing job 550e8400-e29b-41d4-a716-446655440000...
📄 Single document processed: 5 chunks
✅ Completed indexing job 550e8400-e29b-41d4-a716-446655440000: 5 chunks indexed
```

### Database Storage

Job information is stored in MongoDB using the `IndexingJob` model:

- Job metadata and configuration
- Progress tracking
- Results and error information
- Timing statistics

## Error Handling

The system includes comprehensive error handling:

- Individual document failures don't stop the entire job
- Failed jobs are marked with error details
- Retry logic for transient failures
- Detailed error logging for debugging

## Testing

Use the provided test script to verify the functionality:

```bash
# Update the constants in the script first
node test-background-indexing.js
```

The test script covers:
- Background document indexing
- Job status monitoring  
- Job listing and statistics
- Synchronous processing comparison

## Migration from Synchronous Processing

The new background processing is backward compatible:

1. **Default behavior**: `process_in_background: true` is now the default
2. **Existing code**: Will work with background processing unless explicitly set to `false`
3. **Response format**: Background responses include additional fields but maintain compatibility

## Performance Considerations

- **Concurrent jobs**: Limited to prevent resource exhaustion
- **Memory usage**: Jobs are tracked in-memory and database
- **Database queries**: Optimized with proper indexing
- **Cleanup**: Completed jobs are retained for statistics but can be archived

## Future Enhancements

Potential improvements for the system:

1. **Redis Queue**: Integrate with Redis/Bull for better queue management
2. **Priority queues**: Support for high-priority indexing jobs
3. **Webhook notifications**: Notify external systems when jobs complete
4. **Job scheduling**: Schedule indexing jobs for specific times
5. **Distributed processing**: Scale across multiple server instances
