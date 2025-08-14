# Projects API

The Projects API provides endpoints for managing projects within organizations. Projects serve as containers for agents, tools, and related resources.

## Base URL

```
https://your-domain.com/api/organizations/{organization_id}/projects
```

## Authentication

All endpoints require authentication and appropriate organization membership.

**Headers:**

```
Authorization: Bearer {jwt_token}
# OR
X-API-Key: {api_key}
```

## Endpoints

### List Projects

Get all projects in an organization.

```http
GET /api/organizations/{organization_id}/projects
```

**Query Parameters:**

- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20, max: 100)
- `search` (optional): Search term for project names/descriptions
- `sort` (optional): Sort field (`name`, `created_at`, `updated_at`)
- `order` (optional): Sort order (`asc`, `desc`)

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "proj_123456",
        "name": "customer-support-bot",
        "display_name": "Customer Support Bot",
        "description": "AI-powered customer support system",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "agent_count": 3,
        "execution_count": 456,
        "llm_configurations": [
          {
            "provider": "openai",
            "model": "gpt-4",
            "default": true
          }
        ]
      },
      {
        "id": "proj_789012",
        "name": "content-generator",
        "display_name": "Content Generator",
        "description": "Automated content generation for marketing",
        "created_at": "2024-01-12T14:20:00Z",
        "updated_at": "2024-01-14T09:15:00Z",
        "agent_count": 2,
        "execution_count": 123
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "pages": 1
    }
  }
}
```

### Create Project

Create a new project in an organization.

```http
POST /api/organizations/{organization_id}/projects
```

**Request Body:**

```json
{
  "name": "content-analyzer",
  "display_name": "Content Analyzer",
  "description": "Analyze and categorize content automatically",
  "llm_configurations": [
    {
      "provider": "openai",
      "model": "gpt-4",
      "api_key_id": "key_123456",
      "default": true,
      "parameters": {
        "temperature": 0.7,
        "max_tokens": 2000
      }
    }
  ]
}
```

**Validation Rules:**

- `name`: Required, lowercase, alphanumeric with hyphens/underscores
- `display_name`: Optional, human-readable name
- `description`: Optional string
- `llm_configurations`: Optional array of LLM configurations

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "proj_345678",
      "name": "content-analyzer",
      "display_name": "Content Analyzer",
      "description": "Analyze and categorize content automatically",
      "organization": "org_123456",
      "created_at": "2024-01-15T11:30:00Z",
      "updated_at": "2024-01-15T11:30:00Z",
      "llm_configurations": [
        {
          "id": "config_789",
          "provider": "openai",
          "model": "gpt-4",
          "api_key_id": "key_123456",
          "default": true,
          "parameters": {
            "temperature": 0.7,
            "max_tokens": 2000
          }
        }
      ]
    }
  }
}
```

### Get Project

Get details of a specific project.

```http
GET /api/organizations/{organization_id}/projects/{project_id}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "proj_123456",
      "name": "customer-support-bot",
      "display_name": "Customer Support Bot",
      "description": "AI-powered customer support system",
      "organization": "org_123456",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "llm_configurations": [
        {
          "id": "config_456",
          "provider": "openai",
          "model": "gpt-4",
          "api_key_id": "key_123456",
          "default": true,
          "parameters": {
            "temperature": 0.7,
            "max_tokens": 2000
          }
        }
      ],
      "agents": [
        {
          "id": "agent_789",
          "name": "support-chatbot",
          "type": "chatbot",
          "description": "Main support chatbot"
        }
      ],
      "stats": {
        "total_agents": 3,
        "total_executions": 456,
        "total_api_calls": 1234,
        "last_execution": "2024-01-15T09:45:00Z"
      }
    }
  }
}
```

### Update Project

Update a project's details.

```http
PUT /api/organizations/{organization_id}/projects/{project_id}
```

**Request Body:**

```json
{
  "display_name": "Updated Customer Support Bot",
  "description": "Enhanced AI-powered customer support system with new features",
  "llm_configurations": [
    {
      "id": "config_456",
      "parameters": {
        "temperature": 0.8,
        "max_tokens": 3000
      }
    }
  ]
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "proj_123456",
      "name": "customer-support-bot",
      "display_name": "Updated Customer Support Bot",
      "description": "Enhanced AI-powered customer support system with new features",
      "updated_at": "2024-01-15T12:30:00Z",
      "llm_configurations": [
        {
          "id": "config_456",
          "provider": "openai",
          "model": "gpt-4",
          "parameters": {
            "temperature": 0.8,
            "max_tokens": 3000
          }
        }
      ]
    }
  }
}
```

### Delete Project

Delete a project and all its associated data.

```http
DELETE /api/organizations/{organization_id}/projects/{project_id}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

**Note:** This operation permanently deletes the project, all its agents, executions, and associated data.

## LLM Configuration Management

### Add LLM Configuration

Add a new LLM configuration to a project.

```http
POST /api/organizations/{organization_id}/projects/{project_id}/llm-configs
```

**Request Body:**

```json
{
  "provider": "anthropic",
  "model": "claude-3-sonnet",
  "api_key_id": "key_789012",
  "default": false,
  "parameters": {
    "temperature": 0.5,
    "max_tokens": 4000,
    "top_p": 0.9
  }
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "llm_config": {
      "id": "config_567",
      "provider": "anthropic",
      "model": "claude-3-sonnet",
      "api_key_id": "key_789012",
      "default": false,
      "parameters": {
        "temperature": 0.5,
        "max_tokens": 4000,
        "top_p": 0.9
      },
      "created_at": "2024-01-15T13:30:00Z"
    }
  }
}
```

### Update LLM Configuration

Update an existing LLM configuration.

```http
PUT /api/organizations/{organization_id}/projects/{project_id}/llm-configs/{config_id}
```

**Request Body:**

```json
{
  "parameters": {
    "temperature": 0.6,
    "max_tokens": 5000
  },
  "default": true
}
```

### Delete LLM Configuration

Remove an LLM configuration from a project.

```http
DELETE /api/organizations/{organization_id}/projects/{project_id}/llm-configs/{config_id}
```

## Project Statistics

### Get Project Statistics

Get detailed statistics for a project.

```http
GET /api/organizations/{organization_id}/projects/{project_id}/stats
```

**Query Parameters:**

- `period` (optional): `day`, `week`, `month`, `year` (default: `month`)
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "stats": {
      "period": "month",
      "start_date": "2024-01-01T00:00:00Z",
      "end_date": "2024-01-31T23:59:59Z",
      "totals": {
        "agents": 3,
        "executions": 456,
        "api_calls": 1234,
        "tokens_used": 56789,
        "errors": 12,
        "success_rate": 97.4
      },
      "by_agent": [
        {
          "agent_id": "agent_789",
          "agent_name": "support-chatbot",
          "executions": 300,
          "tokens_used": 45000,
          "avg_response_time": 1.2
        }
      ],
      "daily_breakdown": [
        {
          "date": "2024-01-01",
          "executions": 15,
          "tokens_used": 1800,
          "errors": 0
        }
      ]
    }
  }
}
```

### Get Execution History

Get execution history for a project.

```http
GET /api/organizations/{organization_id}/projects/{project_id}/executions
```

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `agent_id` (optional): Filter by specific agent
- `status` (optional): Filter by status (`success`, `error`, `pending`)
- `start_date` (optional): Filter executions after this date
- `end_date` (optional): Filter executions before this date

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "executions": [
      {
        "id": "exec_123456",
        "agent_id": "agent_789",
        "agent_name": "support-chatbot",
        "status": "success",
        "prompt": "How do I reset my password?",
        "response": "To reset your password, please follow these steps...",
        "tokens_used": 150,
        "response_time_ms": 1200,
        "created_at": "2024-01-15T14:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 456,
      "pages": 23
    }
  }
}
```

## Error Handling

### Common Error Responses

**404 Not Found:**

```json
{
  "error": "Project not found",
  "code": "PROJECT_NOT_FOUND"
}
```

**403 Forbidden:**

```json
{
  "error": "Access denied to project",
  "code": "PROJECT_ACCESS_DENIED"
}
```

**409 Conflict:**

```json
{
  "error": "Project name already exists",
  "code": "PROJECT_NAME_EXISTS"
}
```

**422 Unprocessable Entity:**

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "name",
      "message": "Name must contain only lowercase letters, numbers, hyphens, and underscores"
    }
  ]
}
```

## Usage Examples

### JavaScript/Node.js

```javascript
// Create project
const projectData = {
  name: "content-analyzer",
  display_name: "Content Analyzer",
  description: "Analyze and categorize content",
  llm_configurations: [
    {
      provider: "openai",
      model: "gpt-4",
      api_key_id: "key_123456",
      default: true,
    },
  ],
};

const createResponse = await fetch("/api/organizations/org_123/projects", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(projectData),
});

// Get project statistics
const statsResponse = await fetch(
  "/api/organizations/org_123/projects/proj_456/stats?period=week",
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
);
```

### cURL

```bash
# List projects
curl -X GET "https://api.example.com/api/organizations/org_123/projects" \
  -H "Authorization: Bearer {token}"

# Create project
curl -X POST "https://api.example.com/api/organizations/org_123/projects" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "content-analyzer",
    "display_name": "Content Analyzer",
    "description": "Analyze and categorize content"
  }'

# Get project stats
curl -X GET "https://api.example.com/api/organizations/org_123/projects/proj_456/stats?period=month" \
  -H "Authorization: Bearer {token}"
```

### Python

```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Create project
project_data = {
    'name': 'content-analyzer',
    'display_name': 'Content Analyzer',
    'description': 'Analyze and categorize content'
}

response = requests.post(
    'https://api.example.com/api/organizations/org_123/projects',
    json=project_data,
    headers=headers
)

project = response.json()['data']['project']

# Get project statistics
stats_response = requests.get(
    f'https://api.example.com/api/organizations/org_123/projects/{project["id"]}/stats',
    headers=headers,
    params={'period': 'month'}
)
```
