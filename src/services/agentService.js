const Agent = require("../models/Agent");
const Conversation = require("../models/Conversation");
const AgentExecution = require("../models/AgentExecution");
const OpenAIService = require("./openaiService");
const toolService = require("./toolService");
const APIKey = require("../models/ApiKey");
const summarizationService = require("./summarizationService");

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

    // Check if conversation needs summarization
    await this.handleConversationSummarization(conversation, agent);

    return {
      conversation_id: conversation._id,
      response: response.content,
      thinking_process: response.thinking_process,
      tools_used: response.tools_used,
      token_usage: response.token_usage,
    };
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
    const agent = await Agent.findById(agentId).populate("api_key");
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
    const openai = new OpenAIService(
      agent.api_key.key,
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
   * Task-specific reasoning (simpler, single execution)
   */
  async executeTaskReasoning(agent, input, execution, dynamicContext = {}) {
    const openai = new OpenAIService(
      agent.api_key.key,
      agent.api_key.provider.name
    );

    await execution.addThinkingStep(
      "analyze_task",
      "Analyzing task input and determining execution strategy"
    );

    // Build task context
    const prompt = this.buildTaskPrompt(agent, input);

    // Execute reasoning
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

    // Parse response for tool usage or direct output
    const parsedResponse = this.parseAgentResponse(llmResponse.content);

    let output = parsedResponse.response || llmResponse.content;

    // Execute tools if needed
    if (parsedResponse.action === "use_tool") {
      const toolResult = await toolService.executeToolWithConfig(
        parsedResponse.tool_name,
        parsedResponse.tool_parameters,
        this.getAgentToolConfig(agent, parsedResponse.tool_name)
      );

      await execution.addToolExecution(
        parsedResponse.tool_name,
        parsedResponse.tool_parameters,
        toolResult.result,
        toolResult.execution_time_ms
      );

      // Generate final output with tool result
      const finalPrompt = `Based on the tool result: ${JSON.stringify(toolResult.result)}\n\nProvide the final output for the task: ${JSON.stringify(input)}`;

      const finalResponse = await openai.generateCompletion(
        agent.llm_settings.model,
        finalPrompt,
        agent.llm_settings.parameters
      );

      output = finalResponse.content;
    }

    await execution.addThinkingStep(
      "task_completed",
      "Task processing completed"
    );

    return {
      output: output,
      token_usage: llmResponse.usage,
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

    // Add agent's API key information for summarization if enabled
    if (config.summarization?.enabled && agent.api_key) {
      config._agent_api_key = {
        key: agent.api_key.key,
        provider: agent.api_key.provider.name,
      };
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
