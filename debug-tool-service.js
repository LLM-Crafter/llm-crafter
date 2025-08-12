const toolService = require("./src/services/toolService");

async function testToolServiceExecution() {
  console.log("Testing ToolService.executeToolWithConfig...");

  // Test parameters that should work
  const parameters = {
    endpoint_name: "get_weather",
    method: "GET",
    query_params: {
      q: "London",
      units: "metric",
    },
  };

  // Test config (what should be passed from agent tool config)
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
  };

  try {
    console.log("Calling executeToolWithConfig...");
    const result = await toolService.executeToolWithConfig(
      "api_caller",
      parameters,
      agentToolConfig
    );

    console.log("Tool service result:", JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("✅ Tool executed successfully");
    } else {
      console.log("❌ Tool execution failed:", result.error);
    }
  } catch (error) {
    console.error("Unexpected error:", error.message);
  }

  process.exit(0);
}

testToolServiceExecution();
