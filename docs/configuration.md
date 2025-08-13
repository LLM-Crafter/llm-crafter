# Configuration

LLM Crafter provides flexible configuration options through environment variables, database settings, and runtime configuration.

## Environment Variables

### Core Configuration

```bash
# Server Configuration
PORT=3000                           # Server port (default: 3000)
NODE_ENV=production                 # Environment: development|production|test
HOST=0.0.0.0                       # Server host (default: 0.0.0.0)

# Database
MONGODB_URI=mongodb://localhost:27017/llm-crafter  # MongoDB connection string

# Authentication
JWT_SECRET=your-super-secret-key    # JWT signing secret (min 32 characters)
JWT_EXPIRES_IN=24h                  # Token expiration time
BCRYPT_ROUNDS=12                    # Password hashing rounds
```

### Security Configuration

```bash
# CORS Settings
CORS_ORIGIN=*                       # Allowed origins (* for development only)
CORS_CREDENTIALS=true               # Allow credentials in CORS

# Rate Limiting
RATE_LIMIT_MAX=100                  # Max requests per window
RATE_LIMIT_WINDOW=900000            # Rate limit window in ms (15 minutes)
RATE_LIMIT_SKIP_SUCCESSFUL=false    # Count successful requests

# Session Security
SESSION_TIMEOUT=86400000            # Session timeout in ms (24 hours)
SECURE_COOKIES=true                 # Use secure cookies (HTTPS only)
```

### Logging Configuration

```bash
# Logging
LOG_LEVEL=info                      # Logging level: error|warn|info|debug
LOG_FILE=./logs/app.log            # Log file path
LOG_FORMAT=combined                 # Morgan log format
LOG_ROTATE=true                     # Enable log rotation
MAX_LOG_SIZE=10m                    # Max log file size
MAX_LOG_FILES=5                     # Max number of log files
```

### LLM Provider Configuration

```bash
# OpenAI
OPENAI_API_KEY=sk-your-key         # Default OpenAI API key
OPENAI_ORG_ID=org-your-org         # OpenAI organization ID (optional)

# Anthropic
ANTHROPIC_API_KEY=your-key         # Default Anthropic API key

# Custom Providers
CUSTOM_PROVIDER_URL=https://api.example.com  # Custom LLM provider URL
CUSTOM_PROVIDER_KEY=your-key       # Custom provider API key
```

## Database Configuration

### MongoDB Options

```javascript
// Database connection options (set via MONGODB_URI query parameters)
const mongoOptions = {
  // Connection options
  maxPoolSize: 10,          // Maximum connection pool size
  minPoolSize: 5,           // Minimum connection pool size
  maxIdleTimeMS: 30000,     // Close connections after 30s of inactivity
  serverSelectionTimeoutMS: 5000,  // How long to try selecting a server
  
  // Reliability options
  retryWrites: true,        // Retry writes on network errors
  retryReads: true,         // Retry reads on network errors
  heartbeatFrequencyMS: 10000,  // Heartbeat every 10 seconds
  
  // Authentication
  authSource: 'admin',      // Authentication database
  authMechanism: 'SCRAM-SHA-256'  // Authentication mechanism
}
```

Example connection strings:

```bash
# Basic connection
MONGODB_URI=mongodb://localhost:27017/llm-crafter

# With authentication
MONGODB_URI=mongodb://user:pass@localhost:27017/llm-crafter?authSource=admin

# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/llm-crafter?retryWrites=true

# Replica set
MONGODB_URI=mongodb://host1:27017,host2:27017,host3:27017/llm-crafter?replicaSet=rs0
```

### Database Indexes

LLM Crafter automatically creates the following indexes for optimal performance:

```javascript
// Agent indexes
db.agents.createIndex({ project: 1, name: 1 }, { unique: true })
db.agents.createIndex({ organization: 1 })

// Conversation indexes
db.conversations.createIndex({ agent: 1, user_identifier: 1 })
db.conversations.createIndex({ agent: 1, status: 1 })
db.conversations.createIndex({ "metadata.last_activity": 1 })

// Execution indexes
db.agentexecutions.createIndex({ agent: 1, status: 1 })
db.agentexecutions.createIndex({ agent: 1, createdAt: -1 })
db.agentexecutions.createIndex({ status: 1, createdAt: 1 })

// Organization indexes
db.organizations.createIndex({ "members.user": 1 })
db.organizations.createIndex({ name: 1 }, { unique: true })
```

## Runtime Configuration

### System Tools Configuration

Configure built-in system tools in `src/config/systemTools.js`:

```javascript
const systemToolsConfig = {
  web_search: {
    enabled: true,
    max_results: 10,
    timeout: 30000,          // 30 seconds
    search_engine: 'google', // google|bing|duckduckgo
    safe_search: true
  },
  
  calculator: {
    enabled: true,
    precision: 10,           // Decimal precision
    max_computation_time: 5000  // 5 seconds
  },
  
  api_caller: {
    enabled: true,
    timeout: 30000,          // Default request timeout
    max_redirects: 5,        // Max HTTP redirects
    max_response_size: '10mb' // Max response size
  },
  
  json_processor: {
    enabled: true,
    max_depth: 10,           // Max JSON nesting depth
    max_size: '1mb'          // Max JSON size
  }
}
```

### LLM Model Configuration

Configure default model settings and mappings:

```javascript
const modelConfig = {
  // Default models for different providers
  defaults: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-haiku-20240307',
    custom: 'custom-model-v1'
  },
  
  // Model aliases for easy switching
  aliases: {
    'fast': 'gpt-4o-mini',
    'smart': 'gpt-4o',
    'reasoning': 'o1-mini',
    'creative': 'gpt-4o'
  },
  
  // Model-specific parameters
  parameters: {
    'gpt-4o': {
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 1.0
    },
    'gpt-4o-mini': {
      max_tokens: 16384,
      temperature: 0.7,
      top_p: 1.0
    }
  },
  
  // Summarization model mappings
  summarization: {
    'gpt-4o': 'gpt-4o-mini',
    'gpt-5': 'gpt-5-mini',
    'o3': 'o3-mini',
    'o1': 'o1-mini'
  }
}
```

### Conversation Summarization Configuration

Configure automatic conversation summarization:

```javascript
const summarizationConfig = {
  // When to trigger summarization
  triggers: {
    message_count: 15,       // Summarize every 15 messages
    token_threshold: 4000,   // Summarize when context > 4000 tokens
    time_threshold: 3600000  // Summarize after 1 hour of inactivity
  },
  
  // Summarization parameters
  parameters: {
    max_tokens: 800,         // Max tokens for summary
    temperature: 0.3,        // Low temperature for consistency
    model_selection: 'auto'  // auto|specific_model
  },
  
  // Performance settings
  performance: {
    async_processing: true,  // Process summarization in background
    retry_attempts: 3,       // Retry failed summarizations
    fallback_enabled: true   // Use simple fallback if LLM fails
  }
}
```

## Provider Configuration

### Adding Custom LLM Providers

Add custom LLM providers by extending the provider system:

```javascript
// src/config/providers.js
const customProviders = [
  {
    name: 'huggingface',
    display_name: 'Hugging Face',
    api_base_url: 'https://api-inference.huggingface.co/models',
    auth_type: 'bearer_token',
    models: [
      {
        id: 'microsoft/DialoGPT-large',
        name: 'DialoGPT Large',
        type: 'chat',
        context_length: 2048
      }
    ],
    request_format: {
      messages_key: 'inputs',
      model_key: null,
      parameters_key: 'parameters'
    }
  }
]
```

### API Key Management

Configure how API keys are managed:

```javascript
const apiKeyConfig = {
  encryption: {
    algorithm: 'aes-256-gcm',    // Encryption algorithm
    key_derivation: 'pbkdf2',    // Key derivation method
    iterations: 100000           // PBKDF2 iterations
  },
  
  validation: {
    test_on_creation: true,      // Test API keys when created
    periodic_validation: true,   // Validate keys periodically
    validation_interval: 86400000  // 24 hours
  },
  
  usage_tracking: {
    enabled: true,               // Track API key usage
    track_costs: true,           // Calculate usage costs
    alert_thresholds: {
      daily_cost: 10.00,         // Alert if daily cost > $10
      monthly_cost: 100.00       // Alert if monthly cost > $100
    }
  }
}
```

## Performance Tuning

### Memory Configuration

```bash
# Node.js memory settings
NODE_OPTIONS="--max-old-space-size=2048"  # Max heap size (2GB)
UV_THREADPOOL_SIZE=16                      # UV thread pool size
```

### Connection Pooling

```javascript
// MongoDB connection pool settings
const mongoConfig = {
  maxPoolSize: 10,           // Max connections in pool
  minPoolSize: 5,            // Min connections in pool
  maxIdleTimeMS: 30000,      // Close idle connections after 30s
  waitQueueTimeoutMS: 5000,  // Max time to wait for connection
  serverSelectionTimeoutMS: 5000  // Max time to select server
}
```

### Caching Configuration

```javascript
const cacheConfig = {
  // In-memory caching
  memory: {
    enabled: true,
    max_size: '100mb',       // Max memory cache size
    ttl: 300000             // Cache TTL (5 minutes)
  },
  
  // Redis caching (optional)
  redis: {
    enabled: false,
    url: 'redis://localhost:6379',
    prefix: 'llm-crafter:',
    ttl: 3600               // Cache TTL (1 hour)
  }
}
```

## Monitoring Configuration

### Health Checks

```javascript
const healthConfig = {
  endpoints: {
    basic: '/health',        // Basic health check
    detailed: '/health/detailed',  // Detailed system status
    ready: '/ready'          // Readiness probe
  },
  
  checks: {
    database: true,          // Check database connectivity
    external_apis: true,     // Check external API availability
    memory_usage: true,      // Check memory usage
    disk_space: true         // Check disk space
  },
  
  thresholds: {
    memory_warning: 0.8,     // Warn at 80% memory usage
    memory_critical: 0.95,   // Critical at 95% memory usage
    response_time: 5000      // Max response time (5s)
  }
}
```

### Metrics Collection

```javascript
const metricsConfig = {
  enabled: true,
  
  collection: {
    requests: true,          // Collect request metrics
    response_times: true,    // Collect response time metrics
    errors: true,            // Collect error metrics
    llm_usage: true         // Collect LLM usage metrics
  },
  
  export: {
    prometheus: {
      enabled: false,
      endpoint: '/metrics',
      prefix: 'llm_crafter_'
    },
    json: {
      enabled: true,
      endpoint: '/metrics/json'
    }
  }
}
```

## Security Configuration

### Authentication Settings

```javascript
const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET,
    algorithm: 'HS256',
    expiresIn: '24h',
    issuer: 'llm-crafter',
    audience: 'llm-crafter-users'
  },
  
  password: {
    min_length: 8,
    require_uppercase: true,
    require_lowercase: true,
    require_numbers: true,
    require_symbols: false,
    bcrypt_rounds: 12
  },
  
  session: {
    timeout: 86400000,       // 24 hours
    max_concurrent: 5,       // Max concurrent sessions per user
    secure_cookies: process.env.NODE_ENV === 'production'
  }
}
```

### API Security

```javascript
const securityConfig = {
  cors: {
    origin: process.env.CORS_ORIGIN || false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  
  rate_limiting: {
    enabled: true,
    max_requests: 100,
    window_ms: 900000,       // 15 minutes
    skip_successful: false,
    headers: true
  },
  
  helmet: {
    enabled: true,
    content_security_policy: false,  // Disable for API
    cross_origin_embedder_policy: false
  }
}
```

## Validation

Validate your configuration with the built-in health check:

```bash
# Check configuration validity
curl http://localhost:3000/health/detailed
```

This returns detailed system status including:
- Database connectivity
- Environment configuration
- System resource usage
- External service availability

## Next Steps

- Review [Getting Started](/getting-started) for first-time setup
- Explore [Agent Types](/features/agent-types) to understand agent configuration
- Check [API Reference](/api/) for endpoint-specific configuration options
