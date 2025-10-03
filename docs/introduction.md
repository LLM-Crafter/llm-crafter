# What is LLM Crafter?

LLM Crafter is a platform for building and deploying AI-powered applications using Large Language Models (LLMs). Manage agents, workflows, and prompts through a RESTful API or web interface. Deploy across multiple channels, integrate with external services, and leverage powerful built-in tools.

## Core Capabilities

### 🤖 Agents & Workflows

Build and orchestrate AI-powered solutions:

- **Chatbot Agents**: Conversational AI with memory and context preservation
- **Task Agents**: Automated workers for specific jobs
- **Workflows**: Multi-step processes combining agents and tools
- **Custom System Prompts**: Fine-tune behavior and personality
- **Multi-Channel Support**: Deploy across WhatsApp, Telegram, Email, and Website

### 📝 Prompt Management

Version control and manage your prompts:

- **Prompt Versioning**: Track changes and rollback when needed
- **Template System**: Reusable prompt templates
- **Variable Substitution**: Dynamic prompt generation
- **A/B Testing**: Compare prompt performance
- **Execution History**: Track usage and results

### 🔌 LLM Proxy

Unified interface for multiple LLM providers:

- **Provider Abstraction**: Single API for OpenAI, Anthropic, and custom providers
- **Automatic Fallback**: Switch providers on failure
- **Cost Tracking**: Monitor usage and spending per provider
- **Rate Limiting**: Control API usage and costs
- **Model Selection**: Choose optimal models for different tasks

### � Multi-Channel Communication

Deploy your agents across multiple communication channels:

- **WhatsApp**: Via Twilio, Meta Cloud API, or 360Dialog
- **Telegram**: Native bot integration
- **Email**: SMTP, SendGrid, Mailgun, AWS SES
- **Website**: Built-in web widget
- **Unified Conversations**: All channels share the same conversation history

### 🛠️ Powerful Tools

Extend functionality with built-in and 3rd party integrations:

- **Built-in Tools**: Web search, calculations, time, JSON processing, FAQ
- **API Caller Tool**: Integrate with any 3rd party API or service
- **Custom Tools**: Develop and deploy your own specialized tools
- **Tool Chaining**: Combine multiple tools for complex workflows
- **RAG Support**: Vector database integration for knowledge retrieval

### 💬 Conversation Management

Handle complex interactions across channels:

- **Automatic Summarization**: Reduce token usage by up to 70%
- **Context Preservation**: Maintain conversation history across channels
- **Memory Optimization**: Intelligent conversation history management
- **Multi-turn Support**: Handle complex, extended interactions
- **User Identification**: Track conversations per user across channels

### 📊 Organization & Project Management

- **Multi-tenant Architecture**: Support for multiple organizations
- **Project-based Organization**: Logical grouping of agents, prompts, and workflows
- **Role-based Access Control**: Admin, member, and viewer permissions
- **Team Collaboration**: Share resources across teams

### 🔐 Security & Authentication

- **JWT-based Authentication**: Secure API access
- **OAuth Support**: Google and GitHub authentication
- **API Key Management**: Encrypted storage of provider credentials
- **Organization Isolation**: Multi-tenant data separation
- **Provider Support**: OpenAI, Anthropic, and custom LLM providers

## Common Use Cases

### Customer Support

- Multi-channel support bots (WhatsApp, Telegram, Email, Website)
- Knowledge base integration with RAG
- Conversation handoff to human agents
- Automated ticket creation via API calls

### Business Automation

- Document processing workflows
- API orchestration and data synchronization
- Automated report generation
- Multi-step approval processes

### Research & Analysis

- Web search and information gathering
- Data analysis and summarization
- Multi-source research compilation
- Insight generation from documents

### Prompt Engineering

- Version control for prompts
- A/B testing different prompt strategies
- Template management for common tasks
- Performance tracking and optimization

## Architecture Overview

LLM Crafter follows a modular, API-first architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Channels      │    │   API Layer     │    │   Database      │
│   (WhatsApp,    │◄──►│   Express.js    │◄──►│   MongoDB       │
│   Telegram,     │    │   REST API      │    │                 │
│   Email, Web)   │    └─────────────────┘    └─────────────────┘
└─────────────────┘             │
                        ┌─────────────────┐
                        │   Services      │
                        │   - Agents      │
                        │   - Workflows   │
                        │   - Prompts     │
                        │   - LLM Proxy   │
                        │   - Tools       │
                        │   - Vector DB   │
                        └─────────────────┘
```

## Access Methods

### RESTful API

Full-featured API for programmatic access:

```bash
# Create an agent
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents

# Execute a prompt
POST /api/v1/organizations/{orgId}/projects/{projectId}/prompts/{promptName}/execute

# Configure channels
PUT /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels
```

See the [API Reference](/api/index) for complete documentation.

### Web Interface

Visual interface for managing resources:

- **LLM Crafter UI**: [https://github.com/LLM-Crafter/llm-crafter-ui](https://github.com/LLM-Crafter/llm-crafter-ui)
- Manage agents, workflows, and prompts visually
- Monitor conversations and analytics
- Configure channels and integrations
- Test and debug in real-time

## Getting Started

Create your first AI solution in minutes:

1. **[Install](/installation)** - Set up LLM Crafter locally or via Docker
2. **[Configure](/configuration)** - Add your LLM provider API keys
3. **[Create Resources](/getting-started)** - Build agents, workflows, or prompts
4. **[Deploy Channels](/features/multi-channel)** - Connect to WhatsApp, Telegram, or Email (optional)
5. **[Add Tools](/features/system-tools)** - Enhance with web search, API calls, and more

## What You Can Build

- **Conversational AI**: Multi-channel chatbots with memory and context
- **Workflow Automation**: Multi-step processes with decision logic
- **API Orchestration**: Connect and coordinate multiple services
- **Knowledge Systems**: RAG-powered information retrieval
- **Prompt Libraries**: Version-controlled prompt templates
- **LLM Gateway**: Unified interface for multiple providers
