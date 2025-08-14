# Agents

Agents are the core AI entities in LLM Crafter. They encapsulate an LLM with specific behavior, tools, and execution patterns to perform tasks or engage in conversations.

## Agent Types

LLM Crafter supports two primary agent types, each optimized for different use cases:

### Chatbot Agents

Designed for interactive, multi-turn conversations with memory and context preservation.

**Characteristics:**

- **Stateful**: Maintain conversation history and context
- **Interactive**: Designed for back-and-forth communication
- **Memory**: Automatic conversation summarization for long chats
- **Persistent**: Conversations are stored and can be resumed

**Use Cases:**

- Customer support assistants
- Personal AI assistants
- Interactive tutoring systems
- Conversational interfaces

### Task Agents

Optimized for single-purpose, stateless task execution.

**Characteristics:**

- **Stateless**: Each execution is independent
- **Goal-oriented**: Designed to complete specific tasks
- **Efficient**: No conversation overhead
- **Scalable**: Can handle high volumes of parallel requests

**Use Cases:**

- Data processing and analysis
- Content generation
- API orchestration
- Automated workflows

## Agent Structure

### Basic Agent Configuration

```json
{
  "_id": "agent_abc123",
  "name": "support_assistant",
  "type": "chatbot",
  "system_prompt": "You are a helpful customer support assistant...",
  "api_key": "key_xyz789",
  "project": "proj_def456",
  "organization": "org_ghi789",
  "llm_settings": {
    "model": "gpt-4o-mini",
    "parameters": {
      "temperature": 0.7,
      "max_tokens": 1000,
      "top_p": 1.0
    }
  },
  "tools": ["web_search", "calculator", "api_caller"],
  "status": "active",
  "created_at": "2024-01-16T10:00:00Z",
  "updated_at": "2024-01-16T10:00:00Z"
}
```

### System Prompt

The system prompt defines the agent's personality, behavior, and capabilities:

```json
{
  "system_prompt": "You are Sarah, a knowledgeable customer support specialist for TechCorp. You help customers with product questions, troubleshooting, and account issues. Always be friendly, professional, and thorough in your responses. If you don't know something, admit it and offer to find the information or escalate to a human agent."
}
```

### LLM Settings

Configure the underlying language model behavior:

```json
{
  "llm_settings": {
    "model": "gpt-4o",
    "parameters": {
      "temperature": 0.7, // Creativity vs consistency (0.0-2.0)
      "max_tokens": 2000, // Maximum response length
      "top_p": 1.0, // Nucleus sampling (0.0-1.0)
      "frequency_penalty": 0.0, // Reduce repetition (-2.0-2.0)
      "presence_penalty": 0.0 // Encourage new topics (-2.0-2.0)
    }
  }
}
```

### Tool Integration

Agents can be equipped with various tools to extend their capabilities:

```json
{
  "tools": [
    "web_search", // Search the internet
    "calculator", // Mathematical calculations
    "current_time", // Get current date/time
    "json_processor", // Parse and manipulate JSON
    "api_caller" // Make HTTP requests
  ]
}
```

## Creating Agents

### Basic Chatbot Agent

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents
```

```json
{
  "name": "customer_support",
  "type": "chatbot",
  "system_prompt": "You are a helpful customer support agent. Be friendly, professional, and thorough in your responses.",
  "api_key": "key_abc123",
  "llm_settings": {
    "model": "gpt-4o-mini",
    "parameters": {
      "temperature": 0.7,
      "max_tokens": 1000
    }
  },
  "tools": ["web_search", "calculator"]
}
```

### Task Agent with API Integration

```json
{
  "name": "data_processor",
  "type": "task",
  "system_prompt": "You are a data processing specialist. Analyze data, make API calls to retrieve information, and provide structured summaries.",
  "api_key": "key_abc123",
  "llm_settings": {
    "model": "gpt-4o",
    "parameters": {
      "temperature": 0.3,
      "max_tokens": 2000
    }
  },
  "tools": ["api_caller", "json_processor", "calculator"]
}
```

## Agent Execution

### Chatbot Execution

Chatbot agents maintain conversation state:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat
```

```json
{
  "message": "Hello, I need help with my account billing",
  "user_identifier": "user_12345",
  "conversation_id": "conv_optional"
}
```

**Response:**

```json
{
  "response": "Hi! I'd be happy to help you with your billing questions. Could you please provide your account number or email address so I can look up your account?",
  "conversation_id": "conv_abc123",
  "message_id": "msg_def456",
  "token_usage": {
    "prompt_tokens": 45,
    "completion_tokens": 28,
    "total_tokens": 73,
    "cost": 0.0012
  },
  "tools_used": [],
  "execution_time_ms": 1250
}
```

### Task Execution

Task agents execute once and return results:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/execute
```

```json
{
  "input": "Analyze the sales data from last quarter and calculate the growth rate",
  "context": {
    "quarter": "Q3 2024",
    "data_source": "sales_api"
  }
}
```

**Response:**

```json
{
  "execution_id": "exec_abc123",
  "output": "Based on the Q3 2024 sales data, revenue grew 15.3% compared to Q2 2024, driven primarily by increased subscription sales.",
  "status": "completed",
  "token_usage": {
    "total_tokens": 156,
    "cost": 0.0031
  },
  "tools_used": [
    {
      "tool_name": "api_caller",
      "parameters": { "endpoint": "sales_data" },
      "result_summary": "Retrieved Q3 sales figures"
    }
  ],
  "execution_time_ms": 3400
}
```

## Advanced Features

### Dynamic Context

Enhance agents with dynamic context for more relevant responses:

```json
{
  "message": "What's my account balance?",
  "user_identifier": "user_12345",
  "dynamic_context": {
    "user_tier": "premium",
    "recent_purchases": ["Product A", "Product B"],
    "support_history": "2 previous tickets resolved"
  }
}
```

### Tool Configuration

Configure specific tools for individual agents:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config
```

```json
{
  "endpoints": {
    "get_user_data": {
      "base_url": "https://api.company.com",
      "path": "/users/{user_id}",
      "methods": ["GET"]
    }
  },
  "authentication": {
    "type": "bearer_token",
    "token": "your-api-token"
  },
  "summarization": {
    "enabled": true,
    "max_tokens": 150
  }
}
```

### Conversation Management

#### List Conversations

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations
```

#### Get Specific Conversation

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations/{conversationId}
```

#### Summarize Conversation

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations/{conversationId}/summarize
```

## Performance Optimization

### Model Selection

Choose models based on your use case:

```json
{
  "use_cases": {
    "customer_support": {
      "model": "gpt-4o-mini",
      "reasoning": "Cost-effective for simple queries"
    },
    "complex_analysis": {
      "model": "gpt-4o",
      "reasoning": "Better reasoning for complex tasks"
    },
    "coding_assistance": {
      "model": "gpt-4o",
      "reasoning": "Superior code understanding"
    },
    "creative_writing": {
      "model": "gpt-4o",
      "reasoning": "Better creative capabilities"
    }
  }
}
```

### Conversation Summarization

LLM Crafter automatically summarizes long conversations to maintain performance:

- **Trigger**: Every 15 messages
- **Benefits**: 60-70% token reduction
- **Preservation**: Key topics, decisions, and user preferences
- **Models**: Uses cost-effective models (e.g., gpt-4o-mini)

### Parameter Tuning

Optimize LLM parameters for your use case:

```json
{
  "scenarios": {
    "customer_support": {
      "temperature": 0.3,
      "reasoning": "Consistent, reliable responses"
    },
    "creative_content": {
      "temperature": 0.9,
      "reasoning": "More creative and varied output"
    },
    "code_generation": {
      "temperature": 0.1,
      "reasoning": "Precise, deterministic code"
    },
    "brainstorming": {
      "temperature": 1.2,
      "reasoning": "Highly creative and diverse ideas"
    }
  }
}
```

## Monitoring and Analytics

### Execution Tracking

Monitor agent performance:

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/executions
```

**Response includes:**

- Execution times
- Token usage and costs
- Success/failure rates
- Tool usage statistics

### Conversation Analytics

Track conversation metrics:

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations/{conversationId}/summary
```

**Provides:**

- Message counts
- Summarization status
- Token savings
- User engagement patterns

## Best Practices

### System Prompt Design

#### Be Specific

```json
{
  "good": "You are a technical support specialist for CloudCorp's database products. Help users troubleshoot connection issues, performance problems, and configuration questions.",
  "bad": "You are a helpful assistant."
}
```

#### Define Boundaries

```json
{
  "system_prompt": "You are a customer support agent for TechCorp. You can help with product questions, billing issues, and technical support. You cannot process returns, issue refunds, or access customer payment information. For these requests, politely direct users to contact our billing department."
}
```

#### Include Examples

```json
{
  "system_prompt": "You are a code review assistant. Analyze code for bugs, security issues, and best practices. Format your response like this:\n\n**Issues Found:**\n- Issue 1: Description and fix\n- Issue 2: Description and fix\n\n**Suggestions:**\n- Improvement 1\n- Improvement 2"
}
```

### Tool Selection

#### Match Tools to Purpose

```json
{
  "customer_support": ["web_search", "current_time"],
  "data_analysis": ["calculator", "json_processor", "api_caller"],
  "content_creation": ["web_search", "current_time"],
  "system_integration": ["api_caller", "json_processor"]
}
```

#### Minimize Tool Overhead

- Only include tools the agent will actually use
- Too many tools can confuse the model
- Consider creating specialized agents for specific tool combinations

### Error Handling

#### Graceful Degradation

```json
{
  "system_prompt": "If you encounter an error with a tool, explain what went wrong and offer alternative approaches. Never leave the user without a helpful response."
}
```

#### Fallback Strategies

- Configure backup models for critical agents
- Implement retry logic for tool failures
- Provide clear error messages to users

## Security Considerations

### API Key Isolation

- API keys are scoped to specific projects
- Agents cannot access keys from other projects
- Keys are encrypted at rest

### Conversation Privacy

- Conversations are isolated by organization
- User identifiers can be anonymized
- Conversation data can be purged automatically

### Tool Access Control

- System tools are available to all agents
- Custom tools can be restricted by organization
- API caller tool respects configured endpoints only

## Next Steps

- Learn about [Tools](/concepts/tools) to extend agent capabilities
- Explore [Conversation Management](/concepts/conversations) for chatbot optimization
- Review [API Reference](/api/agents) for complete endpoint documentation
