# Agent Types

LLM Crafter supports different types of agents, each designed for specific use cases and interaction patterns. Understanding these types helps you choose the right agent configuration for your needs.

## Available Agent Types

### Chatbot Agent
**Type:** `chatbot`

The chatbot agent is designed for conversational interactions. It maintains context across multiple exchanges and is ideal for:

- Customer support scenarios
- Interactive Q&A sessions
- General conversational AI applications
- Educational tutoring systems

**Characteristics:**
- Maintains conversation history
- Optimized for back-and-forth dialogue
- Can handle follow-up questions and context references
- Supports multi-turn conversations

### Task Agent
**Type:** `task`

Task agents are designed to complete specific, well-defined tasks. They focus on executing single operations efficiently:

- Data processing and analysis
- Content generation (articles, summaries, etc.)
- Code generation and review
- Document classification

**Characteristics:**
- Single-purpose execution
- Clear input/output patterns
- Optimized for specific task completion
- Can be chained together for complex workflows

### Workflow Agent
**Type:** `workflow`

Workflow agents orchestrate complex multi-step processes by coordinating multiple tools and sub-tasks:

- Multi-step business processes
- Data pipelines with multiple stages
- Complex decision trees
- Integration between multiple systems

**Characteristics:**
- Manages multi-step processes
- Can invoke multiple tools in sequence
- Handles conditional logic and branching
- State management across workflow steps

### API Agent
**Type:** `api`

API agents are specifically designed to interact with external APIs and services:

- Third-party service integration
- Data fetching and synchronization
- Webhook processing
- External system automation

**Characteristics:**
- Optimized for API interactions
- Built-in error handling for network operations
- Support for various authentication methods
- Request/response transformation capabilities

## Configuring Agent Types

When creating an agent, specify the type in the agent configuration:

```json
{
  "name": "customer-support-bot",
  "type": "chatbot",
  "description": "Customer support chatbot for handling inquiries",
  "system_prompt": "You are a helpful customer support agent...",
  // ... other configuration
}
```

## Type-Specific Optimizations

Each agent type comes with default optimizations:

### Chatbot Optimizations
- Longer conversation memory
- Higher context retention
- Personality-focused prompting

### Task Optimizations
- Structured output formatting
- Task completion validation
- Performance-focused settings

### Workflow Optimizations
- State persistence between steps
- Error recovery mechanisms
- Progress tracking

### API Optimizations
- Network timeout handling
- Rate limiting awareness
- Response caching strategies

## Choosing the Right Type

Consider these factors when selecting an agent type:

1. **Interaction Pattern**: Single request/response vs. ongoing conversation
2. **Complexity**: Simple task vs. multi-step process
3. **External Dependencies**: Need for API integrations
4. **State Requirements**: Stateless vs. stateful operations

## Best Practices

- **Start Simple**: Begin with task or chatbot agents before moving to complex workflows
- **Clear Purpose**: Define the agent's specific role and responsibilities
- **Type Consistency**: Match the agent type to your use case requirements
- **Testing**: Validate agent behavior matches the expected type characteristics

## Migration Between Types

While agent types are set during creation, you can:

1. **Clone and Reconfigure**: Create a new agent with a different type
2. **Update Tools**: Modify the tools available to change behavior
3. **Adjust Prompts**: Modify system prompts to better match the intended type

The agent type serves as a foundation, but the actual behavior is also influenced by the system prompt, tools, and LLM settings you configure.
