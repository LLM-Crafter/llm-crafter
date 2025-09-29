# Tools API

The Tools API provides endpoints for managing tools that can be used by agents. Tools extend agent capabilities by providing access to external services, APIs, and functionality.

## Base URL

```
https://your-domain.com/api/tools
```

## Authentication

All endpoints require authentication and appropriate permissions.

**Headers:**

```
Authorization: Bearer {jwt_token}
# OR
X-API-Key: {api_key}
```

## Endpoints

### List System Tools

Get all available system tools.

```http
GET /api/tools/system
```

**Query Parameters:**

- `category` (optional): Filter by category (`web`, `computation`, `llm`, `utility`, etc.)
- `search` (optional): Search term for tool names/descriptions

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "web_search",
        "display_name": "Web Search",
        "description": "Search the web for information using a search engine (Brave Search or Tavily)",
        "category": "web",
        "parameters_schema": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "The search query"
            },
            "max_results": {
              "type": "number",
              "description": "Maximum number of results to return",
              "default": 5,
              "minimum": 1,
              "maximum": 20
            },
            "provider": {
              "type": "string",
              "description": "Search provider to use (brave or tavily)",
              "enum": ["brave", "tavily"],
              "default": "brave"
            }
          },
          "required": ["query"]
        },
        "return_schema": {
          "type": "object",
          "properties": {
            "query": { "type": "string" },
            "provider": { "type": "string" },
            "results": { "type": "array" },
            "total_results": { "type": "number" },
            "search_time_ms": { "type": "number" },
            "error": { "type": "string" }
          }
        },
        "is_system_tool": true
      }
    ],
    "total": 8
  }
}
```

### Get System Tool Details

Get detailed information about a specific system tool.

```http
GET /api/tools/system/{tool_name}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "tool": {
      "name": "web_search",
      "display_name": "Web Search",
      "description": "Search the web for information using a search engine",
      "category": "web",
      "parameters_schema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query"
          },
          "max_results": {
            "type": "number",
            "description": "Maximum number of results to return",
            "default": 5,
            "minimum": 1,
            "maximum": 20
          }
        },
        "required": ["query"],
        "additionalProperties": false
      },
      "return_schema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "results": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": { "type": "string" },
                "url": { "type": "string" },
                "snippet": { "type": "string" }
              }
            }
          },
          "total_results": { "type": "number" },
          "search_time_ms": { "type": "number" }
        }
      },
      "implementation": {
        "type": "internal",
        "handler": "webSearchHandler"
      },
      "is_system_tool": true,
      "usage_examples": [
        {
          "name": "Basic search",
          "parameters": {
            "query": "latest developments in artificial intelligence"
          }
        },
        {
          "name": "Limited results",
          "parameters": {
            "query": "weather forecast",
            "max_results": 3
          }
        }
      ]
    }
  }
}
```

### List Custom Tools

Get custom tools for an organization.

```http
GET /api/organizations/{organization_id}/tools
```

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `category` (optional): Filter by category
- `enabled` (optional): Filter by enabled status

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "id": "tool_123456",
        "name": "salesforce_api",
        "display_name": "Salesforce API",
        "description": "Interface with Salesforce CRM data",
        "category": "integration",
        "parameters_schema": {
          "type": "object",
          "properties": {
            "action": {
              "type": "string",
              "enum": ["get_contact", "create_lead", "update_opportunity"]
            },
            "data": {
              "type": "object"
            }
          },
          "required": ["action"]
        },
        "implementation": {
          "type": "webhook",
          "url": "https://api.mycompany.com/salesforce-proxy",
          "authentication": {
            "type": "api_key",
            "header": "X-API-Key"
          }
        },
        "enabled": true,
        "is_system_tool": false,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

### Create Custom Tool

Create a new custom tool for an organization.

```http
POST /api/organizations/{organization_id}/tools
```

**Request Body:**

```json
{
  "name": "github_api",
  "display_name": "GitHub API",
  "description": "Interface with GitHub repositories and issues",
  "category": "integration",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["get_repo", "create_issue", "list_issues"],
        "description": "The action to perform"
      },
      "repository": {
        "type": "string",
        "description": "Repository name in format owner/repo"
      },
      "data": {
        "type": "object",
        "description": "Additional data for the action"
      }
    },
    "required": ["action", "repository"]
  },
  "return_schema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "data": { "type": "object" },
      "message": { "type": "string" }
    }
  },
  "implementation": {
    "type": "webhook",
    "url": "https://api.mycompany.com/github-proxy",
    "method": "POST",
    "authentication": {
      "type": "bearer",
      "token_env": "GITHUB_TOKEN"
    },
    "headers": {
      "Content-Type": "application/json"
    }
  },
  "enabled": true
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "tool": {
      "id": "tool_789012",
      "name": "github_api",
      "display_name": "GitHub API",
      "description": "Interface with GitHub repositories and issues",
      "category": "integration",
      "parameters_schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": ["get_repo", "create_issue", "list_issues"]
          }
        }
      },
      "implementation": {
        "type": "webhook",
        "url": "https://api.mycompany.com/github-proxy"
      },
      "enabled": true,
      "organization": "org_123456",
      "created_at": "2024-01-15T11:30:00Z",
      "updated_at": "2024-01-15T11:30:00Z"
    }
  }
}
```

### Get Custom Tool

Get details of a specific custom tool.

```http
GET /api/organizations/{organization_id}/tools/{tool_id}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "tool": {
      "id": "tool_123456",
      "name": "salesforce_api",
      "display_name": "Salesforce API",
      "description": "Interface with Salesforce CRM data",
      "category": "integration",
      "parameters_schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": ["get_contact", "create_lead", "update_opportunity"]
          }
        }
      },
      "return_schema": {
        "type": "object",
        "properties": {
          "success": { "type": "boolean" },
          "data": { "type": "object" }
        }
      },
      "implementation": {
        "type": "webhook",
        "url": "https://api.mycompany.com/salesforce-proxy",
        "method": "POST",
        "authentication": {
          "type": "api_key",
          "header": "X-API-Key"
        }
      },
      "enabled": true,
      "organization": "org_123456",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "stats": {
        "total_executions": 234,
        "successful_executions": 228,
        "failed_executions": 6,
        "success_rate": 97.4,
        "avg_response_time_ms": 850
      }
    }
  }
}
```

### Update Custom Tool

Update a custom tool's configuration.

```http
PUT /api/organizations/{organization_id}/tools/{tool_id}
```

**Request Body:**

```json
{
  "description": "Enhanced Salesforce API integration with additional features",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": [
          "get_contact",
          "create_lead",
          "update_opportunity",
          "get_account"
        ]
      },
      "filters": {
        "type": "object",
        "description": "Optional filters for data retrieval"
      }
    }
  },
  "enabled": true
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "tool": {
      "id": "tool_123456",
      "description": "Enhanced Salesforce API integration with additional features",
      "parameters_schema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "get_contact",
              "create_lead",
              "update_opportunity",
              "get_account"
            ]
          }
        }
      },
      "updated_at": "2024-01-15T12:30:00Z"
    }
  }
}
```

### Delete Custom Tool

Delete a custom tool.

```http
DELETE /api/organizations/{organization_id}/tools/{tool_id}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Tool deleted successfully"
}
```

### Test Tool

Test a tool's functionality with sample parameters.

```http
POST /api/organizations/{organization_id}/tools/{tool_id}/test
```

**Request Body:**

```json
{
  "parameters": {
    "action": "get_contact",
    "data": {
      "email": "test@example.com"
    }
  }
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "test_result": {
      "success": true,
      "response": {
        "contact": {
          "id": "003XX000000ABC123",
          "name": "John Doe",
          "email": "test@example.com"
        }
      },
      "execution_time_ms": 450,
      "timestamp": "2024-01-15T13:30:00Z"
    }
  }
}
```

## Tool Execution

### Execute Tool

Execute a tool directly (for testing or standalone use).

```http
POST /api/tools/execute
```

**Request Body:**

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "artificial intelligence trends 2024",
    "max_results": 5,
    "provider": "brave"
  },
  "organization_id": "org_123456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "execution": {
      "id": "exec_123456",
      "tool_name": "web_search",
      "parameters": {
        "query": "artificial intelligence trends 2024",
        "max_results": 5
      },
      "result": {
        "query": "artificial intelligence trends 2024",
        "provider": "brave",
        "results": [
          {
            "title": "Top AI Trends for 2024",
            "url": "https://example.com/ai-trends-2024",
            "snippet": "Explore the latest trends in artificial intelligence..."
          }
        ],
        "total_results": 5,
        "search_time_ms": 120
      },
      "execution_time_ms": 450,
      "created_at": "2024-01-15T13:30:00Z"
    }
  }
}
```

## Tool Categories

### List Categories

Get all available tool categories.

```http
GET /api/tools/categories
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "name": "web",
        "display_name": "Web",
        "description": "Tools for web interactions and search",
        "tool_count": 3
      },
      {
        "name": "computation",
        "display_name": "Computation",
        "description": "Mathematical and computational tools",
        "tool_count": 2
      },
      {
        "name": "integration",
        "display_name": "Integration",
        "description": "Third-party service integrations",
        "tool_count": 5
      }
    ]
  }
}
```

## Error Handling

### Common Error Responses

**404 Not Found:**

```json
{
  "error": "Tool not found",
  "code": "TOOL_NOT_FOUND"
}
```

**400 Bad Request:**

```json
{
  "error": "Invalid tool parameters",
  "code": "INVALID_PARAMETERS",
  "details": {
    "parameter": "query",
    "message": "Query parameter is required"
  }
}
```

**422 Unprocessable Entity:**

```json
{
  "error": "Tool validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "parameters_schema",
      "message": "Invalid JSON schema format"
    }
  ]
}
```

**500 Internal Server Error:**

```json
{
  "error": "Tool execution failed",
  "code": "EXECUTION_ERROR",
  "details": {
    "tool_name": "web_search",
    "error_message": "External service unavailable"
  }
}
```

## Usage Examples

### JavaScript/Node.js

```javascript
// List system tools
const systemToolsResponse = await fetch("/api/tools/system", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Create custom tool
const toolData = {
  name: "github_api",
  display_name: "GitHub API",
  description: "Interface with GitHub repositories",
  category: "integration",
  parameters_schema: {
    type: "object",
    properties: {
      action: { type: "string" },
      repository: { type: "string" },
    },
    required: ["action", "repository"],
  },
  implementation: {
    type: "webhook",
    url: "https://api.mycompany.com/github-proxy",
  },
};

const createResponse = await fetch("/api/organizations/org_123/tools", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(toolData),
});

// Execute tool
const executeResponse = await fetch("/api/tools/execute", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tool_name: "web_search",
    parameters: {
      query: "artificial intelligence trends",
      max_results: 5,
    },
  }),
});
```

### cURL

```bash
# List system tools
curl -X GET "https://api.example.com/api/tools/system" \
  -H "Authorization: Bearer {token}"

# Create custom tool
curl -X POST "https://api.example.com/api/organizations/org_123/tools" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github_api",
    "display_name": "GitHub API",
    "description": "Interface with GitHub repositories",
    "category": "integration"
  }'

# Execute tool
curl -X POST "https://api.example.com/api/tools/execute" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "web_search",
    "parameters": {"query": "AI trends", "max_results": 5}
  }'
```

### Python

```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Create custom tool
tool_data = {
    'name': 'github_api',
    'display_name': 'GitHub API',
    'description': 'Interface with GitHub repositories',
    'category': 'integration',
    'parameters_schema': {
        'type': 'object',
        'properties': {
            'action': {'type': 'string'},
            'repository': {'type': 'string'}
        }
    }
}

response = requests.post(
    'https://api.example.com/api/organizations/org_123/tools',
    json=tool_data,
    headers=headers
)

# Execute tool
execution_response = requests.post(
    'https://api.example.com/api/tools/execute',
    json={
        'tool_name': 'web_search',
        'parameters': {
            'query': 'artificial intelligence trends',
            'max_results': 5
        }
    },
    headers=headers
)
```
