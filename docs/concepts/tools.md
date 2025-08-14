# Tools

Tools extend agent capabilities by providing access to external services, computations, and data processing. LLM Crafter includes a comprehensive set of built-in tools and supports custom tool development.

## System Tools

LLM Crafter provides several built-in system tools that are available to all agents:

### Web Search

Search the internet for information using search engines.

**Parameters:**

- `query` (string): The search query
- `max_results` (number): Maximum results to return (default: 5)

**Example:**

```json
{
  "tool_name": "web_search",
  "parameters": {
    "query": "latest TypeScript features 2024",
    "max_results": 3
  }
}
```

**Response:**

```json
{
  "query": "latest TypeScript features 2024",
  "results": [
    {
      "title": "TypeScript 5.0 Features",
      "url": "https://example.com/typescript-5",
      "snippet": "New features in TypeScript 5.0 include..."
    }
  ],
  "total_results": 156,
  "search_time_ms": 234
}
```

### Calculator

Perform mathematical calculations and evaluate expressions.

**Parameters:**

- `expression` (string): Mathematical expression to evaluate

**Example:**

```json
{
  "tool_name": "calculator",
  "parameters": {
    "expression": "sqrt(144) + 2^3"
  }
}
```

**Response:**

```json
{
  "expression": "sqrt(144) + 2^3",
  "result": 20,
  "type": "number"
}
```

### Current Time

Get current date and time information.

**Parameters:**

- `timezone` (string): Timezone (default: "UTC")
- `format` (string): Output format - "iso", "unix", or "human" (default: "iso")

**Example:**

```json
{
  "tool_name": "current_time",
  "parameters": {
    "timezone": "America/New_York",
    "format": "human"
  }
}
```

**Response:**

```json
{
  "timestamp": "Tuesday, January 16, 2024 at 3:30 PM EST",
  "timezone": "America/New_York",
  "format": "human",
  "unix_timestamp": 1705431000,
  "iso_string": "2024-01-16T20:30:00.000Z"
}
```

### JSON Processor

Parse, validate, and manipulate JSON data.

**Parameters:**

- `data` (any): The JSON data to process
- `operation` (string): Operation - "parse", "stringify", "extract", or "validate"
- `path` (string): Dot notation path for extract operation

**Example:**

```json
{
  "tool_name": "json_processor",
  "parameters": {
    "data": { "user": { "name": "John", "age": 30 } },
    "operation": "extract",
    "path": "user.name"
  }
}
```

**Response:**

```json
{
  "operation": "extract",
  "result": "John",
  "success": true
}
```

### API Caller

Make HTTP requests to pre-configured API endpoints with authentication.

**Parameters:**

- `endpoint_name` (string): Name of the configured endpoint
- `method` (string): HTTP method (default: "GET")
- `path_params` (object): Path parameters for URL substitution
- `query_params` (object): Query parameters
- `body_data` (any): Request body data
- `headers` (object): Additional headers

**Example:**

```json
{
  "tool_name": "api_caller",
  "parameters": {
    "endpoint_name": "get_weather",
    "method": "GET",
    "query_params": {
      "q": "London",
      "units": "metric"
    }
  }
}
```

**Response:**

```json
{
  "endpoint_name": "get_weather",
  "url": "https://api.openweathermap.org/data/2.5/weather?q=London&units=metric",
  "method": "GET",
  "status_code": 200,
  "success": true,
  "data": {
    "weather": [{ "main": "Clear", "description": "clear sky" }],
    "main": { "temp": 15.2, "humidity": 65 }
  },
  "execution_time_ms": 234
}
```

## Tool Categories

Tools are organized into categories for easy discovery:

### Communication

- `api_caller`: HTTP requests to external APIs
- `web_search`: Internet search capabilities

### Computation

- `calculator`: Mathematical calculations and expressions

### Data

- `json_processor`: JSON data manipulation and validation

### Utility

- `current_time`: Date and time information

### Web

- `web_search`: Web search functionality

## Custom Tools

Organizations can create custom tools for specific needs.

### Creating Custom Tools

```bash
POST /api/v1/tools
```

```json
{
  "name": "database_query",
  "display_name": "Database Query",
  "description": "Execute SQL queries on the company database",
  "category": "data",
  "parameters_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "SQL query to execute"
      },
      "limit": {
        "type": "number",
        "description": "Maximum rows to return",
        "default": 100
      }
    },
    "required": ["query"]
  },
  "return_schema": {
    "type": "object",
    "properties": {
      "rows": { "type": "array" },
      "count": { "type": "number" },
      "execution_time_ms": { "type": "number" }
    }
  },
  "implementation": {
    "type": "webhook",
    "url": "https://your-server.com/tools/database-query",
    "method": "POST",
    "auth": {
      "type": "bearer_token",
      "token": "your-webhook-token"
    }
  }
}
```

### Custom Tool Implementation

Custom tools can be implemented as:

#### Webhook Tools

External HTTP endpoints that receive tool parameters and return results.

```javascript
// Webhook endpoint implementation
app.post("/tools/database-query", authenticateWebhook, async (req, res) => {
  const { query, limit = 100 } = req.body.parameters;

  try {
    const startTime = Date.now();
    const result = await database.query(query, { limit });
    const executionTime = Date.now() - startTime;

    res.json({
      rows: result.rows,
      count: result.rowCount,
      execution_time_ms: executionTime,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      type: "database_error",
    });
  }
});
```

#### Internal Tools

Built into the LLM Crafter system with direct code implementation.

```javascript
// Internal tool handler
const customToolHandlers = {
  async database_query(parameters) {
    const { query, limit = 100 } = parameters;
    const startTime = Date.now();

    try {
      const result = await database.query(query, { limit });
      return {
        rows: result.rows,
        count: result.rowCount,
        execution_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }
  },
};
```

## Tool Configuration

### Agent Tool Assignment

Assign tools to agents when creating or updating them:

```json
{
  "name": "data_analyst",
  "type": "task",
  "tools": ["calculator", "json_processor", "api_caller", "database_query"]
}
```

### Tool Permissions

Control tool access at the organization level:

```json
{
  "organization_tools": {
    "enabled_tools": [
      "web_search",
      "calculator",
      "current_time",
      "json_processor",
      "api_caller",
      "database_query"
    ],
    "disabled_tools": [],
    "custom_tools": ["database_query"]
  }
}
```

## Tool Usage in Agents

### Automatic Tool Selection

Agents automatically choose appropriate tools based on user requests:

**User:** "What's the weather like in Tokyo right now?"

**Agent Process:**

1. Recognizes need for current weather data
2. Selects `api_caller` tool with weather endpoint
3. Makes API request to weather service
4. Processes and summarizes response

**Agent Response:** "The current weather in Tokyo is 18°C with partly cloudy skies. Humidity is at 60% with light winds from the southeast."

### Tool Chaining

Agents can use multiple tools in sequence:

**User:** "Calculate the compound interest on $10,000 at 5% for 10 years, then search for current savings account rates"

**Agent Process:**

1. Uses `calculator` tool: `10000 * (1.05)^10`
2. Gets result: $16,288.95
3. Uses `web_search` tool: "current savings account interest rates 2024"
4. Combines results in response

### Error Handling

When tools fail, agents gracefully handle errors:

```json
{
  "tool_error": {
    "tool_name": "api_caller",
    "error": "API endpoint timeout",
    "fallback_action": "Apologize and suggest alternative"
  }
}
```

## Tool Development

### Best Practices

#### Parameter Validation

```json
{
  "parameters_schema": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "format": "email",
        "description": "Valid email address"
      },
      "count": {
        "type": "number",
        "minimum": 1,
        "maximum": 100
      }
    },
    "required": ["email"],
    "additionalProperties": false
  }
}
```

#### Error Responses

```json
{
  "error": "Invalid email format",
  "error_code": "VALIDATION_ERROR",
  "parameter": "email",
  "provided_value": "invalid-email"
}
```

#### Response Schemas

```json
{
  "return_schema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "data": { "type": "object" },
      "message": { "type": "string" },
      "execution_time_ms": { "type": "number" }
    },
    "required": ["success"]
  }
}
```

### Testing Tools

Test tool functionality independently:

```bash
POST /api/v1/tools/calculator/execute
```

```json
{
  "parameters": {
    "expression": "2 + 2"
  }
}
```

**Response:**

```json
{
  "result": {
    "expression": "2 + 2",
    "result": 4,
    "type": "number"
  },
  "execution_time_ms": 12,
  "success": true
}
```

## Tool Monitoring

### Usage Statistics

Track tool usage across your organization:

```bash
GET /api/v1/tools/calculator/stats
```

**Response:**

```json
{
  "tool_name": "calculator",
  "usage_stats": {
    "total_executions": 1543,
    "success_rate": 98.5,
    "average_execution_time_ms": 45,
    "most_common_operations": ["addition", "percentage", "square_root"]
  },
  "time_period": "last_30_days"
}
```

### Performance Metrics

Monitor tool performance:

- **Execution Time**: Average time per tool call
- **Success Rate**: Percentage of successful executions
- **Error Patterns**: Common failure types
- **Usage Trends**: Tool usage over time

## API Reference

### Tool Endpoints

| Method | Endpoint                    | Description              |
| ------ | --------------------------- | ------------------------ |
| GET    | `/tools`                    | List all available tools |
| GET    | `/tools/categories`         | Get tool categories      |
| GET    | `/tools/{toolName}`         | Get tool details         |
| POST   | `/tools/{toolName}/execute` | Execute a tool           |
| GET    | `/tools/{toolName}/stats`   | Get usage statistics     |

### Custom Tool Management

| Method | Endpoint            | Description        |
| ------ | ------------------- | ------------------ |
| POST   | `/tools`            | Create custom tool |
| PUT    | `/tools/{toolName}` | Update custom tool |
| DELETE | `/tools/{toolName}` | Delete custom tool |

## Examples

### Weather Agent with API Caller

```json
{
  "name": "weather_assistant",
  "type": "chatbot",
  "system_prompt": "You are a weather assistant. Use the api_caller tool to get current weather and forecasts.",
  "tools": ["api_caller", "current_time"],
  "api_endpoints": {
    "get_weather": {
      "base_url": "https://api.openweathermap.org",
      "path": "/data/2.5/weather",
      "methods": ["GET"]
    }
  }
}
```

### Data Analysis Agent

```json
{
  "name": "data_analyst",
  "type": "task",
  "system_prompt": "You are a data analyst. Use tools to process data, perform calculations, and retrieve information from APIs.",
  "tools": ["calculator", "json_processor", "api_caller", "web_search"]
}
```

### Research Assistant

```json
{
  "name": "research_assistant",
  "type": "chatbot",
  "system_prompt": "You are a research assistant. Search for information, analyze data, and provide comprehensive summaries.",
  "tools": ["web_search", "calculator", "current_time", "json_processor"]
}
```

Tools are the foundation of agent capabilities in LLM Crafter. By combining multiple tools, agents can perform complex workflows and provide sophisticated assistance across a wide range of use cases.
