const Tool = require("../models/Tool");
const OpenAIService = require("./openaiService");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const ApiKey = require("../models/ApiKey");

class ToolService {
  constructor() {
    this.toolHandlers = new Map();
    this.initializeSystemTools();
  }

  /**
   * Initialize built-in system tools
   */
  initializeSystemTools() {
    // Web search tool
    this.registerToolHandler("web_search", this.webSearchHandler.bind(this));

    // Calculator tool
    this.registerToolHandler("calculator", this.calculatorHandler.bind(this));

    // LLM prompt tool (uses existing proxy system)
    this.registerToolHandler("llm_prompt", this.llmPromptHandler.bind(this));

    // Current time tool
    this.registerToolHandler(
      "current_time",
      this.currentTimeHandler.bind(this)
    );

    // JSON processor tool
    this.registerToolHandler(
      "json_processor",
      this.jsonProcessorHandler.bind(this)
    );

    // API caller tool
    this.registerToolHandler("api_caller", this.apiCallerHandler.bind(this));
  }

  /**
   * Register a new tool handler
   */
  registerToolHandler(toolName, handler) {
    this.toolHandlers.set(toolName, handler);
  }

  /**
   * Execute a tool by name with parameters
   */
  async executeTool(toolName, parameters = {}) {
    return this.executeToolWithConfig(toolName, parameters, {});
  }

  /**
   * Execute a tool with agent-specific configuration
   */
  async executeToolWithConfig(toolName, parameters = {}, agentToolConfig = {}) {
    const startTime = Date.now();

    try {
      console.log(`Executing tool '${toolName}' with parameters:`, parameters);
      console.log(`Agent tool config:`, agentToolConfig);

      // Get tool handler
      const handler = this.toolHandlers.get(toolName);
      if (!handler) {
        throw new Error(`No handler registered for tool '${toolName}'`);
      }

      // For built-in tools, use agent config directly
      // Try to get tool definition from database for validation/logging, but don't fail if DB is unavailable
      let tool = null;
      let baseConfig = {};

      try {
        tool = await Tool.findOne({ name: toolName, is_active: true });
        if (tool) {
          // Validate parameters if tool exists in DB
          tool.validateParameters(parameters);
          baseConfig = tool.implementation.config || {};
        }
      } catch (dbError) {
        // If database is unavailable, continue with built-in tools
        console.log(
          `Database unavailable for tool '${toolName}', using built-in configuration`
        );
      }

      // Merge tool config with agent-specific config
      const mergedConfig = {
        ...baseConfig,
        ...agentToolConfig,
      };

      // Execute tool
      const result = await handler(parameters, mergedConfig);
      const executionTime = Date.now() - startTime;

      // Summarize API results if enabled and result is large
      let finalResult = result;
      if (
        toolName === "api_caller" &&
        result &&
        mergedConfig.summarization?.enabled
      ) {
        finalResult = await this.maybeSummarizeApiResult(
          result,
          parameters,
          mergedConfig.summarization,
          mergedConfig._agent_api_key
        );
      }

      // Record usage stats (only if tool exists in DB)
      if (tool) {
        try {
          await tool.recordUsage(true, executionTime);
        } catch (recordError) {
          console.log(
            `Failed to record usage for '${toolName}':`,
            recordError.message
          );
        }
      }

      return {
        success: true,
        result: finalResult,
        execution_time_ms: executionTime,
        tool_name: toolName,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`Tool '${toolName}' execution failed:`, error.message);

      // Try to record failed usage
      try {
        const tool = await Tool.findOne({ name: toolName });
        if (tool) {
          await tool.recordUsage(false, executionTime);
        }
      } catch (recordError) {
        // Ignore recording errors
      }

      return {
        success: false,
        error: error.message,
        execution_time_ms: executionTime,
        tool_name: toolName,
      };
    }
  }

  /**
   * Execute a tool by name with parameters (legacy method)
   */
  async executeTool_old(toolName, parameters = {}) {
    const startTime = Date.now();

    try {
      // Get tool definition
      const tool = await Tool.findOne({ name: toolName, is_active: true });
      if (!tool) {
        throw new Error(`Tool '${toolName}' not found or not active`);
      }

      // Validate parameters
      tool.validateParameters(parameters);

      // Get tool handler
      const handler = this.toolHandlers.get(toolName);
      if (!handler) {
        throw new Error(`No handler registered for tool '${toolName}'`);
      }

      // Execute tool
      const result = await handler(parameters, tool.implementation.config);
      const executionTime = Date.now() - startTime;

      // Record usage stats
      await tool.recordUsage(true, executionTime);

      return {
        success: true,
        result: result,
        execution_time_ms: executionTime,
        tool_name: toolName,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Try to record failed usage
      try {
        const tool = await Tool.findOne({ name: toolName });
        if (tool) {
          await tool.recordUsage(false, executionTime);
        }
      } catch (recordError) {
        // Ignore recording errors
      }

      return {
        success: false,
        error: error.message,
        execution_time_ms: executionTime,
        tool_name: toolName,
      };
    }
  }

  /**
   * Get available tools for an agent
   */
  async getAvailableTools(toolNames = []) {
    if (toolNames.length === 0) {
      return await Tool.find({ is_active: true }).select(
        "name display_name description parameters_schema"
      );
    }

    return await Tool.find({
      name: { $in: toolNames },
      is_active: true,
    }).select("name display_name description parameters_schema");
  }

  // ===== BUILT-IN TOOL HANDLERS =====

  /**
   * Web search tool handler
   */
  async webSearchHandler(parameters, config) {
    const { query, max_results = 5 } = parameters;

    if (!query) {
      throw new Error("Query parameter is required for web search");
    }

    // This is a placeholder implementation
    // In a real implementation, you would integrate with a search API like Google, Bing, or DuckDuckGo
    return {
      query: query,
      results: [
        {
          title: "Example Search Result",
          url: "https://example.com",
          snippet: "This is a placeholder search result for query: " + query,
        },
      ],
      total_results: 1,
      search_time_ms: 100,
    };
  }

  /**
   * Calculator tool handler
   */
  async calculatorHandler(parameters, config) {
    const { expression } = parameters;

    if (!expression) {
      throw new Error("Expression parameter is required for calculator");
    }

    try {
      // Simple safe evaluation (you might want to use a more robust math parser)
      // This is a basic implementation - consider using libraries like math.js for production
      const result = this.evaluateExpression(expression);

      return {
        expression: expression,
        result: result,
        type: typeof result,
      };
    } catch (error) {
      throw new Error(`Calculator error: ${error.message}`);
    }
  }

  /**
   * LLM prompt tool handler - integrates with existing proxy system
   */
  async llmPromptHandler(parameters, config) {
    const {
      prompt,
      system_prompt = null,
      model = "gpt-4o-mini",
      temperature = 0.7,
      max_tokens = 1000,
      api_key_id,
    } = parameters;

    if (!prompt) {
      throw new Error("Prompt parameter is required");
    }

    if (!api_key_id) {
      throw new Error("API key ID is required for LLM prompt tool");
    }

    // Use the existing OpenAI service
    const APIKey = require("../models/ApiKey");
    const apiKey = await APIKey.findById(api_key_id).populate("provider");

    if (!apiKey || !apiKey.is_active) {
      throw new Error("Invalid or inactive API key");
    }

    const openai = new OpenAIService(apiKey.key, apiKey.provider.name);
    const result = await openai.generateCompletion(
      model,
      prompt,
      { temperature, max_tokens },
      system_prompt
    );

    return {
      prompt: prompt,
      response: result.content,
      model: model,
      usage: result.usage,
      finish_reason: result.finish_reason,
    };
  }

  /**
   * Current time tool handler
   */
  async currentTimeHandler(parameters, config) {
    const { timezone = "UTC", format = "iso" } = parameters;

    const now = new Date();

    let formattedTime;
    if (format === "iso") {
      formattedTime = now.toISOString();
    } else if (format === "unix") {
      formattedTime = Math.floor(now.getTime() / 1000);
    } else if (format === "human") {
      formattedTime = now.toLocaleString("en-US", {
        timeZone: timezone === "UTC" ? "UTC" : timezone,
      });
    } else {
      formattedTime = now.toString();
    }

    return {
      timestamp: formattedTime,
      timezone: timezone,
      format: format,
      unix_timestamp: Math.floor(now.getTime() / 1000),
      iso_string: now.toISOString(),
    };
  }

  /**
   * JSON processor tool handler
   */
  async jsonProcessorHandler(parameters, config) {
    const { data, operation = "parse", path = null } = parameters;

    try {
      let result;

      switch (operation) {
        case "parse":
          result = typeof data === "string" ? JSON.parse(data) : data;
          break;

        case "stringify":
          result = JSON.stringify(data, null, 2);
          break;

        case "extract":
          if (!path) {
            throw new Error("Path parameter required for extract operation");
          }
          result = this.extractFromPath(data, path);
          break;

        case "validate":
          result = {
            valid: true,
            type: Array.isArray(data) ? "array" : typeof data,
            keys: typeof data === "object" ? Object.keys(data) : null,
          };
          break;

        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return {
        operation: operation,
        result: result,
        success: true,
      };
    } catch (error) {
      throw new Error(`JSON processing error: ${error.message}`);
    }
  }

  /**
   * API caller tool handler
   */
  async apiCallerHandler(parameters, config) {
    const {
      endpoint_name,
      method = "GET",
      path_params = {},
      query_params = {},
      body_data = null,
      headers = {},
    } = parameters;

    console.log("Executing API caller tool with parameters:", parameters);

    if (!endpoint_name) {
      console.log("API caller tool requires an endpoint name");
      throw new Error("Endpoint name is required");
    }

    // Get endpoint configuration from tool config
    const endpoints = config.endpoints || {};
    const endpointConfig = endpoints[endpoint_name];

    if (!endpointConfig) {
      console.log(`Endpoint '${endpoint_name}' not configured for this tool`);
      throw new Error(
        `Endpoint '${endpoint_name}' not configured for this tool`
      );
    }

    // Validate method is allowed for this endpoint
    const allowedMethods = endpointConfig.methods || ["GET"];
    if (!allowedMethods.includes(method.toUpperCase())) {
      throw new Error(
        `Method '${method}' not allowed for endpoint '${endpoint_name}'. Allowed: ${allowedMethods.join(", ")}`
      );
    }

    // Build URL with path parameters
    let url = endpointConfig.base_url + endpointConfig.path;

    // Replace path parameters in URL
    for (const [key, value] of Object.entries(path_params)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }

    // Check if there are unresolved path parameters
    const unresolvedParams = url.match(/\{[^}]+\}/g);
    if (unresolvedParams) {
      throw new Error(
        `Missing required path parameters: ${unresolvedParams.join(", ")}`
      );
    }

    // Add query parameters
    const finalQueryParams = { ...query_params };

    // Add API key to query params if specified
    const auth = config.authentication || {};
    if (
      auth.type === "api_key" &&
      auth.api_key &&
      auth.api_key_header === "appid"
    ) {
      // Special case for OpenWeather API - appid goes in query params
      finalQueryParams.appid = auth.api_key;
    }

    if (Object.keys(finalQueryParams).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(finalQueryParams)) {
        searchParams.append(key, value);
      }
      url += "?" + searchParams.toString();
    }

    // Build headers with authentication
    const requestHeaders = { ...headers };

    // Add authentication based on config (for header-based auth)
    if (auth.type === "bearer_token" && auth.token) {
      requestHeaders["Authorization"] = `Bearer ${auth.token}`;
    } else if (
      auth.type === "api_key" &&
      auth.api_key &&
      auth.api_key_header !== "appid"
    ) {
      // Only add to headers if not appid (which goes in query params)
      if (auth.api_key_header) {
        requestHeaders[auth.api_key_header] = auth.api_key;
      } else {
        requestHeaders["X-API-Key"] = auth.api_key;
      }
    } else if (auth.type === "cookie" && auth.cookie) {
      requestHeaders["Cookie"] = auth.cookie;
    }

    // Set content type for POST/PUT requests with body
    if (body_data && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      if (!requestHeaders["Content-Type"]) {
        requestHeaders["Content-Type"] = "application/json";
      }
    }

    try {
      const startTime = Date.now();

      // Parse URL to determine which module to use
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const httpModule = isHttps ? https : http;

      // Prepare request options
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: method.toUpperCase(),
        headers: requestHeaders,
        timeout: config.timeout || 30000,
      };

      // Make the HTTP request using Promise wrapper
      const response = await this.makeHttpRequest(
        httpModule,
        requestOptions,
        body_data
      );
      const executionTime = Date.now() - startTime;

      // Parse response based on content type
      let responseData;
      const contentType = response.headers["content-type"] || "";

      if (contentType.includes("application/json")) {
        try {
          responseData = JSON.parse(response.body);
        } catch (e) {
          responseData = response.body;
        }
      } else if (contentType.includes("text/")) {
        responseData = response.body;
      } else {
        // For binary data, just return basic info
        responseData = {
          type: "binary",
          size: response.headers["content-length"] || "unknown",
        };
      }

      return {
        endpoint_name: endpoint_name,
        url: url,
        method: method.toUpperCase(),
        status_code: response.statusCode,
        status_text: response.statusMessage,
        success: response.statusCode >= 200 && response.statusCode < 300,
        headers: response.headers,
        data: responseData,
        execution_time_ms: executionTime,
      };
    } catch (error) {
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Safe expression evaluation for calculator
   */
  evaluateExpression(expression) {
    // Remove any non-math characters for safety
    const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, "");

    // Basic validation
    if (!safeExpression || safeExpression.trim() === "") {
      throw new Error("Invalid expression");
    }

    // Use Function constructor for safe evaluation (still be careful in production)
    try {
      return Function('"use strict"; return (' + safeExpression + ")")();
    } catch (error) {
      throw new Error("Invalid mathematical expression");
    }
  }

  /**
   * Make HTTP request using Node.js built-in modules
   */
  makeHttpRequest(httpModule, options, body) {
    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let responseBody = "";

        res.on("data", (chunk) => {
          responseBody += chunk;
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body: responseBody,
          });
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      // Write body data if provided
      if (body) {
        const bodyData = typeof body === "object" ? JSON.stringify(body) : body;
        req.write(bodyData);
      }

      req.end();
    });
  }

  /**
   * Extract value from object using dot notation path
   */
  extractFromPath(data, path) {
    const keys = path.split(".");
    let result = data;

    for (const key of keys) {
      if (result === null || result === undefined) {
        return null;
      }
      result = result[key];
    }

    return result;
  }

  /**
   * Maybe summarize API result if it's large enough
   */
  async maybeSummarizeApiResult(
    apiResult,
    parameters,
    summaryConfig,
    agentApiKey = null
  ) {
    try {
      // Check if we should summarize this result
      const resultSize = JSON.stringify(apiResult).length;
      const minSizeToSummarize = summaryConfig.min_size || 1000;

      if (resultSize < minSizeToSummarize) {
        console.log(
          `API result size ${resultSize} below threshold ${minSizeToSummarize}, not summarizing`
        );
        return apiResult;
      }

      console.log(
        `API result size ${resultSize} exceeds threshold, summarizing...`
      );

      // Get endpoint-specific configuration
      const endpointName = parameters.endpoint_name;
      const endpointConfig = summaryConfig.endpoint_rules?.[endpointName] || {};

      const maxTokens =
        endpointConfig.max_tokens || summaryConfig.max_tokens || 150;
      const focus =
        endpointConfig.focus ||
        summaryConfig.focus ||
        "key information relevant to user queries";

      const summary = await this.summarizeApiResult(
        apiResult,
        endpointName,
        maxTokens,
        focus,
        agentApiKey,
        summaryConfig.model
      );

      return {
        _summarized: true,
        _original_size: resultSize,
        _endpoint: endpointName,
        _summary_tokens: maxTokens,
        summary: summary,
        // Preserve important metadata
        status_code: apiResult.status_code,
        success: apiResult.success,
        url: apiResult.url,
        method: apiResult.method,
      };
    } catch (error) {
      console.error("Failed to summarize API result:", error.message);
      // Return original result if summarization fails
      return apiResult;
    }
  }

  /**
   * Summarize API result using the agent's LLM API key
   */
  async summarizeApiResult(
    apiResult,
    endpointName,
    maxTokens,
    focus,
    agentApiKey = null,
    model = "gpt-4.1-nano"
  ) {
    // Build summarization prompt
    const prompt = `You are an AI assistant that summarizes API responses for other AI agents.

Summarize this API response from endpoint "${endpointName}" in ${maxTokens} tokens or less.
Focus on: ${focus}

Keep the summary concise but include all information that would be useful for answering user questions.
If the API returned an error, clearly state what went wrong.

API Response:
${JSON.stringify(apiResult, null, 2)}

Summary:`;

    try {
      // Use agent's API key if available, otherwise fallback
      if (agentApiKey && agentApiKey.key) {
        const OpenAIService = require("./openaiService");
        if (!agentApiKey.provider) agentApiKey.provider = "openai"; // Default to OpenAI if no provider specified
        const openai = new OpenAIService(agentApiKey.key, agentApiKey.provider);

        const response = await openai.generateCompletion(model, prompt, {
          max_tokens: maxTokens,
          temperature: 0.3, // Low temperature for consistent summaries
        });

        console.log(
          `Summarized ${JSON.stringify(apiResult).length} chars to ${response.content.length} chars using agent's API key`
        );
        return response.content.trim();
      } else {
        console.log("No agent API key available, using fallback summarization");
        return this.createFallbackSummary(apiResult, endpointName, maxTokens);
      }
    } catch (error) {
      console.error("Summarization service failed:", error.message);
      // Fallback: create a simple summary
      return this.createFallbackSummary(apiResult, endpointName, maxTokens);
    }
  }

  /**
   * Create a simple fallback summary if LLM summarization fails
   */
  createFallbackSummary(apiResult, endpointName, maxTokens) {
    const parts = [];

    // Basic status info
    if (apiResult.status_code) {
      parts.push(
        `Status: ${apiResult.status_code} ${apiResult.status_text || ""}`
      );
    }

    // Success/failure
    if (apiResult.success === false) {
      parts.push("Request failed");
      if (apiResult.data?.message) {
        parts.push(`Error: ${apiResult.data.message}`);
      }
    } else {
      parts.push("Request successful");
    }

    // Try to extract key data
    if (apiResult.data && typeof apiResult.data === "object") {
      const dataStr = JSON.stringify(apiResult.data);
      if (dataStr.length > 200) {
        parts.push(`Data: ${dataStr.substring(0, 200)}...`);
      } else {
        parts.push(`Data: ${dataStr}`);
      }
    }

    const summary = parts.join(". ");

    // Truncate if too long
    if (summary.length > maxTokens * 4) {
      // Rough token estimation
      return summary.substring(0, maxTokens * 4) + "...";
    }

    return summary;
  }
}

module.exports = new ToolService();
