# Vector Database Configuration API - Pinecone Provider

## Endpoint Overview

Create and manage Pinecone vector database configurations for RAG (Retrieval-Augmented Generation) functionality. Each configuration can be scoped to a specific project and uses Pinecone namespaces for data isolation.

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/vector-databases`

**Authentication:** Required (JWT Bearer token)

**Authorization:** Organization member or higher

---

## Pinecone Configuration

### Key Concepts

- **Namespaces**: Each project automatically uses its `project_id` as a Pinecone namespace for data isolation
- **Multi-tenancy**: A single Pinecone index can serve multiple projects/customers
- **Dimensions**: Must match your embedding model (1536 for text-embedding-3-small, 3072 for text-embedding-3-large)

### Required Fields

When `provider` is set to `"pinecone"`, the following fields are required in the `config` object:

| Field       | Type   | Description                                         |
| ----------- | ------ | --------------------------------------------------- |
| `apiKey`    | string | Your Pinecone API key (get from Pinecone dashboard) |
| `indexName` | string | Name of the Pinecone index to use                   |

**Note:** The `environment` field is **not required** as of Pinecone SDK v3+. The system will automatically determine the correct endpoint.

---

## Request Format

### URL Parameters

- `orgId` (string, required): MongoDB ObjectId of the organization
- `projectId` (string, required): MongoDB ObjectId of the project

### Request Body

```json
{
  "name": "Production Pinecone Config",
  "description": "Pinecone vector database for production RAG",
  "provider": "pinecone",
  "config": {
    "apiKey": "pcsk_xxxxx_xxxxxxxxxxxxxxxxxxxxxxxx",
    "indexName": "quivo"
  },
  "is_default": true
}
```

### Field Details

| Field         | Type    | Required | Description                                                 |
| ------------- | ------- | -------- | ----------------------------------------------------------- |
| `name`        | string  | Yes      | Friendly name for the configuration                         |
| `description` | string  | No       | Optional description of the configuration                   |
| `provider`    | string  | Yes      | Must be `"pinecone"` for Pinecone configurations            |
| `config`      | object  | Yes      | Provider-specific configuration (see Pinecone Config below) |
| `is_default`  | boolean | No       | Set as default config for the project (default: false)      |

### Pinecone Config Object

```json
{
  "apiKey": "pcsk_xxxxx_xxxxxxxxxxxxxxxxxxxxxxxx",
  "indexName": "quivo"
}
```

| Field       | Type   | Required | Description                                   |
| ----------- | ------ | -------- | --------------------------------------------- |
| `apiKey`    | string | Yes      | Pinecone API key from your Pinecone dashboard |
| `indexName` | string | Yes      | Name of the existing Pinecone index           |

---

## Response Format

### Success Response (201 Created)

```json
{
  "success": true,
  "configuration": {
    "_id": "673dae1f2a3b4c5d6e7f8g9h",
    "organization_id": "5e58b925-dbe3-4923-832e-06c3b2576f5c",
    "project_id": "1dbfc094-eb77-4c6b-9064-4b9a617f4f9d",
    "name": "Production Pinecone Config",
    "description": "Pinecone vector database for production RAG",
    "provider": "pinecone",
    "config": {
      "pinecone": {
        "apiKey": "***",
        "indexName": "quivo"
      }
    },
    "is_active": true,
    "is_default": true,
    "connection_status": {
      "status": "connected",
      "last_tested": "2025-11-08T10:30:00.000Z",
      "last_error": null
    },
    "created_by": "507f1f77bcf86cd799439011",
    "createdAt": "2025-11-08T10:30:00.000Z",
    "updatedAt": "2025-11-08T10:30:00.000Z"
  },
  "connection_test": {
    "success": true,
    "message": "Successfully connected to Pinecone",
    "index_info": {
      "name": "quivo",
      "dimension": 1536,
      "metric": "cosine",
      "status": "ready"
    }
  }
}
```

### Response Fields

| Field             | Type    | Description                               |
| ----------------- | ------- | ----------------------------------------- |
| `success`         | boolean | Indicates if the request was successful   |
| `configuration`   | object  | The created vector database configuration |
| `connection_test` | object  | Results of the connection test            |

#### Configuration Object

| Field                       | Type    | Description                               |
| --------------------------- | ------- | ----------------------------------------- |
| `_id`                       | string  | Unique identifier for the configuration   |
| `organization_id`           | string  | UUID of the organization                  |
| `project_id`                | string  | UUID of the project                       |
| `name`                      | string  | Configuration name                        |
| `description`               | string  | Configuration description                 |
| `provider`                  | string  | Always "pinecone"                         |
| `config.pinecone.apiKey`    | string  | Masked API key (shown as "\*\*\*")        |
| `config.pinecone.indexName` | string  | Pinecone index name                       |
| `is_active`                 | boolean | Whether the configuration is active       |
| `is_default`                | boolean | Whether this is the default configuration |
| `connection_status`         | object  | Current connection status                 |
| `created_by`                | string  | User ID who created the config            |
| `createdAt`                 | string  | ISO 8601 timestamp                        |
| `updatedAt`                 | string  | ISO 8601 timestamp                        |

#### Connection Test Object

| Field                  | Type    | Description                               |
| ---------------------- | ------- | ----------------------------------------- |
| `success`              | boolean | Whether the connection test passed        |
| `message`              | string  | Connection test result message            |
| `index_info`           | object  | Information about the Pinecone index      |
| `index_info.name`      | string  | Index name                                |
| `index_info.dimension` | number  | Vector dimensions (must match embeddings) |
| `index_info.metric`    | string  | Similarity metric (e.g., "cosine")        |
| `index_info.status`    | string  | Index status (e.g., "ready")              |

---

## Error Responses

### 400 Bad Request - Validation Error

```json
{
  "success": false,
  "errors": [
    {
      "msg": "Configuration object is required",
      "param": "config",
      "location": "body"
    }
  ]
}
```

### 400 Bad Request - Missing Required Fields

```json
{
  "success": false,
  "error": "Pinecone apiKey and indexName are required"
}
```

### 404 Not Found - Index Doesn't Exist

```json
{
  "success": false,
  "error": "Pinecone index 'quivo' does not exist. Please create it first in your Pinecone dashboard or via the API."
}
```

### 400 Bad Request - Dimension Mismatch

```json
{
  "success": false,
  "error": "Embedding dimension mismatch: Your embeddings have 1536 dimensions, but Pinecone index 'quivo' is configured for 2048 dimensions.\n\nTo fix this:\n1. Recreate the index with dimension 1536, OR\n2. Change your embedding model to match 2048 dimensions\n   - For 1024 dims: Use text-embedding-3-small with dimensions parameter\n   - For 1536 dims: Use text-embedding-3-small (default)\n   - For 3072 dims: Use text-embedding-3-large (default)"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Failed to connect to Pinecone: [error details]"
}
```

---

## Example Requests

### cURL Example

```bash
curl -X POST \
  https://api.yourapp.com/api/v1/organizations/5e58b925-dbe3-4923-832e-06c3b2576f5c/projects/1dbfc094-eb77-4c6b-9064-4b9a617f4f9d/vector-databases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Production Pinecone",
    "description": "Main vector database for production",
    "provider": "pinecone",
    "config": {
      "apiKey": "pcsk_xxxxx_xxxxxxxxxxxxxxxxxxxxxxxx",
      "indexName": "quivo"
    },
    "is_default": true
  }'
```

### JavaScript Example

```javascript
const response = await fetch(
  'https://api.yourapp.com/api/v1/organizations/5e58b925-dbe3-4923-832e-06c3b2576f5c/projects/1dbfc094-eb77-4c6b-9064-4b9a617f4f9d/vector-databases',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({
      name: 'Production Pinecone',
      description: 'Main vector database for production',
      provider: 'pinecone',
      config: {
        apiKey: 'pcsk_xxxxx_xxxxxxxxxxxxxxxxxxxxxxxx',
        indexName: 'quivo',
      },
      is_default: true,
    }),
  }
);

const data = await response.json();
console.log(data);
```

### Python Example

```python
import requests

url = "https://api.yourapp.com/api/v1/organizations/5e58b925-dbe3-4923-832e-06c3b2576f5c/projects/1dbfc094-eb77-4c6b-9064-4b9a617f4f9d/vector-databases"

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {jwt_token}"
}

payload = {
    "name": "Production Pinecone",
    "description": "Main vector database for production",
    "provider": "pinecone",
    "config": {
        "apiKey": "pcsk_xxxxx_xxxxxxxxxxxxxxxxxxxxxxxx",
        "indexName": "quivo"
    },
    "is_default": True
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

---

## How Namespaces Work

When you create a Pinecone configuration and index documents:

1. **Data Isolation**: Each project's vectors are stored in a separate namespace (using `project_id`)
2. **Shared Index**: Multiple projects can share the same Pinecone index
3. **Automatic Scoping**: All operations (upsert, query, delete) are automatically scoped to the project's namespace
4. **Cost Efficiency**: Use one Pinecone index for all customers/projects instead of creating separate indexes

### Example Flow

```
Project A (ID: abc-123) -> Pinecone Index "quivo" -> Namespace "abc-123"
Project B (ID: def-456) -> Pinecone Index "quivo" -> Namespace "def-456"
Project C (ID: ghi-789) -> Pinecone Index "quivo" -> Namespace "ghi-789"
```

Each project's data is completely isolated, even though they share the same index.

---

## Prerequisites

Before creating a Pinecone configuration:

1. **Create a Pinecone account** at [https://www.pinecone.io/](https://www.pinecone.io/)
2. **Get your API key** from the Pinecone dashboard
3. **Create an index** with:

   - Name: Your chosen index name (e.g., "quivo")
   - Dimensions: Match your embedding model
     - 1536 for `text-embedding-3-small` (default)
     - 3072 for `text-embedding-3-large`
     - 1024 for `text-embedding-3-small` with dimensions parameter
   - Metric: `cosine` (recommended for text similarity)
   - Cloud/Region: Your preferred region

4. **Note**: Pinecone SDK v3+ (currently installed) does not require an `environment` parameter

---

## Best Practices

1. **Use descriptive names**: Make it easy to identify configurations
2. **Set one as default**: Mark your primary configuration as default
3. **Test connections**: The API automatically tests connections on creation
4. **Secure your API keys**: Keys are automatically masked in responses
5. **Match dimensions**: Ensure your Pinecone index dimensions match your embedding model
6. **Use cosine metric**: Recommended for text similarity searches
7. **Monitor usage**: Use the stats endpoint to track vector counts per project

---

## Related Endpoints

- `GET /api/v1/organizations/:orgId/projects/:projectId/vector-databases` - List all configurations
- `PUT /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId` - Update configuration
- `DELETE /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId` - Delete configuration
- `POST /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/test` - Test connection
- `PUT /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/default` - Set as default
- `GET /api/v1/organizations/:orgId/projects/:projectId/vector-databases/:configId/stats` - Get statistics

---

## Troubleshooting

### Index Not Found

**Error**: "Pinecone index 'quivo' does not exist"

**Solution**: Create the index in your Pinecone dashboard first

### Dimension Mismatch

**Error**: "Vector dimension 1536 does not match the dimension of the index 2048"

**Solutions**:

1. Recreate the Pinecone index with the correct dimensions (1536 for text-embedding-3-small)
2. Or adjust your embedding model configuration to match the index dimensions

### Connection Failed

**Error**: "Failed to connect to Pinecone"

**Check**:

- API key is correct
- Index name is correct
- Index is in "ready" state in Pinecone dashboard
- Network connectivity

### Invalid API Key

**Error**: Authentication errors

**Solution**: Verify your API key in the Pinecone dashboard and regenerate if necessary
