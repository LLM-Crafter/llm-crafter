# Database Schema

LLM Crafter uses MongoDB as its primary database with Mongoose as the ODM (Object Document Mapper). This document outlines the complete database schema and relationships between entities.

## Database Configuration

The application connects to MongoDB using the connection string specified in the `MONGODB_URI` environment variable.

```javascript
// src/config/database.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
```

## Schema Overview

The database consists of several core entities that work together to manage LLM operations:

### Entity Relationships

```
User
├── Organizations (as owner or member)
    ├── Projects
        ├── Agents
        ├── API Keys
        ├── Prompts
        └── Tools (custom)

Conversations
├── Agent (reference)
└── Messages
```

## Core Schemas

### User Schema

Users are the primary actors in the system. Each user can own or be a member of multiple organizations.

```javascript
{
  _id: String (UUID),
  email: String (unique, required),
  password: String (hashed, required),
  name: String (required),
  createdAt: Date,
  updatedAt: Date
}
```

**Key Features:**

- Uses UUID as primary key
- Email validation and uniqueness
- Password hashing with bcrypt
- Automatic timestamps

### Organization Schema

Organizations provide workspace isolation and team collaboration.

```javascript
{
  _id: String (UUID),
  name: String (required),
  description: String,
  owner: String (User reference),
  members: [{
    user: String (User reference),
    role: String (enum: 'admin', 'member', 'viewer')
  }],
  createdAt: Date,
  updatedAt: Date
}
```

**Key Features:**

- Hierarchical role-based access
- Owner and member management
- Soft deletion support

### Project Schema

Projects organize agents, tools, and resources within an organization.

```javascript
{
  _id: String (UUID),
  name: String (required),
  description: String,
  organization: String (Organization reference),
  createdAt: Date,
  updatedAt: Date
}
```

**Virtual Fields:**

- `apiKeys`: References to associated API keys
- `prompts`: References to associated prompts

### Agent Schema

Agents are the core AI entities that execute tasks and conversations.

```javascript
{
  _id: String (UUID),
  name: String (required),
  description: String,
  type: String (enum: 'chatbot', 'task', 'workflow', 'api'),
  organization: String (Organization reference),
  project: String (Project reference),
  system_prompt: String (required),
  api_key: String (ApiKey reference),
  llm_settings: {
    model: String (required),
    parameters: {
      temperature: Number (0-2, default: 0.7),
      max_tokens: Number (min: 1, default: 1000),
      top_p: Number (0-1, default: 1),
      frequency_penalty: Number (-2 to 2, default: 0),
      presence_penalty: Number (-2 to 2, default: 0)
    }
  },
  tools: [{
    name: String (required),
    description: String (required),
    parameters: Mixed,
    enabled: Boolean (default: true)
  }],
  status: String (enum: 'active', 'inactive', 'error'),
  metadata: Mixed,
  createdAt: Date,
  updatedAt: Date
}
```

**Key Features:**

- Multiple agent types for different use cases
- Configurable LLM parameters
- Tool integration and management
- Status tracking

### Tool Schema

Tools extend agent capabilities with external functions and APIs.

```javascript
{
  _id: String (UUID),
  name: String (required, unique),
  display_name: String (required),
  description: String (required),
  category: String (enum: 'web', 'computation', 'data', 'communication', 'utility', 'llm', 'custom'),
  parameters_schema: {
    type: String (default: 'object'),
    properties: Mixed (required),
    required: [String],
    additionalProperties: Boolean (default: false)
  },
  return_schema: {
    type: String (default: 'object'),
    properties: Mixed
  },
  implementation: {
    type: String (enum: 'internal', 'external_api', 'webhook', 'code'),
    handler: String (required),
    config: Mixed
  },
  is_system_tool: Boolean (default: false),
  is_active: Boolean (default: true),
  usage_stats: {
    total_calls: Number (default: 0),
    success_calls: Number (default: 0),
    failed_calls: Number (default: 0),
    last_used: Date,
    average_response_time: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Key Features:**

- JSON Schema validation for parameters
- Multiple implementation types
- Usage statistics tracking
- System vs custom tool differentiation

### API Key Schema

API keys manage authentication credentials for different LLM providers.

```javascript
{
  _id: String (UUID),
  name: String (required),
  provider: String (Provider reference),
  project: String (Project reference),
  key_hash: String (encrypted),
  is_active: Boolean (default: true),
  usage_stats: {
    total_requests: Number (default: 0),
    total_tokens: Number (default: 0),
    last_used: Date
  },
  rate_limits: {
    requests_per_minute: Number,
    tokens_per_minute: Number,
    daily_token_limit: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Provider Schema

Providers define LLM service configurations and capabilities.

```javascript
{
  _id: String (UUID),
  name: String (required, unique),
  display_name: String (required),
  api_base_url: String (required),
  supported_models: [String],
  capabilities: {
    chat_completion: Boolean (default: true),
    text_completion: Boolean (default: false),
    embeddings: Boolean (default: false),
    function_calling: Boolean (default: false)
  },
  configuration_schema: Mixed,
  is_active: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

### Conversation Schema

Conversations track chat sessions and message history.

```javascript
{
  _id: String (UUID),
  title: String,
  agent: String (Agent reference),
  user: String (User reference),
  messages: [{
    role: String (enum: 'user', 'assistant', 'system'),
    content: String (required),
    timestamp: Date (default: Date.now),
    metadata: Mixed
  }],
  status: String (enum: 'active', 'archived', 'deleted'),
  metadata: Mixed,
  createdAt: Date,
  updatedAt: Date
}
```

### Prompt Schema

Prompts store reusable prompt templates and execution history.

```javascript
{
  _id: String (UUID),
  title: String (required),
  content: String (required),
  variables: [{
    name: String (required),
    type: String (enum: 'string', 'number', 'boolean', 'array'),
    description: String,
    default_value: Mixed
  }],
  project: String (Project reference),
  tags: [String],
  version: Number (default: 1),
  is_template: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```

## Indexes and Performance

### Recommended Indexes

```javascript
// Users
db.users.createIndex({ email: 1 }, { unique: true });

// Organizations
db.organizations.createIndex({ owner: 1 });
db.organizations.createIndex({ "members.user": 1 });

// Projects
db.projects.createIndex({ organization: 1 });

// Agents
db.agents.createIndex({ organization: 1, project: 1 });
db.agents.createIndex({ type: 1 });
db.agents.createIndex({ status: 1 });

// Tools
db.tools.createIndex({ name: 1 }, { unique: true });
db.tools.createIndex({ category: 1 });
db.tools.createIndex({ is_system_tool: 1 });

// API Keys
db.apikeys.createIndex({ project: 1 });
db.apikeys.createIndex({ provider: 1 });

// Conversations
db.conversations.createIndex({ agent: 1 });
db.conversations.createIndex({ user: 1 });
db.conversations.createIndex({ status: 1 });

// Prompts
db.prompts.createIndex({ project: 1 });
db.prompts.createIndex({ tags: 1 });
```

## Data Validation

All schemas use Mongoose validation features:

- **Required fields**: Ensures critical data is always present
- **Enum validation**: Restricts values to predefined sets
- **String formatting**: Trim whitespace, enforce case
- **Numeric ranges**: Min/max values for parameters
- **Custom validators**: Email format, UUID format
- **Pre-save hooks**: Password hashing, data normalization

## Migration Considerations

When modifying schemas:

1. **Backward Compatibility**: Ensure existing data remains valid
2. **Default Values**: Provide defaults for new required fields
3. **Data Migration Scripts**: Update existing documents when needed
4. **Index Updates**: Add new indexes for query performance
5. **Validation Changes**: Consider impact on existing invalid data

## Security Features

- **Password Hashing**: bcrypt with salt rounds
- **API Key Encryption**: Encrypted storage of sensitive credentials
- **Input Validation**: Mongoose validators and express-validator
- **Access Control**: Role-based permissions at organization level
- **Audit Trail**: Timestamps on all entities
