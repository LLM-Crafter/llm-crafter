const Tool = require("../models/Tool");

const systemTools = [
  {
    name: "web_search",
    display_name: "Web Search",
    description: "Search the web for information using a search engine",
    category: "web",
    parameters_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return",
          default: 5,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    return_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              snippet: { type: "string" },
            },
          },
        },
        total_results: { type: "number" },
        search_time_ms: { type: "number" },
      },
    },
    implementation: {
      type: "internal",
      handler: "webSearchHandler",
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: "calculator",
    display_name: "Calculator",
    description: "Perform mathematical calculations and evaluate expressions",
    category: "computation",
    parameters_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(30)")',
        },
      },
      required: ["expression"],
      additionalProperties: false,
    },
    return_schema: {
      type: "object",
      properties: {
        expression: { type: "string" },
        result: { type: "number" },
        type: { type: "string" },
      },
    },
    implementation: {
      type: "internal",
      handler: "calculatorHandler",
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: "llm_prompt",
    display_name: "LLM Prompt",
    description:
      "Execute a prompt using an LLM provider (integrates with existing proxy system)",
    category: "llm",
    parameters_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt to send to the LLM",
        },
        system_prompt: {
          type: "string",
          description: "Optional system prompt",
        },
        model: {
          type: "string",
          description: "Model to use",
          default: "gpt-4o-mini",
        },
        temperature: {
          type: "number",
          description: "Temperature for response generation",
          default: 0.7,
          minimum: 0,
          maximum: 2,
        },
        max_tokens: {
          type: "number",
          description: "Maximum tokens in response",
          default: 1000,
          minimum: 1,
        },
        api_key_id: {
          type: "string",
          description: "API key ID to use for the request",
        },
      },
      required: ["prompt", "api_key_id"],
      additionalProperties: false,
    },
    return_schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        response: { type: "string" },
        model: { type: "string" },
        usage: {
          type: "object",
          properties: {
            prompt_tokens: { type: "number" },
            completion_tokens: { type: "number" },
            total_tokens: { type: "number" },
            cost: { type: "number" },
          },
        },
        finish_reason: { type: "string" },
      },
    },
    implementation: {
      type: "internal",
      handler: "llmPromptHandler",
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: "current_time",
    display_name: "Current Time",
    description: "Get the current date and time in various formats",
    category: "utility",
    parameters_schema: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: 'Timezone (e.g., "UTC", "America/New_York")',
          default: "UTC",
        },
        format: {
          type: "string",
          description: "Output format: iso, unix, human",
          enum: ["iso", "unix", "human"],
          default: "iso",
        },
      },
      additionalProperties: false,
    },
    return_schema: {
      type: "object",
      properties: {
        timestamp: { type: "string" },
        timezone: { type: "string" },
        format: { type: "string" },
        unix_timestamp: { type: "number" },
        iso_string: { type: "string" },
      },
    },
    implementation: {
      type: "internal",
      handler: "currentTimeHandler",
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: "json_processor",
    display_name: "JSON Processor",
    description: "Parse, validate, and manipulate JSON data",
    category: "data",
    parameters_schema: {
      type: "object",
      properties: {
        data: {
          description: "The JSON data to process (string or object)",
        },
        operation: {
          type: "string",
          description: "Operation to perform",
          enum: ["parse", "stringify", "extract", "validate"],
          default: "parse",
        },
        path: {
          type: "string",
          description:
            'Dot notation path for extract operation (e.g., "user.name")',
        },
      },
      required: ["data"],
      additionalProperties: false,
    },
    return_schema: {
      type: "object",
      properties: {
        operation: { type: "string" },
        result: {},
        success: { type: "boolean" },
      },
    },
    implementation: {
      type: "internal",
      handler: "jsonProcessorHandler",
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: "api_caller",
    display_name: "API Caller",
    description:
      "Make HTTP requests to pre-configured API endpoints with authentication",
    category: "communication",
    parameters_schema: {
      type: "object",
      properties: {
        endpoint_name: {
          type: "string",
          description: "Name of the pre-configured endpoint to call",
        },
        method: {
          type: "string",
          description: "HTTP method to use",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          default: "GET",
        },
        path_params: {
          type: "object",
          description:
            "Path parameters to replace in URL (e.g., {id} -> path_params: {id: '123'})",
          default: {},
        },
        query_params: {
          type: "object",
          description: "Query parameters to append to URL",
          default: {},
        },
        body_data: {
          description: "Request body data (for POST/PUT/PATCH requests)",
        },
        headers: {
          type: "object",
          description: "Additional headers to include in request",
          default: {},
        },
      },
      required: ["endpoint_name"],
      additionalProperties: false,
    },
    return_schema: {
      type: "object",
      properties: {
        endpoint_name: { type: "string" },
        url: { type: "string" },
        method: { type: "string" },
        status_code: { type: "number" },
        status_text: { type: "string" },
        success: { type: "boolean" },
        headers: { type: "object" },
        data: {},
        execution_time_ms: { type: "number" },
      },
    },
    implementation: {
      type: "internal",
      handler: "apiCallerHandler",
      config: {
        endpoints: {},
        authentication: {},
        timeout: 30000,
      },
    },
    is_system_tool: true,
  },
  {
    name: "faq",
    display_name: "FAQ",
    description:
      "Answer questions using pre-configured frequently asked questions and answers",
    category: "knowledge",
    parameters_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The user's question to search for in the FAQ",
        },
        search_threshold: {
          type: "number",
          description: "Minimum similarity threshold for FAQ matching (0-1)",
          default: 0.2,
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
    return_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        matched_faq: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
            category: { type: "string" },
            confidence: { type: "number" },
          },
        },
        all_matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              category: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
        success: { type: "boolean" },
        execution_time_ms: { type: "number" },
      },
    },
    implementation: {
      type: "internal",
      handler: "faqHandler",
      config: {
        faqs: [],
        enable_partial_matching: true,
        default_threshold: 0.7,
      },
    },
    is_system_tool: true,
  },
];

async function initializeSystemTools() {
  console.log("Initializing system tools...");

  for (const toolData of systemTools) {
    try {
      // Check if tool already exists
      const existingTool = await Tool.findOne({ name: toolData.name });

      if (existingTool) {
        // Update existing tool if it's a system tool
        if (existingTool.is_system_tool) {
          await Tool.findOneAndUpdate(
            { name: toolData.name },
            { ...toolData, updatedAt: new Date() },
            { new: true }
          );
          console.log(`Updated system tool: ${toolData.name}`);
        } else {
          console.log(`Skipped non-system tool: ${toolData.name}`);
        }
      } else {
        // Create new tool
        const tool = new Tool(toolData);
        await tool.save();
        console.log(`Created system tool: ${toolData.name}`);
      }
    } catch (error) {
      console.error(`Error initializing tool ${toolData.name}:`, error.message);
    }
  }

  console.log("System tools initialization completed");
}

module.exports = {
  initializeSystemTools,
  systemTools,
};
