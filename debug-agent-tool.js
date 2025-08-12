const mongoose = require("mongoose");
const toolService = require("./src/services/toolService");

// Connect to MongoDB without auth
mongoose
  .connect("mongodb://localhost:27017/llm-crafter", {
    authSource: "admin",
  })
  .catch(() => {
    console.log("MongoDB connection failed, continuing with tool test...");
  });

async function testApiCallerTool() {
  console.log("Testing API caller tool directly...");

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
  const config = {
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
    console.log(
      "Calling api_caller with parameters:",
      JSON.stringify(parameters, null, 2)
    );
    console.log("Config:", JSON.stringify(config, null, 2));

    // Call the handler directly
    const result = await toolService.toolHandlers.get("api_caller")(
      parameters,
      config
    );

    console.log("Tool result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Tool execution error:", error.message);
    console.error("Stack:", error.stack);
  }

  process.exit(0);
}

testApiCallerTool();
