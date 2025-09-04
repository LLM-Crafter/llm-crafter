const Agent = require("../models/Agent");
const Conversation = require("../models/Conversation");
const AgentExecution = require("../models/AgentExecution");
const OpenAIService = require("./openaiService");
const toolService = require("./toolService");
const APIKey = require("../models/ApiKey");
const summarizationService = require("./summarizationService");
const suggestionService = require("./suggestionService");

class AgentService {
  /**
   * Execute a chatbot agent with a user message
   */
  async executeChatbotAgent(
    agentId,
    conversationId,
    userMessage,
    userIdentifier,
    dynamicContext = {}
  ) {
    //populate agent with API key and provider of api key
    const agent = await Agent.findById(agentId).populate({
      path: "api_key",
      populate: {
        path: "provider",
      },
    });
    if (!agent) {
      throw new Error("Agent not found");
    }

    if (agent.type !== "chatbot") {
      throw new Error("Agent is not a chatbot type");
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.agent !== agentId) {
        throw new Error(
          "Conversation not found or does not belong to this agent"
        );
      }
    } else {
      conversation = new Conversation({
        agent: agentId,
        user_identifier: userIdentifier,
        title: this.generateConversationTitle(userMessage),
      });
      await conversation.save();
    }

    // Add user message to conversation
    await conversation.addMessage({
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    });

    // Execute agent reasoning
    const response = await this.executeAgentReasoning(
      agent,
      conversation,
      dynamicContext
    );

    // Add assistant response to conversation
    await conversation.addMessage({
      role: "assistant",
      content: response.content,
      thinking_process: response.thinking_process,
      tools_used: response.tools_used,
      token_usage: response.token_usage,
      timestamp: new Date(),
    });

    // Generate question suggestions if enabled
    let suggestions = null;
    let suggestionUsage = null;

    if (agent.question_suggestions?.enabled) {
      const suggestionResult =
        await suggestionService.generateQuestionSuggestions(
          agent,
          conversation.messages
        );

      if (suggestionResult) {
        suggestions = suggestionResult.suggestions;
        suggestionUsage = suggestionResult.usage;
      }
    }

    // Check if conversation needs summarization
    await this.handleConversationSummarization(conversation, agent);

    const result = {
      conversation_id: conversation._id,
      response: response.content,
      thinking_process: response.thinking_process,
      tools_used: response.tools_used,
      token_usage: response.token_usage,
    };

    // Add suggestions to response if available
    if (suggestions) {
      result.suggestions = suggestions;
      result.suggestion_usage = suggestionUsage;
    }

    return result;
  }

  /**
   * Execute a task agent with input data
   */
  async executeTaskAgent(
    agentId,
    input,
    userIdentifier = null,
    dynamicContext = {}
  ) {
    const agent = await Agent.findById(agentId).populate({
      path: "api_key",
      populate: {
        path: "provider",
      },
    });
    if (!agent) {
      throw new Error("Agent not found");
    }

    if (agent.type !== "task") {
      throw new Error("Agent is not a task type");
    }

    // Create execution record
    const execution = new AgentExecution({
      agent: agentId,
      type: "task",
      input: input,
      metadata: {
        user_identifier: userIdentifier,
      },
    });
    await execution.save();
    await execution.start();

    try {
      // Execute agent reasoning
      const result = await this.executeTaskReasoning(
        agent,
        input,
        execution,
        dynamicContext
      );

      await execution.complete(result.output);
      execution.usage = result.token_usage;
      await execution.save();

      return {
        execution_id: execution._id,
        output: result.output,
        thinking_process: execution.thinking_process,
        tools_used: execution.tools_executed,
        token_usage: result.token_usage,
        status: "completed",
      };
    } catch (error) {
      await execution.fail(error);
      throw error;
    }
  }

  /**
   * Core agent reasoning engine
   */
  async executeAgentReasoning(agent, conversation, dynamicContext = {}) {
    let decriptedApiKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decriptedApiKey,
      agent.api_key.provider.name
    );

    let thinkingProcess = [];
    let toolsUsed = [];
    let totalTokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };

    // Build context for the agent
    const context = this.buildAgentContext(agent, conversation);

    // Initial reasoning step
    thinkingProcess.push({
      step: "analyze_input",
      reasoning: "Analyzing user input and determining response strategy",
    });

    let maxIterations = agent.config.max_tool_calls || 5;
    let currentIteration = 0;
    let finalResponse = "";

    while (currentIteration < maxIterations) {
      currentIteration++;

      // Build prompt for current iteration
      const prompt = this.buildReasoningPrompt(
        agent,
        context,
        thinkingProcess,
        toolsUsed,
        currentIteration
      );

      // Get LLM response
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        dynamicContext
      );
      const llmResponse = await openai.generateCompletion(
        agent.llm_settings.model,
        prompt,
        agent.llm_settings.parameters,
        enhancedSystemPrompt
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === "use_tool") {
        // Execute tool
        thinkingProcess.push({
          step: "tool_execution",
          reasoning: `Decided to use tool: ${parsedResponse.tool_name}`,
        });

        const toolResult = await toolService.executeToolWithConfig(
          parsedResponse.tool_name,
          parsedResponse.tool_parameters,
          this.getAgentToolConfig(agent, parsedResponse.tool_name)
        );

        // Handle tool result properly - check for success/failure
        const toolResultForAgent = {
          tool_name: parsedResponse.tool_name,
          parameters: parsedResponse.tool_parameters,
          execution_time_ms: toolResult.execution_time_ms,
        };

        if (toolResult.success) {
          toolResultForAgent.result = toolResult.result;
          toolResultForAgent.success = true;
        } else {
          toolResultForAgent.error = toolResult.error;
          toolResultForAgent.success = false;
          // Add thinking step about tool failure
          thinkingProcess.push({
            step: "tool_failed",
            reasoning: `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`,
          });
        }

        toolsUsed.push(toolResultForAgent);

        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === "respond") {
        // Agent decided to respond to user
        finalResponse = parsedResponse.response;
        thinkingProcess.push({
          step: "final_response",
          reasoning: "Determined sufficient information to respond to user",
        });
        break;
      } else {
        // Continue thinking
        thinkingProcess.push({
          step: "continue_reasoning",
          reasoning: parsedResponse.reasoning || "Continuing analysis",
        });
      }
    }

    if (!finalResponse) {
      finalResponse =
        "I apologize, but I wasn't able to complete your request within the allowed processing time. Please try rephrasing your request.";
    }

    return {
      content: finalResponse,
      thinking_process: thinkingProcess,
      tools_used: toolsUsed,
      token_usage: totalTokenUsage,
    };
  }

  /**
   * Task-specific reasoning with iterative tool usage
   */
  async executeTaskReasoning(agent, input, execution, dynamicContext = {}) {
    let decryptedApiKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decryptedApiKey,
      agent.api_key.provider.name
    );

    let thinkingProcess = [];
    let toolsUsed = [];
    let totalTokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };

    await execution.addThinkingStep(
      "analyze_task",
      "Analyzing task input and determining execution strategy"
    );

    thinkingProcess.push({
      step: "analyze_task",
      reasoning: "Analyzing task input and determining execution strategy",
    });

    let maxIterations = agent.config.max_tool_calls || 5;
    let currentIteration = 0;
    let finalOutput = "";

    while (currentIteration < maxIterations) {
      currentIteration++;

      // Build prompt for current iteration
      const prompt = this.buildTaskReasoningPrompt(
        agent,
        input,
        thinkingProcess,
        toolsUsed,
        currentIteration
      );

      // Get LLM response
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        dynamicContext
      );
      const llmResponse = await openai.generateCompletion(
        agent.llm_settings.model,
        prompt,
        agent.llm_settings.parameters,
        enhancedSystemPrompt
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === "use_tool") {
        // Execute tool
        thinkingProcess.push({
          step: "tool_execution",
          reasoning: `Decided to use tool: ${parsedResponse.tool_name}`,
        });

        await execution.addThinkingStep(
          "tool_execution",
          `Using tool: ${parsedResponse.tool_name}`
        );

        const toolResult = await toolService.executeToolWithConfig(
          parsedResponse.tool_name,
          parsedResponse.tool_parameters,
          this.getAgentToolConfig(agent, parsedResponse.tool_name)
        );

        // Handle tool result properly - check for success/failure
        const toolResultForAgent = {
          tool_name: parsedResponse.tool_name,
          parameters: parsedResponse.tool_parameters,
          execution_time_ms: toolResult.execution_time_ms,
        };

        if (toolResult.success) {
          toolResultForAgent.result = toolResult.result;
          toolResultForAgent.success = true;
          
          await execution.addToolExecution(
            parsedResponse.tool_name,
            parsedResponse.tool_parameters,
            toolResult.result,
            toolResult.execution_time_ms
          );
        } else {
          toolResultForAgent.error = toolResult.error;
          toolResultForAgent.success = false;
          
          // Add thinking step about tool failure
          thinkingProcess.push({
            step: "tool_failed",
            reasoning: `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`,
          });

          await execution.addThinkingStep(
            "tool_failed",
            `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`
          );
        }

        toolsUsed.push(toolResultForAgent);

        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === "respond") {
        // Agent decided to provide final output
        finalOutput = parsedResponse.response;
        thinkingProcess.push({
          step: "task_completed",
          reasoning: "Determined sufficient information to complete the task",
        });

        await execution.addThinkingStep(
          "task_completed",
          "Task processing completed with final output"
        );
        break;
      } else {
        // Continue thinking
        thinkingProcess.push({
          step: "continue_reasoning",
          reasoning: parsedResponse.reasoning || "Continuing task analysis",
        });

        await execution.addThinkingStep(
          "continue_reasoning",
          parsedResponse.reasoning || "Continuing task analysis"
        );
      }
    }

    if (!finalOutput) {
      finalOutput =
        "I apologize, but I wasn't able to complete the task within the allowed processing iterations. Please try simplifying the request or providing more specific instructions.";
      
      await execution.addThinkingStep(
        "max_iterations_reached",
        "Maximum iterations reached without completing task"
      );
    }

    return {
      output: finalOutput,
      token_usage: totalTokenUsage,
    };
  }

  /**
   * Build context for agent reasoning with optimized conversation history
   */
  buildAgentContext(agent, conversation) {
    // Use the optimized context method that includes summarization
    const messages = conversation.getContextForAgent(4000); // Limit to ~4K tokens

    return {
      conversation_history: messages,
      available_tools: agent.tools,
      agent_config: agent.config,
      has_summary: !!conversation.conversation_summary,
      summary_version: conversation.metadata.summary_version || 0,
    };
  }

  /**
   * Build reasoning prompt for the agent
   */
  buildReasoningPrompt(agent, context, thinkingProcess, toolsUsed, iteration) {
    let prompt = `You are an AI agent. Your task is to analyze the conversation and decide on the next action.

Conversation History:
${context.conversation_history.map((msg) => `${msg.role}: ${msg.content}`).join("\n")}

Available Tools:
${agent.tools
  .map((tool) => {
    let toolInfo = `- ${tool.name}: ${tool.description}`;
    if (
      tool.name === "api_caller" &&
      tool.parameters &&
      tool.parameters.endpoints
    ) {
      const endpoints = Object.keys(tool.parameters.endpoints);
      toolInfo += `\n  Available endpoints: ${endpoints.join(", ")}`;
    }
    return toolInfo;
  })
  .join("\n")}

Previous Thinking Process:
${thinkingProcess.map((step) => `${step.step}: ${step.reasoning}`).join("\n")}

Tools Used So Far:
${toolsUsed
  .map((tool) => {
    if (tool.success) {
      return `- ${tool.tool_name}: SUCCESS - ${JSON.stringify(tool.result)}`;
    } else {
      return `- ${tool.tool_name}: FAILED - ${tool.error}`;
    }
  })
  .join("\n")}

Current Iteration: ${iteration}

You must respond in one of these formats:

1. To use a tool:
ACTION: use_tool
TOOL: tool_name
PARAMETERS: {"param1": "value1", "param2": "value2"}
REASONING: Why you need to use this tool

For api_caller tool, use this format:
PARAMETERS: {
  "endpoint_name": "endpoint_name",
  "method": "GET|POST|PUT|DELETE",
  "query_params": {"key": "value"},
  "path_params": {"key": "value"}, 
  "body_data": {"key": "value"}
}

2. To respond to the user:
ACTION: respond
RESPONSE: Your response to the user
REASONING: Why this response is appropriate

3. To continue thinking:
ACTION: think
REASONING: What you're thinking about

Choose your action:`;

    return prompt;
  }

  /**
   * Build prompt for task agents
   */
  buildTaskPrompt(agent, input) {
    return `Task Input: ${JSON.stringify(input)}

Available Tools:
${agent.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}

Analyze the task and either:
1. Use a tool if needed (respond with ACTION: use_tool, TOOL: tool_name, PARAMETERS: {...})
2. Provide direct output (respond with ACTION: respond, RESPONSE: your_output)

Your response:`;
  }

  /**
   * Build reasoning prompt for task agents
   */
  buildTaskReasoningPrompt(agent, input, thinkingProcess, toolsUsed, iteration) {
    let prompt = `You are an AI task agent. Your goal is to complete the given task by using available tools when necessary.

Task Input:
${JSON.stringify(input)}

Available Tools:
${agent.tools
  .map((tool) => {
    let toolInfo = `- ${tool.name}: ${tool.description}`;
    if (
      tool.name === "api_caller" &&
      tool.parameters &&
      tool.parameters.endpoints
    ) {
      const endpoints = Object.keys(tool.parameters.endpoints);
      toolInfo += `\n  Available endpoints: ${endpoints.join(", ")}`;
    }
    return toolInfo;
  })
  .join("\n")}

Previous Thinking Process:
${thinkingProcess.map((step) => `${step.step}: ${step.reasoning}`).join("\n")}

Tools Used So Far:
${toolsUsed
  .map((tool) => {
    if (tool.success) {
      return `- ${tool.tool_name}: SUCCESS - ${JSON.stringify(tool.result)}`;
    } else {
      return `- ${tool.tool_name}: FAILED - ${tool.error}`;
    }
  })
  .join("\n")}

Current Iteration: ${iteration}

You must respond in one of these formats:

1. To use a tool:
ACTION: use_tool
TOOL: tool_name
PARAMETERS: {"param1": "value1", "param2": "value2"}
REASONING: Why you need to use this tool

For api_caller tool, use this format:
PARAMETERS: {
  "endpoint_name": "endpoint_name",
  "method": "GET|POST|PUT|DELETE",
  "query_params": {"key": "value"},
  "path_params": {"key": "value"}, 
  "body_data": {"key": "value"}
}

2. To provide final task output:
ACTION: respond
RESPONSE: Your final output/result for the task
REASONING: Why this completes the task

3. To continue analyzing:
ACTION: think
REASONING: What you're thinking about and what you need to do next

Choose your action:`;

    return prompt;
  }

  /**
   * Parse agent response to determine action
   */
  parseAgentResponse(content) {
    console.log("Raw LLM response:", content); // Debug log

    const lines = content.split("\n");
    const result = {};

    // First pass: extract simple single-line fields (except RESPONSE which can be multi-line)
    for (const line of lines) {
      if (line.startsWith("ACTION:")) {
        result.action = line.replace("ACTION:", "").trim();
      } else if (line.startsWith("TOOL:")) {
        result.tool_name = line.replace("TOOL:", "").trim();
      } else if (line.startsWith("REASONING:")) {
        result.reasoning = line.replace("REASONING:", "").trim();
      }
    }

    // Handle multi-line RESPONSE
    const responseIndex = content.indexOf("RESPONSE:");
    if (responseIndex !== -1) {
      const afterResponse = content.substring(
        responseIndex + "RESPONSE:".length
      );

      // Find the end of the response (either next field or end of content)
      const nextFieldMatch = afterResponse.match(
        /\n(ACTION|TOOL|PARAMETERS|REASONING):/
      );
      const responseEnd = nextFieldMatch
        ? nextFieldMatch.index
        : afterResponse.length;

      result.response = afterResponse.substring(0, responseEnd).trim();
      console.log("Parsed multi-line response:", result.response);
    }

    // Second pass: extract potentially multi-line PARAMETERS
    // Find the start of PARAMETERS and manually parse the JSON object
    const parametersIndex = content.indexOf("PARAMETERS:");
    if (parametersIndex !== -1) {
      const afterParameters = content
        .substring(parametersIndex + "PARAMETERS:".length)
        .trim();

      // Find the opening brace
      const openBraceIndex = afterParameters.indexOf("{");
      if (openBraceIndex !== -1) {
        // Count braces to find the matching closing brace
        let braceCount = 0;
        let endIndex = -1;

        for (let i = openBraceIndex; i < afterParameters.length; i++) {
          if (afterParameters[i] === "{") {
            braceCount++;
          } else if (afterParameters[i] === "}") {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }

        if (endIndex !== -1) {
          const jsonStr = afterParameters.substring(
            openBraceIndex,
            endIndex + 1
          );
          try {
            result.tool_parameters = JSON.parse(jsonStr);
            console.log("Parsed parameters:", result.tool_parameters);
          } catch (e) {
            console.error("Failed to parse parameters JSON:", jsonStr);
            console.error("JSON parse error:", e.message);
            result.tool_parameters = {};
          }
        } else {
          console.error("Could not find matching closing brace for PARAMETERS");
          result.tool_parameters = {};
        }
      } else {
        console.error("No opening brace found after PARAMETERS:");
        result.tool_parameters = {};
      }
    } else {
      // Fallback: try single line parsing
      for (const line of lines) {
        if (line.startsWith("PARAMETERS:")) {
          try {
            const paramStr = line.replace("PARAMETERS:", "").trim();
            result.tool_parameters = JSON.parse(paramStr);
            console.log(
              "Parsed single-line parameters:",
              result.tool_parameters
            );
          } catch (e) {
            console.error("Failed to parse single-line parameters:", line);
            console.error("JSON parse error:", e.message);
            result.tool_parameters = {};
          }
          break;
        }
      }

      // If no PARAMETERS found at all
      if (!result.tool_parameters) {
        result.tool_parameters = {};
        console.log("No PARAMETERS found in LLM response");
      }
    }

    console.log("Final parsed result:", result); // Debug log
    return result;
  }

  /**
   * Generate conversation title from first message
   */
  generateConversationTitle(message) {
    if (message.length > 50) {
      return message.substring(0, 47) + "...";
    }
    return message;
  }

  /**
   * Get agent-specific tool configuration
   */
  getAgentToolConfig(agent, toolName) {
    const tool = agent.tools.find((t) => t.name === toolName);
    if (!tool || !tool.parameters) {
      return {};
    }

    // Start with the tool's parameters as config
    const config = { ...tool.parameters };

    // Add agent's API key information for tools that need it
    if (agent.api_key) {
      // Add API key for summarization if enabled
      if (config.summarization?.enabled) {
        config._agent_api_key = {
          key: agent.api_key.key,
          provider: agent.api_key.provider.name,
        };
      }

      // Add API key for FAQ tool to enable semantic similarity
      // Pass the full API key object so it can be decrypted
      if (toolName === "faq") {
        config._agent_api_key = agent.api_key; // Pass full object with decryption method
      }
    }

    return config;
  }

  /**
   * Get agent by ID with validation
   */
  async getAgent(agentId) {
    const agent = await Agent.findById(agentId)
      .populate("api_key")
      .populate("project")
      .populate("organization");

    if (!agent) {
      throw new Error("Agent not found");
    }

    if (!agent.is_active) {
      throw new Error("Agent is not active");
    }

    return agent;
  }

  /**
   * Handle conversation summarization when needed
   */
  async handleConversationSummarization(conversation, agent) {
    try {
      // Check if summarization is needed
      if (!summarizationService.shouldSummarize(conversation)) {
        return;
      }

      console.log(
        `Starting summarization for conversation ${conversation._id}`
      );

      // Get messages to summarize
      const messagesToSummarize =
        summarizationService.getMessagesToSummarize(conversation);

      if (messagesToSummarize.length === 0) {
        console.log("No messages to summarize");
        return;
      }

      // Get existing summary for incremental updates
      const existingSummary = conversation.conversation_summary;

      // Perform summarization
      const result = await summarizationService.summarizeConversation(
        messagesToSummarize,
        agent,
        existingSummary
      );

      // Update conversation with new summary
      await conversation.updateSummary(result.summary);

      console.log(
        `Conversation summarized successfully. Token savings estimated: ${summarizationService.estimateTokenSavings(
          messagesToSummarize
        )} tokens`
      );

      // Log summarization metrics
      this.logSummarizationMetrics(
        conversation,
        messagesToSummarize.length,
        result
      );
    } catch (error) {
      console.error("Summarization failed:", error);
      // Don't throw error - conversation should continue even if summarization fails
    }
  }

  /**
   * Log summarization metrics for monitoring
   */
  logSummarizationMetrics(conversation, messageCount, result) {
    console.log("Summarization Metrics:", {
      conversation_id: conversation._id,
      messages_summarized: messageCount,
      total_messages: conversation.messages.length,
      summary_version: conversation.metadata.summary_version,
      tokens_used: result.token_usage.total_tokens,
      cost: result.token_usage.cost,
      model_used: result.model_used,
    });
  }

  /**
   * Build enhanced system prompt with dynamic context
   */
  buildEnhancedSystemPrompt(baseSystemPrompt, dynamicContext = {}) {
    let enhancedPrompt = baseSystemPrompt;

    // Add context information if provided
    if (Object.keys(dynamicContext).length > 0) {
      const contextString = Object.entries(dynamicContext)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n");

      enhancedPrompt += `\n\nAdditional Context:\n${contextString}`;
    }

    return enhancedPrompt;
  }
}

module.exports = new AgentService();
