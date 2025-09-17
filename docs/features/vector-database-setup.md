# Vector Database Development Setup

This Docker Compose configuration provides local vector database instances for development and testing.

## Quick Start

1. **Start Weaviate locally:**
   ```bash
   docker-compose -f docker-compose.vectors.yml up -d weaviate
   ```

2. **Configure in LLM Crafter:**
   ```javascript
   // Use the configuration from vector-database-setup.js
   const config = {
     name: 'Local Weaviate Development',
     provider: 'weaviate',
     config: {
       endpoint: 'http://localhost:8080',
       scheme: 'http',
       className: 'DevDocuments'
     }
   };
   ```

3. **Verify connection:**
   ```bash
   curl http://localhost:8080/v1/meta
   ```

## Available Services

### Weaviate
- **Port**: 8080
- **GraphQL**: http://localhost:8080/v1/graphql
- **REST API**: http://localhost:8080/v1
- **Console**: http://localhost:8080/v1/console

### Qdrant (Optional)
- **Port**: 6333
- **Dashboard**: http://localhost:6333/dashboard
- **API**: http://localhost:6333

## Configuration Examples

### Memory (Development)
```javascript
{
  provider: 'memory',
  config: {
    maxDocuments: 5000
  }
}
```

### Weaviate (Local)
```javascript
{
  provider: 'weaviate',
  config: {
    endpoint: 'http://localhost:8080',
    scheme: 'http',
    className: 'Documents'
  }
}
```

### Weaviate (Cloud)
```javascript
{
  provider: 'weaviate',
  config: {
    endpoint: 'https://my-cluster.weaviate.network',
    apiKey: 'YOUR_API_KEY',
    scheme: 'https',
    className: 'Documents',
    headers: {
      'X-OpenAI-Api-Key': 'YOUR_OPENAI_KEY' // If using Weaviate's vectorizer
    }
  }
}
```

### Pinecone
```javascript
{
  provider: 'pinecone',
  config: {
    apiKey: 'YOUR_PINECONE_API_KEY',
    environment: 'us-east1-gcp',
    indexName: 'llm-crafter-docs'
  }
}
```

## Testing Your Configuration

Run the setup script to test different configurations:

```bash
# Update the credentials in the script first
node examples/vector-database-setup.js
```

## Production Deployment

### Weaviate Cloud Service (Recommended)
1. Sign up at https://console.weaviate.cloud/
2. Create a new cluster
3. Note your endpoint URL and API key
4. Configure using the API or setup script

### Self-hosted Weaviate
1. Use the provided docker-compose.vectors.yml
2. Customize environment variables
3. Set up proper volumes for persistence
4. Configure backup strategy

### Pinecone
1. Sign up at https://www.pinecone.io/
2. Create an index with 1536 dimensions (for OpenAI embeddings)
3. Note your API key and environment
4. Configure using the API

## Environment Variables

For production deployments, consider these environment variables:

```bash
# Vector Database Configuration
WEAVIATE_ENDPOINT=https://your-cluster.weaviate.network
WEAVIATE_API_KEY=your_api_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENVIRONMENT=us-east1-gcp
PINECONE_INDEX=llm-crafter-docs

# OpenAI (for embeddings)
OPENAI_API_KEY=your_openai_api_key
```

## Troubleshooting

### Connection Issues
1. Check if the service is running: `docker ps`
2. Verify port accessibility: `curl http://localhost:8080/v1/meta`
3. Check logs: `docker-compose -f docker-compose.vectors.yml logs weaviate`

### Performance
- Monitor memory usage in development
- Use persistent volumes for production
- Consider scaling options for high load

### Data Migration
Use the migration functions in the setup script to move between providers safely.
