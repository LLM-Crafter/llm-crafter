const Tool = require("../models/Tool");
const OpenAIService = require("./openaiService");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const ApiKey = require("../models/ApiKey");

// Language-specific abbreviation dictionaries for multi-language FAQ support
const LANGUAGE_ABBREVIATIONS = {
  en: {
    // Common abbreviations
    u: "you",
    ur: "your",
    youre: "you are",
    cant: "cannot",
    wont: "will not",
    dont: "do not",
    isnt: "is not",
    arent: "are not",
    wasnt: "was not",
    werent: "were not",
    hasnt: "has not",
    havent: "have not",
    hadnt: "had not",
    shouldnt: "should not",
    wouldnt: "would not",
    couldnt: "could not",
    mustnt: "must not",
    neednt: "need not",
    r: "are",
    // Common question words
    whats: "what is",
    wheres: "where is",
    whos: "who is",
    hows: "how is",
    whens: "when is",
    whys: "why is",
    thats: "that is",
    theres: "there is",
    heres: "here is",
    // Other common abbreviations
    im: "i am",
    ive: "i have",
    ill: "i will",
    id: "i would",
    youll: "you will",
    youd: "you would",
    youve: "you have",
    theyll: "they will",
    theyd: "they would",
    theyve: "they have",
    were: "we are",
    weve: "we have",
    well: "we will",
    wed: "we would",
    its: "it is",
    itll: "it will",
    itd: "it would",
    // Technical abbreviations
    api: "application programming interface",
    faq: "frequently asked questions",
    url: "uniform resource locator",
    ui: "user interface",
    ux: "user experience",
    db: "database",
    pw: "password",
    pwd: "password",
    pass: "password",
    login: "log in",
    signup: "sign up",
    signin: "sign in",
    logout: "log out",
    signout: "sign out",
  },
  es: {
    // Spanish abbreviations
    q: "que",
    xq: "por que",
    pq: "por que",
    tb: "tambien",
    tbn: "tambien",
    tmb: "tambien",
    x: "por",
    xfa: "por favor",
    pfa: "por favor",
    qtal: "que tal",
    cmo: "como",
    dnd: "donde",
    qnd: "cuando",
    qn: "quien",
    salu2: "saludos",
    bss: "besos",
    mxo: "mucho",
    mxa: "mucha",
    ntp: "no te preocupes",
    sldos: "saludos",
    tkm: "te quiero mucho",
  },
  pt: {
    // Portuguese abbreviations
    vc: "voce",
    vcs: "voces",
    pq: "por que",
    pra: "para",
    tb: "tambem",
    tbm: "tambem",
    qnd: "quando",
    qm: "quem",
    eh: "e",
    nd: "nada",
    td: "tudo",
    bjs: "beijos",
    bjss: "beijos",
    flw: "falou",
    vlw: "valeu",
    cmg: "comigo",
    ctg: "contigo",
    dps: "depois",
    hj: "hoje",
    ontem: "ontem",
    amanha: "amanha",
    sla: "sei la",
    rsrs: "risos",
    kk: "risos",
  },
  fr: {
    // French abbreviations
    pr: "pour",
    qd: "quand",
    ds: "dans",
    vs: "vous",
    tt: "tout",
    tte: "toute",
    ts: "tous",
    ttes: "toutes",
    bcp: "beaucoup",
    bjr: "bonjour",
    bsr: "bonsoir",
    slt: "salut",
    mtn: "maintenant",
    qqs: "quelques",
    qqn: "quelquun",
    qq: "quelque",
    qc: "quelque chose",
    pk: "pourquoi",
    pq: "pourquoi",
    pcq: "parce que",
    dsl: "desole",
    mdr: "mort de rire",
    lol: "mort de rire",
    cc: "coucou",
  },
  de: {
    // German abbreviations
    u: "und",
    od: "oder",
    z: "zu",
    v: "von",
    m: "mit",
    n: "ein",
    ne: "eine",
    aufm: "auf dem",
    gehts: "geht es",
    haste: "hast du",
    biste: "bist du",
    kannste: "kannst du",
    willste: "willst du",
    machste: "machst du",
    isses: "ist es",
    hats: "hat es",
    wirds: "wird es",
    wenns: "wenn es",
    dass: "dass",
    mfg: "mit freundlichen gruessen",
    lg: "liebe gruesse",
    vg: "viele gruesse",
  },
  it: {
    // Italian abbreviations
    x: "per",
    xche: "perche",
    piu: "piu",
    nn: "non",
    cmq: "comunque",
    qnd: "quando",
    qnt: "quanto",
    qst: "questo",
    qlc: "qualche",
    qlcs: "qualcosa",
    qlcn: "qualcuno",
    tt: "tutto",
    tvb: "ti voglio bene",
    tvtb: "ti voglio tanto bene",
  },
};

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

    // FAQ tool
    this.registerToolHandler("faq", this.faqHandler.bind(this));
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

    // Get decrypted API key
    let decryptedKey;
    try {
      decryptedKey = apiKey.getDecryptedKey();
    } catch (error) {
      throw new Error(`Failed to decrypt API key: ${error.message}`);
    }

    const openai = new OpenAIService(decryptedKey, apiKey.provider.name);
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
      headers = {},
      query_params = {},
      path_params = {},
      body_data = null,
      timeout = 30000,
    } = parameters;

    // Check if we have endpoint_name (new format) or url (legacy format)
    if (!endpoint_name && !parameters.url) {
      throw new Error("Either endpoint_name or url parameter is required for API caller");
    }

    let finalUrl;
    let authHeaders = {};

    if (endpoint_name) {
      // New endpoint-based format
      if (!config.endpoints || !config.endpoints[endpoint_name]) {
        throw new Error(`Endpoint '${endpoint_name}' not configured for this agent`);
      }

      const endpointConfig = config.endpoints[endpoint_name];
      
      if (!endpointConfig.base_url || !endpointConfig.path) {
        throw new Error(`Endpoint '${endpoint_name}' missing base_url or path configuration`);
      }

      // Build URL from endpoint configuration
      let path = endpointConfig.path;
      
      // Replace path parameters
      for (const [key, value] of Object.entries(path_params)) {
        path = path.replace(`{${key}}`, encodeURIComponent(value));
      }

      // Build base URL
      finalUrl = new URL(path, endpointConfig.base_url);

      // Add query parameters
      for (const [key, value] of Object.entries(query_params)) {
        finalUrl.searchParams.append(key, value);
      }

      // Handle authentication if configured
      if (config.authentication) {
        const auth = config.authentication;
        
        switch (auth.type) {
          case "bearer_token":
            if (auth.token) {
              authHeaders["Authorization"] = `Bearer ${auth.token}`;
            }
            break;
          case "api_key":
            if (auth.api_key) {
              if (auth.header) {
                authHeaders[auth.header] = auth.api_key;
              } else {
                // Default to X-API-Key if no header specified
                authHeaders["X-API-Key"] = auth.api_key;
              }
            }
            break;
          case "cookie":
            if (auth.cookie) {
              authHeaders["Cookie"] = auth.cookie;
            }
            break;
        }
      }

    } else {
      // Legacy URL format (for backward compatibility)
      finalUrl = new URL(parameters.url);
    }

    try {
      const isHttps = finalUrl.protocol === "https:";
      const httpModule = isHttps ? https : http;

      // Merge all headers
      const finalHeaders = {
        "Content-Type": "application/json",
        ...authHeaders,
        ...headers,
      };

      // Prepare request options
      const options = {
        hostname: finalUrl.hostname,
        port: finalUrl.port || (isHttps ? 443 : 80),
        path: finalUrl.pathname + finalUrl.search,
        method: method.toUpperCase(),
        headers: finalHeaders,
        timeout: timeout,
      };

      // Add body if present
      let requestBody = null;
      if (
        body_data &&
        (method.toUpperCase() === "POST" || method.toUpperCase() === "PUT" || method.toUpperCase() === "PATCH")
      ) {
        requestBody = typeof body_data === "string" ? body_data : JSON.stringify(body_data);
        options.headers["Content-Length"] = Buffer.byteLength(requestBody);
      }

      return new Promise((resolve, reject) => {
        const req = httpModule.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const result = {
                endpoint_name: endpoint_name,
                url: finalUrl.toString(),
                method: method.toUpperCase(),
                status_code: res.statusCode,
                headers: res.headers,
                success: res.statusCode >= 200 && res.statusCode < 300,
              };

              // Try to parse JSON response
              try {
                result.body = JSON.parse(data);
              } catch (parseError) {
                // Not JSON, keep as string
                result.body = data;
              }

              // Add raw data field for compatibility
              result.data = data;

              resolve(result);
            } catch (error) {
              reject(new Error(`Response processing error: ${error.message}`));
            }
          });
        });

        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timeout"));
        });

        req.on("error", (error) => {
          reject(new Error(`Request error: ${error.message}`));
        });

        // Send request body if present
        if (requestBody) {
          req.write(requestBody);
        }

        req.end();
      });
    } catch (error) {
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  /**
   * FAQ tool handler using semantic similarity with OpenAI embeddings
   */
  async faqHandler(parameters, config) {
    console.log("FAQ Handler called with parameters:", parameters);
    console.log("FAQ Handler config:", config);

    const { question, language = "auto" } = parameters;
    const startTime = Date.now();

    if (!question) {
      throw new Error("Question parameter is required for FAQ search");
    }

    // Get FAQ data from config
    const faqs = config.faqs || [];
    if (faqs.length === 0) {
      return {
        question: question,
        matched_faq: null,
        success: false,
        error: "No FAQ data configured",
        execution_time_ms: Date.now() - startTime,
      };
    }

    console.log(`FAQ handler processing question: "${question}"`);
    console.log(`Available FAQs: ${faqs.length}`);

    try {
      // Use hybrid matching system for better accuracy
      const result = await this.calculateHybridFAQMatching(
        question,
        faqs,
        config,
        language
      );

      console.log("FAQ matching result:", result);
      return result;
    } catch (error) {
      console.error("FAQ handler error:", error);

      // Fallback to enhanced text matching if semantic matching fails
      console.log("Attempting fallback to enhanced text matching...");

      const detectedLanguage =
        language === "auto" ? this.detectLanguage(question) : language;
      const threshold = config.threshold || 0.3;

      const matches = faqs.map((faq) => {
        const confidence = this.calculateEnhancedTextSimilarity(
          question,
          faq.question,
          detectedLanguage
        );
        return {
          question: faq.question,
          answer: faq.answer,
          category: faq.category || "general",
          confidence: confidence,
          method: "enhanced_text",
        };
      });

      matches.sort((a, b) => b.confidence - a.confidence);
      const validMatches = this.filterRelevantMatches(matches, threshold);
      const bestMatch = validMatches.length > 0 ? validMatches[0] : null;

      return {
        question: question,
        detected_language: detectedLanguage,
        matched_faq: bestMatch,
        all_matches: validMatches.slice(0, 5),
        success: bestMatch !== null,
        execution_time_ms: Date.now() - startTime,
        fallback_used: true,
        matching_method: "enhanced_text",
      };
    }
  }

  /**
   * Hybrid FAQ matching system combining multiple approaches for better accuracy
   */
  async calculateHybridFAQMatching(question, faqs, config, language = "en") {
    const startTime = Date.now();
    const detectedLanguage =
      language === "auto" ? this.detectLanguage(question) : language;
    const threshold = config.threshold || 0.3;

    console.log(
      `Hybrid FAQ matching - Language: ${detectedLanguage}, Threshold: ${threshold}`
    );

    try {
      // First try semantic similarity if API key is available
      if (config._agent_api_key) {
        console.log("Attempting semantic similarity matching...");
        const semanticResult = await this.calculateSemanticSimilarity(
          question,
          faqs,
          config
        );

        if (
          semanticResult &&
          semanticResult.matches &&
          semanticResult.matches.length > 0
        ) {
          console.log(
            `Semantic similarity found ${semanticResult.matches.length} matches`
          );

          // Filter matches by threshold and relevance
          const validMatches = this.filterRelevantMatches(
            semanticResult.matches,
            threshold
          );
          console.log(`After filtering: ${validMatches.length} valid matches`);

          if (validMatches.length > 0) {
            return {
              question: question,
              detected_language: detectedLanguage,
              matched_faq: validMatches[0],
              all_matches: validMatches.slice(0, 5),
              success: true,
              execution_time_ms: Date.now() - startTime,
              matching_method: "semantic",
              debug: {
                total_matches: semanticResult.matches.length,
                matches_after_filtering: validMatches.length,
                threshold_used: threshold,
              },
            };
          }
        }
      }

      // Fallback to enhanced text similarity
      console.log("Falling back to enhanced text similarity...");
      const matches = faqs.map((faq) => {
        const confidence = this.calculateEnhancedTextSimilarity(
          question,
          faq.question,
          detectedLanguage
        );
        return {
          question: faq.question,
          answer: faq.answer,
          category: faq.category || "general",
          confidence: confidence,
          method: "enhanced_text",
        };
      });

      matches.sort((a, b) => b.confidence - a.confidence);
      const validMatches = this.filterRelevantMatches(matches, threshold);
      const bestMatch = validMatches.length > 0 ? validMatches[0] : null;

      return {
        question: question,
        detected_language: detectedLanguage,
        matched_faq: bestMatch,
        all_matches: validMatches.slice(0, 5),
        success: bestMatch !== null,
        execution_time_ms: Date.now() - startTime,
        fallback_used: true,
        matching_method: "enhanced_text",
        debug: {
          total_matches: matches.length,
          matches_after_filtering: validMatches.length,
          threshold_used: threshold,
        },
      };
    } catch (error) {
      console.error(
        "FAQ hybrid matching failed, falling back to basic similarity:",
        error.message
      );

      // Final fallback to basic text similarity
      const matches = faqs.map((faq) => {
        const confidence = this.calculateBasicTextSimilarity(
          question,
          faq.question
        );
        return {
          question: faq.question,
          answer: faq.answer,
          category: faq.category || "general",
          confidence: confidence,
          method: "basic_text",
        };
      });

      matches.sort((a, b) => b.confidence - a.confidence);
      const validMatches = this.filterRelevantMatches(matches, threshold);
      const bestMatch = validMatches.length > 0 ? validMatches[0] : null;

      return {
        question: question,
        detected_language: detectedLanguage,
        matched_faq: bestMatch,
        all_matches: validMatches.slice(0, 5),
        success: bestMatch !== null,
        execution_time_ms: Date.now() - startTime,
        fallback_used: true,
        matching_method: "basic_text",
        error: error.message,
      };
    }
  }

  /**
   * Calculate semantic similarity using OpenAI embeddings
   */
  async calculateSemanticSimilarity(question, faqs, config) {
    console.log("Starting semantic similarity calculation...");
    console.log(`Question: "${question}"`);
    console.log(`Question length: ${question.length}`);

    if (!config._agent_api_key) {
      console.log("No agent API key available for semantic similarity");
      return null;
    }

    try {
      // Create OpenAI service instance with agent's API key
      console.log("Creating OpenAI service instance...");
      let openaiService;

      if (
        typeof config._agent_api_key === "object" &&
        config._agent_api_key.getDecryptedKey
      ) {
        // It's an API key object, decrypt it
        const decryptedKey = config._agent_api_key.getDecryptedKey();
        console.log(
          `Decrypted API key length: ${decryptedKey ? decryptedKey.length : "null"}`
        );
        openaiService = new OpenAIService(decryptedKey);
      } else if (typeof config._agent_api_key === "string") {
        // It's already a string
        console.log(
          `API key is string, length: ${config._agent_api_key.length}`
        );
        openaiService = new OpenAIService(config._agent_api_key);
      } else {
        console.error("Invalid API key format:", typeof config._agent_api_key);
        return null;
      }

      // Get embedding for the question
      console.log("Getting embedding for question...");
      const questionEmbedding = await this.getTextEmbedding(
        question,
        openaiService
      );
      if (!questionEmbedding) {
        console.error("Failed to get question embedding");
        return null;
      }

      console.log(`Question embedding dimensions: ${questionEmbedding.length}`);

      // Get embeddings for all FAQ questions and calculate similarities
      console.log(`Getting embeddings for ${faqs.length} FAQ entries...`);
      const matches = await Promise.all(
        faqs.map(async (faq, index) => {
          try {
            console.log(`Processing FAQ ${index + 1}: "${faq.question}"`);
            const faqEmbedding = await this.getTextEmbedding(
              faq.question,
              openaiService
            );
            if (!faqEmbedding) {
              console.log(`Failed to get embedding for FAQ: "${faq.question}"`);
              return null;
            }

            const similarity = this.cosineSimilarity(
              questionEmbedding,
              faqEmbedding
            );
            console.log(
              `Similarity for "${faq.question}": ${similarity.toFixed(3)}`
            );

            return {
              question: faq.question,
              answer: faq.answer,
              category: faq.category || "general",
              confidence: similarity,
              method: "semantic",
            };
          } catch (error) {
            console.error(
              `Error processing FAQ "${faq.question}":`,
              error.message
            );
            return null;
          }
        })
      );

      // Filter out null results and sort by confidence
      const validMatches = matches.filter((match) => match !== null);
      validMatches.sort((a, b) => b.confidence - a.confidence);

      console.log(
        `Semantic similarity complete. Found ${validMatches.length} valid matches out of ${faqs.length} FAQs`
      );
      return { matches: validMatches };
    } catch (error) {
      console.error("Semantic similarity calculation failed:", error.message);
      console.error("Error stack:", error.stack);
      return null;
    }
  }

  /**
   * Get text embedding using OpenAI
   */
  async getTextEmbedding(text, openaiService) {
    try {
      // Validate and clean the input text
      if (!text || typeof text !== "string") {
        console.error("Invalid text input for embedding:", text);
        return null;
      }

      const cleanText = text.trim();
      if (cleanText.length === 0) {
        console.error("Empty text after cleaning:", text);
        return null;
      }

      console.log(
        `Getting embedding for text: "${cleanText}" (length: ${cleanText.length})`
      );

      // Call the OpenAI service with proper parameter format
      const response = await openaiService.createEmbedding({
        input: cleanText,
        model: "text-embedding-3-small",
      });

      if (
        !response ||
        !response.data ||
        !response.data[0] ||
        !response.data[0].embedding
      ) {
        console.error("Invalid embedding response structure:", response);
        return null;
      }

      console.log(
        `Successfully got embedding with ${response.data[0].embedding.length} dimensions`
      );
      return response.data[0].embedding;
    } catch (error) {
      console.error("Failed to get text embedding:", error.message);
      return null;
    }
  }

  /**
   * Filter matches based on relevance and threshold
   */
  filterRelevantMatches(matches, threshold = 0.5) {
    console.log(`Filtering matches with threshold: ${threshold}`);
    console.log(`Input matches: ${matches.length}`);

    if (matches.length === 0) {
      console.log("No matches to filter");
      return [];
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Log all match scores for debugging
    matches.forEach((match, index) => {
      console.log(
        `Match ${index + 1}: confidence=${match.confidence.toFixed(3)}, question="${match.question}"`
      );
    });

    // Apply threshold filter
    const thresholdFiltered = matches.filter(
      (match) => match.confidence >= threshold
    );
    console.log(
      `After threshold filter (>= ${threshold}): ${thresholdFiltered.length} matches`
    );

    if (thresholdFiltered.length === 0) {
      console.log("No matches met the threshold requirement");
      return [];
    }

    // Apply relevance filter - ensure the best match is significantly better than noise
    const bestScore = thresholdFiltered[0].confidence;

    // Dynamic minimum relevant score based on match method
    let minRelevantScore;
    if (thresholdFiltered[0].method === "semantic") {
      // For semantic matching, use a higher relative threshold
      minRelevantScore = Math.max(threshold, bestScore * 0.8);
    } else {
      // For text matching, be more lenient but still filter noise
      minRelevantScore = Math.max(threshold, bestScore * 0.7);
    }

    // Additional quality check: if the best score is very low, increase the relative threshold
    if (bestScore < 0.5) {
      minRelevantScore = Math.max(minRelevantScore, bestScore * 0.85);
    }

    const relevantMatches = thresholdFiltered.filter(
      (match) => match.confidence >= minRelevantScore
    );
    console.log(
      `After relevance filter (>= ${minRelevantScore.toFixed(3)}): ${relevantMatches.length} matches`
    );

    // Final sanity check: if we have multiple matches with very similar scores,
    // only keep the top ones to avoid confusion
    if (relevantMatches.length > 3) {
      const scoreGap =
        relevantMatches[0].confidence - relevantMatches[2].confidence;
      if (scoreGap < 0.1) {
        // Scores are too close, only keep top 3
        console.log("Scores too close, limiting to top 3 matches");
        return relevantMatches.slice(0, 3);
      }
    }

    return relevantMatches;
  }

  /**
   * Calculate enhanced text similarity with multi-language support
   */
  calculateEnhancedTextSimilarity(text1, text2, language = "en") {
    // Normalize and expand abbreviations
    const normalized1 = this.normalizeText(text1, language);
    const normalized2 = this.normalizeText(text2, language);

    // Check for exact word matches that indicate opposite meanings
    const negationPenalty = this.calculateNegationPenalty(
      normalized1,
      normalized2
    );

    // Calculate multiple similarity metrics
    const jaccardScore = this.jaccardSimilarity(normalized1, normalized2);
    const levenshteinScore = this.normalizedLevenshtein(
      normalized1,
      normalized2
    );
    const wordOverlapScore = this.wordOverlapSimilarity(
      normalized1,
      normalized2
    );
    const ngramScore = this.ngramSimilarity(normalized1, normalized2, 2);

    // Semantic context bonus for related concepts
    const contextBonus = this.calculateContextBonus(normalized1, normalized2);

    // Weighted combination of metrics
    const weights = {
      jaccard: 0.3,
      levenshtein: 0.2,
      wordOverlap: 0.3,
      ngram: 0.2,
    };

    const combinedScore =
      jaccardScore * weights.jaccard +
      levenshteinScore * weights.levenshtein +
      wordOverlapScore * weights.wordOverlap +
      ngramScore * weights.ngram;

    // Apply negation penalty and context bonus
    const finalScore =
      Math.max(0, combinedScore - negationPenalty) + contextBonus;

    return Math.min(1, Math.max(0, finalScore));
  }

  /**
   * Calculate basic text similarity
   */
  calculateBasicTextSimilarity(text1, text2) {
    const normalized1 = text1.toLowerCase().trim();
    const normalized2 = text2.toLowerCase().trim();

    if (normalized1 === normalized2) return 1.0;

    return this.jaccardSimilarity(normalized1, normalized2);
  }

  /**
   * Normalize text for better matching
   */
  normalizeText(text, language = "en") {
    let normalized = text.toLowerCase().trim();

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, " ");

    // Remove punctuation but keep apostrophes for contractions
    normalized = normalized.replace(/[^\w\s']/g, "");

    // Expand abbreviations based on language
    normalized = this.expandAbbreviations(normalized, language);

    return normalized;
  }

  /**
   * Expand abbreviations based on language
   */
  expandAbbreviations(text, language = "en") {
    const abbreviations =
      LANGUAGE_ABBREVIATIONS[language] || LANGUAGE_ABBREVIATIONS.en;
    const words = text.split(/\s+/);

    const expanded = words.map((word) => {
      const cleanWord = word.replace(/[^\w]/g, "");
      return abbreviations[cleanWord] || word;
    });

    return expanded.join(" ");
  }

  /**
   * Detect language of text (simple heuristic)
   */
  detectLanguage(text) {
    const normalized = text.toLowerCase();

    // Simple language detection based on common words
    const languagePatterns = {
      es: /\b(que|como|donde|cuando|por|para|con|una|este|esta|muy|mas|todo|hacer|tiempo|año|si|no|hola|gracias)\b/g,
      pt: /\b(que|como|onde|quando|por|para|com|uma|este|esta|muito|mais|todo|fazer|tempo|ano|sim|nao|ola|obrigado)\b/g,
      fr: /\b(que|comment|ou|quand|pour|avec|une|cette|tres|plus|tout|faire|temps|annee|oui|non|bonjour|merci)\b/g,
      de: /\b(was|wie|wo|wann|fur|mit|eine|diese|sehr|mehr|alle|machen|zeit|jahr|ja|nein|hallo|danke)\b/g,
      it: /\b(che|come|dove|quando|per|con|una|questa|molto|piu|tutto|fare|tempo|anno|si|no|ciao|grazie)\b/g,
    };

    let maxMatches = 0;
    let detectedLang = "en";

    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      const matches = (normalized.match(pattern) || []).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedLang = lang;
      }
    }

    return detectedLang;
  }

  /**
   * Calculate Jaccard similarity
   */
  jaccardSimilarity(text1, text2) {
    const set1 = new Set(text1.split(/\s+/));
    const set2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate normalized Levenshtein distance
   */
  normalizedLevenshtein(text1, text2) {
    const distance = this.levenshteinDistance(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);
    return maxLength > 0 ? 1 - distance / maxLength : 1;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate word overlap similarity
   */
  wordOverlapSimilarity(text1, text2) {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);

    const commonWords = words1.filter((word) => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);

    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  /**
   * Calculate n-gram similarity
   */
  ngramSimilarity(text1, text2, n = 2) {
    const ngrams1 = this.getNgrams(text1, n);
    const ngrams2 = this.getNgrams(text2, n);

    const set1 = new Set(ngrams1);
    const set2 = new Set(ngrams2);

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Get n-grams from text
   */
  getNgrams(text, n) {
    const ngrams = [];
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.substring(i, i + n));
    }
    return ngrams;
  }

  /**
   * Safely evaluate mathematical expressions
   */
  evaluateExpression(expression) {
    // Basic safety check - only allow numbers, operators, and whitespace
    if (!/^[0-9+\-*/.() ]+$/.test(expression)) {
      throw new Error("Invalid characters in expression");
    }

    try {
      // Use Function constructor for safer evaluation than eval
      return Function('"use strict"; return (' + expression + ")")();
    } catch (error) {
      throw new Error("Invalid mathematical expression");
    }
  }

  /**
   * Extract value from object using dot notation path
   */
  extractFromPath(obj, path) {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Maybe summarize API result if it's too large
   */
  async maybeSummarizeApiResult(
    result,
    parameters,
    summarizationConfig,
    agentApiKey
  ) {
    // Check if result needs summarization
    const resultStr = JSON.stringify(result);
    const maxLength = summarizationConfig.max_length || 2000;

    if (resultStr.length <= maxLength) {
      return result;
    }

    try {
      // Use summarization service
      const SummarizationService = require("./summarizationService");
      const summary = await SummarizationService.summarizeApiResult(
        result,
        parameters.url,
        agentApiKey
      );

      return {
        ...result,
        _summarized: true,
        _original_length: resultStr.length,
        summary: summary,
      };
    } catch (error) {
      console.error("Failed to summarize API result:", error.message);
      return result;
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate penalty for potentially opposite meanings (e.g., check in vs check out)
   */
  calculateNegationPenalty(text1, text2) {
    const opposites = [
      ["in", "out"],
      ["on", "off"],
      ["start", "end"],
      ["begin", "finish"],
      ["open", "close"],
      ["enter", "exit"],
      ["arrive", "depart"],
      ["login", "logout"],
      ["signin", "signout"],
      ["checkin", "checkout"],
      ["upload", "download"],
      ["import", "export"],
      ["enable", "disable"],
      ["activate", "deactivate"],
      ["connect", "disconnect"],
      ["lock", "unlock"],
      ["show", "hide"],
      ["expand", "collapse"],
      ["increase", "decrease"],
      ["add", "remove"],
      ["create", "delete"],
      ["save", "cancel"],
      ["accept", "reject"],
      ["allow", "deny"],
      ["grant", "revoke"],
      ["install", "uninstall"],
      ["freeze", "unfreeze"],
      ["subscribe", "unsubscribe"],
    ];

    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    for (const [word1, word2] of opposites) {
      const hasWord1InText1 = words1.some((w) => w.includes(word1));
      const hasWord2InText1 = words1.some((w) => w.includes(word2));
      const hasWord1InText2 = words2.some((w) => w.includes(word1));
      const hasWord2InText2 = words2.some((w) => w.includes(word2));

      // If one text contains word1 and the other contains word2 (opposites)
      if (
        (hasWord1InText1 && hasWord2InText2) ||
        (hasWord2InText1 && hasWord1InText2)
      ) {
        // Strong penalty for opposite words
        return 0.4;
      }
    }

    return 0;
  }

  /**
   * Calculate context bonus for related concepts
   */
  calculateContextBonus(text1, text2) {
    const contextGroups = [
      // Hotel/accommodation contexts
      ["check", "room", "hotel", "guest", "stay", "reservation", "booking"],
      ["wifi", "internet", "connection", "network", "password"],
      ["breakfast", "food", "meal", "restaurant", "dining", "eat"],
      ["pool", "swimming", "water", "swim", "deck"],
      ["parking", "car", "vehicle", "garage", "valet"],
      ["towel", "linen", "clean", "housekeeping", "service"],
      ["key", "card", "access", "door", "lock", "unlock"],
      ["checkout", "checkin", "arrival", "departure", "time"],
      ["gym", "fitness", "exercise", "workout", "equipment"],
      ["pet", "animal", "dog", "cat", "allowed", "policy"],
      // Technical contexts
      ["api", "endpoint", "request", "response", "data"],
      ["database", "query", "table", "record", "sql"],
      ["authentication", "login", "password", "user", "account"],
      ["error", "bug", "issue", "problem", "fix", "solve"],
      ["file", "upload", "download", "document", "attachment"],
    ];

    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    for (const group of contextGroups) {
      const matches1 = words1.filter((word) =>
        group.some(
          (contextWord) =>
            word.includes(contextWord) || contextWord.includes(word)
        )
      ).length;
      const matches2 = words2.filter((word) =>
        group.some(
          (contextWord) =>
            word.includes(contextWord) || contextWord.includes(word)
        )
      ).length;

      if (matches1 > 0 && matches2 > 0) {
        // Bonus based on how many context words match
        const totalMatches = matches1 + matches2;
        return Math.min(0.2, totalMatches * 0.05);
      }
    }

    return 0;
  }

  // ===== HELPER METHODS =====
}

module.exports = new ToolService();
