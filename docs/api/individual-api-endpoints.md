# Individual API Endpoint Management - Reference

## Overview

New endpoints for managing API endpoints individually on agents with the `api_caller` tool.

---

## Endpoints

### 1. Add API Endpoint

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name`

**Authentication:** Required (JWT token)

**Authorization:** Organization member role or higher

**URL Parameters:**

- `orgId` (string) - Organization ID
- `projectId` (string) - Project ID
- `agentId` (string) - Agent ID
- `endpoint_name` (string) - Unique name for the endpoint

**Request Body:**

```json
{
  "base_url": "https://api.example.com", // Required: Base URL with protocol
  "path": "/users/{user_id}", // Required: Path with optional {params}
  "methods": ["GET", "POST"], // Optional: Array of HTTP methods (default: ["GET"])
  "description": "Get user information", // Optional: Description of endpoint
  "authentication": {
    // Optional: Authentication config
    "type": "bearer_token", // Required if auth provided: bearer_token|api_key|cookie
    "token": "your_token" // For bearer_token
  }
}
```

**Authentication Options:**

**Bearer Token:**

```json
{
  "type": "bearer_token",
  "token": "your_bearer_token_here"
}
```

**API Key (Header):**

```json
{
  "type": "api_key",
  "key_name": "X-API-Key",
  "key_value": "your_api_key_value",
  "location": "header"
}
```

**API Key (Query Parameter):**

```json
{
  "type": "api_key",
  "key_name": "apikey",
  "key_value": "your_api_key_value",
  "location": "query"
}
```

**Cookie:**

```json
{
  "type": "cookie",
  "cookie": "session_id=abc123; token=xyz789"
}
```

**Success Response (201):**

```json
{
  "message": "API endpoint added successfully",
  "endpoint_name": "get_user",
  "endpoint": {
    "base_url": "https://api.example.com",
    "path": "/users/{user_id}",
    "methods": ["GET"],
    "description": "Get user information",
    "authentication": {
      "type": "bearer_token",
      "configured": true
    }
  }
}
```

**Error Responses:**

- `400` - Validation error or endpoint already exists
- `404` - Agent not found or api_caller tool not configured
- `500` - Server error

---

### 2. Update API Endpoint

**Endpoint:** `PUT /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name`

**Authentication:** Required (JWT token)

**Authorization:** Organization member role or higher

**URL Parameters:**

- `orgId` (string) - Organization ID
- `projectId` (string) - Project ID
- `agentId` (string) - Agent ID
- `endpoint_name` (string) - Name of endpoint to update

**Request Body:** (all fields optional)

```json
{
  "base_url": "https://api.example.com", // Optional: Update base URL
  "path": "/v2/users/{user_id}", // Optional: Update path
  "methods": ["GET", "POST", "PUT"], // Optional: Update methods
  "description": "Updated description", // Optional: Update description
  "authentication": {
    // Optional: Update authentication
    "type": "api_key",
    "key_name": "X-API-Key",
    "key_value": "new_api_key",
    "location": "header"
  }
}
```

**Success Response (200):**

```json
{
  "message": "API endpoint updated successfully",
  "endpoint_name": "get_user",
  "endpoint": {
    "base_url": "https://api.example.com",
    "path": "/v2/users/{user_id}",
    "methods": ["GET", "POST", "PUT"],
    "description": "Updated description",
    "authentication": {
      "type": "api_key",
      "key_name": "X-API-Key",
      "location": "header",
      "configured": true
    }
  }
}
```

**Error Responses:**

- `400` - Validation error
- `404` - Agent or endpoint not found
- `500` - Server error

---

### 3. Get Single API Endpoint

**Endpoint:** `GET /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name`

**Authentication:** Required (JWT token)

**Authorization:** Organization viewer role or higher

**URL Parameters:**

- `orgId` (string) - Organization ID
- `projectId` (string) - Project ID
- `agentId` (string) - Agent ID
- `endpoint_name` (string) - Name of endpoint to retrieve

**Request Body:** None

**Success Response (200):**

```json
{
  "endpoint_name": "get_user",
  "endpoint": {
    "base_url": "https://api.example.com",
    "path": "/users/{user_id}",
    "methods": ["GET"],
    "description": "Get user information",
    "authentication": {
      "type": "bearer_token",
      "configured": true
      // Note: Actual token/key values are not exposed for security
    }
  }
}
```

**For API Key Authentication:**

```json
{
  "endpoint_name": "get_weather",
  "endpoint": {
    "base_url": "https://api.weather.com",
    "path": "/current",
    "methods": ["GET"],
    "description": "Get weather data",
    "authentication": {
      "type": "api_key",
      "key_name": "X-API-Key",
      "location": "header",
      "configured": true
      // Note: key_value is not exposed
    }
  }
}
```

**For No Authentication:**

```json
{
  "endpoint_name": "public_data",
  "endpoint": {
    "base_url": "https://api.public.com",
    "path": "/data",
    "methods": ["GET"],
    "description": "Public data endpoint",
    "authentication": null
  }
}
```

**Error Responses:**

- `404` - Agent or endpoint not found
- `500` - Server error

---

### 4. Delete API Endpoint

**Endpoint:** `DELETE /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name`

**Authentication:** Required (JWT token)

**Authorization:** Organization member role or higher

**URL Parameters:**

- `orgId` (string) - Organization ID
- `projectId` (string) - Project ID
- `agentId` (string) - Agent ID
- `endpoint_name` (string) - Name of endpoint to delete

**Request Body:** None

**Success Response (200):**

```json
{
  "message": "API endpoint deleted successfully",
  "endpoint_name": "get_user"
}
```

**Error Responses:**

- `404` - Agent or endpoint not found
- `500` - Server error

---

## Existing Endpoints (Unchanged)

### Get All API Endpoints

**Endpoint:** `GET /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/api-config`

**Authentication:** Required (JWT token)

**Authorization:** Organization viewer role or higher

**Request Body:** None

**Success Response (200):**

```json
{
  "endpoints": {
    "get_user": {
      "base_url": "https://api.example.com",
      "path": "/users/{user_id}",
      "methods": ["GET"],
      "description": "Get user information",
      "authentication": {
        "type": "bearer_token",
        "configured": true
      }
    },
    "create_order": {
      "base_url": "https://api.shop.com",
      "path": "/orders",
      "methods": ["POST"],
      "description": "Create order",
      "authentication": {
        "type": "api_key",
        "key_name": "X-API-Key",
        "location": "header",
        "configured": true
      }
    },
    "public_endpoint": {
      "base_url": "https://api.public.com",
      "path": "/data",
      "methods": ["GET"],
      "description": "Public data",
      "authentication": null
    }
  },
  "authentication": {
    "type": "bearer_token",
    "configured": true,
    "deprecated": true
  },
  "summarization": {}
}
```

**Note:** The `authentication` object at the root level is deprecated. Authentication is now handled at the endpoint level.

---

### Configure All API Endpoints (Bulk)

**Endpoint:** `POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/api-config`

**Authentication:** Required (JWT token)

**Authorization:** Organization member role or higher

**Request Body:**

```json
{
  "endpoints": {
    "endpoint1": {
      "base_url": "https://api.example.com",
      "path": "/path1",
      "methods": ["GET"],
      "description": "Description",
      "authentication": {
        "type": "bearer_token",
        "token": "token_here"
      }
    },
    "endpoint2": {
      "base_url": "https://api.example.com",
      "path": "/path2",
      "methods": ["POST"],
      "authentication": {
        "type": "api_key",
        "key_name": "X-API-Key",
        "key_value": "key_here",
        "location": "header"
      }
    }
  },
  "authentication": {
    "type": "bearer_token",
    "token": "global_token"
  }
}
```

**Success Response (200):**

```json
{
  "message": "API configuration updated successfully",
  "endpoints": {
    /* endpoints object */
  },
  "authentication": { "type": "bearer_token" },
  "summarization": {}
}
```

**Note:** This replaces ALL endpoints. Use individual endpoint management for targeted updates.

---

## Validation Rules

### Common Validations

**base_url:**

- Must be a valid URL with protocol (http:// or https://)
- Example: `https://api.example.com`

**path:**

- Must be a non-empty string
- Can include path parameters in `{param_name}` format
- Example: `/users/{user_id}/orders/{order_id}`

**methods:**

- Must be an array
- Valid values: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- Default: `["GET"]`

**description:**

- Optional string
- Used for documentation

**authentication.type:**

- Required if authentication object is provided
- Valid values: `bearer_token`, `api_key`, `cookie`

### Authentication Type-Specific Validations

**Bearer Token (`bearer_token`):**

- `token` (required): The bearer token string

**API Key (`api_key`):**

- `key_name` (required): Header name or query parameter name
- `key_value` (required): The API key value
- `location` (required): Must be `header` or `query`

**Cookie (`cookie`):**

- `cookie` (required): Complete cookie string

---

## Security Notes

1. **Credential Protection:** Sensitive values (tokens, keys, cookies) are never returned in GET responses
2. **Metadata Only:** Only authentication type and configuration status are exposed
3. **Role-Based Access:**
   - Viewer role: Can read endpoints
   - Member role: Can add, update, delete endpoints
   - Admin role: Full access
4. **Agent Isolation:** Endpoints are scoped to specific agents within projects

---

## HTTP Status Codes

- `200` - Success (GET, PUT, DELETE)
- `201` - Created (POST)
- `400` - Bad Request (validation errors, duplicate endpoint)
- `404` - Not Found (agent, endpoint, or api_caller tool not found)
- `500` - Internal Server Error

---

## Common Error Responses

**Endpoint Already Exists (400):**

```json
{
  "error": "Endpoint 'get_user' already exists. Use PUT to update it."
}
```

**Endpoint Not Found (404):**

```json
{
  "error": "Endpoint 'non_existent' not found"
}
```

**Agent Not Found (404):**

```json
{
  "error": "Agent not found"
}
```

**API Caller Tool Not Configured (400):**

```json
{
  "error": "Agent does not have api_caller tool configured"
}
```

**Invalid Authentication Type (400):**

```json
{
  "error": "Invalid authentication type. Must be one of: bearer_token, api_key, cookie"
}
```

**Missing Required Auth Fields (400):**

```json
{
  "error": "key_name and key_value are required for api_key authentication"
}
```

**Invalid URL (400):**

```json
{
  "errors": [
    {
      "field": "base_url",
      "message": "base_url must be a valid URL with protocol"
    }
  ]
}
```
