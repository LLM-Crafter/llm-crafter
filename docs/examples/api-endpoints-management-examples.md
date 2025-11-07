# API Endpoints Management - Usage Examples

This document provides practical examples for using the new individual API endpoint management features.

## Prerequisites

- An organization with `orgId`
- A project within that organization with `projectId`
- An agent with the `api_caller` tool enabled with `agentId`
- A valid authentication token

## Example Workflow

### 1. Add Individual Endpoints

#### Add a GET endpoint for user information

```bash
curl -X POST \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/get_user' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "base_url": "https://api.example.com",
    "path": "/users/{user_id}",
    "methods": ["GET"],
    "description": "Get user information by ID",
    "authentication": {
      "type": "bearer_token",
      "token": "your_bearer_token_here"
    }
  }'
```

#### Add a POST endpoint with API key authentication

```bash
curl -X POST \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/create_order' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "base_url": "https://api.shop.com",
    "path": "/api/v1/orders",
    "methods": ["POST"],
    "description": "Create a new order",
    "authentication": {
      "type": "api_key",
      "key_name": "X-API-Key",
      "key_value": "sk_live_1234567890",
      "location": "header"
    }
  }'
```

#### Add an endpoint with query parameter authentication

```bash
curl -X POST \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/get_weather' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "base_url": "https://api.weather.com",
    "path": "/v1/current",
    "methods": ["GET"],
    "description": "Get current weather data",
    "authentication": {
      "type": "api_key",
      "key_name": "apikey",
      "key_value": "weather_api_key_123",
      "location": "query"
    }
  }'
```

#### Add an endpoint without authentication

```bash
curl -X POST \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/public_data' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "base_url": "https://api.public.com",
    "path": "/v1/data",
    "methods": ["GET"],
    "description": "Get public data"
  }'
```

### 2. Get a Specific Endpoint

```bash
curl -X GET \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/get_user' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**

```json
{
  "endpoint_name": "get_user",
  "endpoint": {
    "base_url": "https://api.example.com",
    "path": "/users/{user_id}",
    "methods": ["GET"],
    "description": "Get user information by ID",
    "authentication": {
      "type": "bearer_token",
      "configured": true
    }
  }
}
```

### 3. Update an Endpoint

#### Update the path and methods

```bash
curl -X PUT \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/get_user' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "/api/v2/users/{user_id}",
    "methods": ["GET", "HEAD"]
  }'
```

#### Update only the authentication

```bash
curl -X PUT \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/create_order' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "authentication": {
      "type": "bearer_token",
      "token": "new_bearer_token_xyz"
    }
  }'
```

#### Update description only

```bash
curl -X PUT \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/get_weather' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "description": "Get current weather and forecast data for a location"
  }'
```

### 4. Get All Endpoints

```bash
curl -X GET \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**

```json
{
  "endpoints": {
    "get_user": {
      "base_url": "https://api.example.com",
      "path": "/api/v2/users/{user_id}",
      "methods": ["GET", "HEAD"],
      "description": "Get user information by ID",
      "authentication": {
        "type": "bearer_token",
        "configured": true
      }
    },
    "create_order": {
      "base_url": "https://api.shop.com",
      "path": "/api/v1/orders",
      "methods": ["POST"],
      "description": "Create a new order",
      "authentication": {
        "type": "bearer_token",
        "configured": true
      }
    },
    "get_weather": {
      "base_url": "https://api.weather.com",
      "path": "/v1/current",
      "methods": ["GET"],
      "description": "Get current weather and forecast data for a location",
      "authentication": {
        "type": "api_key",
        "key_name": "apikey",
        "location": "query",
        "configured": true
      }
    },
    "public_data": {
      "base_url": "https://api.public.com",
      "path": "/v1/data",
      "methods": ["GET"],
      "description": "Get public data",
      "authentication": null
    }
  },
  "authentication": {},
  "summarization": {}
}
```

### 5. Delete an Endpoint

```bash
curl -X DELETE \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/public_data' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**

```json
{
  "message": "API endpoint deleted successfully",
  "endpoint_name": "public_data"
}
```

## Bulk Configuration (Legacy Method - Still Supported)

You can still configure all endpoints at once:

```bash
curl -X POST \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "endpoints": {
      "get_user": {
        "base_url": "https://api.example.com",
        "path": "/users/{user_id}",
        "methods": ["GET"],
        "authentication": {
          "type": "bearer_token",
          "token": "user_api_token"
        }
      },
      "create_order": {
        "base_url": "https://api.shop.com",
        "path": "/orders",
        "methods": ["POST"],
        "authentication": {
          "type": "api_key",
          "key_name": "X-API-Key",
          "key_value": "shop_api_key",
          "location": "header"
        }
      }
    }
  }'
```

## Agent Usage

Once endpoints are configured, the agent can use them through the `api_caller` tool:

```javascript
// Agent tool call
{
  "tool": "api_caller",
  "parameters": {
    "endpoint_name": "get_user",
    "method": "GET",
    "path_params": {
      "user_id": "12345"
    }
  }
}
```

The system will automatically:

1. Resolve the endpoint configuration
2. Build the full URL: `https://api.example.com/users/12345`
3. Apply the configured authentication (Bearer token)
4. Make the HTTP request
5. Return the response to the agent

## Error Handling

### Endpoint Already Exists

```bash
# Attempting to add an endpoint that already exists
curl -X POST \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/get_user' \
  ...
```

**Response (400):**

```json
{
  "error": "Endpoint 'get_user' already exists. Use PUT to update it."
}
```

### Endpoint Not Found

```bash
# Attempting to update a non-existent endpoint
curl -X PUT \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/non_existent' \
  ...
```

**Response (404):**

```json
{
  "error": "Endpoint 'non_existent' not found"
}
```

### Invalid Authentication Type

```bash
curl -X POST \
  'http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-endpoints/test' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "base_url": "https://api.example.com",
    "path": "/test",
    "authentication": {
      "type": "invalid_type"
    }
  }'
```

**Response (400):**

```json
{
  "error": "Invalid authentication type. Must be one of: bearer_token, api_key, cookie"
}
```

## Best Practices

1. **Use Descriptive Endpoint Names**: Use clear, descriptive names for endpoints (e.g., `get_user_profile`, `create_order`, `update_product`)

2. **Secure Credentials**: Never commit authentication credentials to version control. Use environment variables or secure secret management.

3. **Different Auth Per Endpoint**: Take advantage of endpoint-level authentication to use different credentials for different services.

4. **Update vs Replace**: Use the individual endpoint management for targeted updates instead of replacing the entire configuration.

5. **Test Endpoints**: After configuring, test endpoints with the agent to ensure they work as expected.

6. **Documentation**: Document each endpoint's purpose, required parameters, and expected responses.

## Migration from Global Authentication

If you're currently using global authentication, here's how to migrate:

### Before (Global Auth)

```json
{
  "endpoints": {
    "endpoint1": { "base_url": "...", "path": "..." },
    "endpoint2": { "base_url": "...", "path": "..." }
  },
  "authentication": {
    "type": "bearer_token",
    "token": "global_token"
  }
}
```

### After (Endpoint-Level Auth)

Use the individual endpoint management to add authentication to each endpoint:

```bash
# Update endpoint1
curl -X PUT '.../api-endpoints/endpoint1' \
  -d '{"authentication": {"type": "bearer_token", "token": "token_for_endpoint1"}}'

# Update endpoint2
curl -X PUT '.../api-endpoints/endpoint2' \
  -d '{"authentication": {"type": "api_key", "key_name": "X-API-Key", "key_value": "key_for_endpoint2", "location": "header"}}'
```

The global authentication will still work as a fallback until all endpoints have their own authentication configured.
