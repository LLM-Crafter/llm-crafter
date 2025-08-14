# Agents API

The Agents API provides endpoints for managing AI agents within projects. Agents are the core entities that execute prompts using configured LLM providers.

## Base URL

```
https://your-domain.com/api/organizations/{organization_id}/projects/{project_id}/agents
```

## Authentication

All endpoints require authentication and appropriate project access.

**Headers:**

```
Authorization: Bearer {jwt_token}
# OR
X-API-Key: {api_key}
```

## Endpoints

### List Agents

Get all agents in a project.

```http
GET /api/organizations/{organization_id}/projects/{project_id}/agents
```

**Query Parameters:**

- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20, max: 100)
- `type` (optional): Filter by agent type (`chatbot`, `task`, `workflow`, `api`)
- `search` (optional): Search term for agent names/descriptions
- `enabled` (optional): Filter by enabled status (`true`, `false`)

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent_123456",
        "name": "customer-support-chatbot",
        "description": "Main customer support chatbot",
        "type": "chatbot",
        "enabled": true,
        "system_prompt": "You are a helpful customer support assistant...",
        "api_key": "key_789012",
        "llm_settings": {
          "model": "gpt-4",
          "parameters": {
            "temperature": 0.7,
            "max_tokens": 1000
          }
        },
        "tools": [
          {
            "name": "web_search",
            "description": "Search for information",
            "enabled": true
          }
        ],
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "execution_count": 456,
        "last_execution": "2024-01-15T14:30:00Z"
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

### Create Agent

Create a new agent in a project.

```http
POST /api/organizations/{organization_id}/projects/{project_id}/agents
```

**Request Body:**

```json
{
  "name": "content-analyzer-agent",
  "description": "Analyzes and categorizes content automatically",
  "type": "task",
  "system_prompt": "You are an expert content analyst. Analyze the provided content and categorize it based on topic, sentiment, and quality.",
  "api_key": "key_123456",
  "llm_settings": {
    "model": "gpt-4",
    "parameters": {
      "temperature": 0.3,
      "max_tokens": 2000,
      "top_p": 0.9
    }
  },
  "tools": [
    {
      "name": "web_search",
      "description": "Search for related information",
      "enabled": true
    },
    {
      "name": "calculator",
      "description": "Perform calculations",
      "enabled": false
    }
  ],
  "enabled": true
}
```

**Validation Rules:**

- `name`: Required, alphanumeric with hyphens/underscores
- `type`: Required, one of: `chatbot`, `task`, `workflow`, `api`
- `system_prompt`: Required, non-empty string
- `api_key`: Required, valid API key ID
- `llm_settings.model`: Required string
- `tools`: Optional array of tool configurations

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_789012",
      "name": "content-analyzer-agent",
      "description": "Analyzes and categorizes content automatically",
      "type": "task",
      "enabled": true,
      "system_prompt": "You are an expert content analyst...",
      "api_key": "key_123456",
      "llm_settings": {
        "model": "gpt-4",
        "parameters": {
          "temperature": 0.3,
          "max_tokens": 2000,
          "top_p": 0.9
        }
      },
      "tools": [
        {
          "name": "web_search",
          "description": "Search for related information",
          "enabled": true
        }
      ],
      "organization": "org_123456",
      "project": "proj_789012",
      "created_at": "2024-01-15T11:30:00Z",
      "updated_at": "2024-01-15T11:30:00Z"
    }
  }
}
```

### Get Agent

Get details of a specific agent.

```http
GET /api/organizations/{organization_id}/projects/{project_id}/agents/{agent_id}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_123456",
      "name": "customer-support-chatbot",
      "description": "Main customer support chatbot",
      "type": "chatbot",
      "enabled": true,
      "system_prompt": "You are a helpful customer support assistant...",
      "api_key": "key_789012",
      "llm_settings": {
        "model": "gpt-4",
        "parameters": {
          "temperature": 0.7,
          "max_tokens": 1000,
          "top_p": 1.0,
          "frequency_penalty": 0,
          "presence_penalty": 0
        }
      },
      "tools": [
        {
          "name": "web_search",
          "description": "Search for information",
          "parameters": {},
          "enabled": true
        }
      ],
      "organization": "org_123456",
      "project": "proj_789012",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "stats": {
        "total_executions": 456,
        "successful_executions": 445,
        "failed_executions": 11,
        "avg_response_time_ms": 1200,
        "last_execution": "2024-01-15T14:30:00Z"
      }
    }
  }
}
```

### Update Agent

Update an agent's configuration.

```http
PUT /api/organizations/{organization_id}/projects/{project_id}/agents/{agent_id}
```

**Request Body:**

```json
{
  "description": "Enhanced customer support chatbot with improved responses",
  "system_prompt": "You are an expert customer support assistant with access to our knowledge base...",
  "llm_settings": {
    "parameters": {
      "temperature": 0.8,
      "max_tokens": 1500
    }
  },
  "tools": [
    {
      "name": "web_search",
      "description": "Search for information",
      "enabled": true
    },
    {
      "name": "knowledge_base",
      "description": "Search internal knowledge base",
      "enabled": true
    }
  ]
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_123456",
      "name": "customer-support-chatbot",
      "description": "Enhanced customer support chatbot with improved responses",
      "system_prompt": "You are an expert customer support assistant...",
      "llm_settings": {
        "model": "gpt-4",
        "parameters": {
          "temperature": 0.8,
          "max_tokens": 1500
        }
      },
      "updated_at": "2024-01-15T12:30:00Z"
    }
  }
}
```

### Delete Agent

Delete an agent and its execution history.

```http
DELETE /api/organizations/{organization_id}/projects/{project_id}/agents/{agent_id}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Agent deleted successfully"
}
```

## Agent Execution

### Execute Agent

Execute an agent with a prompt.

```http
POST /api/organizations/{organization_id}/projects/{project_id}/agents/{agent_id}/execute
```

**Request Body:**

```json
{
  "prompt": "How do I reset my password?",
  "context": {
    "user_id": "user_123",
    "session_id": "session_456"
  },
  "override_settings": {
    "temperature": 0.5
  }
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "execution": {
      "id": "exec_123456",
      "agent_id": "agent_789012",
      "prompt": "How do I reset my password?",
      "response": "To reset your password, please follow these steps:\n1. Go to the login page\n2. Click 'Forgot Password'\n3. Enter your email address...",
      "context": {
        "user_id": "user_123",
        "session_id": "session_456"
      },
      "metadata": {
        "model_used": "gpt-4",
        "tokens_used": {
          "prompt": 45,
          "completion": 123,
          "total": 168
        },
        "response_time_ms": 1200,
        "tools_used": ["web_search"]
      },
      "created_at": "2024-01-15T14:30:00Z"
    }
  }
}
```

### Get Execution History

Get execution history for an agent.

```http
GET /api/organizations/{organization_id}/projects/{project_id}/agents/{agent_id}/executions
```

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
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
        "prompt": "How do I reset my password?",
        "response": "To reset your password...",
        "status": "success",
        "tokens_used": 168,
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

### Clone Agent

Create a copy of an existing agent.

```http
POST /api/organizations/{organization_id}/projects/{project_id}/agents/{agent_id}/clone
```

**Request Body:**

```json
{
  "name": "customer-support-chatbot-v2",
  "description": "Updated version of the customer support chatbot"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_345678",
      "name": "customer-support-chatbot-v2",
      "description": "Updated version of the customer support chatbot",
      "type": "chatbot",
      "system_prompt": "You are a helpful customer support assistant...",
      "created_at": "2024-01-15T15:30:00Z"
    }
  }
}
```

## Agent Statistics

### Get Agent Statistics

Get detailed statistics for an agent.

```http
GET /api/organizations/{organization_id}/projects/{project_id}/agents/{agent_id}/stats
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
        "executions": 456,
        "successful_executions": 445,
        "failed_executions": 11,
        "tokens_used": 67890,
        "avg_response_time_ms": 1200,
        "success_rate": 97.6
      },
      "tools_usage": [
        {
          "tool_name": "web_search",
          "usage_count": 234,
          "success_rate": 98.7
        }
      ],
      "daily_breakdown": [
        {
          "date": "2024-01-01",
          "executions": 15,
          "tokens_used": 2100,
          "avg_response_time_ms": 1150
        }
      ]
    }
  }
}
```

## Error Handling

### Common Error Responses

**404 Not Found:**

```json
{
  "error": "Agent not found",
  "code": "AGENT_NOT_FOUND"
}
```

**403 Forbidden:**

```json
{
  "error": "Access denied to agent",
  "code": "AGENT_ACCESS_DENIED"
}
```

**409 Conflict:**

```json
{
  "error": "Agent name already exists",
  "code": "AGENT_NAME_EXISTS"
}
```

**422 Unprocessable Entity:**

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "type",
      "message": "Invalid agent type"
    }
  ]
}
```

**500 Internal Server Error (Execution Error):**

```json
{
  "error": "Agent execution failed",
  "code": "EXECUTION_ERROR",
  "details": {
    "error_type": "api_error",
    "message": "LLM provider returned an error",
    "provider_error": "Rate limit exceeded"
  }
}
```

## Usage Examples

### JavaScript/Node.js

```javascript
// Create agent
const agentData = {
  name: "content-analyzer",
  description: "Analyzes content automatically",
  type: "task",
  system_prompt: "You are an expert content analyst...",
  api_key: "key_123456",
  llm_settings: {
    model: "gpt-4",
    parameters: {
      temperature: 0.3,
      max_tokens: 2000,
    },
  },
};

const createResponse = await fetch(
  "/api/organizations/org_123/projects/proj_456/agents",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(agentData),
  }
);

// Execute agent
const executeResponse = await fetch(
  "/api/organizations/org_123/projects/proj_456/agents/agent_789/execute",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: "Analyze this content for sentiment and topics",
      context: { source: "api" },
    }),
  }
);
```

### cURL

```bash
# Create agent
curl -X POST "https://api.example.com/api/organizations/org_123/projects/proj_456/agents" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "content-analyzer",
    "type": "task",
    "system_prompt": "You are an expert content analyst...",
    "api_key": "key_123456",
    "llm_settings": {
      "model": "gpt-4",
      "parameters": {"temperature": 0.3}
    }
  }'

# Execute agent
curl -X POST "https://api.example.com/api/organizations/org_123/projects/proj_456/agents/agent_789/execute" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze this content"}'
```

### Python

```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Create agent
agent_data = {
    'name': 'content-analyzer',
    'type': 'task',
    'system_prompt': 'You are an expert content analyst...',
    'api_key': 'key_123456',
    'llm_settings': {
        'model': 'gpt-4',
        'parameters': {'temperature': 0.3}
    }
}

response = requests.post(
    'https://api.example.com/api/organizations/org_123/projects/proj_456/agents',
    json=agent_data,
    headers=headers
)

agent = response.json()['data']['agent']

# Execute agent
execution_response = requests.post(
    f'https://api.example.com/api/organizations/org_123/projects/proj_456/agents/{agent["id"]}/execute',
    json={'prompt': 'Analyze this content'},
    headers=headers
)
```
