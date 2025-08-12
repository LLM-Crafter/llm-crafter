// Test script to verify agent system is working
// This is just for development testing

const Agent = require("./src/models/Agent");
const Tool = require("./src/models/Tool");
const agentService = require("./src/services/agentService");
const toolService = require("./src/services/toolService");

async function testAgentSystem() {
  console.log("Testing Agent System...");

  try {
    // Test tool service
    console.log("\n1. Testing tool execution...");
    const calculatorResult = await toolService.executeTool("calculator", {
      expression: "2 + 2 * 3",
    });
    console.log("Calculator result:", calculatorResult);

    const timeResult = await toolService.executeTool("current_time", {
      format: "human",
    });
    console.log("Current time result:", timeResult);

    // Test getting available tools
    console.log("\n2. Testing available tools...");
    const tools = await toolService.getAvailableTools();
    console.log(
      "Available tools:",
      tools.map((t) => t.name)
    );

    console.log("\nAgent system test completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  require("dotenv").config();
  const connectDB = require("./src/config/database");
  const { initializeSystemTools } = require("./src/config/systemTools");

  connectDB()
    .then(async () => {
      await initializeSystemTools();
      await testAgentSystem();
      process.exit(0);
    })
    .catch(console.error);
}

module.exports = { testAgentSystem };
