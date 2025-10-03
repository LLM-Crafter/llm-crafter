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

## Runtime Configuration

### System Tools Configuration

LLM Crafter provides 11 built-in system tools in `src/config/systemTools.js`:

**Available Tools:**

1. **web_search** - Search the web using Brave Search or Tavily
2. **webpage_scraper** - Scrape content from web pages
3. **calculator** - Perform mathematical calculations
4. **llm_prompt** - Execute prompts using LLM providers
5. **current_time** - Get current date and time in various formats
6. **json_processor** - Parse, validate, and manipulate JSON data
7. **api_caller** - Make HTTP requests to pre-configured API endpoints
8. **faq** - Answer questions using pre-configured FAQs
9. **rag_search** - Search indexed knowledge base using semantic similarity
10. **request_human_handoff** - Request human operator intervention
11. **webpage_scraper** - Extract content from web pages

**Tool Categories:**

- Web: `web_search`, `webpage_scraper`
- Computation: `calculator`
- LLM: `llm_prompt`
- Utility: `current_time`
- Data: `json_processor`
- Communication: `api_caller`, `request_human_handoff`
- Knowledge: `faq`, `rag_search`

These tools are automatically initialized at startup and available to all agents. See [System Tools Documentation](/features/system-tools) for detailed usage and configuration.

### Conversation Summarization Configuration

Configure automatic conversation summarization:

```javascript
const summarizationConfig = {
  // When to trigger summarization
  triggers: {
    message_count: 15, // Summarize every 15 messages
    token_threshold: 4000, // Summarize when context > 4000 tokens
    time_threshold: 3600000, // Summarize after 1 hour of inactivity
  },

  // Summarization parameters
  parameters: {
    max_tokens: 800, // Max tokens for summary
    temperature: 0.3, // Low temperature for consistency
    model_selection: 'auto', // auto|specific_model
  },

  // Performance settings
  performance: {
    async_processing: true, // Process summarization in background
    retry_attempts: 3, // Retry failed summarizations
    fallback_enabled: true, // Use simple fallback if LLM fails
  },
};
```

## Provider Configuration

### Default LLM Providers

LLM Crafter comes with pre-configured providers in `src/config/defaultProviders.js`. These providers are automatically initialized on server startup:

```javascript
// src/config/defaultProviders.js
const defaultProviders = [
  {
    name: 'openai',
    models: [
      'gpt-5',
      'gpt-5-mini',
      'gpt-4.1',
      'gpt-4o',
      'gpt-4o-mini',
      'o3-deep-research',
      'o3-pro',
      'o3-mini',
      'o4-mini',
      'text-embedding-3-large',
      'text-embedding-3-small',
      // ... and more
    ],
  },
  {
    name: 'anthropic',
    models: [
      'claude-opus-4-1-20250805',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      // ... and more
    ],
  },
  {
    name: 'google',
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      // ... and more
    ],
  },
  {
    name: 'deepseek',
    models: [
      'DeepSeek-V3',
      'DeepSeek-R1',
      'deepseek-llm-67b-chat',
      'DeepSeek-VL',
      'DeepSeek-Math',
      'DeepSeek-Prover',
      // ... and more
    ],
  },
];
```

The system automatically updates existing providers with new models while preserving any custom models you've added via the API.

### Adding Custom Providers

To add a custom LLM provider, edit `src/config/defaultProviders.js` and add your provider to the `defaultProviders` array:

```javascript
const defaultProviders = [
  // ... existing providers
  {
    name: 'your-custom-provider',
    models: [
      'model-name-1',
      'model-name-2',
      // Add all supported models
    ],
  },
];
```

After adding a custom provider, restart the server to initialize it automatically.

### API Key Management

Configure how API keys are managed:

```javascript
const apiKeyConfig = {
  encryption: {
    algorithm: 'aes-256-gcm', // Encryption algorithm
    key_derivation: 'pbkdf2', // Key derivation method
    iterations: 100000, // PBKDF2 iterations
  },

  validation: {
    test_on_creation: true, // Test API keys when created
    periodic_validation: true, // Validate keys periodically
    validation_interval: 86400000, // 24 hours
  },

  usage_tracking: {
    enabled: true, // Track API key usage
    track_costs: true, // Calculate usage costs
    alert_thresholds: {
      daily_cost: 10.0, // Alert if daily cost > $10
      monthly_cost: 100.0, // Alert if monthly cost > $100
    },
  },
};
```

## Security Configuration

Configure authentication methods and security features using environment variables defined in `src/config/passport.js`.

### Core Authentication

```bash
# JWT Secret (Required)
# Secret key for signing JWT tokens
JWT_SECRET=your-secure-jwt-secret-key-min-32-characters

# Session Secret (Optional)
# Secret key for session management (falls back to JWT_SECRET if not set)
SESSION_SECRET=your-secure-session-secret-key

# Encryption Key (Required for API Keys)
# 32-character key for encrypting sensitive data (API keys, credentials)
ENCRYPTION_KEY=your-32-character-encryption-key
```

### Email Domain Restrictions

```bash
# Allowed Email Domains (Optional)
# Comma-separated list of allowed email domains for registration
# If not set, all email domains are allowed
ALLOWED_EMAIL_DOMAINS=company.com,partner.com,example.org
```

### Google OAuth

```bash
# Google OAuth Credentials (Optional)
# Enable Google authentication by providing these credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=/auth/google/callback  # Default callback URL
```

To obtain Google OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`

### GitHub OAuth

```bash
# GitHub OAuth Credentials (Optional)
# Enable GitHub authentication by providing these credentials
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=/auth/github/callback  # Default callback URL
```

To obtain GitHub OAuth credentials:

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL: `http://localhost:3000/auth/github/callback`
4. Copy the Client ID and generate a Client Secret

### Authentication Methods

The system supports three authentication methods configured in `src/config/passport.js`:

1. **Local Strategy** (Email/Password)

   - Always enabled
   - Requires strong passwords (8+ characters, uppercase, lowercase, number)
   - Uses bcrypt for password hashing

2. **Google OAuth**

   - Enabled when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
   - Automatically creates user accounts from Google profiles
   - Supports email domain restrictions

3. **GitHub OAuth**
   - Enabled when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set
   - Automatically creates user accounts from GitHub profiles
   - Supports email domain restrictions

## Next Steps

- Review [Getting Started](/getting-started) for first-time setup
- Explore [Agent Types](/features/agent-types) to understand agent configuration
- Check [API Reference](/api/index) for endpoint-specific configuration options
