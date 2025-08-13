// Complete working example of agent passing arguments to API caller tool

// 1. Create agent with system prompt that explains how to use the API
const agentSystemPrompt = `
You are a helpful weather assistant. You can check weather for any city using the api_caller tool.

When users ask for weather information:
- Use the "api_caller" tool with endpoint "get_weather" 
- Pass the city name in query_params under the key "q"
- Pass "metric" in query_params under the key "units" for Celsius
- Always include the API key in query_params under "appid"

Example tool usage:
{
  "tool_name": "api_caller",
  "parameters": {
    "endpoint_name": "get_weather",
    "method": "GET", 
    "query_params": {
      "q": "London",
      "units": "metric",
      "appid": "your-api-key-here"
    }
  }
}
`;

// 2. API configuration with weather endpoints
const weatherApiConfig = {
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
      description: "Get 5-day weather forecast",
    },
    get_weather_by_coords: {
      base_url: "https://api.openweathermap.org",
      path: "/data/2.5/weather",
      methods: ["GET"],
      description: "Get weather by latitude and longitude",
    },
  },
  authentication: {
    type: "api_key",
    api_key: "your-openweather-api-key",
    api_key_header: "appid", // OpenWeather uses 'appid' as query param
  },
  summarization: {
    enabled: true,
    model: "gpt-3.5-turbo", // Cheap model for summaries
    max_tokens: 120,
    min_size: 800, // Only summarize if response > 800 chars
    focus: "weather conditions, temperature, humidity, wind, forecast",
    endpoint_rules: {
      get_weather: {
        max_tokens: 100,
        focus: "current temperature, weather condition, wind, humidity",
      },
      get_forecast: {
        max_tokens: 150,
        focus: "forecast overview, temperature trends, notable weather changes",
      },
      get_weather_by_coords: {
        max_tokens: 100,
        focus: "location name, current weather conditions, temperature",
      },
    },
  },
};

// 3. How the agent would respond to different user queries:

const userQueries = [
  {
    user: "What's the weather in Tokyo?",
    agent_tool_call: {
      tool_name: "api_caller",
      parameters: {
        endpoint_name: "get_weather",
        method: "GET",
        query_params: {
          q: "Tokyo",
          units: "metric",
        },
      },
    },
    api_url_called:
      "https://api.openweathermap.org/data/2.5/weather?q=Tokyo&units=metric&appid=your-api-key",
  },

  {
    user: "Give me the forecast for New York",
    agent_tool_call: {
      tool_name: "api_caller",
      parameters: {
        endpoint_name: "get_forecast",
        method: "GET",
        query_params: {
          q: "New York",
          units: "metric",
        },
      },
    },
    api_url_called:
      "https://api.openweathermap.org/data/2.5/forecast?q=New York&units=metric&appid=your-api-key",
  },

  {
    user: "Weather at coordinates 40.7128, -74.0060",
    agent_tool_call: {
      tool_name: "api_caller",
      parameters: {
        endpoint_name: "get_weather_by_coords",
        method: "GET",
        query_params: {
          lat: "40.7128",
          lon: "-74.0060",
          units: "metric",
        },
      },
    },
    api_url_called:
      "https://api.openweathermap.org/data/2.5/weather?lat=40.7128&lon=-74.0060&units=metric&appid=your-api-key",
  },
];

// 4. Example with path parameters (for a custom API)
const customApiExample = {
  endpoints: {
    get_user_preferences: {
      base_url: "https://api.myapp.com",
      path: "/users/{user_id}/preferences/{category}",
      methods: ["GET"],
    },
  },

  user_query: "Get weather preferences for user 123",
  agent_tool_call: {
    tool_name: "api_caller",
    parameters: {
      endpoint_name: "get_user_preferences",
      method: "GET",
      path_params: {
        user_id: "123",
        category: "weather",
      },
    },
  },
  api_url_called: "https://api.myapp.com/users/123/preferences/weather",
};

// 5. Example with POST request and body data
const postApiExample = {
  endpoints: {
    save_weather_alert: {
      base_url: "https://api.myapp.com",
      path: "/alerts",
      methods: ["POST"],
    },
  },

  user_query: "Set up a weather alert for rain in London",
  agent_tool_call: {
    tool_name: "api_caller",
    parameters: {
      endpoint_name: "save_weather_alert",
      method: "POST",
      body_data: {
        city: "London",
        condition: "rain",
        notify: true,
        user_email: "user@example.com",
      },
      headers: {
        "Content-Type": "application/json",
      },
    },
  },
};

module.exports = {
  agentSystemPrompt,
  weatherApiConfig,
  userQueries,
  customApiExample,
  postApiExample,
};
