# Test API Endpoints for Summarization Configuration

## 1. Configure API Endpoints with Summarization

### PUT `/api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config`

```json
{
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
    "max_tokens": 150,
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
}
```

**Expected Response:**

```json
{
  "message": "API configuration updated successfully",
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
    }
  },
  "authentication": {
    "type": "api_key"
  },
  "summarization": {
    "enabled": true,
    "model": "gpt-3.5-turbo",
    "max_tokens": 150,
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
}
```

## 2. Get API Configuration with Summarization

### GET `/api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config`

**Expected Response:**

```json
{
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
    }
  },
  "authentication": {
    "type": "api_key",
    "configured": true
  },
  "summarization": {
    "enabled": true,
    "model": "gpt-3.5-turbo",
    "max_tokens": 150,
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
}
```

## 3. Update Only Summarization (Partial Update)

### PUT `/api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/api-config`

```json
{
  "summarization": {
    "enabled": false,
    "max_tokens": 200
  }
}
```

**Expected Response:**

```json
{
  "message": "API configuration updated successfully",
  "endpoints": {},
  "authentication": {},
  "summarization": {
    "enabled": false,
    "max_tokens": 200
  }
}
```

## 4. Error Validation Examples

### Invalid max_tokens

```json
{
  "summarization": {
    "enabled": true,
    "max_tokens": 1500 // Too high
  }
}
```

**Expected Error Response:**

```json
{
  "error": "Summarization 'max_tokens' must be a number between 10 and 1000"
}
```

### Invalid endpoint rules

```json
{
  "summarization": {
    "enabled": true,
    "endpoint_rules": {
      "get_weather": {
        "max_tokens": 5 // Too low
      }
    }
  }
}
```

**Expected Error Response:**

```json
{
  "error": "Endpoint rule 'get_weather' max_tokens must be a number between 10 and 1000"
}
```

## 5. Frontend Integration Examples

### JavaScript Fetch Example

```javascript
// Configure summarization
const response = await fetch(
  `/api/organizations/${orgId}/projects/${projectId}/agents/${agentId}/api-config`,
  {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      summarization: {
        enabled: true,
        max_tokens: 150,
        min_size: 800,
        focus: "key weather information",
        endpoint_rules: {
          get_weather: {
            max_tokens: 100,
            focus: "temperature and conditions",
          },
        },
      },
    }),
  }
);

const result = await response.json();
console.log("Summarization configured:", result);
```

### React Hook Example

```javascript
const useSummarizationConfig = (orgId, projectId, agentId) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  const updateSummarization = async (summarizationConfig) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/agents/${agentId}/api-config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summarization: summarizationConfig }),
        }
      );
      const result = await response.json();
      setConfig(result.summarization);
      return result;
    } finally {
      setLoading(false);
    }
  };

  return { config, updateSummarization, loading };
};
```
