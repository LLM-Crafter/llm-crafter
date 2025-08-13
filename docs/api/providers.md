# Providers API

The Providers API manages LLM providers and their configurations. Providers define how to connect to different LLM services like OpenAI, Anthropic, or custom endpoints.

## Base URL
```
https://your-domain.com/api/providers
```

## Authentication
All endpoints require authentication and appropriate permissions.

**Headers:**
```
Authorization: Bearer {jwt_token}
# OR
X-API-Key: {api_key}
```

## Endpoints

### List Supported Providers

Get all supported LLM providers.

```http
GET /api/providers/supported
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "name": "openai",
        "display_name": "OpenAI",
        "description": "OpenAI GPT models including GPT-4, GPT-3.5",
        "website": "https://openai.com",
        "supported_models": [
          {
            "name": "gpt-4",
            "display_name": "GPT-4",
            "context_length": 8192,
            "input_cost_per_1k": 0.03,
            "output_cost_per_1k": 0.06
          },
          {
            "name": "gpt-3.5-turbo",
            "display_name": "GPT-3.5 Turbo",
            "context_length": 4096,
            "input_cost_per_1k": 0.0015,
            "output_cost_per_1k": 0.002
          }
        ],
        "configuration_schema": {
          "type": "object",
          "properties": {
            "api_key": {
              "type": "string",
              "description": "OpenAI API key"
            },
            "organization": {
              "type": "string",
              "description": "OpenAI organization ID (optional)"
            }
          },
          "required": ["api_key"]
        }
      },
      {
        "name": "anthropic",
        "display_name": "Anthropic",
        "description": "Anthropic Claude models",
        "website": "https://anthropic.com",
        "supported_models": [
          {
            "name": "claude-3-opus",
            "display_name": "Claude 3 Opus",
            "context_length": 200000,
            "input_cost_per_1k": 0.015,
            "output_cost_per_1k": 0.075
          }
        ]
      }
    ]
  }
}
```

### List Organization Providers

Get configured providers for an organization.

```http
GET /api/organizations/{organization_id}/providers
```

**Query Parameters:**
- `enabled` (optional): Filter by enabled status (`true`, `false`)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "provider_123456",
        "name": "openai",
        "display_name": "OpenAI",
        "configuration": {
          "api_key": "sk-xxx...xxx",
          "organization": "org-xxx"
        },
        "enabled": true,
        "default": true,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "last_used": "2024-01-15T14:30:00Z",
        "usage_stats": {
          "total_requests": 1234,
          "total_tokens": 567890,
          "last_30_days_requests": 456
        }
      }
    ]
  }
}
```

### Configure Provider

Configure a provider for an organization.

```http
POST /api/organizations/{organization_id}/providers
```

**Request Body:**
```json
{
  "name": "openai",
  "configuration": {
    "api_key": "sk-1234567890abcdef...",
    "organization": "org-12345"
  },
  "enabled": true,
  "default": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "provider": {
      "id": "provider_789012",
      "name": "openai",
      "display_name": "OpenAI",
      "configuration": {
        "api_key": "sk-xxx...xxx",
        "organization": "org-12345"
      },
      "enabled": true,
      "default": true,
      "organization": "org_123456",
      "created_at": "2024-01-15T11:30:00Z",
      "updated_at": "2024-01-15T11:30:00Z"
    }
  }
}
```

### Get Provider

Get details of a specific provider configuration.

```http
GET /api/organizations/{organization_id}/providers/{provider_id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "provider": {
      "id": "provider_123456",
      "name": "openai",
      "display_name": "OpenAI",
      "configuration": {
        "api_key": "sk-xxx...xxx",
        "organization": "org-12345"
      },
      "enabled": true,
      "default": true,
      "organization": "org_123456",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "supported_models": [
        {
          "name": "gpt-4",
          "display_name": "GPT-4",
          "context_length": 8192,
          "available": true
        }
      ],
      "usage_stats": {
        "total_requests": 1234,
        "successful_requests": 1220,
        "failed_requests": 14,
        "total_tokens": 567890,
        "avg_response_time_ms": 1200,
        "last_request": "2024-01-15T14:30:00Z"
      }
    }
  }
}
```

### Update Provider

Update a provider's configuration.

```http
PUT /api/organizations/{organization_id}/providers/{provider_id}
```

**Request Body:**
```json
{
  "configuration": {
    "api_key": "sk-new-api-key...",
    "organization": "org-54321"
  },
  "enabled": true,
  "default": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "provider": {
      "id": "provider_123456",
      "configuration": {
        "api_key": "sk-xxx...xxx",
        "organization": "org-54321"
      },
      "enabled": true,
      "default": false,
      "updated_at": "2024-01-15T12:30:00Z"
    }
  }
}
```

### Delete Provider

Remove a provider configuration.

```http
DELETE /api/organizations/{organization_id}/providers/{provider_id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Provider configuration deleted successfully"
}
```

### Test Provider

Test a provider's connectivity and authentication.

```http
POST /api/organizations/{organization_id}/providers/{provider_id}/test
```

**Request Body:**
```json
{
  "model": "gpt-3.5-turbo",
  "test_prompt": "Hello, this is a test message."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "test_result": {
      "success": true,
      "model_used": "gpt-3.5-turbo",
      "response": "Hello! This is a test response from the model.",
      "tokens_used": {
        "prompt": 8,
        "completion": 12,
        "total": 20
      },
      "response_time_ms": 850,
      "timestamp": "2024-01-15T13:30:00Z"
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "data": {
    "test_result": {
      "success": false,
      "error": "Authentication failed",
      "error_code": "invalid_api_key",
      "timestamp": "2024-01-15T13:30:00Z"
    }
  }
}
```

## Model Information

### List Available Models

Get available models for a provider.

```http
GET /api/organizations/{organization_id}/providers/{provider_id}/models
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "name": "gpt-4",
        "display_name": "GPT-4",
        "description": "Most capable GPT-4 model",
        "context_length": 8192,
        "max_tokens": 4096,
        "input_cost_per_1k": 0.03,
        "output_cost_per_1k": 0.06,
        "available": true,
        "deprecated": false
      },
      {
        "name": "gpt-3.5-turbo",
        "display_name": "GPT-3.5 Turbo",
        "description": "Fast and efficient model",
        "context_length": 4096,
        "max_tokens": 2048,
        "input_cost_per_1k": 0.0015,
        "output_cost_per_1k": 0.002,
        "available": true,
        "deprecated": false
      }
    ]
  }
}
```

### Get Model Details

Get detailed information about a specific model.

```http
GET /api/organizations/{organization_id}/providers/{provider_id}/models/{model_name}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "model": {
      "name": "gpt-4",
      "display_name": "GPT-4",
      "description": "Most capable GPT-4 model, great for complex tasks",
      "provider": "openai",
      "context_length": 8192,
      "max_tokens": 4096,
      "input_cost_per_1k": 0.03,
      "output_cost_per_1k": 0.06,
      "available": true,
      "deprecated": false,
      "capabilities": [
        "text_generation",
        "code_generation",
        "function_calling",
        "json_mode"
      ],
      "parameters": {
        "temperature": {
          "type": "number",
          "min": 0,
          "max": 2,
          "default": 1,
          "description": "Controls randomness in output"
        },
        "max_tokens": {
          "type": "integer",
          "min": 1,
          "max": 4096,
          "description": "Maximum tokens in response"
        }
      }
    }
  }
}
```

## Provider Statistics

### Get Provider Usage

Get usage statistics for a provider.

```http
GET /api/organizations/{organization_id}/providers/{provider_id}/usage
```

**Query Parameters:**
- `period` (optional): `day`, `week`, `month`, `year` (default: `month`)
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "usage": {
      "period": "month",
      "start_date": "2024-01-01T00:00:00Z",
      "end_date": "2024-01-31T23:59:59Z",
      "totals": {
        "requests": 1234,
        "successful_requests": 1220,
        "failed_requests": 14,
        "tokens_used": 567890,
        "estimated_cost": 45.67,
        "avg_response_time_ms": 1200
      },
      "by_model": [
        {
          "model": "gpt-4",
          "requests": 456,
          "tokens_used": 234567,
          "estimated_cost": 32.15
        },
        {
          "model": "gpt-3.5-turbo",
          "requests": 778,
          "tokens_used": 333323,
          "estimated_cost": 13.52
        }
      ],
      "daily_breakdown": [
        {
          "date": "2024-01-01",
          "requests": 45,
          "tokens_used": 12345,
          "estimated_cost": 1.23
        }
      ]
    }
  }
}
```

## Error Handling

### Common Error Responses

**404 Not Found:**
```json
{
  "error": "Provider not found",
  "code": "PROVIDER_NOT_FOUND"
}
```

**400 Bad Request:**
```json
{
  "error": "Invalid provider configuration",
  "code": "INVALID_CONFIGURATION",
  "details": {
    "field": "api_key",
    "message": "API key is required"
  }
}
```

**422 Unprocessable Entity:**
```json
{
  "error": "Provider test failed",
  "code": "PROVIDER_TEST_FAILED",
  "details": {
    "error": "Authentication failed",
    "provider_response": "Invalid API key"
  }
}
```

## Usage Examples

### JavaScript/Node.js
```javascript
// Configure OpenAI provider
const providerData = {
  name: 'openai',
  configuration: {
    api_key: 'sk-1234567890abcdef...',
    organization: 'org-12345'
  },
  enabled: true,
  default: true
};

const configResponse = await fetch('/api/organizations/org_123/providers', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(providerData)
});

// Test provider
const testResponse = await fetch('/api/organizations/org_123/providers/provider_456/test', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    test_prompt: 'Hello, this is a test.'
  })
});
```

### cURL
```bash
# Configure provider
curl -X POST "https://api.example.com/api/organizations/org_123/providers" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "openai",
    "configuration": {
      "api_key": "sk-1234567890abcdef..."
    },
    "enabled": true
  }'

# Test provider
curl -X POST "https://api.example.com/api/organizations/org_123/providers/provider_456/test" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-3.5-turbo", "test_prompt": "Hello"}'
```

### Python
```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Configure provider
provider_data = {
    'name': 'openai',
    'configuration': {
        'api_key': 'sk-1234567890abcdef...'
    },
    'enabled': True,
    'default': True
}

response = requests.post(
    'https://api.example.com/api/organizations/org_123/providers',
    json=provider_data,
    headers=headers
)

provider = response.json()['data']['provider']

# Get usage statistics
usage_response = requests.get(
    f'https://api.example.com/api/organizations/org_123/providers/{provider["id"]}/usage',
    headers=headers,
    params={'period': 'month'}
)
```
