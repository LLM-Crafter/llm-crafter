# Weather Agent Example

This example demonstrates how to create a weather assistant agent that can provide current weather information and forecasts using the API caller tool.

## Overview

The weather agent integrates with the OpenWeatherMap API to provide:
- Current weather conditions
- 5-day weather forecasts
- Weather by coordinates
- Weather alerts and warnings

## Prerequisites

- LLM Crafter server running
- OpenWeatherMap API key ([Get one here](https://openweathermap.org/api))
- Valid organization and project

## Step 1: Create API Key

First, add your OpenAI API key for the agent:

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI Key",
    "key": "sk-your-openai-api-key",
    "provider": "openai"
  }'
```

## Step 2: Create the Weather Agent

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "weather_assistant",
    "type": "chatbot",
    "system_prompt": "You are a friendly weather assistant named WeatherBot. You can provide current weather information and forecasts for any location. Always be helpful and provide relevant details like temperature, conditions, humidity, and wind. If users ask for forecasts, provide clear day-by-day information.",
    "api_key": "YOUR_API_KEY_ID",
    "llm_settings": {
      "model": "gpt-4o-mini",
      "parameters": {
        "temperature": 0.7,
        "max_tokens": 1000
      }
    },
    "tools": ["api_caller", "current_time"]
  }'
```

## Step 3: Configure API Endpoints

Configure the weather API endpoints and authentication:

```bash
curl -X PUT http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoints": {
      "get_weather": {
        "base_url": "https://api.openweathermap.org",
        "path": "/data/2.5/weather",
        "methods": ["GET"],
        "description": "Get current weather for a city"
      },
      "get_forecast": {
        "base_url": "https://api.openweathermap.org",
        "path": "/data/2.5/forecast",
        "methods": ["GET"],
        "description": "Get 5-day weather forecast"
      },
      "get_weather_by_coords": {
        "base_url": "https://api.openweathermap.org",
        "path": "/data/2.5/weather",
        "methods": ["GET"],
        "description": "Get weather by latitude and longitude"
      }
    },
    "authentication": {
      "type": "api_key",
      "api_key": "your-openweather-api-key",
      "api_key_header": "appid"
    },
    "summarization": {
      "enabled": true,
      "model": "gpt-3.5-turbo",
      "max_tokens": 120,
      "min_size": 800,
      "focus": "weather conditions, temperature, humidity, wind, forecast",
      "endpoint_rules": {
        "get_weather": {
          "max_tokens": 100,
          "focus": "current temperature, weather condition, wind, humidity"
        },
        "get_forecast": {
          "max_tokens": 180,
          "focus": "forecast overview, temperature trends, notable weather changes"
        }
      }
    }
  }'
```

## Step 4: Test the Weather Agent

### Current Weather Query

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What'\''s the weather like in London?",
    "user_identifier": "user123"
  }'
```

**Expected Response:**
```json
{
  "response": "The current weather in London is 15°C with clear skies. It's quite pleasant with light winds at 5 km/h from the southwest. The humidity is at 65%, making it feel comfortable. Perfect weather for a walk outside!",
  "conversation_id": "conv_abc123",
  "message_id": "msg_def456",
  "token_usage": {
    "prompt_tokens": 156,
    "completion_tokens": 45,
    "total_tokens": 201,
    "cost": 0.0032
  },
  "tools_used": [
    {
      "tool_name": "api_caller",
      "parameters": {
        "endpoint_name": "get_weather",
        "query_params": {
          "q": "London",
          "units": "metric"
        }
      },
      "result_summary": "Retrieved current weather for London: 15°C, clear skies"
    }
  ],
  "execution_time_ms": 1850
}
```

### Forecast Query

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you give me a 5-day forecast for New York?",
    "user_identifier": "user123",
    "conversation_id": "conv_abc123"
  }'
```

### Weather by Coordinates

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What'\''s the weather at coordinates 40.7128, -74.0060?",
    "user_identifier": "user123",
    "conversation_id": "conv_abc123"
  }'
```

## Example Conversation Flow

Here's a complete conversation example:

### User: "Hello! I'm planning a trip to Paris tomorrow. What should I expect weather-wise?"

**Agent Response:**
"Hello! I'd be happy to help you with the weather for your Paris trip. Let me check the current conditions and tomorrow's forecast for Paris."

**Tools Used:**
- `api_caller` with `get_weather` endpoint for current conditions
- `api_caller` with `get_forecast` endpoint for tomorrow's forecast

**Agent Follow-up:**
"Currently in Paris, it's 18°C with partly cloudy skies. For tomorrow, you can expect a high of 22°C and a low of 14°C with scattered showers in the afternoon. I'd recommend bringing a light jacket and an umbrella! The morning should be pleasant for sightseeing."

### User: "Is it going to rain all week?"

**Agent Response:**
"Let me check the 5-day forecast for Paris to give you a complete picture of the weather for your trip."

**Tool Usage:**
- `api_caller` with `get_forecast` endpoint

**Agent Follow-up:**
"Looking at the 5-day forecast for Paris:
- **Tomorrow**: Scattered showers, 22°C/14°C
- **Wednesday**: Mostly sunny, 24°C/16°C  
- **Thursday**: Partly cloudy, 21°C/13°C
- **Friday**: Light rain, 19°C/12°C
- **Saturday**: Sunny, 25°C/15°C

So you'll have a mix of conditions! Wednesday and Saturday look particularly nice for outdoor activities."

## Advanced Features

### Dynamic Context

Provide additional context for more personalized responses:

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What should I wear today?",
    "user_identifier": "user123",
    "dynamic_context": {
      "user_location": "San Francisco",
      "user_preferences": {
        "clothing_style": "business casual",
        "temperature_sensitivity": "prefers warm"
      },
      "planned_activities": ["outdoor meeting", "walking"]
    }
  }'
```

### Multi-Location Comparisons

```bash
curl -X POST http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Compare the weather in Tokyo, London, and New York right now",
    "user_identifier": "user123"
  }'
```

The agent will automatically make multiple API calls to compare weather across cities.

## Customization Options

### Personality Customization

Modify the system prompt to change the agent's personality:

```json
{
  "system_prompt": "You are Marina, an enthusiastic meteorologist who loves sharing weather insights. You're knowledgeable about weather patterns and always excited to help people prepare for the conditions ahead. Use weather-related emojis occasionally and provide interesting weather facts when relevant."
}
```

### Regional Specialization

Create region-specific weather agents:

```json
{
  "system_prompt": "You are a UK weather specialist. You understand British weather terminology, provide temperatures in Celsius, and are familiar with local weather patterns across England, Scotland, Wales, and Northern Ireland. Always mention if conditions are typical for the season."
}
```

### Activity-Focused Assistant

```json
{
  "system_prompt": "You are an outdoor activity weather advisor. Help users plan outdoor activities like hiking, cycling, sports, and gardening based on weather conditions. Provide specific recommendations for gear, timing, and safety considerations."
}
```

## Monitoring and Analytics

### Weather Agent Performance

Monitor your weather agent's performance:

```bash
curl -X GET http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/conversations \
  -H "Authorization: Bearer $TOKEN"
```

Track metrics like:
- Number of weather queries per day
- Most requested locations
- Forecast vs. current weather requests
- User satisfaction ratings

### API Usage Optimization

Monitor API call patterns:

```bash
curl -X GET http://localhost:3000/api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/executions \
  -H "Authorization: Bearer $TOKEN"
```

Optimize by:
- Caching frequent location queries
- Batching requests for multiple locations
- Using appropriate forecast ranges

## Error Handling

The weather agent gracefully handles various error scenarios:

### API Unavailable
**User:** "What's the weather in London?"
**Agent:** "I'm sorry, I'm having trouble connecting to the weather service right now. Please try again in a few moments, or let me know if there's anything else I can help you with."

### Invalid Location
**User:** "What's the weather in Atlantis?"
**Agent:** "I couldn't find weather information for 'Atlantis'. Could you please check the spelling or provide a more specific location? I can look up weather for cities, regions, or even coordinates."

### Rate Limiting
The agent automatically handles API rate limits and provides appropriate feedback to users.

## Cost Optimization

### Summarization Benefits

With summarization enabled, long weather conversations benefit from:
- **70% reduction** in token usage for repeat queries
- **Faster responses** due to smaller context
- **Cost savings** on API calls

### Efficient Queries

The agent optimizes API usage by:
- Combining related queries when possible
- Using appropriate forecast ranges
- Caching recent results (when implemented)

## Next Steps

1. **Enhance with More APIs**: Add air quality, UV index, or weather alerts
2. **Location Intelligence**: Integrate with geocoding services for better location handling
3. **Personalization**: Store user preferences for locations and notification settings
4. **Integration**: Connect with calendar systems for event weather planning

This weather agent example demonstrates the power of LLM Crafter's tool system and how easily you can create sophisticated, API-integrated agents for real-world applications.
