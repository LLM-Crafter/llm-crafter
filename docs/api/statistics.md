# Statistics API

The Statistics API provides comprehensive dashboard data for monitoring LLM usage, costs, and performance metrics within your organization.

## Endpoints

### Get Dashboard Statistics

```
GET /api/v1/organizations/{orgId}/statistics/dashboard?period={period}
```

Returns comprehensive dashboard statistics for an organization.

**Parameters:**

- `orgId` (path, required): Organization ID
- `period` (query, optional): Time period for statistics. Options: `1d`, `1w`, `1m`. Default: `1d`

**Response:**

```json
{
  "period": "1d",
  "timeRange": {
    "start": "2025-08-18T00:00:00.000Z",
    "end": "2025-08-19T00:00:00.000Z"
  },
  "overview": {
    "totalTokensUsed": 150000,
    "totalCost": 3.45,
    "totalApiCalls": 245,
    "totalConversations": 15,
    "totalAgents": 5,
    "totalProjects": 3
  },
  "promptExecutions": {
    "totalCalls": 120,
    "totalTokens": 85000,
    "totalCost": 1.85,
    "avgTokensPerCall": 708,
    "successRate": "95.83",
    "breakdown": {
      "successful": 115,
      "errors": 3,
      "cached": 2
    }
  },
  "agentExecutions": {
    "totalExecutions": 125,
    "totalTokens": 65000,
    "totalCost": 1.6,
    "totalToolCalls": 45,
    "avgExecutionTime": 2345,
    "successRate": "92.00",
    "breakdown": {
      "completed": 115,
      "failed": 10,
      "pending": 0
    }
  },
  "conversations": {
    "total": 15,
    "totalMessages": 78,
    "totalTokens": 45000,
    "totalCost": 0.95,
    "totalToolsExecuted": 23,
    "avgMessagesPerConversation": "5.20",
    "breakdown": {
      "active": 8,
      "ended": 7
    }
  },
  "recentActivity": [
    {
      "_id": "exec_123",
      "status": "completed",
      "createdAt": "2025-08-19T10:30:00.000Z",
      "execution_time_ms": 1200,
      "usage": {
        "total_tokens": 850
      },
      "agent": {
        "name": "Customer Support Agent"
      }
    }
  ],
  "topAgents": [
    {
      "_id": "agent_456",
      "name": "Data Analysis Agent",
      "totalExecutions": 45,
      "totalTokens": 25000,
      "totalCost": 0.85
    }
  ],
  "dailyUsage": [
    {
      "_id": "2025-08-19",
      "executionCount": 125,
      "tokenCount": 65000,
      "costSum": 1.6
    }
  ]
}
```

### Get Agent Statistics

```
GET /api/v1/organizations/{orgId}/statistics/agents/{agentId}?period={period}
```

Returns detailed statistics for a specific agent.

**Parameters:**

- `orgId` (path, required): Organization ID
- `agentId` (path, required): Agent ID
- `period` (query, optional): Time period for statistics. Options: `1d`, `1w`, `1m`. Default: `1d`

**Response:**

```json
{
  "agent": {
    "id": "agent_456",
    "name": "Data Analysis Agent",
    "type": "task"
  },
  "period": "1d",
  "timeRange": {
    "start": "2025-08-18T00:00:00.000Z",
    "end": "2025-08-19T00:00:00.000Z"
  },
  "executions": {
    "total": 45,
    "completed": 42,
    "failed": 3,
    "successRate": "93.33",
    "avgExecutionTime": 1850,
    "totalTokens": 25000,
    "totalCost": 0.85,
    "totalToolCalls": 15
  },
  "conversations": {
    "total": 8,
    "active": 3,
    "totalMessages": 32,
    "avgMessagesPerConversation": "4.00",
    "totalTokens": 12000,
    "totalCost": 0.35
  },
  "recentActivity": [
    {
      "_id": "exec_789",
      "status": "completed",
      "createdAt": "2025-08-19T11:45:00.000Z",
      "execution_time_ms": 1650,
      "usage": {
        "total_tokens": 720
      },
      "type": "task"
    }
  ]
}
```

## Key Metrics Explained

### Overview Metrics

- **Total Tokens Used**: Sum of all tokens consumed across prompt executions, agent executions, and conversations
- **Total Cost**: Combined cost in USD for all LLM API calls
- **Total API Calls**: Sum of prompt executions and agent executions
- **Total Conversations**: Number of agent conversations initiated
- **Total Agents**: Number of agents in the organization
- **Total Projects**: Number of projects in the organization

### Prompt Executions

- **Success Rate**: Percentage of successful prompt executions vs total executions
- **Avg Tokens Per Call**: Average number of tokens used per prompt execution
- **Breakdown**: Distribution of executions by status (successful, errors, cached)

### Agent Executions

- **Success Rate**: Percentage of completed executions vs total executions
- **Avg Execution Time**: Average time in milliseconds for agent executions
- **Tool Calls**: Total number of tool calls made by agents
- **Breakdown**: Distribution by status (completed, failed, pending)

### Conversations

- **Avg Messages Per Conversation**: Average number of messages exchanged per conversation
- **Tools Executed**: Total number of tools executed within conversations
- **Breakdown**: Distribution by conversation status (active, ended)

### Additional Data

- **Recent Activity**: Last 10-20 executions with basic details
- **Top Agents**: Most active agents by execution count
- **Daily Usage**: Day-by-day breakdown of usage metrics

## Authentication

All endpoints require:

1. Valid authentication token in the `Authorization` header
2. Organization membership for the specified organization

## Error Responses

- `400 Bad Request`: Invalid period parameter
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Not a member of the specified organization
- `404 Not Found`: Agent not found (for agent-specific endpoints)
- `500 Internal Server Error`: Database or server error

## Usage Examples

### Get 1-week dashboard statistics

```bash
curl -H "Authorization: Bearer your_token" \
  "https://api.llm-crafter.com/api/v1/organizations/org_123/statistics/dashboard?period=1w"
```

### Get 1-month statistics for a specific agent

```bash
curl -H "Authorization: Bearer your_token" \
  "https://api.llm-crafter.com/api/v1/organizations/org_123/statistics/agents/agent_456?period=1m"
```
