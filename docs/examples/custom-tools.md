# Custom Tools Examples

This guide provides comprehensive examples for creating and using custom tools in LLM Crafter. Custom tools extend agent capabilities by integrating with external services, APIs, and custom business logic.

## Understanding Custom Tools

Custom tools are user-defined functions that agents can call to perform specific tasks. They can:

- Interface with external APIs
- Access databases
- Perform complex calculations
- Integrate with third-party services
- Execute custom business logic

## Tool Types

### 1. Webhook Tools

Webhook tools make HTTP requests to external endpoints.

#### Example: Slack Integration Tool

```json
{
  "name": "slack_notifier",
  "display_name": "Slack Notifier",
  "description": "Send notifications to Slack channels",
  "category": "communication",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "channel": {
        "type": "string",
        "description": "Slack channel name or ID",
        "examples": ["#general", "C1234567890"]
      },
      "message": {
        "type": "string",
        "description": "Message to send"
      },
      "username": {
        "type": "string",
        "description": "Bot username (optional)",
        "default": "LLM Crafter Bot"
      },
      "emoji": {
        "type": "string",
        "description": "Bot emoji (optional)",
        "default": ":robot_face:"
      }
    },
    "required": ["channel", "message"]
  },
  "return_schema": {
    "type": "object",
    "properties": {
      "success": {"type": "boolean"},
      "message_id": {"type": "string"},
      "timestamp": {"type": "string"}
    }
  },
  "implementation": {
    "type": "webhook",
    "url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body_template": {
      "channel": "{{channel}}",
      "text": "{{message}}",
      "username": "{{username}}",
      "icon_emoji": "{{emoji}}"
    }
  }
}
```

#### Example: CRM Integration Tool

```json
{
  "name": "crm_customer_lookup",
  "display_name": "CRM Customer Lookup",
  "description": "Look up customer information from CRM system",
  "category": "integration",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "search_type": {
        "type": "string",
        "enum": ["email", "phone", "customer_id"],
        "description": "Type of search to perform"
      },
      "search_value": {
        "type": "string",
        "description": "Value to search for"
      },
      "include_orders": {
        "type": "boolean",
        "description": "Include recent orders in response",
        "default": false
      }
    },
    "required": ["search_type", "search_value"]
  },
  "return_schema": {
    "type": "object",
    "properties": {
      "found": {"type": "boolean"},
      "customer": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "name": {"type": "string"},
          "email": {"type": "string"},
          "phone": {"type": "string"},
          "created_date": {"type": "string"},
          "tier": {"type": "string"}
        }
      },
      "orders": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "order_id": {"type": "string"},
            "date": {"type": "string"},
            "total": {"type": "number"},
            "status": {"type": "string"}
          }
        }
      }
    }
  },
  "implementation": {
    "type": "webhook",
    "url": "https://api.yourcrm.com/customers/search",
    "method": "GET",
    "authentication": {
      "type": "bearer",
      "token_env": "CRM_API_TOKEN"
    },
    "query_params": {
      "type": "{{search_type}}",
      "value": "{{search_value}}",
      "include_orders": "{{include_orders}}"
    }
  }
}
```

### 2. Database Tools

Tools that interact with databases for data retrieval and manipulation.

#### Example: Analytics Query Tool

```json
{
  "name": "analytics_query",
  "display_name": "Analytics Query",
  "description": "Query analytics database for insights",
  "category": "analytics",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "metric": {
        "type": "string",
        "enum": ["revenue", "users", "sessions", "conversions"],
        "description": "Metric to query"
      },
      "period": {
        "type": "string",
        "enum": ["today", "yesterday", "last_7_days", "last_30_days", "last_quarter"],
        "description": "Time period for the query"
      },
      "segment": {
        "type": "string",
        "description": "Optional segment filter (e.g., 'mobile', 'desktop', 'premium_users')"
      },
      "granularity": {
        "type": "string",
        "enum": ["hourly", "daily", "weekly", "monthly"],
        "default": "daily",
        "description": "Data granularity"
      }
    },
    "required": ["metric", "period"]
  },
  "return_schema": {
    "type": "object",
    "properties": {
      "metric": {"type": "string"},
      "period": {"type": "string"},
      "total": {"type": "number"},
      "data_points": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": {"type": "string"},
            "value": {"type": "number"}
          }
        }
      },
      "comparison": {
        "type": "object",
        "properties": {
          "previous_period": {"type": "number"},
          "change_percent": {"type": "number"}
        }
      }
    }
  },
  "implementation": {
    "type": "webhook",
    "url": "https://api.youranalytics.com/query",
    "method": "POST",
    "authentication": {
      "type": "api_key",
      "header": "X-API-Key",
      "key_env": "ANALYTICS_API_KEY"
    },
    "body_template": {
      "query": {
        "metric": "{{metric}}",
        "period": "{{period}}",
        "filters": {
          "segment": "{{segment}}"
        },
        "granularity": "{{granularity}}"
      }
    }
  }
}
```

### 3. File Processing Tools

Tools for handling file uploads, processing, and transformations.

#### Example: Document Processor Tool

```json
{
  "name": "document_processor",
  "display_name": "Document Processor",
  "description": "Process and extract information from documents",
  "category": "file_processing",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "document_url": {
        "type": "string",
        "description": "URL of the document to process"
      },
      "document_type": {
        "type": "string",
        "enum": ["pdf", "docx", "txt", "csv", "xlsx"],
        "description": "Type of document"
      },
      "extraction_type": {
        "type": "string",
        "enum": ["full_text", "tables", "metadata", "summary"],
        "description": "Type of extraction to perform"
      },
      "language": {
        "type": "string",
        "description": "Document language (ISO 639-1 code)",
        "default": "en"
      }
    },
    "required": ["document_url", "document_type", "extraction_type"]
  },
  "return_schema": {
    "type": "object",
    "properties": {
      "success": {"type": "boolean"},
      "document_info": {
        "type": "object",
        "properties": {
          "pages": {"type": "number"},
          "size_bytes": {"type": "number"},
          "language": {"type": "string"}
        }
      },
      "extracted_content": {
        "type": "object",
        "properties": {
          "text": {"type": "string"},
          "tables": {"type": "array"},
          "metadata": {"type": "object"},
          "summary": {"type": "string"}
        }
      }
    }
  },
  "implementation": {
    "type": "webhook",
    "url": "https://api.yourdocprocessor.com/process",
    "method": "POST",
    "authentication": {
      "type": "bearer",
      "token_env": "DOC_PROCESSOR_TOKEN"
    },
    "timeout": 30000,
    "body_template": {
      "document_url": "{{document_url}}",
      "document_type": "{{document_type}}",
      "extraction_type": "{{extraction_type}}",
      "options": {
        "language": "{{language}}"
      }
    }
  }
}
```

## Creating Tools via API

### JavaScript Example

```javascript
class ToolManager {
  constructor(apiKey, organizationId) {
    this.apiKey = apiKey;
    this.organizationId = organizationId;
    this.baseUrl = 'https://api.llmcrafter.com';
    this.headers = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async createTool(toolConfig) {
    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.organizationId}/tools`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(toolConfig)
      }
    );
    return response.json();
  }

  async testTool(toolId, parameters) {
    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.organizationId}/tools/${toolId}/test`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ parameters })
      }
    );
    return response.json();
  }

  async createEmailTool() {
    const emailTool = {
      name: 'email_sender',
      display_name: 'Email Sender',
      description: 'Send emails via SMTP',
      category: 'communication',
      parameters_schema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient email address'
          },
          subject: {
            type: 'string',
            description: 'Email subject'
          },
          body: {
            type: 'string',
            description: 'Email body content'
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high'],
            default: 'normal',
            description: 'Email priority'
          }
        },
        required: ['to', 'subject', 'body']
      },
      return_schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message_id: { type: 'string' },
          status: { type: 'string' }
        }
      },
      implementation: {
        type: 'webhook',
        url: 'https://api.youremailservice.com/send',
        method: 'POST',
        authentication: {
          type: 'api_key',
          header: 'X-API-Key',
          key_env: 'EMAIL_API_KEY'
        },
        body_template: {
          to: '{{to}}',
          subject: '{{subject}}',
          html: '{{body}}',
          priority: '{{priority}}'
        }
      },
      enabled: true
    };

    const result = await this.createTool(emailTool);
    console.log('Email tool created:', result.data.tool.id);

    // Test the tool
    const testResult = await this.testTool(result.data.tool.id, {
      to: 'test@example.com',
      subject: 'Test Email',
      body: 'This is a test email from LLM Crafter.',
      priority: 'normal'
    });

    console.log('Test result:', testResult);
    return result.data.tool;
  }
}

// Usage
const toolManager = new ToolManager(
  process.env.LLM_CRAFTER_API_KEY,
  'org_123456'
);

const emailTool = await toolManager.createEmailTool();
```

### Python Example

```python
import requests
import json

class ToolManager:
    def __init__(self, api_key, organization_id):
        self.api_key = api_key
        self.organization_id = organization_id
        self.base_url = 'https://api.llmcrafter.com'
        self.headers = {
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        }
    
    def create_tool(self, tool_config):
        response = requests.post(
            f'{self.base_url}/api/organizations/{self.organization_id}/tools',
            headers=self.headers,
            json=tool_config
        )
        return response.json()
    
    def create_weather_tool(self):
        weather_tool = {
            'name': 'weather_lookup',
            'display_name': 'Weather Lookup',
            'description': 'Get current weather information for a location',
            'category': 'information',
            'parameters_schema': {
                'type': 'object',
                'properties': {
                    'location': {
                        'type': 'string',
                        'description': 'City name or coordinates (lat,lon)'
                    },
                    'units': {
                        'type': 'string',
                        'enum': ['celsius', 'fahrenheit', 'kelvin'],
                        'default': 'celsius',
                        'description': 'Temperature units'
                    },
                    'include_forecast': {
                        'type': 'boolean',
                        'default': False,
                        'description': 'Include 5-day forecast'
                    }
                },
                'required': ['location']
            },
            'return_schema': {
                'type': 'object',
                'properties': {
                    'location': {'type': 'string'},
                    'current': {
                        'type': 'object',
                        'properties': {
                            'temperature': {'type': 'number'},
                            'humidity': {'type': 'number'},
                            'pressure': {'type': 'number'},
                            'description': {'type': 'string'},
                            'wind_speed': {'type': 'number'}
                        }
                    },
                    'forecast': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'date': {'type': 'string'},
                                'high': {'type': 'number'},
                                'low': {'type': 'number'},
                                'description': {'type': 'string'}
                            }
                        }
                    }
                }
            },
            'implementation': {
                'type': 'webhook',
                'url': 'https://api.openweathermap.org/data/2.5/weather',
                'method': 'GET',
                'query_params': {
                    'q': '{{location}}',
                    'appid': '${OPENWEATHER_API_KEY}',
                    'units': '{{units}}'
                },
                'response_transformer': {
                    'location': '$.name',
                    'current.temperature': '$.main.temp',
                    'current.humidity': '$.main.humidity',
                    'current.pressure': '$.main.pressure',
                    'current.description': '$.weather[0].description',
                    'current.wind_speed': '$.wind.speed'
                }
            },
            'enabled': True
        }
        
        result = self.create_tool(weather_tool)
        print(f"Weather tool created: {result['data']['tool']['id']}")
        return result['data']['tool']

# Usage
tool_manager = ToolManager(
    api_key=os.environ['LLM_CRAFTER_API_KEY'],
    organization_id='org_123456'
)

weather_tool = tool_manager.create_weather_tool()
```

## Advanced Tool Features

### 1. Conditional Logic

Tools can include conditional logic based on parameters:

```json
{
  "name": "adaptive_notification",
  "description": "Send notifications via different channels based on urgency",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "message": {"type": "string"},
      "urgency": {
        "type": "string",
        "enum": ["low", "medium", "high", "critical"]
      },
      "recipient": {"type": "string"}
    }
  },
  "implementation": {
    "type": "webhook",
    "url": "https://api.yournotificationservice.com/send",
    "method": "POST",
    "body_template": {
      "message": "{{message}}",
      "recipient": "{{recipient}}",
      "channel": "{{urgency === 'critical' ? 'sms' : urgency === 'high' ? 'push' : 'email'}}",
      "priority": "{{urgency}}"
    }
  }
}
```

### 2. Response Transformation

Transform external API responses to match your schema:

```json
{
  "implementation": {
    "type": "webhook",
    "url": "https://api.external.com/data",
    "response_transformer": {
      "total_count": "$.metadata.total",
      "items": "$.data[*].{id: id, name: title, created: created_at}",
      "next_page": "$.pagination.next_url"
    }
  }
}
```

### 3. Error Handling

Define custom error handling and retry logic:

```json
{
  "implementation": {
    "type": "webhook",
    "url": "https://api.external.com/data",
    "retry_config": {
      "max_attempts": 3,
      "retry_delay_ms": 1000,
      "retry_on_status": [500, 502, 503, 504]
    },
    "error_mapping": {
      "404": "Resource not found",
      "429": "Rate limit exceeded, please try again later",
      "500": "External service temporarily unavailable"
    }
  }
}
```

## Tool Testing and Debugging

### Testing Tools in Development

```javascript
// Tool testing utility
class ToolTester {
  constructor(apiKey, organizationId) {
    this.apiKey = apiKey;
    this.organizationId = organizationId;
    this.baseUrl = 'https://api.llmcrafter.com';
  }

  async testTool(toolId, testCases) {
    const results = [];
    
    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}`);
      
      try {
        const response = await fetch(
          `${this.baseUrl}/api/organizations/${this.organizationId}/tools/${toolId}/test`,
          {
            method: 'POST',
            headers: {
              'X-API-Key': this.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              parameters: testCase.parameters
            })
          }
        );
        
        const result = await response.json();
        
        results.push({
          name: testCase.name,
          success: result.success,
          result: result.data,
          expectedFields: testCase.expectedFields,
          passed: this.validateResult(result.data, testCase.expectedFields)
        });
        
      } catch (error) {
        results.push({
          name: testCase.name,
          success: false,
          error: error.message,
          passed: false
        });
      }
    }
    
    return results;
  }

  validateResult(result, expectedFields) {
    if (!expectedFields) return true;
    
    for (const field of expectedFields) {
      if (!this.hasNestedProperty(result, field)) {
        return false;
      }
    }
    return true;
  }

  hasNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined, obj
    ) !== undefined;
  }
}

// Usage
const tester = new ToolTester(
  process.env.LLM_CRAFTER_API_KEY,
  'org_123456'
);

const testCases = [
  {
    name: 'Valid weather lookup',
    parameters: {
      location: 'New York',
      units: 'celsius',
      include_forecast: true
    },
    expectedFields: ['location', 'current.temperature', 'current.description']
  },
  {
    name: 'Invalid location',
    parameters: {
      location: 'InvalidCity123',
      units: 'celsius'
    },
    expectedFields: ['error']
  }
];

const results = await tester.testTool('tool_123456', testCases);
console.log('Test Results:', results);
```

## Best Practices

### 1. Schema Design

- **Clear Descriptions**: Provide detailed descriptions for all parameters
- **Validation**: Use JSON schema validation to prevent errors
- **Defaults**: Set sensible default values where appropriate
- **Examples**: Include parameter examples for clarity

### 2. Error Handling

- **Graceful Failures**: Handle errors gracefully and return meaningful messages
- **Retry Logic**: Implement retry logic for transient failures
- **Timeouts**: Set appropriate timeouts to prevent hanging requests
- **Status Codes**: Map HTTP status codes to user-friendly messages

### 3. Security

- **Authentication**: Always use secure authentication methods
- **Input Validation**: Validate all inputs to prevent injection attacks
- **Rate Limiting**: Implement rate limiting to prevent abuse
- **Secrets Management**: Store API keys and secrets securely

### 4. Performance

- **Caching**: Cache responses when appropriate
- **Timeouts**: Set reasonable timeouts
- **Pagination**: Handle large datasets with pagination
- **Compression**: Use compression for large responses

### 5. Documentation

- **Clear Naming**: Use descriptive names for tools and parameters
- **Usage Examples**: Provide practical usage examples
- **Return Schemas**: Define clear return schemas
- **Categories**: Organize tools into logical categories

Custom tools provide powerful extensibility to LLM Crafter, enabling integration with virtually any external service or custom business logic. By following these examples and best practices, you can create robust, reliable tools that enhance your agents' capabilities.
