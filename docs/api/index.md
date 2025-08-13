# API Reference

LLM Crafter provides a comprehensive RESTful API for managing organizations, projects, agents, and conversations. All endpoints require authentication unless otherwise noted.

## Base URL

```
http://localhost:3000/api/v1
```

## Authentication

All API endpoints require a JWT token obtained through authentication.

### Authentication Header

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

### Getting a Token

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "user_123",
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

## Rate Limiting

- **Limit**: 100 requests per 15-minute window
- **Headers**: Rate limit information is included in response headers
- **Status Code**: 429 when rate limit exceeded

## Error Handling

### Standard Error Response

```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

## Pagination

List endpoints support pagination using query parameters:

```bash
GET /api/v1/organizations?page=1&limit=10&sort=name&order=asc
```

**Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `sort`: Field to sort by
- `order`: Sort order (`asc` or `desc`)

**Response includes pagination metadata:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "pages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Content Types

### Request Content Type
```
Content-Type: application/json
```

### Response Content Type
```
Content-Type: application/json
```

## API Endpoints

### Health Check

Check API health and status.

```bash
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "llm-crafter",
  "timestamp": "2024-01-16T10:30:00Z",
  "version": "0.1.0"
}
```

### Detailed Health Check

Get detailed system status including database connectivity.

```bash
GET /health/detailed
```

**Response:**
```json
{
  "status": "ok",
  "service": "llm-crafter",
  "timestamp": "2024-01-16T10:30:00Z",
  "version": "0.1.0",
  "database": {
    "status": "connected",
    "response_time_ms": 12
  },
  "memory": {
    "used": "156.2 MB",
    "total": "512.0 MB",
    "percentage": 30.5
  },
  "uptime": "2h 15m 30s"
}
```

## Quick Reference

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | User login |
| POST | `/auth/logout` | User logout |
| GET | `/auth/me` | Get current user |

### Organization Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/organizations` | List user's organizations |
| POST | `/organizations` | Create organization |
| GET | `/organizations/{orgId}` | Get organization details |
| PUT | `/organizations/{orgId}` | Update organization |
| DELETE | `/organizations/{orgId}` | Delete organization |

### Project Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/organizations/{orgId}/projects` | List projects |
| POST | `/organizations/{orgId}/projects` | Create project |
| GET | `/organizations/{orgId}/projects/{projectId}` | Get project |
| PUT | `/organizations/{orgId}/projects/{projectId}` | Update project |
| DELETE | `/organizations/{orgId}/projects/{projectId}` | Delete project |

### Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/organizations/{orgId}/projects/{projectId}/agents` | List agents |
| POST | `/organizations/{orgId}/projects/{projectId}/agents` | Create agent |
| GET | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}` | Get agent |
| PUT | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}` | Update agent |
| DELETE | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}` | Delete agent |

### Agent Execution Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat` | Chat with agent |
| POST | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}/execute` | Execute task agent |
| GET | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations` | List conversations |
| GET | `/organizations/{orgId}/projects/{projectId}/agents/{agentId}/executions` | List executions |

### Tool Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tools` | List all tools |
| GET | `/tools/categories` | Get tool categories |
| GET | `/tools/{toolName}` | Get tool details |
| POST | `/tools/{toolName}/execute` | Execute tool |

### Provider Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/providers` | List LLM providers |
| GET | `/providers/{providerId}` | Get provider details |
| GET | `/providers/{providerId}/models` | List provider models |

## WebSocket API

For real-time features like streaming responses:

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
ws.send(JSON.stringify({
  type: 'authenticate',
  token: 'your-jwt-token'
}));
```

### Agent Streaming

```javascript
ws.send(JSON.stringify({
  type: 'agent_chat',
  agent_id: 'agent_123',
  message: 'Hello, how can you help me?',
  user_identifier: 'user_456'
}));
```

## SDKs and Libraries

### JavaScript/Node.js

```bash
npm install llm-crafter-sdk
```

```javascript
import { LLMCrafter } from 'llm-crafter-sdk';

const client = new LLMCrafter({
  baseUrl: 'http://localhost:3000/api/v1',
  apiKey: 'your-jwt-token'
});

// Create an agent
const agent = await client.agents.create({
  name: 'my-agent',
  type: 'chatbot',
  systemPrompt: 'You are a helpful assistant'
});

// Chat with the agent
const response = await client.agents.chat(agent.id, {
  message: 'Hello!',
  userIdentifier: 'user123'
});
```

### Python

```bash
pip install llm-crafter-python
```

```python
from llm_crafter import LLMCrafter

client = LLMCrafter(
    base_url='http://localhost:3000/api/v1',
    api_key='your-jwt-token'
)

# Create an agent
agent = client.agents.create(
    name='my-agent',
    type='chatbot',
    system_prompt='You are a helpful assistant'
)

# Chat with the agent
response = client.agents.chat(
    agent_id=agent.id,
    message='Hello!',
    user_identifier='user123'
)
```

### cURL Examples

#### Create Organization

```bash
curl -X POST http://localhost:3000/api/v1/organizations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Company",
    "description": "AI automation for business"
  }'
```

#### Create Agent

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "support_agent",
    "type": "chatbot",
    "system_prompt": "You are a helpful support agent",
    "api_key": "key_123",
    "llm_settings": {
      "model": "gpt-4o-mini",
      "parameters": {
        "temperature": 0.7
      }
    },
    "tools": ["web_search"]
  }'
```

#### Chat with Agent

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, I need help with my account",
    "user_identifier": "user123"
  }'
```

## Testing

### API Testing with Postman

Import the [Postman Collection](./postman/llm-crafter.json) for easy API testing.

### Integration Testing

```bash
# Run API tests
npm test

# Run specific test suite
npm test -- --grep "Agent API"

# Test with coverage
npm run test:coverage
```

## Versioning

The API uses semantic versioning:

- **Major Version**: Breaking changes
- **Minor Version**: New features, backward compatible
- **Patch Version**: Bug fixes, backward compatible

Current version: `v1.0.0`

### API Deprecation

When endpoints are deprecated:

1. **Warning Header**: `X-API-Deprecation-Warning` with details
2. **Documentation**: Clear migration instructions
3. **Timeline**: Minimum 6 months before removal

## Common Patterns

### Resource Creation Pattern

```json
{
  "name": "resource-name",
  "description": "Optional description",
  "settings": {
    "key": "value"
  }
}
```

### Update Pattern

```json
{
  "name": "updated-name",
  "settings": {
    "key": "new-value"
  }
}
```

### List Response Pattern

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

## Best Practices

### API Key Security

- Store JWT tokens securely
- Use HTTPS in production
- Implement token refresh
- Don't log tokens

### Error Handling

```javascript
try {
  const response = await api.agents.create(agentData);
  return response;
} catch (error) {
  if (error.status === 400) {
    // Handle validation errors
    console.error('Validation error:', error.details);
  } else if (error.status === 429) {
    // Handle rate limiting
    console.error('Rate limited, retry after:', error.retryAfter);
  } else {
    // Handle other errors
    console.error('API error:', error.message);
  }
}
```

### Retry Logic

```javascript
async function apiCallWithRetry(apiCall, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

## Performance Optimization

### Batch Operations

For multiple operations, use batch endpoints when available:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/batch
```

### Caching

Implement client-side caching for:
- Organization and project lists
- Agent configurations
- Tool definitions

### Pagination

Always use pagination for large datasets:

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents?limit=50
```

## Support

- **Documentation**: [https://docs.llm-crafter.com](https://docs.llm-crafter.com)
- **GitHub Issues**: [https://github.com/your-username/llm-crafter/issues](https://github.com/your-username/llm-crafter/issues)
- **Discord**: [LLM Crafter Community](https://discord.gg/llm-crafter)
- **Email**: support@llm-crafter.com

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for detailed version history and breaking changes.
