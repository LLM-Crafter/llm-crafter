# API Endpoints Management

This document describes the API endpoints management system for agents with the `api_caller` tool.

## Overview

The API endpoints configuration system now supports both:

1. **Bulk Configuration** (existing): Configure all endpoints at once
2. **Individual Endpoint Management** (new): Add, update, delete, and retrieve individual endpoints

## Key Changes

### Authentication at Endpoint Level

Authentication has been moved from the global level to the individual endpoint level. This allows different endpoints to use different authentication methods.

- **Old Approach** (still supported for backward compatibility): Global authentication applied to all endpoints
- **New Approach**: Each endpoint can have its own authentication configuration

### Endpoint-Level Authentication Types

Each endpoint can specify its own authentication:

#### 1. Bearer Token

```json
{
  "type": "bearer_token",
  "token": "your_bearer_token_here"
}
```

#### 2. API Key

```json
{
  "type": "api_key",
  "key_name": "X-API-Key",
  "key_value": "your_api_key_here",
  "location": "header" // or "query"
}
```

#### 3. Cookie

```json
{
  "type": "cookie",
  "cookie": "session_id=abc123; token=xyz789"
}
```

## API Endpoints

### Bulk Configuration (Existing)

#### Configure All API Endpoints

```
POST /api/organizations/:orgId/projects/:projectId/agents/:agentId/api-config
```

**Request Body:**

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
        "token": "your_token_here"
      }
    },
    "create_order": {
      "base_url": "https://api.example.com",
      "path": "/orders",
      "methods": ["POST"],
      "description": "Create a new order",
      "authentication": {
        "type": "api_key",
        "key_name": "X-API-Key",
        "key_value": "your_api_key",
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

**Note:** The global `authentication` field is deprecated. Use endpoint-level authentication instead.

#### Get All API Endpoints

```
GET /api/organizations/:orgId/projects/:projectId/agents/:agentId/api-config
```

**Response:**

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

### Individual Endpoint Management (New)

#### Add a Single Endpoint

```
POST /api/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name
```

**Request Body:**

```json
{
  "base_url": "https://api.example.com",
  "path": "/products/{product_id}",
  "methods": ["GET"],
  "description": "Get product details",
  "authentication": {
    "type": "api_key",
    "key_name": "X-API-Key",
    "key_value": "your_api_key",
    "location": "header"
  }
}
```

**Response:**

```json
{
  "message": "API endpoint added successfully",
  "endpoint_name": "get_product",
  "endpoint": {
    "base_url": "https://api.example.com",
    "path": "/products/{product_id}",
    "methods": ["GET"],
    "description": "Get product details",
    "authentication": {
      "type": "api_key",
      "key_name": "X-API-Key",
      "location": "header",
      "configured": true
    }
  }
}
```

#### Update an Endpoint

```
PUT /api/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name
```

**Request Body:** (all fields optional)

```json
{
  "path": "/products/v2/{product_id}",
  "methods": ["GET", "POST"],
  "description": "Updated product endpoint",
  "authentication": {
    "type": "bearer_token",
    "token": "new_token"
  }
}
```

**Response:**

```json
{
  "message": "API endpoint updated successfully",
  "endpoint_name": "get_product",
  "endpoint": {
    "base_url": "https://api.example.com",
    "path": "/products/v2/{product_id}",
    "methods": ["GET", "POST"],
    "description": "Updated product endpoint",
    "authentication": {
      "type": "bearer_token",
      "configured": true
    }
  }
}
```

#### Delete an Endpoint

```
DELETE /api/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name
```

**Response:**

```json
{
  "message": "API endpoint deleted successfully",
  "endpoint_name": "get_product"
}
```

#### Get a Single Endpoint

```
GET /api/organizations/:orgId/projects/:projectId/agents/:agentId/api-endpoints/:endpoint_name
```

**Response:**

```json
{
  "endpoint_name": "get_product",
  "endpoint": {
    "base_url": "https://api.example.com",
    "path": "/products/{product_id}",
    "methods": ["GET"],
    "description": "Get product details",
    "authentication": {
      "type": "api_key",
      "key_name": "X-API-Key",
      "location": "header",
      "configured": true
    }
  }
}
```

## Validation Rules

### Add Endpoint (POST)

- `base_url` (required): Must be a valid URL with protocol (http:// or https://)
- `path` (required): Must be a non-empty string
- `methods` (optional): Array of valid HTTP methods (GET, POST, PUT, PATCH, DELETE)
- `description` (optional): String
- `authentication` (optional): Object with authentication configuration

### Update Endpoint (PUT)

- All fields are optional
- Same validation rules apply as for adding

### Authentication Validation

- `type` (required if authentication provided): Must be one of `bearer_token`, `api_key`, or `cookie`
- For `bearer_token`: `token` is required
- For `api_key`: `key_name`, `key_value`, and `location` (header or query) are required
- For `cookie`: `cookie` string is required

## Backward Compatibility

The system maintains backward compatibility:

1. **Global Authentication**: Still supported but marked as deprecated
2. **Priority**: Endpoint-level authentication takes priority over global authentication
3. **Legacy Format**: Old API key format (`api_key` and `header` fields) is still supported

## Usage in Agent Tool Calls

When the agent uses the `api_caller` tool, authentication is automatically applied based on the endpoint configuration:

```javascript
// Agent tool call
{
  "tool": "api_caller",
  "parameters": {
    "endpoint_name": "get_product",
    "method": "GET",
    "path_params": {
      "product_id": "12345"
    }
  }
}
```

The system will:

1. Look up the `get_product` endpoint configuration
2. Build the URL with the configured `base_url` and `path`
3. Apply endpoint-level authentication (if configured)
4. Fall back to global authentication (if endpoint-level is not configured)
5. Make the HTTP request with proper headers

## Security Notes

- Authentication credentials (tokens, keys, cookies) are never returned in GET requests
- Only metadata about authentication (type, configured status) is exposed
- Store sensitive credentials securely and rotate them regularly
