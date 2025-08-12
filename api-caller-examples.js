// Example of how to use the API caller tool with agents

const exampleApiConfiguration = {
  // Example: Configure endpoints for a weather API
  endpoints: {
    get_weather: {
      base_url: "https://api.openweathermap.org",
      path: "/data/2.5/weather",
      methods: ["GET"],
      description: "Get current weather for a city",
    },
    get_forecast: {
      base_url: "https://api.openweathermap.org",
      path: "/data/2.5/forecast",
      methods: ["GET"],
      description: "Get weather forecast for a city",
    },
    create_user: {
      base_url: "https://api.example.com",
      path: "/users",
      methods: ["POST"],
      description: "Create a new user",
    },
    get_user: {
      base_url: "https://api.example.com",
      path: "/users/{user_id}",
      methods: ["GET"],
      description: "Get user by ID",
    },
    update_user: {
      base_url: "https://api.example.com",
      path: "/users/{user_id}",
      methods: ["PUT", "PATCH"],
      description: "Update user information",
    },
  },

  // Authentication examples
  authentication: {
    // Bearer token example
    type: "bearer_token",
    token: "your-bearer-token-here",

    // OR API key example
    // type: "api_key",
    // api_key: "your-api-key-here",
    // api_key_header: "X-API-Key"  // optional, defaults to X-API-Key

    // OR Cookie example
    // type: "cookie",
    // cookie: "session=abc123; auth=xyz789"
  },
};

const exampleAgentToolUsage = {
  // How the agent would use the API caller tool
  toolCalls: [
    {
      tool_name: "api_caller",
      parameters: {
        endpoint_name: "get_weather",
        method: "GET",
        query_params: {
          q: "London",
          appid: "api-key-here",
          units: "metric",
        },
      },
    },
    {
      tool_name: "api_caller",
      parameters: {
        endpoint_name: "get_user",
        method: "GET",
        path_params: {
          user_id: "123",
        },
      },
    },
    {
      tool_name: "api_caller",
      parameters: {
        endpoint_name: "create_user",
        method: "POST",
        body_data: {
          name: "John Doe",
          email: "john@example.com",
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    },
  ],
};

const exampleApiResponses = {
  // What the tool would return
  weatherResponse: {
    endpoint_name: "get_weather",
    url: "https://api.openweathermap.org/data/2.5/weather?q=London&appid=api-key-here&units=metric",
    method: "GET",
    status_code: 200,
    status_text: "OK",
    success: true,
    headers: {
      "content-type": "application/json",
    },
    data: {
      coord: { lon: -0.1257, lat: 51.5085 },
      weather: [{ main: "Clear", description: "clear sky" }],
      main: { temp: 15.2, humidity: 65 },
      name: "London",
    },
    execution_time_ms: 234,
  },

  userResponse: {
    endpoint_name: "get_user",
    url: "https://api.example.com/users/123",
    method: "GET",
    status_code: 200,
    status_text: "OK",
    success: true,
    headers: {
      "content-type": "application/json",
    },
    data: {
      id: 123,
      name: "John Doe",
      email: "john@example.com",
      created_at: "2025-08-12T10:00:00Z",
    },
    execution_time_ms: 156,
  },
};

// Instructions for using the API caller tool:

/*
1. Create an agent with the api_caller tool:
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents
{
  "name": "weather_assistant",
  "type": "chatbot",
  "system_prompt": "You are a weather assistant that can check weather and manage users. Use the api_caller tool to fetch weather data and user information.",
  "api_key": "your-llm-api-key-id",
  "llm_settings": {
    "model": "gpt-4o-mini",
    "parameters": {
      "temperature": 0.7
    }
  },
  "tools": ["api_caller"]
}

2. Configure API endpoints for the agent:
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config
{
  "endpoints": {
    "get_weather": {
      "base_url": "https://api.openweathermap.org",
      "path": "/data/2.5/weather", 
      "methods": ["GET"]
    }
  },
  "authentication": {
    "type": "bearer_token",
    "token": "your-api-token"
  }
}

3. Chat with the agent:
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat
{
  "message": "What's the weather like in London?",
  "user_identifier": "user@example.com"
}

The agent will:
- Understand the request needs weather data
- Use the api_caller tool with the get_weather endpoint
- Make the API call with proper authentication
- Process the response and provide a natural language answer
*/

module.exports = {
  exampleApiConfiguration,
  exampleAgentToolUsage,
  exampleApiResponses,
};
