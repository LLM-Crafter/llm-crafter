# API Caller Tool

Make HTTP requests to pre-configured API endpoints with authentication and advanced features.

## Overview

The API Caller tool enables agents to interact with external APIs in a secure and structured manner. It supports pre-configured endpoints with authentication, path/query parameters, and comprehensive error handling.

## Configuration

**Category:** Communication  
**Tool Name:** `api_caller`

## Parameters

| Parameter       | Type   | Required | Default | Description                                    |
| --------------- | ------ | -------- | ------- | ---------------------------------------------- |
| `endpoint_name` | string | Yes      | -       | Name of the pre-configured endpoint            |
| `method`        | string | No       | `GET`   | HTTP method: GET, POST, PUT, PATCH, DELETE     |
| `path_params`   | object | No       | `{}`    | Path parameters to replace in URL (e.g., {id}) |
| `query_params`  | object | No       | `{}`    | Query parameters to append to URL              |
| `body_data`     | any    | No       | -       | Request body data (for POST/PUT/PATCH)         |
| `headers`       | object | No       | `{}`    | Additional headers to include                  |

## Setup

Configure API endpoints for an agent:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config
```

**Request Body:**

```json
{
  "endpoints": {
    "get_user": {
      "base_url": "https://api.example.com",
      "path": "/users/{user_id}",
      "methods": ["GET"],
      "description": "Get user details by ID"
    },
    "create_order": {
      "base_url": "https://api.example.com",
      "path": "/orders",
      "methods": ["POST"],
      "description": "Create a new order"
    }
  },
  "authentication": {
    "type": "bearer_token",
    "token": "your-api-token"
  },
  "summarization": {
    "enabled": true,
    "max_tokens": 500,
    "min_size": 1000,
    "model": "gpt-4o-mini",
    "endpoint_rules": {
      "get_user": {
        "max_tokens": 300,
        "focus": "Extract name, email, and role"
      }
    }
  }
}
```

**Response:**

```json
{
  "message": "API configuration updated successfully",
  "endpoints": {
    /* configured endpoints */
  },
  "authentication": { "type": "bearer_token" },
  "summarization": {
    /* summarization config */
  }
}
```

Get the configuration:

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config
```

## Authentication Types

### Bearer Token

```json
{
  "authentication": {
    "type": "bearer_token",
    "token": "your-jwt-token"
  }
}
```

### API Key (Header)

```json
{
  "authentication": {
    "type": "api_key",
    "header_name": "X-API-Key",
    "api_key": "your-api-key"
  }
}
```

### Basic Auth

```json
{
  "authentication": {
    "type": "basic",
    "username": "user",
    "password": "pass"
  }
}
```

### Custom Headers

```json
{
  "authentication": {
    "type": "custom_headers",
    "headers": {
      "Authorization": "Bearer token",
      "X-Custom": "value"
    }
  }
}
```

## Usage Examples

### GET Request with Path Parameters

```json
{
  "tool_name": "api_caller",
  "parameters": {
    "endpoint_name": "get_user",
    "method": "GET",
    "path_params": {
      "user_id": "12345"
    }
  }
}
```

### POST Request with Body

```json
{
  "tool_name": "api_caller",
  "parameters": {
    "endpoint_name": "create_order",
    "method": "POST",
    "body_data": {
      "product_id": "prod_123",
      "quantity": 2,
      "customer_id": "cust_456"
    }
  }
}
```

### GET with Query Parameters

```json
{
  "tool_name": "api_caller",
  "parameters": {
    "endpoint_name": "search_products",
    "method": "GET",
    "query_params": {
      "category": "electronics",
      "limit": 10,
      "sort": "price_asc"
    }
  }
}
```

## Response Format

```json
{
  "endpoint_name": "get_user",
  "url": "https://api.example.com/users/12345",
  "method": "GET",
  "status_code": 200,
  "status_text": "OK",
  "success": true,
  "headers": {
    "content-type": "application/json"
  },
  "data": {
    "id": "12345",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "execution_time_ms": 245
}
```

## Common Use Cases

- **CRM Integration**: Fetch customer data from Salesforce, HubSpot
- **Order Management**: Create/update orders in e-commerce systems
- **User Management**: Query user data from authentication systems
- **Data Sync**: Synchronize data between systems
- **Webhook Triggers**: Trigger actions in external systems
- **Analytics**: Fetch metrics and analytics data

## Configuration in Agents

```json
{
  "name": "integration_assistant",
  "type": "chatbot",
  "tools": ["api_caller"],
  "system_prompt": "You can interact with external APIs to fetch and update data..."
}
```

## Best Practices

- **Pre-configure Endpoints**: Always configure endpoints before agent uses them
- **Use Path Parameters**: For dynamic URLs (e.g., `/users/{id}`)
- **Validate Responses**: Check `success` field before processing data
- **Handle Errors**: Gracefully handle HTTP errors and timeouts
- **Rate Limiting**: Be aware of external API rate limits
- **Security**: Store API credentials securely, never in prompts

## Error Handling

Common error scenarios:

- **Endpoint Not Configured**: Returns error if endpoint_name not found
- **Method Not Allowed**: Returns error if HTTP method not permitted
- **Authentication Failed**: HTTP 401/403 errors
- **Timeout**: Request exceeds configured timeout
- **Network Error**: Connection failures

Example error response:

```json
{
  "endpoint_name": "get_user",
  "success": false,
  "status_code": 404,
  "error": "User not found",
  "execution_time_ms": 123
}
```

## Advanced Features

### Response Summarization

Enable automatic response summarization for large API responses:

```json
{
  "summarization": {
    "enabled": true,
    "max_tokens": 150
  }
}
```

### Timeout Configuration

Set custom timeout for specific endpoints:

```json
{
  "endpoints": {
    "long_running_task": {
      "base_url": "https://api.example.com",
      "path": "/tasks",
      "timeout": 60000
    }
  }
}
```

## Related Tools

- [JSON Processor](/tools/json-processor) - Process API responses
- [Web Search](/tools/web-search) - Search for API documentation
- [LLM Prompt](/tools/llm-prompt) - Generate API requests dynamically
