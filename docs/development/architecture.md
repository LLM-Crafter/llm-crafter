# Architecture

This document provides a comprehensive overview of LLM Crafter's architecture, including system design, component relationships, and technical implementation details.

## System Overview

LLM Crafter is built as a modular, scalable platform for managing and executing LLM agents. The architecture follows a microservices-inspired design with clear separation of concerns.

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                       │
├─────────────────────────────────────────────────────────────┤
│                         API Gateway                         │
├─────────────────────────────────────────────────────────────┤
│                    Core Application Layer                   │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │   Agents    │    Tools    │  Projects   │    Auth     │ │
│  │   Service   │   Service   │   Service   │   Service   │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Integration Layer                        │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │   LLM       │   Cache     │   Queue     │   Storage   │ │
│  │  Providers  │   Service   │   Service   │   Service   │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                      Data Layer                             │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │  MongoDB    │    Redis    │   Message   │    File     │ │
│  │  Database   │    Cache    │    Queue    │   Storage   │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Application Layer

#### Express.js Server

The main application server built with Express.js provides:

- RESTful API endpoints
- Middleware for authentication and validation
- Route handling and request processing
- Error handling and logging

#### Controller Layer

Controllers handle HTTP requests and orchestrate business logic:

```javascript
// Example: Agent Controller Structure
class AgentController {
  async createAgent(req, res) {
    try {
      // Validate request
      const validationResult = await this.validateAgentData(req.body);

      // Create agent via service
      const agent = await this.agentService.createAgent(validationResult.data);

      // Return response
      res.status(201).json({
        success: true,
        data: { agent },
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }
}
```

#### Service Layer

Services contain business logic and data processing:

```javascript
// Example: Agent Service Structure
class AgentService {
  constructor(agentModel, toolService, cacheService) {
    this.agentModel = agentModel;
    this.toolService = toolService;
    this.cacheService = cacheService;
  }

  async createAgent(agentData) {
    // Validate tools
    await this.validateAgentTools(agentData.tools);

    // Create agent record
    const agent = await this.agentModel.create(agentData);

    // Initialize agent cache
    await this.cacheService.initializeAgentCache(agent.id);

    return agent;
  }

  async executeAgent(agentId, prompt, context) {
    // Load agent configuration
    const agent = await this.getAgentWithCache(agentId);

    // Prepare execution context
    const executionContext = await this.prepareContext(agent, context);

    // Execute via LLM service
    const result = await this.llmService.execute(
      agent,
      prompt,
      executionContext
    );

    // Process tools if needed
    if (result.tool_calls) {
      result.tool_results = await this.toolService.executeCalls(
        result.tool_calls
      );
    }

    // Store execution record
    await this.storeExecution(agentId, prompt, result);

    return result;
  }
}
```

### 2. Data Models

#### MongoDB Schema Design

LLM Crafter uses MongoDB with Mongoose for data modeling:

```javascript
// Organization Schema
const organizationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    name: { type: String, required: true },
    description: String,
    members: [
      {
        user: { type: String, ref: "User" },
        role: { type: String, enum: ["owner", "admin", "member", "viewer"] },
        joined_at: { type: Date, default: Date.now },
      },
    ],
    settings: {
      default_model: String,
      rate_limits: {
        requests_per_minute: { type: Number, default: 100 },
        tokens_per_day: { type: Number, default: 100000 },
      },
    },
  },
  { timestamps: true }
);

// Agent Schema
const agentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    name: { type: String, required: true },
    type: { type: String, enum: ["chatbot", "task", "workflow", "api"] },
    organization: { type: String, ref: "Organization", required: true },
    project: { type: String, ref: "Project", required: true },
    system_prompt: { type: String, required: true },
    llm_settings: {
      model: String,
      parameters: {
        temperature: { type: Number, default: 0.7 },
        max_tokens: { type: Number, default: 1000 },
        top_p: { type: Number, default: 1 },
        frequency_penalty: { type: Number, default: 0 },
        presence_penalty: { type: Number, default: 0 },
      },
    },
    tools: [
      {
        name: String,
        description: String,
        parameters: mongoose.Schema.Types.Mixed,
        enabled: { type: Boolean, default: true },
      },
    ],
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);
```

#### Indexing Strategy

```javascript
// Performance indexes
organizationSchema.index({ "members.user": 1 });
organizationSchema.index({ name: 1 });

agentSchema.index({ organization: 1, project: 1 });
agentSchema.index({ organization: 1, enabled: 1 });
agentSchema.index({ type: 1, enabled: 1 });

// Execution tracking indexes
executionSchema.index({ agent: 1, created_at: -1 });
executionSchema.index({ organization: 1, created_at: -1 });
executionSchema.index({ status: 1, created_at: -1 });
```

### 3. Authentication & Authorization

#### JWT-based Authentication

```javascript
// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};
```

#### Role-based Access Control

```javascript
// Organization authorization middleware
const orgAuth = {
  isMember: async (req, res, next) => {
    const { orgId } = req.params;
    const user = req.user;

    const organization = await Organization.findById(orgId);
    const membership = organization.members.find(
      (member) => member.user.toString() === user._id.toString()
    );

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    req.organization = organization;
    req.userRole = membership.role;
    next();
  },

  requireRole: (minRole) => {
    const roleHierarchy = ["viewer", "member", "admin", "owner"];

    return (req, res, next) => {
      const userRoleIndex = roleHierarchy.indexOf(req.userRole);
      const requiredRoleIndex = roleHierarchy.indexOf(minRole);

      if (userRoleIndex < requiredRoleIndex) {
        return res.status(403).json({
          error: "Insufficient permissions",
          required_role: minRole,
        });
      }

      next();
    };
  },
};
```

### 4. LLM Integration Layer

#### Provider Abstraction

```javascript
// LLM Provider interface
class LLMProvider {
  constructor(config) {
    this.config = config;
  }

  async execute(prompt, settings) {
    throw new Error("Execute method must be implemented");
  }

  async validateConfig() {
    throw new Error("ValidateConfig method must be implemented");
  }
}

// OpenAI Provider implementation
class OpenAIProvider extends LLMProvider {
  constructor(config) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.api_key,
      organization: config.organization,
    });
  }

  async execute(prompt, settings) {
    const response = await this.client.chat.completions.create({
      model: settings.model || "gpt-3.5-turbo",
      messages: prompt,
      temperature: settings.temperature || 0.7,
      max_tokens: settings.max_tokens || 1000,
      top_p: settings.top_p || 1,
      frequency_penalty: settings.frequency_penalty || 0,
      presence_penalty: settings.presence_penalty || 0,
    });

    return {
      response: response.choices[0].message.content,
      usage: response.usage,
      model: response.model,
    };
  }

  async validateConfig() {
    try {
      await this.client.models.list();
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}
```

#### Provider Factory

```javascript
class ProviderFactory {
  static create(providerName, config) {
    switch (providerName) {
      case "openai":
        return new OpenAIProvider(config);
      case "anthropic":
        return new AnthropicProvider(config);
      case "azure":
        return new AzureProvider(config);
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }
  }

  static getSupportedProviders() {
    return [
      {
        name: "openai",
        display_name: "OpenAI",
        models: ["gpt-4", "gpt-3.5-turbo"],
      },
      {
        name: "anthropic",
        display_name: "Anthropic",
        models: ["claude-3-opus", "claude-3-sonnet"],
      },
    ];
  }
}
```

### 5. Tool Execution System

#### Tool Interface

```javascript
// Base tool class
class Tool {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.description = config.description;
    this.parametersSchema = config.parameters_schema;
  }

  async execute(parameters) {
    // Validate parameters
    const validation = this.validateParameters(parameters);
    if (!validation.valid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(", ")}`);
    }

    // Execute tool logic
    return await this.run(parameters);
  }

  async run(parameters) {
    throw new Error("Run method must be implemented");
  }

  validateParameters(parameters) {
    // JSON schema validation
    const ajv = new Ajv();
    const validate = ajv.compile(this.parametersSchema);
    const valid = validate(parameters);

    return {
      valid,
      errors: validate.errors?.map((err) => err.message) || [],
    };
  }
}
```

#### System Tools

```javascript
// Web search tool implementation
class WebSearchTool extends Tool {
  constructor(config) {
    super(config);
    this.searchEngine = new SearchEngine(process.env.SEARCH_API_KEY);
  }

  async run(parameters) {
    const { query, max_results = 5 } = parameters;

    const results = await this.searchEngine.search({
      q: query,
      num: max_results,
    });

    return {
      query,
      results: results.items.map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
      })),
      total_results: results.searchInformation.totalResults,
      search_time_ms: results.searchInformation.searchTime * 1000,
    };
  }
}

// Calculator tool implementation
class CalculatorTool extends Tool {
  async run(parameters) {
    const { expression } = parameters;

    try {
      // Use math.js for safe expression evaluation
      const result = math.evaluate(expression);

      return {
        expression,
        result,
        type: typeof result,
      };
    } catch (error) {
      throw new Error(`Invalid expression: ${error.message}`);
    }
  }
}
```

### 6. Caching Strategy

#### Redis Integration

```javascript
class CacheService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    });
  }

  async get(key) {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key, value, ttl = 3600) {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async del(key) {
    await this.redis.del(key);
  }

  // Agent-specific caching
  async cacheAgent(agentId, agentData, ttl = 1800) {
    await this.set(`agent:${agentId}`, agentData, ttl);
  }

  async getCachedAgent(agentId) {
    return await this.get(`agent:${agentId}`);
  }

  // Execution result caching
  async cacheExecution(executionId, result, ttl = 3600) {
    await this.set(`execution:${executionId}`, result, ttl);
  }

  // Rate limiting
  async checkRateLimit(key, limit, window) {
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, window);
    }

    return {
      count: current,
      limit,
      remaining: Math.max(0, limit - current),
      resetTime: Date.now() + window * 1000,
    };
  }
}
```

### 7. Message Queue System

#### Async Processing

```javascript
// Queue service using Bull
const Queue = require("bull");

class QueueService {
  constructor() {
    this.agentExecutionQueue = new Queue("agent execution", {
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
      },
    });

    this.setupProcessors();
  }

  setupProcessors() {
    this.agentExecutionQueue.process("execute", async (job) => {
      const { agentId, prompt, context } = job.data;

      try {
        const result = await this.agentService.executeAgent(
          agentId,
          prompt,
          context
        );
        return result;
      } catch (error) {
        throw new Error(`Agent execution failed: ${error.message}`);
      }
    });
  }

  async queueExecution(agentId, prompt, context, priority = "normal") {
    const priorityMap = {
      low: 10,
      normal: 0,
      high: -10,
      critical: -20,
    };

    return await this.agentExecutionQueue.add(
      "execute",
      {
        agentId,
        prompt,
        context,
      },
      {
        priority: priorityMap[priority] || 0,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );
  }
}
```

### 8. Monitoring & Observability

#### Health Checks

```javascript
class HealthService {
  constructor(dbConnection, redis, queueService) {
    this.db = dbConnection;
    this.redis = redis;
    this.queue = queueService;
  }

  async checkHealth() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueue(),
      this.checkExternalServices(),
    ]);

    const results = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {},
    };

    checks.forEach((check, index) => {
      const serviceName = ["database", "redis", "queue", "external"][index];

      if (check.status === "fulfilled") {
        results.services[serviceName] = check.value;
      } else {
        results.services[serviceName] = {
          status: "unhealthy",
          error: check.reason.message,
        };
        results.status = "degraded";
      }
    });

    return results;
  }

  async checkDatabase() {
    const start = Date.now();
    await this.db.connection.db.admin().ping();

    return {
      status: "healthy",
      response_time_ms: Date.now() - start,
    };
  }

  async checkRedis() {
    const start = Date.now();
    await this.redis.ping();

    return {
      status: "healthy",
      response_time_ms: Date.now() - start,
    };
  }
}
```

#### Metrics Collection

```javascript
class MetricsService {
  constructor() {
    this.prometheus = require("prom-client");
    this.collectDefaultMetrics();
    this.setupCustomMetrics();
  }

  collectDefaultMetrics() {
    this.prometheus.collectDefaultMetrics({
      timeout: 5000,
      prefix: "llmcrafter_",
    });
  }

  setupCustomMetrics() {
    this.agentExecutions = new this.prometheus.Counter({
      name: "llmcrafter_agent_executions_total",
      help: "Total number of agent executions",
      labelNames: ["agent_id", "status", "organization"],
    });

    this.executionDuration = new this.prometheus.Histogram({
      name: "llmcrafter_execution_duration_seconds",
      help: "Agent execution duration",
      labelNames: ["agent_id", "organization"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    });

    this.tokenUsage = new this.prometheus.Counter({
      name: "llmcrafter_tokens_used_total",
      help: "Total tokens used",
      labelNames: ["organization", "model", "type"],
    });
  }

  recordExecution(agentId, organizationId, status, duration, tokens) {
    this.agentExecutions.inc({
      agent_id: agentId,
      status,
      organization: organizationId,
    });

    this.executionDuration.observe(
      {
        agent_id: agentId,
        organization: organizationId,
      },
      duration
    );

    if (tokens) {
      this.tokenUsage.inc(
        {
          organization: organizationId,
          model: tokens.model,
          type: "input",
        },
        tokens.prompt_tokens
      );

      this.tokenUsage.inc(
        {
          organization: organizationId,
          model: tokens.model,
          type: "output",
        },
        tokens.completion_tokens
      );
    }
  }

  getMetrics() {
    return this.prometheus.register.metrics();
  }
}
```

## Deployment Architecture

### Container Strategy

```dockerfile
# Multi-stage Docker build
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
USER node

CMD ["npm", "start"]
```

### Environment Configuration

```yaml
# docker-compose.yml
version: "3.8"

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/llmcrafter
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis

  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=password

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  mongo_data:
  redis_data:
```

This architecture provides a solid foundation for scaling LLM Crafter while maintaining modularity, performance, and reliability.
