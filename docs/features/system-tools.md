# System Tools

LLM Crafter provides a comprehensive set of built-in system tools that agents can use to extend their capabilities. These tools are pre-configured and maintained by the platform, offering reliable functionality for common tasks.

## Available System Tools

### Web Search
**Name:** `web_search`  
**Category:** Web

Search the web for information using a search engine.

**Parameters:**
- `query` (string, required): The search query
- `max_results` (number, optional): Maximum number of results to return (default: 5)

**Returns:**
- `query`: The original search query
- `results`: Array of search results with title, URL, and snippet
- `total_results`: Total number of results found
- `search_time_ms`: Time taken for the search

**Example Usage:**
```json
{
  "name": "web_search",
  "parameters": {
    "query": "latest developments in artificial intelligence",
    "max_results": 10
  }
}
```

### Calculator
**Name:** `calculator`  
**Category:** Computation

Perform mathematical calculations and evaluate expressions.

**Parameters:**
- `expression` (string, required): Mathematical expression to evaluate

**Returns:**
- `expression`: The original expression
- `result`: The calculated result
- `type`: The type of calculation performed

**Supported Operations:**
- Basic arithmetic: `+`, `-`, `*`, `/`, `%`
- Powers and roots: `^`, `sqrt()`, `cbrt()`
- Trigonometric: `sin()`, `cos()`, `tan()`, `asin()`, `acos()`, `atan()`
- Logarithmic: `log()`, `ln()`, `log10()`
- Constants: `pi`, `e`

**Example Usage:**
```json
{
  "name": "calculator",
  "parameters": {
    "expression": "sqrt(16) + 2 * pi"
  }
}
```

### LLM Prompt
**Name:** `llm_prompt`  
**Category:** LLM

Execute a prompt using an LLM provider, integrating with the existing proxy system.

**Parameters:**
- `prompt` (string, required): The prompt to send to the LLM
- `system_prompt` (string, optional): Optional system prompt
- `model` (string, optional): Specific model to use
- `temperature` (number, optional): Temperature for response generation
- `max_tokens` (number, optional): Maximum tokens in response

**Returns:**
- `prompt`: The original prompt
- `response`: The LLM's response
- `model_used`: The model that processed the request
- `token_usage`: Token consumption details

**Example Usage:**
```json
{
  "name": "llm_prompt",
  "parameters": {
    "prompt": "Explain quantum computing in simple terms",
    "system_prompt": "You are a science educator",
    "temperature": 0.7
  }
}
```

### Date and Time
**Name:** `datetime`  
**Category:** Utility

Get current date and time information or perform date calculations.

**Parameters:**
- `operation` (string, required): Operation type (`current`, `format`, `calculate`)
- `timezone` (string, optional): Timezone for the operation
- `format` (string, optional): Output format for date formatting
- `date` (string, optional): Input date for calculations

**Returns:**
- `timestamp`: Current or calculated timestamp
- `formatted`: Formatted date string
- `timezone`: Timezone used
- `day_of_week`: Day of the week

### File Operations
**Name:** `file_operations`  
**Category:** File System

Perform basic file operations like reading, writing, and listing files.

**Parameters:**
- `operation` (string, required): Operation type (`read`, `write`, `list`, `delete`)
- `path` (string, required): File or directory path
- `content` (string, optional): Content for write operations
- `encoding` (string, optional): File encoding (default: utf-8)

**Security Note:** File operations are sandboxed and restricted to designated directories for security.

### HTTP Request
**Name:** `http_request`  
**Category:** Network

Make HTTP requests to external APIs and services.

**Parameters:**
- `url` (string, required): The URL to request
- `method` (string, optional): HTTP method (default: GET)
- `headers` (object, optional): Request headers
- `body` (string/object, optional): Request body
- `timeout` (number, optional): Request timeout in milliseconds

**Returns:**
- `status_code`: HTTP response status code
- `headers`: Response headers
- `body`: Response body
- `response_time_ms`: Time taken for the request

### JSON Operations
**Name:** `json_operations`  
**Category:** Data Processing

Parse, validate, and manipulate JSON data.

**Parameters:**
- `operation` (string, required): Operation type (`parse`, `stringify`, `validate`, `query`)
- `data` (string/object, required): JSON data to process
- `query` (string, optional): JSONPath query for data extraction
- `pretty` (boolean, optional): Pretty print JSON output

## Tool Categories

System tools are organized into categories for easier discovery:

- **Web**: Tools for web interactions and search
- **Computation**: Mathematical and computational tools
- **LLM**: Tools for interacting with language models
- **Utility**: General utility functions
- **File System**: File and directory operations
- **Network**: HTTP and network-related tools
- **Data Processing**: Tools for data manipulation and analysis

## Using System Tools in Agents

System tools are automatically available to all agents. To enable a tool for an agent:

1. **Include in Agent Configuration:**
```json
{
  "tools": [
    {
      "name": "web_search",
      "description": "Search for current information",
      "enabled": true
    },
    {
      "name": "calculator",
      "description": "Perform calculations",
      "enabled": true
    }
  ]
}
```

2. **Reference in System Prompt:**
```text
You have access to web search and calculator tools. Use them when you need current information or need to perform calculations.
```

## Tool Execution Flow

1. **Agent Request**: Agent calls a tool with specified parameters
2. **Validation**: Parameters are validated against the tool's schema
3. **Execution**: Tool handler processes the request
4. **Response**: Results are returned to the agent
5. **Integration**: Agent incorporates results into its response

## Error Handling

System tools include robust error handling:

- **Parameter Validation**: Invalid parameters are caught before execution
- **Timeout Protection**: Long-running operations are automatically terminated
- **Rate Limiting**: Tools respect rate limits for external services
- **Fallback Mechanisms**: Alternative approaches when primary methods fail

## Security Considerations

- **Sandboxing**: File operations are restricted to safe directories
- **Input Sanitization**: All inputs are sanitized to prevent injection attacks
- **Access Controls**: Tools respect organization and project permissions
- **Audit Logging**: All tool executions are logged for security monitoring

## Performance Optimization

- **Caching**: Frequently accessed data is cached when appropriate
- **Connection Pooling**: HTTP requests use connection pooling
- **Lazy Loading**: Tools are loaded only when needed
- **Resource Limits**: Memory and CPU usage are monitored and limited

## Custom Tool Integration

While system tools cover common use cases, you can also:

1. **Create Custom Tools**: Develop organization-specific tools
2. **External API Integration**: Use the HTTP request tool for API access
3. **Tool Chaining**: Combine multiple tools for complex operations
4. **Conditional Logic**: Use tools based on specific conditions

System tools provide a solid foundation for agent capabilities while maintaining security, performance, and reliability standards.
