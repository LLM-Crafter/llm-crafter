# API Keys & Providers

LLM Crafter supports multiple LLM providers and provides secure API key management for accessing various language models and services.

## Overview

API keys and providers form the foundation of LLM access in LLM Crafter. The system supports:

- **Multiple Providers**: OpenAI, Anthropic, and custom providers
- **Secure Storage**: Encrypted API key storage
- **Project Isolation**: Keys scoped to specific projects
- **Usage Tracking**: Monitor costs and usage patterns
- **Key Rotation**: Easy key updates and management

## Supported Providers

### OpenAI

The primary supported provider with comprehensive model support.

**Supported Models:**
- `gpt-4o`: Latest GPT-4 optimized model
- `gpt-4o-mini`: Cost-effective GPT-4 variant
- `gpt-4-turbo`: High-performance GPT-4
- `gpt-3.5-turbo`: Fast and economical
- `o1-preview`: Advanced reasoning model
- `o1-mini`: Compact reasoning model

**Provider Configuration:**
```json
{
  "name": "openai",
  "display_name": "OpenAI",
  "api_base_url": "https://api.openai.com/v1",
  "auth_type": "bearer_token",
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4 Optimized",
      "type": "chat",
      "context_length": 128000,
      "cost_per_1k_tokens": {
        "input": 0.005,
        "output": 0.015
      }
    }
  ]
}
```

### Anthropic

Support for Claude models from Anthropic.

**Supported Models:**
- `claude-3-5-sonnet-20241022`: Latest Claude 3.5 Sonnet
- `claude-3-haiku-20240307`: Fast and efficient
- `claude-3-opus-20240229`: Most capable model

**Provider Configuration:**
```json
{
  "name": "anthropic",
  "display_name": "Anthropic",
  "api_base_url": "https://api.anthropic.com",
  "auth_type": "x-api-key",
  "models": [
    {
      "id": "claude-3-5-sonnet-20241022",
      "name": "Claude 3.5 Sonnet",
      "type": "chat",
      "context_length": 200000,
      "cost_per_1k_tokens": {
        "input": 0.003,
        "output": 0.015
      }
    }
  ]
}
```

### Custom Providers

Add support for custom LLM providers.

**Example Custom Provider:**
```json
{
  "name": "custom_llm",
  "display_name": "Custom LLM Service",
  "api_base_url": "https://api.example.com/v1",
  "auth_type": "bearer_token",
  "models": [
    {
      "id": "custom-model-v1",
      "name": "Custom Model v1",
      "type": "chat",
      "context_length": 32000
    }
  ],
  "request_format": {
    "messages_key": "messages",
    "model_key": "model",
    "parameters_key": "parameters"
  }
}
```

## API Key Management

### Creating API Keys

API keys are created at the project level for security isolation.

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/api-keys
```

```json
{
  "name": "OpenAI Production Key",
  "key": "sk-proj-abc123...",
  "provider": "openai",
  "description": "Production API key for customer-facing agents",
  "settings": {
    "cost_limit_monthly": 500.00,
    "rate_limit": 1000,
    "allowed_models": ["gpt-4o-mini", "gpt-4o"]
  }
}
```

**Response:**
```json
{
  "_id": "key_abc123",
  "name": "OpenAI Production Key", 
  "provider": {
    "_id": "openai",
    "name": "OpenAI",
    "display_name": "OpenAI"
  },
  "masked_key": "sk-proj-...c123",
  "description": "Production API key for customer-facing agents",
  "status": "active",
  "settings": {
    "cost_limit_monthly": 500.00,
    "rate_limit": 1000,
    "allowed_models": ["gpt-4o-mini", "gpt-4o"]
  },
  "usage_stats": {
    "requests_current_month": 0,
    "cost_current_month": 0.00,
    "last_used": null
  },
  "created_at": "2024-01-16T10:30:00Z"
}
```

### API Key Structure

```json
{
  "_id": "key_abc123",
  "name": "Development Key",
  "key": "encrypted_key_value",
  "provider": "provider_id",
  "project": "project_id",
  "status": "active",
  "settings": {
    "cost_limit_monthly": 100.00,
    "rate_limit": 100,
    "allowed_models": ["gpt-4o-mini"],
    "allowed_ips": ["192.168.1.0/24"],
    "expires_at": "2024-12-31T23:59:59Z"
  },
  "usage_stats": {
    "requests_total": 1543,
    "requests_current_month": 234,
    "cost_total": 45.67,
    "cost_current_month": 12.34,
    "last_used": "2024-01-16T15:30:00Z"
  },
  "metadata": {
    "created_by": "user_123",
    "environment": "development"
  },
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-16T15:30:00Z"
}
```

### Key Security Features

#### Encryption at Rest
```javascript
const crypto = require('crypto');

class ApiKeyManager {
  encryptKey(key) {
    const cipher = crypto.createCipher('aes-256-gcm', process.env.ENCRYPTION_KEY);
    let encrypted = cipher.update(key, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${encrypted}:${authTag.toString('hex')}`;
  }
  
  decryptKey(encryptedKey) {
    const [encrypted, authTag] = encryptedKey.split(':');
    const decipher = crypto.createDecipher('aes-256-gcm', process.env.ENCRYPTION_KEY);
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

#### Key Masking
- Only show last 4 characters in API responses
- Full keys never returned in GET requests
- Audit logs for key access

#### Access Control
- Keys scoped to specific projects
- Role-based access for key management
- IP restrictions and rate limiting

## Provider Configuration

### Getting Available Providers

```bash
GET /api/v1/providers
```

**Response:**
```json
{
  "providers": [
    {
      "_id": "openai",
      "name": "openai", 
      "display_name": "OpenAI",
      "description": "OpenAI's language models including GPT-4 and GPT-3.5",
      "status": "active",
      "supported_features": [
        "chat_completion",
        "function_calling",
        "streaming",
        "vision"
      ],
      "models_count": 8
    },
    {
      "_id": "anthropic",
      "name": "anthropic",
      "display_name": "Anthropic", 
      "description": "Anthropic's Claude models for conversational AI",
      "status": "active",
      "supported_features": [
        "chat_completion",
        "function_calling",
        "long_context"
      ],
      "models_count": 3
    }
  ]
}
```

### Provider Models

```bash
GET /api/v1/providers/{providerId}/models
```

**Response:**
```json
{
  "provider": {
    "_id": "openai",
    "name": "OpenAI"
  },
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4 Optimized",
      "description": "Latest GPT-4 model optimized for speed and efficiency",
      "type": "chat",
      "context_length": 128000,
      "supports_tools": true,
      "supports_vision": true,
      "cost_per_1k_tokens": {
        "input": 0.005,
        "output": 0.015
      },
      "rate_limits": {
        "requests_per_minute": 500,
        "tokens_per_minute": 30000
      }
    }
  ]
}
```

## Usage Tracking

### Key Usage Statistics

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/api-keys/{keyId}/stats
```

**Response:**
```json
{
  "key_id": "key_abc123",
  "key_name": "Production Key",
  "usage_stats": {
    "current_month": {
      "requests": 1543,
      "total_tokens": 156789,
      "input_tokens": 98234,
      "output_tokens": 58555,
      "cost": 45.67
    },
    "previous_month": {
      "requests": 2104,
      "total_tokens": 234567,
      "cost": 67.89
    },
    "total": {
      "requests": 15430,
      "total_tokens": 1567890,
      "cost": 456.78
    }
  },
  "daily_usage": [
    {"date": "2024-01-15", "requests": 87, "cost": 2.34},
    {"date": "2024-01-16", "requests": 92, "cost": 2.45}
  ],
  "model_usage": {
    "gpt-4o-mini": {"requests": 1200, "cost": 12.45},
    "gpt-4o": {"requests": 343, "cost": 33.22}
  }
}
```

### Cost Analysis

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/cost-analysis
```

**Response:**
```json
{
  "project_id": "proj_abc123",
  "cost_analysis": {
    "current_month": {
      "total_cost": 123.45,
      "by_provider": {
        "openai": 98.76,
        "anthropic": 24.69
      },
      "by_model": {
        "gpt-4o": 45.67,
        "gpt-4o-mini": 53.09,
        "claude-3-haiku": 24.69
      },
      "by_agent": {
        "customer_support": 67.89,
        "data_analyst": 34.56,
        "content_writer": 21.00
      }
    },
    "trends": {
      "cost_trend": "increasing",
      "efficiency_score": 8.7,
      "optimization_opportunities": [
        "Consider using gpt-4o-mini for simple tasks",
        "Enable conversation summarization for long chats"
      ]
    }
  }
}
```

## Key Management Operations

### List API Keys

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/api-keys
```

**Query Parameters:**
- `provider`: Filter by provider
- `status`: Filter by status (active, inactive, expired)
- `limit`: Number of keys per page
- `page`: Page number

### Update API Key

```bash
PUT /api/v1/organizations/{orgId}/projects/{projectId}/api-keys/{keyId}
```

```json
{
  "name": "Updated Key Name",
  "description": "Updated description",
  "settings": {
    "cost_limit_monthly": 750.00,
    "rate_limit": 2000,
    "allowed_models": ["gpt-4o", "gpt-4o-mini"],
    "expires_at": "2024-12-31T23:59:59Z"
  }
}
```

### Rotate API Key

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/api-keys/{keyId}/rotate
```

```json
{
  "new_key": "sk-proj-new-key-value..."
}
```

### Deactivate API Key

```bash
DELETE /api/v1/organizations/{orgId}/projects/{projectId}/api-keys/{keyId}
```

## Security Best Practices

### Key Management

#### Principle of Least Privilege
```json
{
  "settings": {
    "allowed_models": ["gpt-4o-mini"],  // Only necessary models
    "cost_limit_monthly": 50.00,       // Reasonable limits
    "allowed_ips": ["192.168.1.0/24"], // IP restrictions
    "expires_at": "2024-06-30T23:59:59Z" // Expiration dates
  }
}
```

#### Regular Rotation
- Rotate keys quarterly
- Use different keys for different environments
- Monitor for unusual usage patterns

#### Environment Separation
```json
{
  "development": {
    "key": "dev_key_123",
    "cost_limit": 10.00,
    "models": ["gpt-4o-mini"]
  },
  "production": {
    "key": "prod_key_456", 
    "cost_limit": 1000.00,
    "models": ["gpt-4o", "gpt-4o-mini"]
  }
}
```

### Access Auditing

#### Key Access Logs
```json
{
  "audit_log": {
    "event": "key_used",
    "key_id": "key_abc123",
    "agent_id": "agent_xyz789",
    "user_id": "user_123",
    "model_used": "gpt-4o-mini",
    "tokens_used": 156,
    "cost": 0.0023,
    "timestamp": "2024-01-16T15:30:00Z",
    "ip_address": "192.168.1.100"
  }
}
```

#### Usage Alerts
```json
{
  "alerts": {
    "cost_threshold": {
      "threshold": 80,  // 80% of monthly limit
      "current": 72,
      "status": "warning"
    },
    "unusual_usage": {
      "detected": false,
      "last_check": "2024-01-16T15:00:00Z"
    }
  }
}
```

## Cost Optimization

### Model Selection

Choose appropriate models for different use cases:

```json
{
  "optimization_strategies": {
    "customer_support": {
      "model": "gpt-4o-mini",
      "reasoning": "Cost-effective for routine queries",
      "estimated_savings": "75%"
    },
    "complex_analysis": {
      "model": "gpt-4o",
      "reasoning": "Better reasoning for complex tasks",
      "cost_justified": true
    },
    "summarization": {
      "model": "gpt-3.5-turbo",
      "reasoning": "Fast and cheap for summarization",
      "estimated_savings": "90%"
    }
  }
}
```

### Usage Optimization

#### Conversation Summarization
- Enable automatic summarization
- Reduce token usage by 60-70%
- Significant cost savings for long conversations

#### Prompt Engineering
- Optimize system prompts for clarity
- Reduce unnecessary context
- Use specific instructions to minimize back-and-forth

#### Caching Strategies
```javascript
class ResponseCache {
  constructor() {
    this.cache = new Map();
  }
  
  getCacheKey(prompt, model, parameters) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({prompt, model, parameters}))
      .digest('hex');
  }
  
  async getResponse(prompt, model, parameters) {
    const key = this.getCacheKey(prompt, model, parameters);
    
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    const response = await this.llmApi.generate(prompt, model, parameters);
    this.cache.set(key, response);
    return response;
  }
}
```

## Monitoring and Alerts

### Cost Monitoring

Set up automatic cost monitoring:

```json
{
  "cost_alerts": {
    "monthly_limit_warning": {
      "threshold": 80,
      "notification_method": "email",
      "recipients": ["admin@company.com"]
    },
    "daily_spike_detection": {
      "threshold_multiplier": 3.0,
      "lookback_days": 7,
      "notification_method": "slack"
    },
    "model_cost_analysis": {
      "enabled": true,
      "report_frequency": "weekly"
    }
  }
}
```

### Usage Analytics

Track key performance indicators:

```json
{
  "kpis": {
    "cost_per_conversation": 0.15,
    "tokens_per_conversation": 456,
    "response_time_avg": "1.2s",
    "success_rate": 99.2,
    "cost_efficiency_score": 8.7
  }
}
```

### Performance Monitoring

Monitor API performance across providers:

```json
{
  "performance_metrics": {
    "openai": {
      "avg_response_time": "1.1s",
      "success_rate": 99.5,
      "rate_limit_hits": 0
    },
    "anthropic": {
      "avg_response_time": "1.3s", 
      "success_rate": 99.1,
      "rate_limit_hits": 2
    }
  }
}
```

## Troubleshooting

### Common Issues

#### Invalid API Key
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY",
  "details": {
    "key_id": "key_abc123",
    "provider": "openai",
    "last_valid": "2024-01-15T10:30:00Z"
  }
}
```

**Solutions:**
- Verify key is still valid with provider
- Check if key has been rotated
- Confirm key permissions and limits

#### Rate Limit Exceeded
```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 1000,
    "current": 1000,
    "reset_time": "2024-01-16T16:00:00Z"
  }
}
```

**Solutions:**
- Wait for rate limit reset
- Implement exponential backoff
- Consider upgrading provider plan

#### Cost Limit Reached
```json
{
  "error": "Monthly cost limit exceeded",
  "code": "COST_LIMIT_EXCEEDED",
  "details": {
    "limit": 500.00,
    "current": 500.00,
    "period": "2024-01"
  }
}
```

**Solutions:**
- Increase cost limit if appropriate
- Optimize usage patterns
- Review and archive unused agents

## Integration Examples

### Environment-based Key Management

```javascript
class KeyManager {
  constructor(environment) {
    this.environment = environment;
    this.keys = new Map();
  }
  
  async getKey(provider, purpose) {
    const keyName = `${this.environment}_${provider}_${purpose}`;
    
    if (!this.keys.has(keyName)) {
      const key = await this.fetchKey(keyName);
      this.keys.set(keyName, key);
    }
    
    return this.keys.get(keyName);
  }
  
  async rotateKeys() {
    for (const [keyName, keyData] of this.keys) {
      if (this.shouldRotate(keyData)) {
        await this.rotateKey(keyName);
      }
    }
  }
}
```

### Usage Tracking Integration

```javascript
class UsageTracker {
  async trackUsage(keyId, model, tokenUsage, cost) {
    await this.database.usage_logs.insert({
      key_id: keyId,
      model,
      tokens: tokenUsage,
      cost,
      timestamp: new Date()
    });
    
    await this.updateDailyStats(keyId, tokenUsage, cost);
    await this.checkCostLimits(keyId);
  }
  
  async checkCostLimits(keyId) {
    const key = await this.getKey(keyId);
    const monthlyUsage = await this.getMonthlyUsage(keyId);
    
    if (monthlyUsage.cost >= key.settings.cost_limit_monthly) {
      await this.deactivateKey(keyId);
      await this.sendAlert(keyId, 'COST_LIMIT_EXCEEDED');
    }
  }
}
```

API keys and providers form the secure foundation for accessing LLM capabilities in LLM Crafter, with comprehensive management, monitoring, and optimization features.
