const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');
const AgentExecution = require('../models/AgentExecution');
const OpenAIService = require('./openaiService');
const toolService = require('./toolService');
const APIKey = require('../models/ApiKey');
const summarizationService = require('./summarizationService');
const suggestionService = require('./suggestionService');

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
      path: 'api_key',
      populate: {
        path: 'provider',
      },
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (!agent.is_active) {
      throw new Error(
        'Agent is currently disabled. Please contact your administrator.'
      );
    }

    if (agent.type !== 'chatbot') {
      throw new Error('Agent is not a chatbot type');
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.agent !== agentId) {
        throw new Error(
          'Conversation not found or does not belong to this agent'
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

    // Check if conversation is under human control or handoff requested
    if (
      conversation &&
      (conversation.status === 'handoff_requested' ||
        conversation.current_handler === 'human')
    ) {
      // Add user message to conversation
      await conversation.addMessage({
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      });

      // Return handoff notification instead of agent response
      const handoffMessage =
        conversation.status === 'handoff_requested'
          ? 'Your request has been forwarded to a human operator. Please wait for assistance.'
          : `You are currently chatting with a human operator from our support team.`;

      return {
        conversation_id: conversation._id,
        response: handoffMessage,
        handoff_requested: conversation.status === 'handoff_requested',
        handoff_info: conversation.handoff_info,
        token_usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cost: 0,
        },
        tools_used: [],
      };
    }

    // Update dynamic context if provided
    if (dynamicContext && Object.keys(dynamicContext).length > 0) {
      conversation.dynamic_context = dynamicContext;
      conversation.dynamic_context_updated_at = new Date();
      await conversation.save();
    }

    // Add user message to conversation
    await conversation.addMessage({
      role: 'user',
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
      role: 'assistant',
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

    // Check if handoff was requested
    const handoffTool = response.tools_used?.find(
      tool => tool.tool_name === 'request_human_handoff' && tool.success
    );

    const result = {
      conversation_id: conversation._id,
      response: response.content,
      thinking_process: response.thinking_process,
      tools_used: response.tools_used,
      token_usage: response.token_usage,
    };

    // Add handoff information to response if handoff was requested
    if (handoffTool) {
      result.handoff_requested = true;
      result.handoff_info = {
        reason: handoffTool.parameters.reason,
        urgency: handoffTool.parameters.urgency,
        context_summary: handoffTool.parameters.context_summary,
        status: 'handoff_requested',
        requested_at: new Date().toISOString(),
      };
    }

    // Add suggestions to response if available
    if (suggestions) {
      result.suggestions = suggestions;
      result.suggestion_usage = suggestionUsage;
    }

    return result;
  }

  /**
   * Execute a chatbot agent with streaming support
   */
  async executeChatbotAgentStream(
    agentId,
    conversationId,
    userMessage,
    userIdentifier,
    dynamicContext = {},
    streamCallback = null
  ) {
    //populate agent with API key and provider of api key
    const agent = await Agent.findById(agentId).populate({
      path: 'api_key',
      populate: {
        path: 'provider',
      },
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (!agent.is_active) {
      throw new Error(
        'Agent is currently disabled. Please contact your administrator.'
      );
    }

    if (agent.type !== 'chatbot') {
      throw new Error('Agent is not a chatbot type');
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.agent !== agentId) {
        throw new Error(
          'Conversation not found or does not belong to this agent'
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

    // Check if conversation is under human control or handoff requested
    if (
      conversation &&
      (conversation.status === 'handoff_requested' ||
        conversation.current_handler === 'human')
    ) {
      // Add user message to conversation
      await conversation.addMessage({
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      });

      // Return handoff notification instead of agent response
      const handoffMessage =
        conversation.status === 'handoff_requested'
          ? 'Your request has been forwarded to a human operator. Please wait for assistance.'
          : `You are currently chatting with a human operator from our support team.`;

      return {
        conversation_id: conversation._id,
        response: handoffMessage,
        handoff_status: conversation.status,
        current_handler: conversation.current_handler,
        handoff_info: conversation.handoff_info,
        token_usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cost: 0,
        },
        tools_used: [],
      };
    }

    // Update dynamic context if provided
    if (dynamicContext && Object.keys(dynamicContext).length > 0) {
      conversation.dynamic_context = dynamicContext;
      conversation.dynamic_context_updated_at = new Date();
      await conversation.save();
    }

    // Add user message to conversation
    await conversation.addMessage({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    });

    // Execute agent reasoning with streaming
    const response = await this.executeAgentReasoningStream(
      agent,
      conversation,
      dynamicContext,
      streamCallback
    );

    // Add assistant response to conversation
    await conversation.addMessage({
      role: 'assistant',
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

    // Check if handoff was requested
    const handoffTool = response.tools_used?.find(
      tool => tool.tool_name === 'request_human_handoff' && tool.success
    );

    const result = {
      conversation_id: conversation._id,
      response: response.content,
      thinking_process: response.thinking_process,
      tools_used: response.tools_used,
      token_usage: response.token_usage,
    };

    // Add handoff information to response if handoff was requested
    if (handoffTool) {
      result.handoff_requested = true;
      result.handoff_info = {
        reason: handoffTool.parameters.reason,
        urgency: handoffTool.parameters.urgency,
        context_summary: handoffTool.parameters.context_summary,
        status: 'handoff_requested',
        requested_at: new Date().toISOString(),
      };
    }

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
      path: 'api_key',
      populate: {
        path: 'provider',
      },
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (!agent.is_active) {
      throw new Error(
        'Agent is currently disabled. Please contact your administrator.'
      );
    }

    if (agent.type !== 'task') {
      throw new Error('Agent is not a task type');
    }

    // Create execution record
    const execution = new AgentExecution({
      agent: agentId,
      type: 'task',
      input,
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
        status: 'completed',
      };
    } catch (error) {
      await execution.fail(error);
      throw error;
    }
  }

  /**
   * Execute a task agent with streaming support
   */
  async executeTaskAgentStream(
    agentId,
    input,
    userIdentifier = null,
    dynamicContext = {},
    streamCallback = null
  ) {
    const agent = await Agent.findById(agentId).populate({
      path: 'api_key',
      populate: {
        path: 'provider',
      },
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (!agent.is_active) {
      throw new Error(
        'Agent is currently disabled. Please contact your administrator.'
      );
    }

    if (agent.type !== 'task') {
      throw new Error('Agent is not a task type');
    }

    // Create execution record
    const execution = new AgentExecution({
      agent: agentId,
      type: 'task',
      input,
      metadata: {
        user_identifier: userIdentifier,
      },
    });
    await execution.save();
    await execution.start();

    try {
      // Execute agent reasoning with streaming
      const result = await this.executeTaskReasoningStream(
        agent,
        input,
        execution,
        dynamicContext,
        streamCallback
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
        status: 'completed',
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
    const decriptedApiKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decriptedApiKey,
      agent.api_key.provider.name
    );

    const thinkingProcess = [];
    const toolsUsed = [];
    const totalTokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };

    // Build context for the agent
    const context = this.buildAgentContext(agent, conversation);

    // Initial reasoning step
    thinkingProcess.push({
      step: 'analyze_input',
      reasoning: 'Analyzing user input and determining response strategy',
    });

    const maxIterations = agent.config.max_tool_calls || 5;
    let currentIteration = 0;
    let finalResponse = '';

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

      if (parsedResponse.action === 'use_tool') {
        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          reasoning: `Decided to use tool: ${parsedResponse.tool_name}`,
        });

        const toolResult = await toolService.executeToolWithConfig(
          parsedResponse.tool_name,
          parsedResponse.tool_parameters,
          this.getAgentToolConfig(
            agent,
            parsedResponse.tool_name,
            conversation._id
          )
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
            step: 'tool_failed',
            reasoning: `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`,
          });
        }

        toolsUsed.push(toolResultForAgent);

        // Check if this is a human handoff request - stop processing immediately
        if (
          parsedResponse.tool_name === 'request_human_handoff' &&
          toolResult.success
        ) {
          finalResponse =
            'I understand this requires specialized assistance. Let me connect you with one of our team members who can better help you with this. Please wait a moment.';
          thinkingProcess.push({
            step: 'human_handoff_requested',
            reasoning:
              'Human handoff was requested, stopping agent processing and waiting for human operator',
          });
          break;
        }
        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === 'respond') {
        // Agent decided to respond to user
        finalResponse = parsedResponse.response;
        thinkingProcess.push({
          step: 'final_response',
          reasoning: 'Determined sufficient information to respond to user',
        });
        break;
      } else {
        // Continue thinking
        thinkingProcess.push({
          step: 'continue_reasoning',
          reasoning: parsedResponse.reasoning || 'Continuing analysis',
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
   * Core agent reasoning engine with streaming support
   */
  async executeAgentReasoningStream(
    agent,
    conversation,
    dynamicContext = {},
    streamCallback = null
  ) {
    const decriptedApiKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decriptedApiKey,
      agent.api_key.provider.name
    );

    const thinkingProcess = [];
    const toolsUsed = [];
    const totalTokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };

    // Build context for the agent
    const context = this.buildAgentContext(agent, conversation);

    // Initial reasoning step
    thinkingProcess.push({
      step: 'analyze_input',
      reasoning: 'Analyzing user input and determining response strategy',
    });

    const maxIterations = agent.config.max_tool_calls || 5;
    let currentIteration = 0;
    let finalResponse = '';

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

      // Get LLM response with streaming
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        dynamicContext
      );

      let streamBuffer = '';
      let isStreaming = false;
      let streamingStarted = false;
      let responseContentSent = '';

      const onChunk = chunk => {
        streamBuffer += chunk;

        // Check if we've detected a RESPONSE action and should start streaming
        if (!streamingStarted && this.shouldStartStreaming(streamBuffer)) {
          isStreaming = true;
          streamingStarted = true;

          // Extract and stream the response content so far
          const responseContent = this.extractResponseFromBuffer(streamBuffer);
          if (responseContent && streamCallback) {
            streamCallback(responseContent);
            responseContentSent = responseContent;
          }
        } else if (isStreaming && streamCallback) {
          // Use buffered approach to prevent REASONING from being streamed
          const safeContent = this.extractSafeStreamingContent(
            streamBuffer,
            responseContentSent
          );
          if (safeContent && safeContent !== responseContentSent) {
            const newContent = safeContent.substring(
              responseContentSent.length
            );
            if (newContent) {
              streamCallback(newContent);
              responseContentSent = safeContent;
            }
          }

          // Check if we should stop streaming (REASONING detected)
          if (this.shouldStopStreaming(streamBuffer)) {
            isStreaming = false;
            return;
          }
        }
      };

      const llmResponse = await openai.generateStreamingCompletion(
        agent.llm_settings.model,
        prompt,
        agent.llm_settings.parameters,
        enhancedSystemPrompt,
        onChunk
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === 'use_tool') {
        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          reasoning: `Decided to use tool: ${parsedResponse.tool_name}`,
        });

        const toolResult = await toolService.executeToolWithConfig(
          parsedResponse.tool_name,
          parsedResponse.tool_parameters,
          this.getAgentToolConfig(
            agent,
            parsedResponse.tool_name,
            conversation._id
          )
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
            step: 'tool_failed',
            reasoning: `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`,
          });
        }

        toolsUsed.push(toolResultForAgent);

        // Check if this is a human handoff request - stop processing immediately
        if (
          parsedResponse.tool_name === 'request_human_handoff' &&
          toolResult.success
        ) {
          finalResponse =
            'I understand this requires specialized assistance. Let me connect you with one of our team members who can better help you with this. Please wait a moment.';
          thinkingProcess.push({
            step: 'human_handoff_requested',
            reasoning:
              'Human handoff was requested, stopping agent processing and waiting for human operator',
          });
          break;
        }
        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === 'respond') {
        // Agent decided to respond to user
        finalResponse = parsedResponse.response;
        thinkingProcess.push({
          step: 'final_response',
          reasoning: 'Determined sufficient information to respond to user',
        });
        break;
      } else {
        // Continue thinking
        thinkingProcess.push({
          step: 'continue_reasoning',
          reasoning: parsedResponse.reasoning || 'Continuing analysis',
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
   * Check if we should start streaming based on the buffer content
   */
  shouldStartStreaming(buffer) {
    // Look for ACTION: respond pattern
    return (
      buffer.includes('ACTION: respond') || buffer.includes('ACTION:respond')
    );
  }

  /**
   * Extract response content from buffer when streaming starts
   */
  extractResponseFromBuffer(buffer) {
    const responseIndex = buffer.indexOf('RESPONSE:');
    if (responseIndex === -1) return '';

    const afterResponse = buffer.substring(responseIndex + 'RESPONSE:'.length);

    // Enhanced pattern matching to catch all field transitions and REASONING variants
    const nextFieldMatch = afterResponse.match(
      /\n(ACTION|TOOL|PARAMETERS|REASONING):/i
    );
    if (nextFieldMatch) {
      let content = afterResponse.substring(0, nextFieldMatch.index).trim();

      // Double-check for any remaining REASONING traces
      const reasoningCheck = content.toLowerCase().indexOf('reasoning');
      if (reasoningCheck !== -1) {
        content = content.substring(0, reasoningCheck).trim();
      }

      return content;
    }

    // If no next field found yet, check for REASONING without newline
    const reasoningIndex = afterResponse.toLowerCase().indexOf('reasoning');
    if (reasoningIndex !== -1) {
      return afterResponse.substring(0, reasoningIndex).trim();
    }

    // Return what we have, trimmed
    return afterResponse.trim();
  }

  /**
   * Extract new response content from the latest chunk
   */
  extractNewResponseContent(buffer, chunk) {
    // If we're in streaming mode and this chunk contains response content
    const responseIndex = buffer.indexOf('RESPONSE:');
    if (responseIndex === -1) return '';

    // Check if this chunk contains "REASONING:" - if so, stop streaming
    if (chunk.includes('REASONING:') || chunk.includes('\nREASONING:')) {
      return ''; // Don't stream anything that contains REASONING
    }

    const beforeChunk = buffer.substring(0, buffer.length - chunk.length);
    const beforeResponseContent = this.extractResponseFromBuffer(beforeChunk);
    const currentResponseContent = this.extractResponseFromBuffer(buffer);

    // Return only the new content, but make sure it doesn't contain REASONING
    if (currentResponseContent.length > beforeResponseContent.length) {
      const newContent = currentResponseContent.substring(
        beforeResponseContent.length
      );

      // Double-check that the new content doesn't contain REASONING
      if (newContent.includes('REASONING:')) {
        return '';
      }

      return newContent;
    }

    return '';
  }

  /**
   * Extract safe response content with enhanced REASONING detection
   */
  extractSafeResponseContent(buffer, alreadySent = '') {
    const responseIndex = buffer.indexOf('RESPONSE:');
    if (responseIndex === -1) return '';

    const afterResponse = buffer.substring(responseIndex + 'RESPONSE:'.length);

    // Look for any field that comes after RESPONSE (ACTION, TOOL, PARAMETERS, REASONING)
    const nextFieldPatterns = [
      /\nACTION:/i,
      /\nTOOL:/i,
      /\nPARAMETERS:/i,
      /\nREASONING:/i,
      /\n\nREASONING:/i,
      // Also catch variations without newlines
      /REASONING:/i,
    ];

    let safeEndIndex = afterResponse.length;

    for (const pattern of nextFieldPatterns) {
      const match = afterResponse.match(pattern);
      if (match && match.index !== undefined && match.index < safeEndIndex) {
        safeEndIndex = match.index;
      }
    }

    let safeContent = afterResponse.substring(0, safeEndIndex).trim();

    // Additional safety: if the content contains any variation of "reasoning", truncate before it
    const reasoningVariants = [
      'reasoning:',
      'REASONING:',
      'Reasoning:',
      'reason:',
      'REASON:',
    ];
    for (const variant of reasoningVariants) {
      const reasoningIndex = safeContent.indexOf(variant);
      if (reasoningIndex !== -1) {
        safeContent = safeContent.substring(0, reasoningIndex).trim();
        break;
      }
    }

    return safeContent;
  }

  /**
   * Extract safe streaming content with aggressive REASONING prevention
   */
  extractSafeStreamingContent(buffer, alreadySent = '') {
    const responseIndex = buffer.indexOf('RESPONSE:');
    if (responseIndex === -1) return alreadySent;

    const afterResponse = buffer.substring(responseIndex + 'RESPONSE:'.length);

    // Look for the start of any next field or REASONING patterns
    const dangerPatterns = [
      '\nACTION:',
      '\nTOOL:',
      '\nPARAMETERS:',
      '\nREASONING:',
      '\n\nREASONING:',
      'REASONING:',
      '\nRE', // Catch partial REASONING
      '\nREA',
      '\nREAS',
      '\nREASO',
      '\nREASON',
      '\nREASONI',
      '\nREASONIN',
      'RE', // Very aggressive - catch even "RE" at end of response to prevent REASONING
    ];

    let safeContent = afterResponse.trim();
    let safeEndIndex = safeContent.length;

    // Find the earliest occurrence of any dangerous pattern
    for (const pattern of dangerPatterns) {
      const patternIndex = afterResponse.indexOf(pattern);
      if (patternIndex !== -1 && patternIndex < safeEndIndex) {
        safeEndIndex = patternIndex;
      }
    }

    // Take only the safe portion
    safeContent = afterResponse.substring(0, safeEndIndex).trim();

    // Additional check: if the content ends with partial REASONING letters, trim them
    const partialReasoningPatterns = [
      'R',
      'RE',
      'REA',
      'REAS',
      'REASO',
      'REASON',
      'REASONI',
      'REASONIN',
    ];
    for (const pattern of partialReasoningPatterns) {
      if (
        safeContent.endsWith('\n' + pattern) ||
        safeContent.endsWith(pattern)
      ) {
        // Remove the partial pattern
        const lastIndex = safeContent.lastIndexOf(pattern);
        if (lastIndex !== -1) {
          safeContent = safeContent.substring(0, lastIndex).trim();
        }
      }
    }

    return safeContent;
  }

  /**
   * Check if streaming should stop (REASONING detected)
   */
  shouldStopStreaming(buffer) {
    const stopPatterns = [
      'REASONING:',
      '\nREASONING:',
      '\n\nREASONING:',
      '\nreasoning:',
    ];

    for (const pattern of stopPatterns) {
      if (buffer.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Task-specific reasoning with iterative tool usage
   */
  async executeTaskReasoning(agent, input, execution, dynamicContext = {}) {
    const decryptedApiKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decryptedApiKey,
      agent.api_key.provider.name
    );

    const thinkingProcess = [];
    const toolsUsed = [];
    const totalTokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };

    await execution.addThinkingStep(
      'analyze_task',
      'Analyzing task input and determining execution strategy'
    );

    thinkingProcess.push({
      step: 'analyze_task',
      reasoning: 'Analyzing task input and determining execution strategy',
    });

    const maxIterations = agent.config.max_tool_calls || 5;
    let currentIteration = 0;
    let finalOutput = '';

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

      if (parsedResponse.action === 'use_tool') {
        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          reasoning: `Decided to use tool: ${parsedResponse.tool_name}`,
        });

        await execution.addThinkingStep(
          'tool_execution',
          `Using tool: ${parsedResponse.tool_name}`
        );

        const toolResult = await toolService.executeToolWithConfig(
          parsedResponse.tool_name,
          parsedResponse.tool_parameters,
          this.getAgentToolConfig(
            agent,
            parsedResponse.tool_name,
            execution ? execution._id : null
          )
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
            step: 'tool_failed',
            reasoning: `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`,
          });

          // Check if this is a human handoff request - stop processing immediately
          if (
            parsedResponse.tool_name === 'request_human_handoff' &&
            toolResult.success
          ) {
            // For task agents, we cannot properly handle handoffs, so we log and continue
            console.warn(
              'Human handoff requested in task agent - functionality limited'
            );
          }
          await execution.addThinkingStep(
            'tool_failed',
            `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`
          );
        }

        toolsUsed.push(toolResultForAgent);

        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === 'respond') {
        // Agent decided to provide final output
        finalOutput = parsedResponse.response;
        thinkingProcess.push({
          step: 'task_completed',
          reasoning: 'Determined sufficient information to complete the task',
        });

        await execution.addThinkingStep(
          'task_completed',
          'Task processing completed with final output'
        );
        break;
      } else {
        // Continue thinking
        thinkingProcess.push({
          step: 'continue_reasoning',
          reasoning: parsedResponse.reasoning || 'Continuing task analysis',
        });

        await execution.addThinkingStep(
          'continue_reasoning',
          parsedResponse.reasoning || 'Continuing task analysis'
        );
      }
    }

    if (!finalOutput) {
      finalOutput =
        "I apologize, but I wasn't able to complete the task within the allowed processing iterations. Please try simplifying the request or providing more specific instructions.";

      await execution.addThinkingStep(
        'max_iterations_reached',
        'Maximum iterations reached without completing task'
      );
    }

    return {
      output: finalOutput,
      token_usage: totalTokenUsage,
    };
  }

  /**
   * Task-specific reasoning with streaming support
   */
  async executeTaskReasoningStream(
    agent,
    input,
    execution,
    dynamicContext = {},
    streamCallback = null
  ) {
    const decryptedApiKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decryptedApiKey,
      agent.api_key.provider.name
    );

    const thinkingProcess = [];
    const toolsUsed = [];
    const totalTokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };

    await execution.addThinkingStep(
      'analyze_task',
      'Analyzing task input and determining execution strategy'
    );

    thinkingProcess.push({
      step: 'analyze_task',
      reasoning: 'Analyzing task input and determining execution strategy',
    });

    const maxIterations = agent.config.max_tool_calls || 5;
    let currentIteration = 0;
    let finalOutput = '';

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

      // Get LLM response with streaming
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        dynamicContext
      );

      let streamBuffer = '';
      let isStreaming = false;
      let streamingStarted = false;
      let responseContentSent = '';

      const onChunk = chunk => {
        streamBuffer += chunk;

        // Check if we've detected a RESPONSE action and should start streaming
        if (!streamingStarted && this.shouldStartStreaming(streamBuffer)) {
          isStreaming = true;
          streamingStarted = true;

          // Extract and stream the response content so far
          const responseContent = this.extractResponseFromBuffer(streamBuffer);
          if (responseContent && streamCallback) {
            streamCallback(responseContent);
            responseContentSent = responseContent;
          }
        } else if (isStreaming && streamCallback) {
          // Use buffered approach to prevent REASONING from being streamed
          const safeContent = this.extractSafeStreamingContent(
            streamBuffer,
            responseContentSent
          );
          if (safeContent && safeContent !== responseContentSent) {
            const newContent = safeContent.substring(
              responseContentSent.length
            );
            if (newContent) {
              streamCallback(newContent);
              responseContentSent = safeContent;
            }
          }

          // Check if we should stop streaming (REASONING detected)
          if (this.shouldStopStreaming(streamBuffer)) {
            isStreaming = false;
            return;
          }
        }
      };

      const llmResponse = await openai.generateStreamingCompletion(
        agent.llm_settings.model,
        prompt,
        agent.llm_settings.parameters,
        enhancedSystemPrompt,
        onChunk
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === 'use_tool') {
        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          reasoning: `Decided to use tool: ${parsedResponse.tool_name}`,
        });

        await execution.addThinkingStep(
          'tool_execution',
          `Using tool: ${parsedResponse.tool_name}`
        );

        const toolResult = await toolService.executeToolWithConfig(
          parsedResponse.tool_name,
          parsedResponse.tool_parameters,
          this.getAgentToolConfig(
            agent,
            parsedResponse.tool_name,
            conversation ? conversation._id : execution ? execution._id : null
          )
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
            step: 'tool_failed',
            reasoning: `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`,
          });

          // Check if this is a human handoff request - stop processing immediately
          if (
            parsedResponse.tool_name === 'request_human_handoff' &&
            toolResult.success
          ) {
            // For task agents, we cannot properly handle handoffs, so we log and continue
            console.warn(
              'Human handoff requested in task agent - functionality limited'
            );
          }
          await execution.addThinkingStep(
            'tool_failed',
            `Tool ${parsedResponse.tool_name} failed: ${toolResult.error}`
          );
        }

        toolsUsed.push(toolResultForAgent);

        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === 'respond') {
        // Agent decided to provide final output
        finalOutput = parsedResponse.response;
        thinkingProcess.push({
          step: 'task_completed',
          reasoning: 'Determined sufficient information to complete the task',
        });

        await execution.addThinkingStep(
          'task_completed',
          'Task processing completed with final output'
        );
        break;
      } else {
        // Continue thinking
        thinkingProcess.push({
          step: 'continue_reasoning',
          reasoning: parsedResponse.reasoning || 'Continuing task analysis',
        });

        await execution.addThinkingStep(
          'continue_reasoning',
          parsedResponse.reasoning || 'Continuing task analysis'
        );
      }
    }

    if (!finalOutput) {
      finalOutput =
        "I apologize, but I wasn't able to complete the task within the allowed processing iterations. Please try simplifying the request or providing more specific instructions.";

      await execution.addThinkingStep(
        'max_iterations_reached',
        'Maximum iterations reached without completing task'
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
    const prompt = `You are an AI agent. Your task is to analyze the conversation and decide on the next action.

Conversation History:
${context.conversation_history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Available Tools:
${agent.tools
  .map(tool => {
    let toolInfo = `- ${tool.name}: ${tool.description}`;
    if (
      tool.name === 'api_caller' &&
      tool.parameters &&
      tool.parameters.endpoints
    ) {
      const endpoints = Object.keys(tool.parameters.endpoints);
      toolInfo += `\n  Available endpoints: ${endpoints.join(', ')}`;
    }
    return toolInfo;
  })
  .join('\n')}

Previous Thinking Process:
${thinkingProcess.map(step => `${step.step}: ${step.reasoning}`).join('\n')}

Tools Used So Far:
${toolsUsed
  .map(tool => {
    if (tool.success) {
      return `- ${tool.tool_name}: SUCCESS - ${JSON.stringify(tool.result)}`;
    } else {
      return `- ${tool.tool_name}: FAILED - ${tool.error}`;
    }
  })
  .join('\n')}

Current Iteration: ${iteration}

You must respond in one of these formats:

1. To use a tool (including request_human_handoff):
ACTION: use_tool
TOOL: tool_name
PARAMETERS: {"param1": "value1", "param2": "value2"}
REASONING: Why you need to use this tool

IMPORTANT: ALL tools must be called with ACTION: use_tool. Never use the tool name as the action.
Example for human handoff:
ACTION: use_tool
TOOL: request_human_handoff
PARAMETERS: {"reason": "Customer requested human assistance", "urgency": "low"}

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
${agent.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

Analyze the task and either:
1. Use a tool if needed (respond with ACTION: use_tool, TOOL: tool_name, PARAMETERS: {...})
2. Provide direct output (respond with ACTION: respond, RESPONSE: your_output)

Your response:`;
  }

  /**
   * Build reasoning prompt for task agents
   */
  buildTaskReasoningPrompt(
    agent,
    input,
    thinkingProcess,
    toolsUsed,
    iteration
  ) {
    const prompt = `You are an AI task agent. Your goal is to complete the given task by using available tools when necessary.

Task Input:
${JSON.stringify(input)}

Available Tools:
${agent.tools
  .map(tool => {
    let toolInfo = `- ${tool.name}: ${tool.description}`;
    if (
      tool.name === 'api_caller' &&
      tool.parameters &&
      tool.parameters.endpoints
    ) {
      const endpoints = Object.keys(tool.parameters.endpoints);
      toolInfo += `\n  Available endpoints: ${endpoints.join(', ')}`;
    }
    return toolInfo;
  })
  .join('\n')}

Previous Thinking Process:
${thinkingProcess.map(step => `${step.step}: ${step.reasoning}`).join('\n')}

Tools Used So Far:
${toolsUsed
  .map(tool => {
    if (tool.success) {
      return `- ${tool.tool_name}: SUCCESS - ${JSON.stringify(tool.result)}`;
    } else {
      return `- ${tool.tool_name}: FAILED - ${tool.error}`;
    }
  })
  .join('\n')}

Current Iteration: ${iteration}

You must respond in one of these formats:

1. To use a tool (including request_human_handoff):
ACTION: use_tool
TOOL: tool_name
PARAMETERS: {"param1": "value1", "param2": "value2"}
REASONING: Why you need to use this tool

IMPORTANT: ALL tools must be called with ACTION: use_tool. Never use the tool name as the action.
Example for human handoff:
ACTION: use_tool
TOOL: request_human_handoff
PARAMETERS: {"reason": "Customer requested human assistance", "urgency": "low"}

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
    console.log('Raw LLM response:', content); // Debug log

    const lines = content.split('\n');
    const result = {};

    // First pass: extract simple single-line fields (except RESPONSE which can be multi-line)
    for (const line of lines) {
      if (line.startsWith('ACTION:')) {
        result.action = line.replace('ACTION:', '').trim();
      } else if (line.startsWith('TOOL:')) {
        result.tool_name = line.replace('TOOL:', '').trim();
      } else if (line.startsWith('REASONING:')) {
        result.reasoning = line.replace('REASONING:', '').trim();
      }
    }

    // Handle multi-line RESPONSE
    const responseIndex = content.indexOf('RESPONSE:');
    if (responseIndex !== -1) {
      const afterResponse = content.substring(
        responseIndex + 'RESPONSE:'.length
      );

      // Find the end of the response (either next field or end of content)
      const nextFieldMatch = afterResponse.match(
        /\n(ACTION|TOOL|PARAMETERS|REASONING):/
      );
      const responseEnd = nextFieldMatch
        ? nextFieldMatch.index
        : afterResponse.length;

      result.response = afterResponse.substring(0, responseEnd).trim();
      console.log('Parsed multi-line response:', result.response);
    }

    // Second pass: extract potentially multi-line PARAMETERS
    // Find the start of PARAMETERS and manually parse the JSON object
    const parametersIndex = content.indexOf('PARAMETERS:');
    if (parametersIndex !== -1) {
      const afterParameters = content
        .substring(parametersIndex + 'PARAMETERS:'.length)
        .trim();

      // Find the opening brace
      const openBraceIndex = afterParameters.indexOf('{');
      if (openBraceIndex !== -1) {
        // Count braces to find the matching closing brace
        let braceCount = 0;
        let endIndex = -1;

        for (let i = openBraceIndex; i < afterParameters.length; i++) {
          if (afterParameters[i] === '{') {
            braceCount++;
          } else if (afterParameters[i] === '}') {
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
            console.log('Parsed parameters:', result.tool_parameters);
          } catch (e) {
            console.error('Failed to parse parameters JSON:', jsonStr);
            console.error('JSON parse error:', e.message);
            result.tool_parameters = {};
          }
        } else {
          console.error('Could not find matching closing brace for PARAMETERS');
          result.tool_parameters = {};
        }
      } else {
        console.error('No opening brace found after PARAMETERS:');
        result.tool_parameters = {};
      }
    } else {
      // Fallback: try single line parsing
      for (const line of lines) {
        if (line.startsWith('PARAMETERS:')) {
          try {
            const paramStr = line.replace('PARAMETERS:', '').trim();
            result.tool_parameters = JSON.parse(paramStr);
            console.log(
              'Parsed single-line parameters:',
              result.tool_parameters
            );
          } catch (e) {
            console.error('Failed to parse single-line parameters:', line);
            console.error('JSON parse error:', e.message);
            result.tool_parameters = {};
          }
          break;
        }
      }

      // If no PARAMETERS found at all
      if (!result.tool_parameters) {
        result.tool_parameters = {};
        console.log('No PARAMETERS found in LLM response');
      }
    }

    console.log('Final parsed result:', result); // Debug log
    return result;
  }

  /**
   * Generate conversation title from first message
   */
  generateConversationTitle(message) {
    if (message.length > 50) {
      return `${message.substring(0, 47)}...`;
    }
    return message;
  }

  /**
   * Get agent-specific tool configuration
   */
  getAgentToolConfig(agent, toolName, conversationId = null) {
    const tool = agent.tools.find(t => t.name === toolName);
    if (!tool || !tool.parameters) {
      return {};
    }

    // Start with the tool's parameters as config
    const config = { ...tool.parameters };

    // Add organization and project context for all tools
    config.organization_id = agent.organization;
    config.project_id = agent.project;

    // Add conversation context for human handoff tool
    if (toolName === 'request_human_handoff') {
      console.log(
        'Setting handoff config - conversationId:',
        conversationId,
        'agent._id:',
        agent._id
      );
      config.conversation_id = conversationId; // May be null for task agents
      config.agent_id = agent._id;
    }

    // Add agent's API key information for tools that need it
    if (agent.api_key) {
      // Add API key ID for RAG search and other tools that need embeddings
      if (toolName === 'rag_search') {
        config._agent_api_key_id = agent.api_key._id;
        config._agent_api_key = agent.api_key; // Also pass full object for backward compatibility
      }

      // Add API key for summarization if enabled
      if (config.summarization?.enabled) {
        config._agent_api_key = {
          key: agent.api_key.key,
          provider: agent.api_key.provider.name,
        };
      }

      // Add API key for FAQ tool to enable semantic similarity
      // Pass the full API key object so it can be decrypted
      if (toolName === 'faq') {
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
      .populate('api_key')
      .populate('project')
      .populate('organization');

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (!agent.is_active) {
      throw new Error('Agent is not active');
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
        console.log('No messages to summarize');
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
      console.error('Summarization failed:', error);
      // Don't throw error - conversation should continue even if summarization fails
    }
  }

  /**
   * Log summarization metrics for monitoring
   */
  logSummarizationMetrics(conversation, messageCount, result) {
    console.log('Summarization Metrics:', {
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
        .join('\n');

      enhancedPrompt += `\n\nAdditional Context:\n${contextString}`;
    }

    return enhancedPrompt;
  }
}

module.exports = new AgentService();
