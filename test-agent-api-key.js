const toolService = require("./src/services/toolService");

async function testWithAgentApiKey() {
  console.log("Testing summarization with simulated agent API key...");

  // Test parameters that should work
  const parameters = {
    endpoint_name: "get_weather",
    method: "GET",
    query_params: {
      q: "London",
      units: "metric",
    },
  };

  // Simulate what agent service would pass (including _agent_api_key)
  const agentToolConfig = {
    endpoints: {
      get_weather: {
        base_url: "https://api.openweathermap.org",
        path: "/data/2.5/weather",
        methods: ["GET"],
      },
    },
    authentication: {
      type: "api_key",
      api_key: "test-key-123",
      api_key_header: "appid",
    },
    summarization: {
      enabled: true,
      model: "gpt-3.5-turbo",
      max_tokens: 100,
      min_size: 500,
      focus: "weather conditions, temperature",
      endpoint_rules: {
        get_weather: {
          max_tokens: 80,
          focus: "temperature, weather condition, wind",
        },
      },
    },
    // This is what the agent service would add
    _agent_api_key: {
      key: "test-openai-key",
      provider: "openai",
    },
  };

  try {
    console.log("Calling executeToolWithConfig with agent API key...");
    const result = await toolService.executeToolWithConfig(
      "api_caller",
      parameters,
      agentToolConfig
    );

    console.log("Tool service result with agent API key:");
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.result._summarized) {
      console.log("✅ Summarization used agent API key!");
    } else {
      console.log("ℹ️ Fell back to simple summarization");
    }
  } catch (error) {
    console.error("Test failed:", error.message);
  }

  process.exit(0);
}

testWithAgentApiKey();
