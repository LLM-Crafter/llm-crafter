# JSON Processor Tool

Parse, validate, and manipulate JSON data with powerful data extraction capabilities.

## Overview

The JSON Processor tool enables agents to work with JSON data structures, performing operations like parsing, validation, extraction, and stringification. Essential for working with structured data and API responses.

## Configuration

**Category:** Data  
**Tool Name:** `json_processor`

## Parameters

| Parameter   | Type          | Required | Default | Description                                                 |
| ----------- | ------------- | -------- | ------- | ----------------------------------------------------------- |
| `data`      | string/object | Yes      | -       | The JSON data to process                                    |
| `operation` | string        | No       | `parse` | Operation: `parse`, `stringify`, `extract`, `validate`      |
| `path`      | string        | No       | -       | Dot notation path for extract operation (e.g., "user.name") |

## Operations

### Parse

Convert JSON string to object

### Stringify

Convert object to JSON string

### Extract

Extract specific value from JSON using dot notation path

### Validate

Check if data is valid JSON

## Usage Examples

### Parse JSON String

```json
{
  "tool_name": "json_processor",
  "parameters": {
    "data": "{\"name\":\"John\",\"age\":30}",
    "operation": "parse"
  }
}
```

**Response:**

```json
{
  "operation": "parse",
  "result": {
    "name": "John",
    "age": 30
  },
  "success": true
}
```

### Extract Nested Value

```json
{
  "tool_name": "json_processor",
  "parameters": {
    "data": {
      "user": {
        "profile": {
          "name": "Alice",
          "email": "alice@example.com"
        }
      }
    },
    "operation": "extract",
    "path": "user.profile.email"
  }
}
```

**Response:**

```json
{
  "operation": "extract",
  "result": "alice@example.com",
  "success": true
}
```

### Stringify Object

```json
{
  "tool_name": "json_processor",
  "parameters": {
    "data": {
      "status": "active",
      "count": 42
    },
    "operation": "stringify"
  }
}
```

**Response:**

```json
{
  "operation": "stringify",
  "result": "{\"status\":\"active\",\"count\":42}",
  "success": true
}
```

### Validate JSON

```json
{
  "tool_name": "json_processor",
  "parameters": {
    "data": "{\"valid\": true}",
    "operation": "validate"
  }
}
```

**Response:**

```json
{
  "operation": "validate",
  "result": {
    "valid": true,
    "error": null
  },
  "success": true
}
```

## Path Notation

Use dot notation to navigate nested structures:

- `user.name` - Access name property of user object
- `users.0.email` - Access email of first user in array
- `data.items.2.price` - Access price of third item

## Common Use Cases

- **API Response Processing**: Extract data from API responses
- **Data Transformation**: Convert between JSON formats
- **Data Validation**: Verify JSON structure before processing
- **Configuration Parsing**: Parse configuration files
- **Error Handling**: Validate and parse user-provided JSON
- **Data Extraction**: Pull specific values from complex structures

## Configuration in Agents

```json
{
  "name": "data_processor",
  "type": "task",
  "tools": ["json_processor", "api_caller"],
  "system_prompt": "You process and analyze JSON data from various sources..."
}
```

## Best Practices

- **Validate First**: Always validate JSON before parsing
- **Error Handling**: Handle parsing errors gracefully
- **Path Accuracy**: Verify paths exist before extraction
- **Type Awareness**: Be aware of data types in extracted values
- **Size Limits**: Be cautious with very large JSON structures

## Error Handling

Common errors and responses:

- **Invalid JSON**: Returns error with parsing failure details
- **Path Not Found**: Returns null for non-existent paths
- **Type Mismatch**: Returns error if operation not applicable to data type

## Workflow Example

Process API response:

```json
// Step 1: Call API
{
  "tool_name": "api_caller",
  "parameters": {
    "endpoint_name": "get_users"
  }
}

// Step 2: Extract specific data
{
  "tool_name": "json_processor",
  "parameters": {
    "data": "<<API_RESPONSE>>",
    "operation": "extract",
    "path": "data.users.0.email"
  }
}
```

## Related Tools

- [API Caller](/tools/api-caller) - Make HTTP requests that return JSON
- [Webpage Scraper](/tools/webpage-scraper) - Extract JSON data from web pages
- [Calculator](/tools/calculator) - Perform calculations on extracted numbers
