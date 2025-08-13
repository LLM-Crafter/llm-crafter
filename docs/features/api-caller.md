# API Caller Tool

The API Caller Tool is a specialized system tool that enables agents to interact with external APIs in a structured and secure manner. It provides a standardized way to make HTTP requests, handle authentication, and process responses.

## Overview

The API Caller Tool abstracts the complexity of API interactions, providing:

- **Unified Interface**: Consistent API calling across different services
- **Authentication Management**: Automatic handling of various auth methods
- **Response Processing**: Intelligent parsing and error handling
- **Security Controls**: Request validation and rate limiting
- **Monitoring**: Request tracking and performance metrics

## Features

### Multi-Protocol Support
- **REST APIs**: Full support for RESTful web services
- **GraphQL**: Query and mutation support
- **SOAP**: Legacy SOAP service integration
- **Webhooks**: Outbound webhook calls

### Authentication Methods
- **API Keys**: Header, query parameter, or custom placement
- **Bearer Tokens**: JWT and other bearer token formats
- **OAuth 2.0**: Full OAuth 2.0 flow support
- **Basic Auth**: Username/password authentication
- **Custom Headers**: Flexible authentication header support

### Request Formats
- **JSON**: Automatic JSON serialization/deserialization
- **XML**: XML request and response handling
- **Form Data**: URL-encoded and multipart form data
- **Plain Text**: Raw text requests

## Configuration

### Basic API Configuration

```json
{
  "name": "api_caller",
  "parameters": {
    "url": "https://api.example.com/v1/users",
    "method": "GET",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer ${API_TOKEN}"
    }
  }
}
```

### Advanced Configuration

```json
{
  "name": "api_caller",
  "parameters": {
    "url": "https://api.example.com/v1/data",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "X-API-Key": "${API_KEY}"
    },
    "body": {
      "query": "user data",
      "filters": {
        "active": true,
        "created_after": "2024-01-01"
      }
    },
    "timeout": 30000,
    "retry_attempts": 3,
    "retry_delay": 1000
  }
}
```

## Parameters

### Required Parameters
- **url** (string): The API endpoint URL
- **method** (string): HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)

### Optional Parameters
- **headers** (object): Request headers
- **body** (string/object): Request body
- **query_params** (object): URL query parameters
- **timeout** (number): Request timeout in milliseconds (default: 30000)
- **retry_attempts** (number): Number of retry attempts (default: 1)
- **retry_delay** (number): Delay between retries in milliseconds (default: 1000)
- **follow_redirects** (boolean): Follow HTTP redirects (default: true)
- **validate_ssl** (boolean): Validate SSL certificates (default: true)

### Authentication Parameters
- **auth_type** (string): Authentication method (`bearer`, `api_key`, `basic`, `oauth2`)
- **auth_config** (object): Authentication configuration specific to the auth type

## Response Format

The API Caller Tool returns a standardized response:

```json
{
  "success": true,
  "status_code": 200,
  "headers": {
    "content-type": "application/json",
    "x-rate-limit-remaining": "99"
  },
  "body": {
    "data": [...],
    "meta": {...}
  },
  "response_time_ms": 245,
  "request_id": "req_123456789"
}
```

### Response Fields
- **success** (boolean): Whether the request was successful
- **status_code** (number): HTTP response status code
- **headers** (object): Response headers
- **body** (any): Parsed response body
- **response_time_ms** (number): Request duration
- **request_id** (string): Unique identifier for tracking
- **error** (object): Error details if the request failed

## Error Handling

### HTTP Errors
```json
{
  "success": false,
  "status_code": 404,
  "error": {
    "type": "http_error",
    "message": "Resource not found",
    "details": {
      "url": "https://api.example.com/v1/nonexistent",
      "method": "GET"
    }
  }
}
```

### Network Errors
```json
{
  "success": false,
  "error": {
    "type": "network_error",
    "message": "Connection timeout",
    "details": {
      "timeout": 30000,
      "attempts": 3
    }
  }
}
```

### Authentication Errors
```json
{
  "success": false,
  "status_code": 401,
  "error": {
    "type": "auth_error",
    "message": "Invalid API key",
    "details": {
      "auth_type": "api_key"
    }
  }
}
```

## Use Cases

### Data Retrieval
```json
{
  "name": "api_caller",
  "parameters": {
    "url": "https://jsonplaceholder.typicode.com/posts",
    "method": "GET",
    "query_params": {
      "userId": 1,
      "limit": 10
    }
  }
}
```

### Data Submission
```json
{
  "name": "api_caller",
  "parameters": {
    "url": "https://api.example.com/v1/users",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user"
    }
  }
}
```

### File Upload
```json
{
  "name": "api_caller",
  "parameters": {
    "url": "https://api.example.com/v1/upload",
    "method": "POST",
    "headers": {
      "Content-Type": "multipart/form-data"
    },
    "body": {
      "file": "@/path/to/file.pdf",
      "description": "Document upload"
    }
  }
}
```

## Security Features

### Request Validation
- **URL Validation**: Ensures URLs are properly formatted and safe
- **Header Sanitization**: Removes potentially dangerous headers
- **Body Size Limits**: Prevents oversized requests
- **Timeout Enforcement**: Prevents hanging requests

### Access Controls
- **Domain Whitelisting**: Restrict calls to approved domains
- **Rate Limiting**: Prevent abuse with request throttling
- **User Permissions**: Respect user and organization permissions
- **Audit Logging**: Log all API calls for security monitoring

### Data Protection
- **Credential Masking**: Hide sensitive data in logs
- **Response Filtering**: Remove sensitive information from responses
- **Encryption**: Encrypt sensitive data in transit and at rest

## Performance Optimization

### Connection Management
- **Connection Pooling**: Reuse connections for better performance
- **Keep-Alive**: Maintain persistent connections
- **DNS Caching**: Cache DNS lookups
- **Compression**: Support gzip/deflate compression

### Caching
- **Response Caching**: Cache GET responses when appropriate
- **Cache Headers**: Respect cache control headers
- **ETag Support**: Use ETags for conditional requests
- **TTL Management**: Automatic cache expiration

### Monitoring
- **Performance Metrics**: Track response times and success rates
- **Error Tracking**: Monitor and alert on error patterns
- **Usage Analytics**: Track API usage patterns
- **Health Checks**: Monitor external API availability

## Best Practices

### Request Design
1. **Use Appropriate Methods**: GET for retrieval, POST for creation
2. **Include Error Handling**: Always check the success field
3. **Set Reasonable Timeouts**: Balance responsiveness with reliability
4. **Implement Retries**: Use exponential backoff for retries

### Security
1. **Validate Inputs**: Sanitize all user inputs
2. **Use HTTPS**: Always use secure connections
3. **Rotate Credentials**: Regularly update API keys and tokens
4. **Monitor Usage**: Track API calls for unusual patterns

### Performance
1. **Cache When Possible**: Use caching for repeated requests
2. **Batch Requests**: Combine multiple operations when supported
3. **Use Pagination**: Handle large datasets with pagination
4. **Monitor Rate Limits**: Respect API rate limiting

The API Caller Tool provides a robust foundation for integrating external services into your LLM agents while maintaining security, performance, and reliability standards.
