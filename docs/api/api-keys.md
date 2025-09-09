# API Key System Documentation

## Overview

The LLM Crafter API Key system enables external applications to securely access prompts and agents without requiring full user authentication. The system implements a two-tier security model:

1. **API Keys** - For prompt execution and basic operations
2. **Session Tokens** - For secure agent execution with enhanced controls

## Architecture

### Security Model

```
External Client
    ↓ (API Key)
API Key Authentication
    ↓
Prompt Execution (Direct)
    OR
Session Token Generation
    ↓ (Session Token)
Agent Execution (Secure)
```

### Key Components

- **UserApiKey Model** - Stores hashed API keys with scopes and restrictions
- **SessionToken Model** - Manages short-lived tokens for agent execution
- **Authentication Middleware** - Validates API keys and session tokens
- **External API Routes** - Dedicated endpoints for external access

## API Key Management

### Creating API Keys

**Endpoint:** `POST /api/v1/organizations/{orgId}/user-api-keys`

**Required Scopes for User:** Member role or higher

**Request Body:**

```json
{
  "name": "Production Integration Key",
  "scopes": ["prompts:execute", "agents:read", "agents:execute"],
  "restrictions": {
    "ip_whitelist": ["192.168.1.100", "10.0.0.50"],
    "domain_whitelist": ["myapp.com", "api.mycompany.com"],
    "rate_limit_override": 120,
    "max_executions_per_day": 1000
  },
  "expires_at": "2024-12-31T23:59:59Z",
  "allowed_projects": ["proj_123", "proj_456"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "key_abc123",
    "name": "Production Integration Key",
    "api_key": "ak_1234567890abcdef...", // Only shown once!
    "scopes": ["prompts:execute", "agents:read", "agents:execute"],
    "expires_at": "2024-12-31T23:59:59Z",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "message": "API key created successfully. Save this key securely - it won't be shown again."
}
```

### Available Scopes

| Scope             | Description                                 |
| ----------------- | ------------------------------------------- |
| `prompts:execute` | Execute prompts via external API            |
| `agents:read`     | Read agent configurations and info          |
| `agents:execute`  | Generate session tokens for agent execution |
| `agents:chat`     | Direct agent chat (bypasses session system) |
| `projects:read`   | Read project information                    |
| `statistics:read` | Read usage statistics                       |

### Security Restrictions

- **IP Whitelist** - Restrict access to specific IP addresses
- **Domain Whitelist** - Restrict access to specific domains (via Origin header)
- **Rate Limiting** - Custom rate limits per API key
- **Daily Limits** - Maximum executions per day
- **Project Access** - Restrict access to specific projects
- **Expiration** - Set expiration dates for keys

## Prompt Execution

### External Prompt Execution

**Endpoint:** `POST /api/v1/external/organizations/{orgId}/projects/{projectId}/prompts/{promptName}/execute`

**Authentication:** API Key with `prompts:execute` scope

**Headers:**

```
X-API-Key: your-api-key
Content-Type: application/json
```

**Request Body:**

```json
{
  "variables": {
    "name": "John",
    "language": "English",
    "context": "business meeting"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "result": "Hello John! I understand you're preparing for a business meeting...",
    "usage": {
      "prompt_tokens": 45,
      "completion_tokens": 123,
      "total_tokens": 168
    },
    "cached": false,
    "execution_id": "exec_789",
    "prompt_name": "greeting",
    "model": "gpt-4"
  }
}
```

## Agent Execution

### Two-Tier Security Model

#### Tier 1: Session Token Generation

**Endpoint:** `POST /api/v1/sessions`

**Authentication:** API Key with `agents:execute` scope

```json
{
  "agentId": "agent_123",
  "maxInteractions": 50,
  "expiresIn": 1800
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "session_token": "st_abcdef123456...", // Only shown once!
    "session_id": "session_789",
    "agent_id": "agent_123",
    "expires_at": "2024-01-15T11:00:00Z",
    "max_interactions": 50,
    "expires_in": 1800
  }
}
```

#### Tier 2: Agent Execution with Session Token

**Endpoint:** `POST /api/v1/external/agents/chat`

**Authentication:** Session Token

**Headers:**

```
X-Session-Token: your-session-token
Content-Type: application/json
```

**Request Body:**

```json
{
  "message": "Hello, how can you help me today?",
  "conversationId": "conv_456", // Optional
  "userIdentifier": "user_123", // Optional
  "dynamicContext": {} // Optional
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "response": "Hello! I'm here to help you with...",
    "conversation_id": "conv_456",
    "usage": {
      "prompt_tokens": 234,
      "completion_tokens": 156,
      "total_tokens": 390
    },
    "suggestions": ["How do I...", "What about..."],
    "execution_id": "exec_890"
  },
  "session_info": {
    "session_id": "session_789",
    "remaining_interactions": 49,
    "expires_at": "2024-01-15T11:00:00Z"
  }
}
```

### Alternative: Direct Agent Chat

For simpler use cases, you can chat directly with agents using API keys:

**Endpoint:** `POST /api/v1/external/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat`

**Authentication:** API Key with `agents:chat` scope

This bypasses the session system but requires the more privileged `agents:chat` scope.

## JavaScript SDK Usage

### Installation and Setup

```javascript
// Install via npm (when published)
npm install llm-crafter-client

// Or include directly
const LLMCrafterClient = require('./sdk/llm-crafter-client.js');

// Initialize client
const client = new LLMCrafterClient(
  'your-api-key',
  'https://your-domain.com/api/v1'
);
```

### Prompt Execution

```javascript
// Execute a prompt
const result = await client.executePrompt("org_123", "proj_456", "greeting", {
  name: "John",
  context: "business meeting",
});

console.log("Response:", result.data.result);
console.log("Tokens used:", result.data.usage.total_tokens);
```

### Agent Chat (Recommended Approach)

```javascript
// Create session and start chatting
const chat = await client.startAgentChat("agent_789", "Hello there!");

console.log("Agent response:", chat.response.data.response);
console.log("Conversation ID:", chat.response.data.conversation_id);

// Continue the conversation
const followUp = await client.chatWithAgent(
  chat.session.session_token,
  "Can you help me with something specific?",
  chat.response.data.conversation_id
);

console.log("Follow-up response:", followUp.data.response);
console.log(
  "Remaining interactions:",
  followUp.session_info.remaining_interactions
);
```

### Session Management

```javascript
// Create a custom session
const session = await client.createAgentSession("agent_789", {
  maxInteractions: 200,
  expiresIn: 7200, // 2 hours
});

// Get all active sessions
const sessions = await client.getSessions();
console.log("Active sessions:", sessions.data.length);

// Revoke a session
await client.revokeSession(session.data.session_id);

// Revoke all sessions
await client.revokeAllSessions();
```

### Usage Monitoring

```javascript
// Check API key usage
const usage = await client.getUsage();
console.log("Total requests:", usage.data.usage.total_requests);
console.log("Today's executions:", usage.data.usage.executions_today);
console.log("Daily limit remaining:", usage.data.daily_limit_remaining);

// Test connection
const test = await client.testConnection();
if (test.success) {
  console.log("API key is working correctly");
} else {
  console.error("Connection failed:", test.message);
}
```

## Rate Limiting

### Default Limits

- **API Key Operations:** 60 requests per minute
- **Session Operations:** 60 requests per minute
- **Information Retrieval:** 100 requests per 15 minutes
- **API Key Management:** 20 requests per 15 minutes

### Custom Rate Limits

API keys can have custom rate limits set via the `rate_limit_override` restriction:

```json
{
  "restrictions": {
    "rate_limit_override": 120 // 120 requests per minute
  }
}
```

## Error Handling

### Common Error Codes

| Code                         | HTTP Status | Description                           |
| ---------------------------- | ----------- | ------------------------------------- |
| `API_KEY_REQUIRED`           | 401         | No API key provided                   |
| `INVALID_API_KEY`            | 401         | API key not found or invalid          |
| `API_KEY_EXPIRED`            | 401         | API key has expired                   |
| `INSUFFICIENT_PERMISSIONS`   | 403         | API key lacks required scope          |
| `ACCESS_RESTRICTED`          | 403         | IP/domain/limit restrictions violated |
| `SESSION_TOKEN_REQUIRED`     | 401         | No session token provided             |
| `INVALID_SESSION_TOKEN`      | 401         | Session token invalid or expired      |
| `INTERACTION_LIMIT_EXCEEDED` | 429         | Session interaction limit reached     |
| `PROJECT_ACCESS_DENIED`      | 403         | API key cannot access this project    |

### Error Response Format

```json
{
  "error": "Insufficient permissions",
  "code": "INSUFFICIENT_PERMISSIONS",
  "required_scopes": ["prompts:execute"],
  "available_scopes": ["agents:read"]
}
```

## Security Best Practices

### For API Key Holders

1. **Store Securely** - Never expose API keys in client-side code
2. **Use Environment Variables** - Store keys in secure environment variables
3. **Rotate Regularly** - Rotate keys periodically using the rotation endpoint
4. **Scope Minimally** - Only request the scopes you actually need
5. **Monitor Usage** - Regularly check usage statistics for anomalies
6. **Set Restrictions** - Use IP/domain whitelists when possible

### For Platform Administrators

1. **Regular Audits** - Review active API keys and their usage
2. **Monitor Rate Limits** - Watch for unusual traffic patterns
3. **Set Reasonable Limits** - Configure appropriate daily limits
4. **Clean Up Sessions** - Run regular cleanup of expired sessions
5. **Log Security Events** - Monitor authentication failures and restrictions

## Migration from JWT-Only Authentication

### Gradual Migration

1. **Enable API Keys** - Allow users to create API keys alongside JWT tokens
2. **Update Clients** - Gradually migrate external integrations to use API keys
3. **Monitor Usage** - Track adoption and identify any issues
4. **Deprecate Direct JWT** - Eventually restrict external API access to API keys only

### Backward Compatibility

The system maintains backward compatibility with existing JWT authentication for internal/web application use while adding API key support for external integrations.

## Administration

### Cleanup Tasks

```javascript
// Clean up expired sessions (can be run as a cron job)
const SessionToken = require("./src/models/SessionToken");
const deletedCount = await SessionToken.cleanupExpired();
console.log(`Cleaned up ${deletedCount} expired sessions`);
```

### Monitoring Endpoints

- `GET /api/v1/external/usage/api-key` - Get API key usage statistics
- `GET /api/v1/sessions` - List active sessions for an API key
- `POST /api/v1/sessions/cleanup` - Admin endpoint to cleanup expired sessions

This API key system provides a secure, scalable foundation for external integrations while maintaining the security and flexibility required for production use.
