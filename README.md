# LLM Crafter

A collaborative platform for managing and executing LLM prompts with intelligent agents, conversation management, and powerful tool integrations.

> ⚠️ **Alpha Version** - This project is currently in active development and not finalized yet. Features and APIs may change.

## ✨ Features

- 🤖 **Intelligent Agents**: Create chatbot and task agents with customizable behavior
- 💬 **Smart Conversations**: Automatic summarization reduces token usage by up to 70%
- 🛠️ **Powerful Tools**: Built-in tools for web search, calculations, API calls, and more
- 🎯 **Default Providers**: Pre-configured access to OpenAI, Anthropic, Google, and DeepSeek with latest models
- 📊 **Organization Management**: Multi-tenant structure with role-based access control
- 🔧 **API Integration**: Easy external API configuration with authentication
- ⚡ **Performance Optimized**: Token-efficient processing with intelligent model selection

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB 4.4+
- An OpenAI API key (or other supported LLM provider)

### Installation

```bash
# Clone the repository
git clone https://github.com/LLM-Crafter/llm-crafter.git
cd llm-crafter

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Start the server
npm run dev
```

**🎉 That's it!** The application automatically initializes with default providers for OpenAI, Anthropic, Google, and DeepSeek, so you can start creating agents immediately.

## 📦 JavaScript SDK

We provide a JavaScript SDK for easy integration with the LLM Crafter API:

```bash
npm install @llm-crafter/sdk
```

### Quick SDK Usage

```javascript
import { LLMCrafterClient } from '@llm-crafter/sdk';

const client = new LLMCrafterClient(
  'your-api-key',
  'https://your-domain.com/api/v1'
);

// Execute a prompt
const result = await client.executePrompt(
  'org-id',
  'project-id',
  'prompt-name',
  {
    variable: 'value',
  }
);

// Chat with an agent
const chat = await client.startAgentChat('agent-id', 'Hello!');
console.log(chat.response.data.response);
```

[📖 View SDK Documentation](./packages/js-sdk/README.md)

### Create Your First Agent

```bash
# Register a user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com", "password": "secure-password"}'

# Login and get token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "secure-password"}'

# Create organization, project, API key, and agent
# See the Getting Started guide for complete instructions
```

## 📚 Documentation

### Development Server

Start the documentation development server:

```bash
npm run docs:dev
```

The documentation will be available at `http://localhost:5173`.

### Build Documentation

Build the documentation for production:

```bash
npm run docs:build
```

### Deploy Documentation

Preview the built documentation:

```bash
npm run docs:preview
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Layer     │    │   Database      │
│   Applications  │◄──►│   Express.js    │◄──►│   MongoDB       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                        ┌─────────────────┐
                        │   Services      │
                        │   - Agents      │
                        │   - Tools       │
                        │   - OpenAI      │
                        │   - Summarize   │
                        └─────────────────┘
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- MongoDB 4.4+
- Git

### Setup

```bash
# Clone the repository
git clone hhttps://github.com/LLM-Crafter/llm-crafter.git
cd llm-crafter

# Install dependencies
npm install

# Start MongoDB
brew services start mongodb-community  # macOS
sudo systemctl start mongod             # Linux

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start development server
npm run dev
```

### Environment Variables

```bash
# Required
MONGODB_URI=mongodb://localhost:27017/llm-crafter
JWT_SECRET=your-super-secret-key-min-32-chars
PORT=3000
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## 📖 Core Concepts

### Organizations & Projects

LLM Crafter uses a hierarchical structure:

- **Organizations**: Top-level entities with team management
- **Projects**: Containers for related AI resources
- **Agents**: AI assistants and task workers
- **Tools**: Extend agent capabilities

### Agent Types

#### Chatbot Agents

- Stateful conversations with memory
- Automatic conversation summarization
- Multi-turn interactions

#### Task Agents

- Stateless task execution
- Single-purpose operations
- High-volume processing

### Tools

Built-in tools include:

- **Web Search**: Search the internet for information
- **Calculator**: Mathematical calculations
- **API Caller**: HTTP requests to external APIs
- **JSON Processor**: Parse and manipulate JSON data
- **Current Time**: Get current date and time

## 🔧 Configuration

### Database Configuration

```bash
# Local MongoDB
MONGODB_URI=mongodb://localhost:27017/llm-crafter

# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/llm-crafter

# Replica Set
MONGODB_URI=mongodb://host1:27017,host2:27017/llm-crafter?replicaSet=rs0
```

### LLM Providers

Configure default provider credentials:

```bash
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

Or manage API keys through the API for better security and organization.

## 🚀 Deployment

### Docker

```bash
# Build image
docker build -t llm-crafter .

# Run with Docker Compose
docker-compose up -d
```

### PM2 (Production)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit
```

### Environment Setup

```bash
# Production environment variables
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/llm-crafter-prod
JWT_SECRET=your-production-secret-key
```

## 📊 Performance

### Conversation Summarization

- **Token Reduction**: Up to 70% reduction in token usage
- **Cost Savings**: Significant reduction in LLM API costs
- **Response Speed**: 30-50% faster responses for long conversations
- **Context Quality**: Preserves important information while removing redundancy

### Model Selection

LLM Crafter automatically selects cost-effective models:

- Production tasks: `gpt-4o`
- Development: `gpt-4o-mini`
- Summarization: `gpt-4o-mini`
- Reasoning tasks: `o1-mini`

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/development/contributing.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run tests and linting
6. Submit a pull request

### Code Style

We use ESLint and Prettier for code formatting:

```bash
npm run lint
npm run format
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Documentation**: Coming soon
- **GitHub**: [https://github.com/LLM-Crafter/llm-crafter](https://github.com/LLM-Crafter/llm-crafter)
- **Issues**: [https://github.com/LLM-Crafter/llm-crafter/issues](https://github.com/LLM-Crafter/llm-crafter/issues)

## 💬 Support

- **Documentation**: Complete guides and API reference
- **GitHub Issues**: Bug reports and feature requests

---

Built with ❤️ by the LLM Crafter team
