# Getting Started

This guide will walk you through setting up LLM Crafter and creating your first AI agent.

## Prerequisites

- Node.js 18+ 
- MongoDB 4.4+
- An OpenAI API key (or other supported LLM provider)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/llm-crafter.git
cd llm-crafter
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/llm-crafter

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key

# Server Configuration
PORT=3000
NODE_ENV=development

# Optional: Default provider keys (can also be added via API)
OPENAI_API_KEY=your-openai-api-key
```

### 4. Start the Database

Make sure MongoDB is running on your system:

```bash
# macOS with Homebrew
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 5. Start the Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

## Quick Start Tutorial

### Step 1: Create a User Account

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "secure-password"
  }'
```

### Step 2: Login and Get Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "secure-password"
  }'
```

Save the returned `token` for subsequent requests.

### Step 3: Create an Organization

```bash
curl -X POST http://localhost:3000/api/v1/organizations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Company",
    "description": "My first organization"
  }'
```

### Step 4: Create a Project

```bash
curl -X POST http://localhost:3000/api/v1/organizations/ORG_ID/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "AI Assistants",
    "description": "Collection of AI assistants"
  }'
```

### Step 5: Add an API Key

```bash
curl -X POST http://localhost:3000/api/v1/organizations/ORG_ID/projects/PROJECT_ID/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "OpenAI Key",
    "key": "sk-your-openai-api-key",
    "provider": "openai"
  }'
```

### Step 6: Create Your First Agent

```bash
curl -X POST http://localhost:3000/api/v1/organizations/ORG_ID/projects/PROJECT_ID/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "helpful_assistant",
    "type": "chatbot",
    "system_prompt": "You are a helpful assistant that can answer questions and provide information.",
    "api_key": "API_KEY_ID",
    "llm_settings": {
      "model": "gpt-4o-mini",
      "parameters": {
        "temperature": 0.7,
        "max_tokens": 1000
      }
    },
    "tools": ["web_search", "calculator"]
  }'
```

### Step 7: Chat with Your Agent

```bash
curl -X POST http://localhost:3000/api/v1/organizations/ORG_ID/projects/PROJECT_ID/agents/AGENT_ID/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Hello! Can you help me calculate the square root of 144?",
    "user_identifier": "user123"
  }'
```

## Health Check

Verify your installation by checking the health endpoint:

```bash
curl http://localhost:3000/health
```

You should receive:
```json
{
  "status": "ok",
  "service": "llm-crafter"
}
```

## Next Steps

Now that you have LLM Crafter running, explore these topics:

- **[Agent Types](/features/agent-types)** - Learn about chatbot vs task agents
- **[Tools](/concepts/tools)** - Understand the built-in tool system
- **[API Integration](/features/api-caller)** - Connect to external APIs
- **[Conversation Management](/concepts/conversations)** - Handle long conversations efficiently

## Troubleshooting

### Common Issues

**MongoDB Connection Error**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
- Ensure MongoDB is running
- Check the connection string in your `.env` file

**JWT Token Invalid**
```
{"error": "Invalid token"}
```
- Make sure you're including the `Authorization: Bearer TOKEN` header
- Check that the token hasn't expired (tokens are valid for 24 hours)

**API Key Not Found**
```
{"error": "API key not found in this project"}
```
- Verify the API key ID exists in your project
- Ensure you're using the correct organization and project IDs

### Getting Help

- Check the [API Reference](/api/) for detailed endpoint documentation
- Review [Examples](/examples/) for common use cases
- Open an issue on GitHub for bugs or feature requests
