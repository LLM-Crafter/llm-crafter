const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');
const AgentExecution = require('../models/AgentExecution');
const OpenAIService = require('./openaiService');
const toolService = require('./toolService');
const APIKey = require('../models/ApiKey');
const summarizationService = require('./summarizationService');
const suggestionService = require('./suggestionService');
const languageDetectionService = require('./languageDetectionService');
const procedureService = require('./procedureService');
const hookService = require('./hookService');
const { runAgentGraph } = require('./agentGraph');
// Status label helpers only; the agent loop itself never runs graph code.
const { createStatusEmitter, toolStatus } = require('./agentGraph/shared');
const { formatHistoryLines } = require('../utils/operatorGuidance');

class AgentService {
  /**
   * Get the structured output schema for agent responses
   * This ensures the LLM always returns properly formatted responses
   * Note: Not using strict mode to allow flexible tool_parameters
   */
  getAgentResponseSchema() {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'agent_response',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['use_tool', 'respond', 'think'],
              description: 'The action the agent wants to take',
            },
            tool_name: {
              type: 'string',
              description:
                'Name of the tool to use (required when action is use_tool)',
            },
            tool_parameters: {
              type: 'object',
              description:
                'Parameters to pass to the tool (required when action is use_tool)',
            },
            response: {
              type: 'string',
              description:
                'Response to send to the user (required when action is respond)',
            },
            reasoning: {
              type: 'string',
              description: 'Explanation of why this action was chosen',
            },
          },
          required: ['action', 'reasoning'],
        },
      },
    };
  }

  /**
   * Execute a chatbot agent with a user message
   */
  async executeChatbotAgent(
    agentId,
    conversationId,
    userMessage,
    userIdentifier,
    dynamicContext = {},
    cancellationToken = null
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
        gdpr: { encrypt_messages: !!(agent.gdpr && agent.gdpr.encrypt_messages) },
      });
      await conversation.save();

      // Fire new_conversation hooks (non-blocking)
      hookService.executeHooks(agent, conversation, userMessage, 'user', 'new_conversation').catch(err => {
        console.error('[Hook] new_conversation hook error:', err.message);
      });
    }

    // If agent is disabled, switch to human handler
    if (!agent.is_active) {
      // Add user message to conversation
      await conversation.addMessage({
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      });

      // Switch conversation to human handler
      conversation.current_handler = 'human';
      conversation.status = 'human_controlled';
      await conversation.save();

      // Fire message hooks even when agent is disabled (non-blocking)
      hookService.executeHooks(agent, conversation, userMessage, 'user', 'message').catch(err => {
        console.error('[Hook] message hook error:', err.message);
      });
      hookService.scheduleInactivityHooks(agent, conversation);

      return {
        conversation_id: conversation._id,
        response:
          'This agent is currently unavailable. Your conversation has been forwarded to a human operator who will assist you shortly.',
        current_handler: 'human',
        token_usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cost: 0,
        },
        tools_used: [],
      };
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

      // Fire message hooks during human-controlled conversations (non-blocking)
      hookService.executeHooks(agent, conversation, userMessage, 'user', 'message').catch(err => {
        console.error('[Hook] message hook error:', err.message);
      });
      hookService.scheduleInactivityHooks(agent, conversation);

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
    const userMessageData = {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    if (dynamicContext.channel_info_for_message) {
      userMessageData.channel_info = dynamicContext.channel_info_for_message;
    }
    await conversation.addMessage(userMessageData);

    // Generate AI-powered conversation title on 2nd message and every 5 messages thereafter.
    // Started now so it runs in parallel with the agent instead of delaying the response;
    // generateAIConversationTitle never rejects (returns null on error).
    const userMessageCount = conversation.messages.filter(
      msg => msg.role === 'user'
    ).length;
    const shouldGenerateTitle = userMessageCount === 2 || (userMessageCount > 2 && (userMessageCount - 2) % 5 === 0);
    const titlePromise = shouldGenerateTitle
      ? this.generateAIConversationTitle(conversation, agent)
      : null;

    // Fire message hooks in agent-controlled mode (non-blocking)
    hookService.executeHooks(agent, conversation, userMessage, 'user', 'message').catch(err => {
      console.error('[Hook] message hook error:', err.message);
    });
    hookService.scheduleInactivityHooks(agent, conversation);

    // Detect language of the user message (runs unless explicitly disabled)
    let detectedLanguage = null;
    if (agent.config.enforce_language_detection !== false) {
      const decryptedKey = agent.api_key.getDecryptedKey();
      const detection = await languageDetectionService.detectLanguage(
        userMessage,
        decryptedKey,
        agent.api_key.provider.name,
        conversation.getDecryptedMessages(),
        conversation.current_turn_language || null,
        dynamicContext,
        agent
      );
      detectedLanguage = detection.language;
      conversation.current_turn_language = detectedLanguage;
      // Fold the background detection call's cost into the conversation, same as title/suggestion calls
      if (detection.usage?.cost) {
        conversation.metadata.total_cost = (conversation.metadata.total_cost || 0) + detection.usage.cost;
        conversation.metadata.total_tokens_used = (conversation.metadata.total_tokens_used || 0) + (detection.usage.total_tokens || 0);
      }
      await conversation.save();
    }

    // Match/advance configured procedures for this turn (no-op when the agent has none)
    await procedureService.processTurn(agent, conversation, userMessage, dynamicContext);

    // Execute agent reasoning — route through small agent graph if enabled
    const useGraph = agent.config?.enable_small_agent_graph === true;
    const response = useGraph
      ? await this.executeChatbotAgentGraph(agent, conversation, dynamicContext, cancellationToken)
      : await this.executeAgentReasoning(agent, conversation, dynamicContext, cancellationToken);

    // Add assistant response to conversation (skip if handoff occurred - message already added by tool)
    let assistantMessageId = null;
    if (response.content) {
      const savedConversation = await conversation.addMessage({
        role: 'assistant',
        content: response.content,
        thinking_process: response.thinking_process,
        tools_used: response.tools_used,
        token_usage: response.token_usage,
        timestamp: new Date(),
      });
      const lastMsg = savedConversation.messages[savedConversation.messages.length - 1];
      assistantMessageId = lastMsg?._id || null;
    }

    // Apply the title generated in parallel with the agent (started after the user message was added)
    if (titlePromise) {
      const titleResult = await titlePromise;
      if (titleResult) {
        conversation.title = titleResult.title;
        if (titleResult.titleTranslations.length > 0) {
          conversation.title_translations = titleResult.titleTranslations;
        }
        // Accumulate background title + translation costs into conversation metadata
        const titleCost = (titleResult.titleUsage?.cost || 0) + (titleResult.titleTranslationUsage?.cost || 0);
        const titleTokens = (titleResult.titleUsage?.total_tokens || 0) + (titleResult.titleTranslationUsage?.total_tokens || 0);
        if (titleCost > 0) {
          conversation.metadata.total_cost = (conversation.metadata.total_cost || 0) + titleCost;
          conversation.metadata.total_tokens_used = (conversation.metadata.total_tokens_used || 0) + titleTokens;
        }
        await conversation.save();
      }
    }

    // Generate question suggestions if enabled
    let suggestions = null;
    let suggestionUsage = null;

    if (agent.question_suggestions?.enabled) {
      const suggestionResult =
        await suggestionService.generateQuestionSuggestions(
          agent,
          conversation.getDecryptedMessages()
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
      message_id: assistantMessageId,
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
    streamCallback = null,
    cancellationToken = null,
    statusCallback = null // graph mode only: receives { stage } progress events
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
        gdpr: { encrypt_messages: !!(agent.gdpr && agent.gdpr.encrypt_messages) },
      });
      await conversation.save();

      // Fire new_conversation hooks (non-blocking)
      hookService.executeHooks(agent, conversation, userMessage, 'user', 'new_conversation').catch(err => {
        console.error('[Hook] new_conversation hook error:', err.message);
      });
    }

    // If agent is disabled, switch to human handler
    if (!agent.is_active) {
      // Add user message to conversation
      await conversation.addMessage({
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      });

      // Switch conversation to human handler
      conversation.current_handler = 'human';
      conversation.status = 'human_controlled';
      await conversation.save();

      // Fire message hooks even when agent is disabled (non-blocking)
      hookService.executeHooks(agent, conversation, userMessage, 'user', 'message').catch(err => {
        console.error('[Hook] message hook error:', err.message);
      });
      hookService.scheduleInactivityHooks(agent, conversation);

      return {
        conversation_id: conversation._id,
        response: '',
        current_handler: 'human',
        handoff_status: 'human_controlled',
        token_usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cost: 0,
        },
        tools_used: [],
      };
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

      // Fire message hooks during human-controlled conversations (non-blocking)
      hookService.executeHooks(agent, conversation, userMessage, 'user', 'message').catch(err => {
        console.error('[Hook] message hook error:', err.message);
      });
      hookService.scheduleInactivityHooks(agent, conversation);

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
    const userMessageData = {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    if (dynamicContext.channel_info_for_message) {
      userMessageData.channel_info = dynamicContext.channel_info_for_message;
    }
    await conversation.addMessage(userMessageData);

    // Generate AI-powered conversation title on 2nd message and every 5 messages thereafter.
    // Started now so it runs in parallel with the agent instead of delaying the response;
    // generateAIConversationTitle never rejects (returns null on error).
    const userMessageCount = conversation.messages.filter(
      msg => msg.role === 'user'
    ).length;
    const shouldGenerateTitle = userMessageCount === 2 || (userMessageCount > 2 && (userMessageCount - 2) % 5 === 0);
    const titlePromise = shouldGenerateTitle
      ? this.generateAIConversationTitle(conversation, agent)
      : null;

    // Fire message hooks in agent-controlled mode (non-blocking)
    hookService.executeHooks(agent, conversation, userMessage, 'user', 'message').catch(err => {
      console.error('[Hook] message hook error:', err.message);
    });
    hookService.scheduleInactivityHooks(agent, conversation);

    // Detect language of the user message (runs unless explicitly disabled)
    let detectedLanguage = null;
    if (agent.config.enforce_language_detection !== false) {
      const decryptedKey = agent.api_key.getDecryptedKey();
      const detection = await languageDetectionService.detectLanguage(
        userMessage,
        decryptedKey,
        agent.api_key.provider.name,
        conversation.getDecryptedMessages(),
        conversation.current_turn_language || null,
        dynamicContext,
        agent
      );
      detectedLanguage = detection.language;
      conversation.current_turn_language = detectedLanguage;
      // Fold the background detection call's cost into the conversation, same as title/suggestion calls
      if (detection.usage?.cost) {
        conversation.metadata.total_cost = (conversation.metadata.total_cost || 0) + detection.usage.cost;
        conversation.metadata.total_tokens_used = (conversation.metadata.total_tokens_used || 0) + (detection.usage.total_tokens || 0);
      }
      await conversation.save();
    }

    // Match/advance configured procedures for this turn (no-op when the agent has none)
    await procedureService.processTurn(agent, conversation, userMessage, dynamicContext);

    // Execute agent reasoning with streaming — route through small agent graph if enabled
    const useGraph = agent.config?.enable_small_agent_graph === true;
    const response = useGraph
      ? await this.executeChatbotAgentGraphStream(agent, conversation, dynamicContext, streamCallback, cancellationToken, statusCallback)
      : await this.executeAgentReasoningStream(agent, conversation, dynamicContext, streamCallback, cancellationToken);

    // Add assistant response to conversation (skip if handoff occurred - message already added by tool)
    let assistantMessageId = null;
    if (response.content) {
      const savedConversation = await conversation.addMessage({
        role: 'assistant',
        content: response.content,
        thinking_process: response.thinking_process,
        tools_used: response.tools_used,
        token_usage: response.token_usage,
        timestamp: new Date(),
      });
      const lastMsg = savedConversation.messages[savedConversation.messages.length - 1];
      assistantMessageId = lastMsg?._id || null;
    }

    // Apply the title generated in parallel with the agent (started after the user message was added)
    if (titlePromise) {
      const titleResult = await titlePromise;
      if (titleResult) {
        conversation.title = titleResult.title;
        if (titleResult.titleTranslations.length > 0) {
          conversation.title_translations = titleResult.titleTranslations;
        }
        // Accumulate background title + translation costs into conversation metadata
        const titleCost = (titleResult.titleUsage?.cost || 0) + (titleResult.titleTranslationUsage?.cost || 0);
        const titleTokens = (titleResult.titleUsage?.total_tokens || 0) + (titleResult.titleTranslationUsage?.total_tokens || 0);
        if (titleCost > 0) {
          conversation.metadata.total_cost = (conversation.metadata.total_cost || 0) + titleCost;
          conversation.metadata.total_tokens_used = (conversation.metadata.total_tokens_used || 0) + titleTokens;
        }
        await conversation.save();
      }
    }

    // Generate question suggestions if enabled
    let suggestions = null;
    let suggestionUsage = null;

    if (agent.question_suggestions?.enabled) {
      const suggestionResult =
        await suggestionService.generateQuestionSuggestions(
          agent,
          conversation.getDecryptedMessages()
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
      message_id: assistantMessageId,
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
      if (result.output_files && result.output_files.length > 0) {
        execution.output_files = result.output_files;
      }
      await execution.save();

      return {
        execution_id: execution._id,
        output: result.output,
        output_files: result.output_files || [],
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
      if (result.output_files && result.output_files.length > 0) {
        execution.output_files = result.output_files;
      }
      await execution.save();

      return {
        execution_id: execution._id,
        output: result.output,
        output_files: result.output_files || [],
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
  async executeAgentReasoning(agent, conversation, dynamicContext = {}, cancellationToken = null, contextOptions = {}) {
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
      cached_tokens: 0,
      cost: 0,
    };

    // Build context for the agent
    const context = this.buildAgentContext(agent, conversation, contextOptions);

    console.log(
      `[Reasoning] agent=${agent._id} conv=${conversation._id} db_messages=${conversation.messages.length}` +
      ` history_messages=${context.conversation_history.length}` +
      ` history_chars=${context.conversation_history.reduce((s, m) => s + (m.content?.length ?? 0), 0)}` +
      ` has_summary=${context.has_summary}`
    );

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

      // Check if this execution has been cancelled by a newer incoming message
      if (cancellationToken?.cancelled) {
        const err = new Error('Execution cancelled — newer message received');
        err.code = 'EXECUTION_CANCELLED';
        throw err;
      }

      // Build prompt for current iteration
      const prompt = this.buildReasoningPrompt(
        agent,
        context,
        thinkingProcess,
        toolsUsed,
        currentIteration
      );

      // Get LLM response with optimized system prompt for caching
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        agent,
        dynamicContext,
        conversation.current_turn_language
      );

      // Use structured outputs if model supports it
      const responseFormat = openai.supportsStructuredOutputs(
        agent.llm_settings.model
      )
        ? this.getAgentResponseSchema()
        : null;

      const llmResponse = await openai.generateCompletion(
        agent.llm_settings.model,
        prompt,
        agent.llm_settings.parameters,
        enhancedSystemPrompt,
        responseFormat,
        { prompt_cache_key: `agent_${agent._id}` } // Improve cache hit rate via routing stickiness
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cached_tokens += llmResponse.usage.cached_tokens || 0;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Log cache performance
      const cacheHitRate = totalTokenUsage.prompt_tokens > 0 
        ? ((totalTokenUsage.cached_tokens / totalTokenUsage.prompt_tokens) * 100).toFixed(1)
        : '0.0';
      console.log(`[Cache] Iteration ${currentIteration}: ${llmResponse.usage.cached_tokens || 0} cached tokens | Total: ${totalTokenUsage.cached_tokens} / ${totalTokenUsage.prompt_tokens} (${cacheHitRate}% hit rate)`);

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === 'use_tool') {
        // Guard: reject tool calls for tools not configured on this agent
        const agentHasTool = agent.tools.some(t => t.name === parsedResponse.tool_name);
        if (!agentHasTool) {
          thinkingProcess.push({
            step: 'tool_not_available',
            tool_name: parsedResponse.tool_name,
            reasoning: `Tool '${parsedResponse.tool_name}' is not available for this agent.`,
          });
          // Inject a synthetic failed result so the LLM can adjust its response
          context.conversation_history = [
            ...context.conversation_history,
            {
              role: 'system',
              content: `Tool '${parsedResponse.tool_name}' is not available. Do not attempt to use it again. Respond directly to the user.`,
            },
          ];
          continue;
        }

        // Guard: block tools gated by an unfinished procedure step
        const procedureGate = procedureService.checkToolAllowed(conversation, parsedResponse.tool_name);
        if (!procedureGate.allowed) {
          thinkingProcess.push({
            step: 'procedure_tool_blocked',
            tool_name: parsedResponse.tool_name,
            reasoning: procedureGate.reason,
          });
          context.conversation_history = [
            ...context.conversation_history,
            {
              role: 'system',
              content: `${procedureGate.reason} Ask the user for the missing information instead.`,
            },
          ];
          continue;
        }

        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          tool_name: parsedResponse.tool_name,
          reasoning: parsedResponse.reasoning || `Decided to use tool: ${parsedResponse.tool_name}`,
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

        procedureService.recordToolResult(conversation, parsedResponse.tool_name, toolResult);

        // Handle tool result properly - check for success/failure
        const toolResultForAgent = {
          tool_name: parsedResponse.tool_name,
          parameters: parsedResponse.tool_parameters,
          execution_time_ms: toolResult.execution_time_ms,
        };

        if (toolResult.success) {
          toolResultForAgent.result = toolResult.result;
          toolResultForAgent.success = true;

          const resultJson = JSON.stringify(toolResult.result);
          if (resultJson.length > 10_000) {
            console.warn(
              `[ToolResult] LARGE response — tool=${parsedResponse.tool_name}` +
              ` result_chars=${resultJson.length}` +
              ` params=${JSON.stringify(parsedResponse.tool_parameters).slice(0, 300)}` +
              ` preview=${resultJson.slice(0, 500)}`
            );
          } else {
            console.log(`[ToolResult] tool=${parsedResponse.tool_name} result_chars=${resultJson.length}`);
          }
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
          // Get the handoff message from parameters or use default
          const handoffMessage =
            parsedResponse.tool_parameters.handoff_message ||
            'I understand this requires specialized assistance. Let me connect you with one of our team members who can better help you with this. Please wait a moment.';

          // Set as final response so it appears in the response
          finalResponse = handoffMessage;
          thinkingProcess.push({
            step: 'human_handoff_requested',
            reasoning: parsedResponse.reasoning || 'Human handoff was requested, stopping agent processing and waiting for human operator',
          });
          break;
        }
        // If LLM returned both a tool call and a response, use the pending response after tool execution
        if (parsedResponse._pendingResponse && toolResult.success) {
          finalResponse = parsedResponse._pendingResponse;
          thinkingProcess.push({
            step: 'final_response',
            reasoning: parsedResponse.reasoning || 'Tool executed successfully, using combined response from LLM output',
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
          reasoning: parsedResponse.reasoning || 'Determined sufficient information to respond to user',
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

    // Check if handoff occurred - if so, don't show fallback error message
    const handoffOccurred = thinkingProcess.some(
      step => step.step === 'human_handoff_requested'
    );

    if (!finalResponse && !handoffOccurred) {
      // Force a final LLM response instead of a generic error message.
      // The agent must answer with what it knows even if tool calls were exhausted.
      const forceRespondPrompt =
        this.buildReasoningPrompt(agent, context, thinkingProcess, toolsUsed, maxIterations) +
        '\n\n**IMPORTANT: You have reached the maximum number of tool calls. You MUST now respond to the user directly. Do NOT call any more tools. Use ACTION: respond and provide the best answer you can based on the conversation and any information gathered so far.**';

      const forcedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        agent,
        dynamicContext,
        conversation.current_turn_language
      );

      const forcedResponseFormat = openai.supportsStructuredOutputs(agent.llm_settings.model)
        ? this.getAgentResponseSchema()
        : null;

      try {
        const forcedLlmResponse = await openai.generateCompletion(
          agent.llm_settings.model,
          forceRespondPrompt,
          agent.llm_settings.parameters,
          forcedSystemPrompt,
          forcedResponseFormat,
          { prompt_cache_key: `agent_${agent._id}` }
        );

        totalTokenUsage.prompt_tokens += forcedLlmResponse.usage.prompt_tokens;
        totalTokenUsage.completion_tokens += forcedLlmResponse.usage.completion_tokens;
        totalTokenUsage.total_tokens += forcedLlmResponse.usage.total_tokens;
        totalTokenUsage.cached_tokens += forcedLlmResponse.usage.cached_tokens || 0;
        totalTokenUsage.cost += forcedLlmResponse.usage.cost;

        const forcedParsed = this.parseAgentResponse(forcedLlmResponse.content);
        if (forcedParsed.response) {
          finalResponse = forcedParsed.response;
          thinkingProcess.push({
            step: 'forced_final_response',
            reasoning: forcedParsed.reasoning || 'Max iterations reached, forced final response',
          });
        }
      } catch (e) {
        console.error('Failed forced final response call:', e);
      }

      // Ultimate fallback only if the forced call also fails
      if (!finalResponse) {
        finalResponse =
          "I apologize, but I wasn't able to complete your request within the allowed processing time. Please try rephrasing your request.";
      }
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
    streamCallback = null,
    cancellationToken = null,
    contextOptions = {},
    statusCallback = null // receives { stage } just before each tool runs
  ) {
    const decriptedApiKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decriptedApiKey,
      agent.api_key.provider.name
    );
    const emitStatus = createStatusEmitter(statusCallback);

    const thinkingProcess = [];
    const toolsUsed = [];
    const totalTokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cached_tokens: 0,
      cost: 0,
    };

    // Build context for the agent
    const context = this.buildAgentContext(agent, conversation, contextOptions);

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

      // Check if this execution has been cancelled by a newer incoming message
      if (cancellationToken?.cancelled) {
        const err = new Error('Execution cancelled — newer message received');
        err.code = 'EXECUTION_CANCELLED';
        throw err;
      }

      // Build prompt for current iteration
      const prompt = this.buildReasoningPrompt(
        agent,
        context,
        thinkingProcess,
        toolsUsed,
        currentIteration
      );

      // Get LLM response with streaming and optimized system prompt for caching
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        agent,
        dynamicContext,
        conversation.current_turn_language
      );

      // Use structured outputs if model supports it
      const responseFormat = openai.supportsStructuredOutputs(
        agent.llm_settings.model
      )
        ? this.getAgentResponseSchema()
        : null;

      let streamBuffer = '';
      let responseContentSent = '';
      let inResponseField = false;
      let actionChecked = false;
      let isRespondAction = false;
      let isStreaming = false;
      let streamingStarted = false;

      const onChunk = chunk => {
        streamBuffer += chunk;

        // For structured outputs, extract response field content incrementally
        if (responseFormat) {
          // First, check if the action is "respond" before streaming any response content
          if (!actionChecked) {
            const actionMatch = /"action"\s*:\s*"([^"]+)"/.exec(streamBuffer);
            if (actionMatch) {
              actionChecked = true;
              isRespondAction = actionMatch[1] === 'respond';
            }
          }

          // Only proceed to stream response field if action is "respond"
          if (!isRespondAction) {
            return;
          }

          // Look for the "response" field in the JSON stream
          if (!inResponseField) {
            const responseFieldMatch = /"response"\s*:\s*"/.exec(streamBuffer);
            if (responseFieldMatch) {
              inResponseField = true;
            }
          }

          if (inResponseField) {
            // Extract everything after "response":"
            const responseFieldMatch = /"response"\s*:\s*"/.exec(streamBuffer);
            if (responseFieldMatch) {
              const startPos =
                responseFieldMatch.index + responseFieldMatch[0].length;
              let rawContent = streamBuffer.substring(startPos);

              // Find the end of the response string (unescaped quote)
              let endPos = rawContent.length;
              let i = 0;
              while (i < rawContent.length) {
                if (rawContent[i] === '\\' && i + 1 < rawContent.length) {
                  // Skip escaped character
                  i += 2;
                } else if (rawContent[i] === '"') {
                  // Found unescaped quote - this is the end
                  endPos = i;
                  break;
                } else {
                  i++;
                }
              }

              // Extract the content up to end position
              let content = rawContent.substring(0, endPos);

              // Find a safe position to stream (don't send incomplete escape sequences)
              let safeLength = content.length;
              if (content.endsWith('\\')) {
                // Ends with backslash - might be start of escape sequence
                // Only send up to before the backslash
                safeLength = content.length - 1;
              }

              const safeContent = content.substring(0, safeLength);
              
              // Properly JSON-unescape by parsing as JSON string
              let unescapedContent = safeContent;
              try {
                unescapedContent = JSON.parse('"' + safeContent + '"');
              } catch (e) {
                // If parsing fails, use raw content
              }

              // Stream new content
              if (unescapedContent.length > responseContentSent.length) {
                const newContent = unescapedContent.substring(
                  responseContentSent.length
                );
                if (newContent && streamCallback) {
                  streamCallback(newContent);
                  responseContentSent = unescapedContent;
                }
              }
            }
          }
          return;
        }

        // Legacy text-based streaming for non-structured outputs
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
        onChunk,
        responseFormat,
        { prompt_cache_key: `agent_${agent._id}` } // Improve cache hit rate via routing stickiness
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cached_tokens += llmResponse.usage.cached_tokens || 0;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Log cache performance
      const cacheHitRate = totalTokenUsage.prompt_tokens > 0 
        ? ((totalTokenUsage.cached_tokens / totalTokenUsage.prompt_tokens) * 100).toFixed(1)
        : '0.0';
      console.log(`[Cache] Stream Iteration ${currentIteration}: ${llmResponse.usage.cached_tokens || 0} cached tokens | Total: ${totalTokenUsage.cached_tokens} / ${totalTokenUsage.prompt_tokens} (${cacheHitRate}% hit rate)`);

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === 'use_tool') {
        // Guard: reject tool calls for tools not configured on this agent
        const agentHasTool = agent.tools.some(t => t.name === parsedResponse.tool_name);
        if (!agentHasTool) {
          thinkingProcess.push({
            step: 'tool_not_available',
            tool_name: parsedResponse.tool_name,
            reasoning: `Tool '${parsedResponse.tool_name}' is not available for this agent.`,
          });
          // Inject a synthetic failed result so the LLM can adjust its response
          context.conversation_history = [
            ...context.conversation_history,
            {
              role: 'system',
              content: `Tool '${parsedResponse.tool_name}' is not available. Do not attempt to use it again. Respond directly to the user.`,
            },
          ];
          continue;
        }

        // Guard: block tools gated by an unfinished procedure step
        const procedureGate = procedureService.checkToolAllowed(conversation, parsedResponse.tool_name);
        if (!procedureGate.allowed) {
          thinkingProcess.push({
            step: 'procedure_tool_blocked',
            tool_name: parsedResponse.tool_name,
            reasoning: procedureGate.reason,
          });
          context.conversation_history = [
            ...context.conversation_history,
            {
              role: 'system',
              content: `${procedureGate.reason} Ask the user for the missing information instead.`,
            },
          ];
          continue;
        }

        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          tool_name: parsedResponse.tool_name,
          reasoning: parsedResponse.reasoning || `Decided to use tool: ${parsedResponse.tool_name}`,
        });

        emitStatus(toolStatus(parsedResponse.tool_name));
        const toolResult = await toolService.executeToolWithConfig(
          parsedResponse.tool_name,
          parsedResponse.tool_parameters,
          this.getAgentToolConfig(
            agent,
            parsedResponse.tool_name,
            conversation._id
          )
        );

        procedureService.recordToolResult(conversation, parsedResponse.tool_name, toolResult);

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
          // Get the handoff message from parameters or use default
          const handoffMessage =
            parsedResponse.tool_parameters.handoff_message ||
            'I understand this requires specialized assistance. Let me connect you with one of our team members who can better help you with this. Please wait a moment.';

          // Stream the handoff message to the frontend
          if (streamCallback) {
            streamCallback(handoffMessage);
          }

          // Set as final response so it appears in the response
          finalResponse = handoffMessage;
          thinkingProcess.push({
            step: 'human_handoff_requested',
            reasoning: parsedResponse.reasoning || 'Human handoff was requested, stopping agent processing and waiting for human operator',
          });
          break;
        }
        // If LLM returned both a tool call and a response, use the pending response after tool execution
        if (parsedResponse._pendingResponse && toolResult.success) {
          finalResponse = parsedResponse._pendingResponse;
          if (streamCallback) {
            streamCallback(parsedResponse._pendingResponse);
          }
          thinkingProcess.push({
            step: 'final_response',
            reasoning: parsedResponse.reasoning || 'Tool executed successfully, using combined response from LLM output',
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
          reasoning: parsedResponse.reasoning || 'Determined sufficient information to respond to user',
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

    // Check if handoff occurred - if so, don't show fallback error message
    const handoffOccurred = thinkingProcess.some(
      step => step.step === 'human_handoff_requested'
    );

    if (!finalResponse && !handoffOccurred) {
      // Force a final LLM response instead of a generic error message.
      // The agent must answer with what it knows even if tool calls were exhausted.
      const forceRespondPrompt =
        this.buildReasoningPrompt(agent, context, thinkingProcess, toolsUsed, maxIterations) +
        '\n\n**IMPORTANT: You have reached the maximum number of tool calls. You MUST now respond to the user directly. Do NOT call any more tools. Use ACTION: respond and provide the best answer you can based on the conversation and any information gathered so far.**';

      const forcedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        agent,
        dynamicContext,
        conversation.current_turn_language
      );

      const forcedResponseFormat = openai.supportsStructuredOutputs(agent.llm_settings.model)
        ? this.getAgentResponseSchema()
        : null;

      let forcedStreamBuffer = '';
      let forcedContentSent = '';
      let forcedInResponseField = false;
      let forcedActionChecked = false;
      let forcedIsRespondAction = false;

      const onForcedChunk = chunk => {
        forcedStreamBuffer += chunk;

        if (forcedResponseFormat) {
          if (!forcedActionChecked) {
            const actionMatch = /"action"\s*:\s*"([^"]+)"/.exec(forcedStreamBuffer);
            if (actionMatch) {
              forcedActionChecked = true;
              forcedIsRespondAction = actionMatch[1] === 'respond';
            }
          }
          if (!forcedIsRespondAction) return;

          if (!forcedInResponseField) {
            if (/"response"\s*:\s*"/.exec(forcedStreamBuffer)) {
              forcedInResponseField = true;
            }
          }

          if (forcedInResponseField) {
            const rfMatch = /"response"\s*:\s*"/.exec(forcedStreamBuffer);
            if (rfMatch) {
              const startPos = rfMatch.index + rfMatch[0].length;
              let rawContent = forcedStreamBuffer.substring(startPos);
              let endPos = rawContent.length;
              let i = 0;
              while (i < rawContent.length) {
                if (rawContent[i] === '\\' && i + 1 < rawContent.length) { i += 2; continue; }
                if (rawContent[i] === '"') { endPos = i; break; }
                i++;
              }
              let safeContent = rawContent.substring(0, endPos);
              if (safeContent.endsWith('\\')) safeContent = safeContent.slice(0, -1);
              let unescaped = safeContent;
              try { unescaped = JSON.parse('"' + safeContent + '"'); } catch (e) {}
              if (unescaped.length > forcedContentSent.length) {
                const newContent = unescaped.substring(forcedContentSent.length);
                if (newContent && streamCallback) {
                  streamCallback(newContent);
                  forcedContentSent = unescaped;
                }
              }
            }
          }
          return;
        }

        if (!this.shouldStartStreaming(forcedStreamBuffer)) return;
        const safeContent = this.extractSafeStreamingContent(forcedStreamBuffer, forcedContentSent);
        if (safeContent && safeContent !== forcedContentSent) {
          const newContent = safeContent.substring(forcedContentSent.length);
          if (newContent && streamCallback) {
            streamCallback(newContent);
            forcedContentSent = safeContent;
          }
        }
      };

      try {
        const forcedLlmResponse = await openai.generateStreamingCompletion(
          agent.llm_settings.model,
          forceRespondPrompt,
          agent.llm_settings.parameters,
          forcedSystemPrompt,
          onForcedChunk,
          forcedResponseFormat,
          { prompt_cache_key: `agent_${agent._id}` }
        );

        totalTokenUsage.prompt_tokens += forcedLlmResponse.usage.prompt_tokens;
        totalTokenUsage.completion_tokens += forcedLlmResponse.usage.completion_tokens;
        totalTokenUsage.total_tokens += forcedLlmResponse.usage.total_tokens;
        totalTokenUsage.cached_tokens += forcedLlmResponse.usage.cached_tokens || 0;
        totalTokenUsage.cost += forcedLlmResponse.usage.cost;

        const forcedParsed = this.parseAgentResponse(forcedLlmResponse.content);
        if (forcedParsed.response) {
          finalResponse = forcedParsed.response;
          thinkingProcess.push({
            step: 'forced_final_response',
            reasoning: forcedParsed.reasoning || 'Max iterations reached, forced final response',
          });
        }
      } catch (e) {
        console.error('Failed forced final response call:', e);
      }

      // Ultimate fallback only if the forced call also fails
      if (!finalResponse) {
        finalResponse =
          "I apologize, but I wasn't able to complete your request within the allowed processing time. Please try rephrasing your request.";
      }
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
      cached_tokens: 0,
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
    const outputFiles = [];

    while (currentIteration < maxIterations) {
      currentIteration++;

      // Build prompt for current iteration
      const prompt = this.buildTaskReasoningPrompt(
        agent,
        input,
        thinkingProcess,
        toolsUsed,
        currentIteration,
        dynamicContext
      );

      // Get LLM response with optimized system prompt for caching
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        agent,
        dynamicContext
      );

      const llmResponse = await openai.generateCompletion(
        agent.llm_settings.model,
        prompt,
        agent.llm_settings.parameters,
        enhancedSystemPrompt,
        null, // no responseFormat for task agents
        { prompt_cache_key: `agent_${agent._id}` } // Improve cache hit rate via routing stickiness
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cached_tokens += llmResponse.usage.cached_tokens || 0;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Log cache performance
      const cacheHitRate = totalTokenUsage.prompt_tokens > 0 
        ? ((totalTokenUsage.cached_tokens / totalTokenUsage.prompt_tokens) * 100).toFixed(1)
        : '0.0';
      console.log(`[Cache] Task Iteration ${currentIteration}: ${llmResponse.usage.cached_tokens || 0} cached tokens | Total: ${totalTokenUsage.cached_tokens} / ${totalTokenUsage.prompt_tokens} (${cacheHitRate}% hit rate)`);

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === 'use_tool') {
        const toolReasoning = parsedResponse.reasoning || `Decided to use tool: ${parsedResponse.tool_name}`;
        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          tool_name: parsedResponse.tool_name,
          reasoning: toolReasoning,
        });

        await execution.addThinkingStep(
          'tool_execution',
          toolReasoning
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

          // Collect file outputs produced by tools (e.g. save_presentation)
          if (toolResult.result && toolResult.result._output_file) {
            outputFiles.push({
              ...toolResult.result._output_file,
              tool_name: parsedResponse.tool_name,
            });
          }

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

        // If LLM returned both a tool call and a response, use the pending response after tool execution
        if (parsedResponse._pendingResponse && toolResult.success) {
          finalOutput = parsedResponse._pendingResponse;
          const pendingReasoning = parsedResponse.reasoning || 'Tool executed successfully, using combined response from LLM output';
          thinkingProcess.push({
            step: 'task_completed',
            reasoning: pendingReasoning,
          });
          await execution.addThinkingStep(
            'task_completed',
            pendingReasoning
          );
          break;
        }
        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === 'respond') {
        // Agent decided to provide final output
        finalOutput = parsedResponse.response;
        const respondReasoning = parsedResponse.reasoning || 'Determined sufficient information to complete the task';
        thinkingProcess.push({
          step: 'task_completed',
          reasoning: respondReasoning,
        });

        await execution.addThinkingStep(
          'task_completed',
          respondReasoning
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
      output_files: outputFiles,
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
      cached_tokens: 0,
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
    const outputFiles = [];

    while (currentIteration < maxIterations) {

      // Get LLM response with streaming and optimized system prompt for caching
      const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
        agent.system_prompt,
        agent,
        dynamicContext
      );

      let streamBuffer = '';
      let responseContentSent = '';
      let isStreaming = false;
      let streamingStarted = false;

      const onChunk = chunk => {
        streamBuffer += chunk;

        // Legacy text-based streaming for non-structured outputs
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
        onChunk,
        null, // no responseFormat for task agents
        { prompt_cache_key: `agent_${agent._id}` } // Improve cache hit rate via routing stickiness
      );

      // Update token usage
      totalTokenUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalTokenUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalTokenUsage.total_tokens += llmResponse.usage.total_tokens;
      totalTokenUsage.cached_tokens += llmResponse.usage.cached_tokens || 0;
      totalTokenUsage.cost += llmResponse.usage.cost;

      // Log cache performance
      const cacheHitRate = totalTokenUsage.prompt_tokens > 0 
        ? ((totalTokenUsage.cached_tokens / totalTokenUsage.prompt_tokens) * 100).toFixed(1)
        : '0.0';
      console.log(`[Cache] Task Stream Iteration ${currentIteration}: ${llmResponse.usage.cached_tokens || 0} cached tokens | Total: ${totalTokenUsage.cached_tokens} / ${totalTokenUsage.prompt_tokens} (${cacheHitRate}% hit rate)`);

      // Parse LLM response to determine next action
      const parsedResponse = this.parseAgentResponse(llmResponse.content);

      if (parsedResponse.action === 'use_tool') {
        const toolReasoning = parsedResponse.reasoning || `Decided to use tool: ${parsedResponse.tool_name}`;
        // Execute tool
        thinkingProcess.push({
          step: 'tool_execution',
          tool_name: parsedResponse.tool_name,
          reasoning: toolReasoning,
        });

        await execution.addThinkingStep(
          'tool_execution',
          toolReasoning
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

          // Collect file outputs produced by tools (e.g. save_presentation)
          if (toolResult.result && toolResult.result._output_file) {
            outputFiles.push({
              ...toolResult.result._output_file,
              tool_name: parsedResponse.tool_name,
            });
          }

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

        // If LLM returned both a tool call and a response, use the pending response after tool execution
        if (parsedResponse._pendingResponse && toolResult.success) {
          finalOutput = parsedResponse._pendingResponse;
          if (streamCallback) {
            streamCallback(parsedResponse._pendingResponse);
          }
          const pendingReasoning = parsedResponse.reasoning || 'Tool executed successfully, using combined response from LLM output';
          thinkingProcess.push({
            step: 'task_completed',
            reasoning: pendingReasoning,
          });
          await execution.addThinkingStep(
            'task_completed',
            pendingReasoning
          );
          break;
        }
        // Continue reasoning with tool result (success or failure)
        continue;
      } else if (parsedResponse.action === 'respond') {
        // Agent decided to provide final output
        finalOutput = parsedResponse.response;
        const respondReasoning = parsedResponse.reasoning || 'Determined sufficient information to complete the task';
        thinkingProcess.push({
          step: 'task_completed',
          reasoning: respondReasoning,
        });

        await execution.addThinkingStep(
          'task_completed',
          respondReasoning
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
      output_files: outputFiles,
      token_usage: totalTokenUsage,
    };
  }

  /**
   * Build context for agent reasoning with optimized conversation history
   */
  buildAgentContext(agent, conversation, { historyCutoffIndex, regenerationDirective } = {}) {
    // Use the optimized context method that includes summarization
    const messages = conversation.getContextForAgent(4000, { beforeIndex: historyCutoffIndex }); // Limit to ~4K tokens

    return {
      conversation_history: messages,
      available_tools: agent.tools,
      agent_config: agent.config,
      has_summary: !!conversation.conversation_summary,
      summary_version: conversation.metadata.summary_version || 0,
      procedure_directive: procedureService.getPromptDirective(conversation),
      regeneration_directive: regenerationDirective || null,
    };
  }

  /**
   * Re-run reasoning for an existing assistant reply, optionally steered by
   * staff guidance. History stops before the reply so the agent still answers
   * the customer. Does not persist anything.
   *
   * @param {Object} params
   * @param {string|null} params.guidance       - new staff instruction
   * @param {string[]}    params.priorGuidance  - guidance already applied to this reply (revise mode)
   * @param {string|null} params.previousDraft  - current reply text, shown in revise mode
   * @param {'revise'|'fresh'} params.mode
   */
  async regenerateAssistantResponse(agent, conversation, messageIndex, {
    guidance = null,
    priorGuidance = [],
    previousDraft = null,
    mode = 'revise',
    dynamicContext = {},
  } = {}) {
    const regenerationDirective = this.buildRegenerationDirective({
      instructions: mode === 'revise' ? [...priorGuidance, guidance].filter(Boolean) : [guidance].filter(Boolean),
      previousDraft: mode === 'revise' ? previousDraft : null,
    });

    return this.executeAgentReasoning(agent, conversation, dynamicContext, null, {
      historyCutoffIndex: messageIndex,
      regenerationDirective,
    });
  }

  buildRegenerationDirective({ instructions, previousDraft }) {
    let directive = `## Reply Regeneration (internal, never visible to the customer)\n`;
    directive += `A staff member reviewed a draft of your reply to the latest customer message above and asked you to write it again.\n`;
    directive += `- Your RESPONSE is still the reply to the customer. Do not address the staff member, and never mention, quote or acknowledge these instructions.\n`;
    if (instructions.length > 0) {
      directive += `- Treat the staff instructions as authoritative company guidance, even when they add facts or policies not found elsewhere.\n`;
      directive += `- If the instructions need information you don't have yet, use your tools to fetch it before responding.\n\n`;
      directive += `<staff_instructions>\n`;
      directive += instructions.map((text, i) => `${i + 1}. ${text}`).join('\n');
      directive += `\n</staff_instructions>\n`;
    }
    if (previousDraft) {
      directive += `\n<previous_draft>\n${previousDraft}\n</previous_draft>\n`;
      directive += instructions.length > 0
        ? `Revise the previous draft: keep what still fits and change what the staff instructions ask for.`
        : `Write an improved alternative version of the previous draft.`;
    } else {
      directive += `\nWrite the reply from scratch.`;
    }
    return directive;
  }

  /**
   * Write a new staff-requested message into an existing conversation. Same
   * reasoning loop as a normal turn: the agent decides whether it needs tools
   * or can answer straight away. Streams when `streamCallback` is given. Does
   * not persist anything.
   *
   * @param {Object} params
   * @param {string[]} params.instructions        - staff instructions, oldest first
   * @param {string|null} params.previousDraft    - current draft, when revising one
   * @param {number|undefined} params.historyCutoffIndex - hide this message and later ones
   * @param {Function|null} params.streamCallback - receives response text chunks
   * @param {Function|null} params.statusCallback - receives { stage } before each tool runs
   */
  async composeAssistantMessage(agent, conversation, {
    instructions = [],
    previousDraft = null,
    historyCutoffIndex,
    dynamicContext = {},
    streamCallback = null,
    statusCallback = null,
  } = {}) {
    const contextOptions = {
      historyCutoffIndex,
      regenerationDirective: this.buildComposeDirective({ instructions, previousDraft }),
    };

    if (streamCallback) {
      return this.executeAgentReasoningStream(
        agent, conversation, dynamicContext, streamCallback, null, contextOptions, statusCallback
      );
    }
    return this.executeAgentReasoning(agent, conversation, dynamicContext, null, contextOptions);
  }

  buildComposeDirective({ instructions, previousDraft }) {
    let directive = `## Staff-Requested Message (internal, never visible to the customer)\n`;
    directive += `A staff member asked you to write a new message to the customer in this conversation. It is not necessarily a reply to the latest customer message: follow the staff instructions for what it should say.\n`;
    directive += `- Your RESPONSE is the message to the customer. Do not address the staff member, and never mention, quote or acknowledge these instructions.\n`;
    directive += `- Treat the staff instructions as authoritative company guidance, even when they add facts or policies not found elsewhere.\n`;
    directive += `- If the instructions and the conversation already contain what you need, respond right away. Only use tools to fetch facts the message needs that are missing.\n`;
    directive += `- Do not request a human handoff: a staff member is already handling this conversation.\n\n`;
    directive += `<staff_instructions>\n`;
    directive += instructions.map((text, i) => `${i + 1}. ${text}`).join('\n');
    directive += `\n</staff_instructions>\n`;
    if (previousDraft) {
      directive += `\n<previous_draft>\n${previousDraft}\n</previous_draft>\n`;
      directive += `Revise the previous draft: keep what still fits and change what the latest staff instructions ask for.`;
    } else {
      directive += `\nWrite the message from scratch.`;
    }
    return directive;
  }

  formatHistoryForPrompt(messages) {
    return formatHistoryLines(messages);
  }

  getToolResultForPrompt(toolName, result) {
    if (toolName !== 'api_caller' || !result || typeof result !== 'object') {
      return result;
    }

    const promptResult = {
      endpoint_name: result.endpoint_name,
      url: result.url,
      method: result.method,
      status_code: result.status_code,
      success: result.success,
    };

    if (result._summarized && result.summary !== undefined) {
      promptResult.summary = result.summary;
      promptResult._summarized = true;
      promptResult._original_length = result._original_length;
    } else if (result.body !== undefined) {
      promptResult.body = result.body;
    } else if (result.data !== undefined) {
      promptResult.data = result.data;
    }

    return promptResult;
  }

  /**
   * Build reasoning prompt for the agent (optimized for caching)
   * Static content (tools, format) is now in system prompt and gets cached.
   * This prompt contains only dynamic, per-iteration data.
   */
  buildReasoningPrompt(agent, context, thinkingProcess, toolsUsed, iteration) {
    // Only include dynamic content that changes each iteration
    // Static content (tools, format instructions) is in the system prompt for caching
    let prompt = `## Current Task\nAnalyze the conversation and decide on the next action.\n\n`;
    
    // Separate summary context from conversation messages to prevent tone contamination
    const summaryMessages = context.conversation_history.filter(msg => msg.is_summarized);
    const conversationMessages = context.conversation_history.filter(msg => !msg.is_summarized);
    
    if (summaryMessages.length > 0) {
      prompt += `## Previous Context Summary\n`;
      prompt += summaryMessages.map(msg => msg.content).join('\n');
      prompt += `\n\n`;
    }
    
    prompt += `## Conversation History\n`;
    prompt += this.formatHistoryForPrompt(conversationMessages);
    
    if (context.procedure_directive) {
      prompt += `\n\n${context.procedure_directive}`;
    }

    if (context.regeneration_directive) {
      prompt += `\n\n${context.regeneration_directive}`;
    }
    
    if (thinkingProcess.length > 0) {
      prompt += `\n\n## Previous Thinking Process\n`;
      prompt += thinkingProcess.map(step => `${step.step}: ${step.reasoning}`).join('\n');
    }
    
    if (toolsUsed.length > 0) {
      prompt += `\n\n## Tools Used So Far\n`;
      prompt += toolsUsed.map(tool => {
        if (tool.success) {
          const result = this.getToolResultForPrompt(tool.tool_name, tool.result);
          return `- ${tool.tool_name}: SUCCESS - ${JSON.stringify(result)}`;
        } else {
          return `- ${tool.tool_name}: FAILED - ${tool.error}`;
        }
      }).join('\n');
    }
    
    prompt += `\n\n## Current Iteration\n${iteration} of ${agent.config.max_tool_calls || 5}\n\n`;
    prompt += `Choose your action based on the response format defined in the system instructions:`;

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
   * Build reasoning prompt for task agents (optimized for caching)
   * Static content (tools, format) is now in system prompt and gets cached.
   * This prompt contains only dynamic, per-iteration data.
   */
  buildTaskReasoningPrompt(
    agent,
    input,
    thinkingProcess,
    toolsUsed,
    iteration,
    dynamicContext = {}
  ) {
    // Only include dynamic content that changes each iteration
    let prompt = `## Task Input\n${JSON.stringify(input, null, 2)}\n\n`;

    // Surface attached files prominently so the agent can reference their URLs in tool calls
    if (dynamicContext.input_files && dynamicContext.input_files.length > 0) {
      prompt += `## Attached Files\n`;
      prompt += `The following files were uploaded with this task. Use their URLs directly in tool calls (e.g. logo_url, background_image):\n`;
      dynamicContext.input_files.forEach(f => {
        prompt += `- **${f.filename}** (${f.mime_type}, ${f.size ? Math.round(f.size / 1024) + ' KB' : 'unknown size'}): ${f.url}\n`;
      });
      prompt += `\n`;
    }

    if (thinkingProcess.length > 0) {
      prompt += `## Previous Thinking Process\n`;
      prompt += thinkingProcess.map(step => `${step.step}: ${step.reasoning}`).join('\n');
      prompt += `\n\n`;
    }

    if (toolsUsed.length > 0) {
      prompt += `## Tools Used So Far\n`;
      prompt += toolsUsed.map(tool => {
        if (tool.success) {
          const result = this.getToolResultForPrompt(tool.tool_name, tool.result);
          return `- ${tool.tool_name}: SUCCESS - ${JSON.stringify(result)}`;
        } else {
          return `- ${tool.tool_name}: FAILED - ${tool.error}`;
        }
      }).join('\n');
      prompt += `\n\n`;
    }

    prompt += `## Current Iteration\n${iteration} of ${agent.config.max_tool_calls || 5}\n\n`;
    prompt += `Analyze the task and choose your action based on the response format in the system instructions:`;

    return prompt;
  }

  /**
   * Extract individual JSON objects from a string that may contain multiple
   * concatenated JSON objects. Handles the case where the LLM returns a
   * use_tool action followed by a respond action in a single response.
   */
  extractJsonObjects(content) {
    const objects = [];
    let i = 0;

    while (i < content.length) {
      if (content[i] === '{') {
        let braceCount = 0;
        let inString = false;
        let escape = false;

        for (let j = i; j < content.length; j++) {
          const ch = content[j];

          if (escape) {
            escape = false;
            continue;
          }

          if (ch === '\\' && inString) {
            escape = true;
            continue;
          }

          if (ch === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (ch === '{') braceCount++;
            if (ch === '}') {
              braceCount--;
              if (braceCount === 0) {
                const jsonStr = content.substring(i, j + 1);
                try {
                  objects.push(JSON.parse(jsonStr));
                } catch (e) {
                  // Skip malformed JSON fragments
                }
                i = j + 1;
                break;
              }
            }
          }

          // If we reach the end without closing, skip this opening brace
          if (j === content.length - 1) {
            i = j + 1;
          }
        }
      } else {
        i++;
      }
    }

    return objects;
  }

  /**
   * Parse agent response to determine action
   * Handles both structured JSON outputs and legacy text-based formats
   */
  parseAgentResponse(content) {
    console.log('Raw LLM response:', content); // Debug log

    // Try to parse as JSON first (structured output)
    try {
      const jsonResponse = JSON.parse(content);

      // Validate it has the expected structure
      if (jsonResponse.action && jsonResponse.reasoning) {
        console.log('Parsed structured JSON response:', jsonResponse);

        // Normalize the response format
        const result = {
          action: jsonResponse.action,
          reasoning: jsonResponse.reasoning,
        };

        if (jsonResponse.tool_name) {
          result.tool_name = jsonResponse.tool_name;
        }

        if (jsonResponse.tool_parameters) {
          result.tool_parameters = jsonResponse.tool_parameters;
        }

        // Only include response field when action is 'respond'
        if (jsonResponse.response && jsonResponse.action === 'respond') {
          result.response = jsonResponse.response;
        }
        
        // Only include plan_steps when action is 'plan'
        if (jsonResponse.plan_steps && jsonResponse.action === 'plan') {
          result.plan_steps = jsonResponse.plan_steps;
        }

        return result;
      }
    } catch (e) {
      // Try to extract multiple concatenated JSON objects
      // (LLM sometimes returns a use_tool + respond pair in a single response)
      const jsonObjects = this.extractJsonObjects(content);
      const validObjects = jsonObjects.filter(obj => obj.action && obj.reasoning);

      if (validObjects.length > 0) {
        console.log(`Extracted ${validObjects.length} valid JSON action(s) from concatenated response`);

        const toolAction = validObjects.find(obj => obj.action === 'use_tool');
        const respondAction = validObjects.find(obj => obj.action === 'respond');

        // If both a tool call and a response exist, return the tool call with a pending response
        if (toolAction && respondAction) {
          console.log('Detected combined use_tool + respond pattern, will execute tool then use pending response');
          return {
            action: toolAction.action,
            reasoning: toolAction.reasoning,
            tool_name: toolAction.tool_name,
            tool_parameters: toolAction.tool_parameters || {},
            _pendingResponse: respondAction.response,
          };
        }

        // Otherwise return the first valid action
        const first = validObjects[0];
        const result = {
          action: first.action,
          reasoning: first.reasoning,
        };
        if (first.tool_name) result.tool_name = first.tool_name;
        if (first.tool_parameters) result.tool_parameters = first.tool_parameters;
        if (first.response && first.action === 'respond') result.response = first.response;
        return result;
      }

      // Fall through to legacy text-based parsing
      console.log('Content is not structured JSON, using text parser');
    }

    // Legacy text-based parsing
    // When the LLM outputs multiple ACTION blocks, only parse the first one.
    // The loop-based field extraction would otherwise mix the last TOOL with
    // the first PARAMETERS, producing mismatched results.
    const secondActionIdx = content.indexOf('\nACTION:', content.indexOf('ACTION:') + 1);
    const contentToParse = secondActionIdx !== -1 ? content.substring(0, secondActionIdx) : content;

    const lines = contentToParse.split('\n');
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
    const responseIndex = contentToParse.indexOf('RESPONSE:');
    if (responseIndex !== -1) {
      const afterResponse = contentToParse.substring(
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
    const parametersIndex = contentToParse.indexOf('PARAMETERS:');
    if (parametersIndex !== -1) {
      const afterParameters = contentToParse
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
   * Generate placeholder conversation title
   */
  generateConversationTitle(message) {
    return 'New Conversation';
  }

  /**
   * Generate AI-powered conversation title based on conversation history
   * Uses a cost-effective model and generates concise titles (max 10 words)
   */
  async generateAIConversationTitle(conversation, agent, modelOverride = null) {
    try {
      // Get the conversation messages for context, decrypted
      // Use more messages on regeneration for better context
      const allMessages = conversation.getDecryptedMessages();
      const messages = allMessages.slice(0, Math.min(allMessages.length, 10));
      
      if (messages.length < 2) {
        return null; // Not enough context yet
      }

      // Build context from messages
      const conversationContext = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const decryptedApiKey = agent.api_key.getDecryptedKey();
      const openai = new OpenAIService(
        decryptedApiKey,
        agent.api_key.provider.name
      );

      // Use a cost-effective model for the agent's provider unless the caller
      // overrides it (e.g. hook config)
      const providerName = agent.api_key.provider.name;
      const model =
        modelOverride ||
        (providerName === 'openai'
          ? 'gpt-5.6-luna'
          : languageDetectionService.getModelForProvider(providerName));

      const customTitlePrompt = agent.config?.title_generation_prompt;
      const prompt = customTitlePrompt
        ? `${customTitlePrompt}\n\n${conversationContext}`
        : `Based on the following conversation, generate a concise title (maximum 10 words) that captures the main topic or intent. Respond with only the title, no quotes or additional text.\n\n${conversationContext}`;

      const systemPrompt = 'You are a helpful assistant that generates concise, descriptive conversation titles. Keep titles under 10 words and make them clear and informative.';

      // Reasoning-style models (e.g. gpt-5.6 family) spend hidden reasoning tokens
      // out of the same completion budget, so a small cap can leave 0 tokens for
      // the actual title text.
      const maxTokens = openai.isFixedTemperatureModel(model) ? 1000 : 60;

      const response = await openai.generateCompletion(
        model,
        prompt,
        { temperature: 1, max_tokens: maxTokens },
        systemPrompt
      );

      // Clean up the title (remove quotes if present)
      let title = response.content.trim();
      title = title.replace(/^["']|["']$/g, '');

      if (!title) {
        console.warn('[Title] LLM returned an empty title, skipping title update');
        return null;
      }

      // Ensure title is not too long (max 10 words)
      const words = title.split(' ');
      if (words.length > 10) {
        title = words.slice(0, 10).join(' ') + '...';
      }

      // Generate translations if required languages are configured
      const requiredLanguages = agent.config?.required_languages || [];
      let titleTranslations = [];
      let titleTranslationUsage = null;
      if (requiredLanguages.length > 0) {
        const translationResult = await summarizationService.generateTranslations(title, requiredLanguages, agent);
        // Drop any empty translations — the schema requires non-empty text
        titleTranslations = translationResult.translations.filter(t => t.text && t.text.trim());
        titleTranslationUsage = translationResult.usage;
      }

      return { title, titleTranslations, titleTranslationUsage, titleUsage: response.usage };
    } catch (error) {
      console.error('Failed to generate AI conversation title:', error);
      return null; // Fallback to existing title on error
    }
  }

  /**
   * Get agent-specific tool configuration
   */
  getAgentToolConfig(agent, toolName, conversationId = null) {
    const tool = agent.tools.find(t => t.name === toolName);

    // Start with the tool's stored parameters (may be empty or tool may not exist)
    const config = { ...(tool?.parameters || {}) };

    // Always add organization and project context for all tools
    config.organization_id = agent.organization;
    config.project_id = agent.project;

    // Add conversation context (available for all tools when in a chatbot conversation)
    config.conversation_id = conversationId || null; // May be null for task agents

    // Add extra context for human handoff tool
    if (toolName === 'request_human_handoff') {
      config.agent_id = agent._id;
      // Pass gating flag so the tool can check for online operators
      config.require_online_operator =
        agent.config?.handoff_config?.require_online_operator || false;
      // Pass webhook config so the tool can fire the webhook on handoff
      config.handoff_webhook_url =
        agent.config?.handoff_config?.webhook_url || null;
      config.handoff_webhook_secret =
        agent.config?.handoff_config?.webhook_secret || null;
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

      // Pass agent's primary API key for OpenAI TTS in presentation tools
      if (['add_slide', 'generate_slide_audio'].includes(toolName)) {
        config._agent_api_key = agent.api_key;
        config.agent_id = agent._id;
        // execution_id is already in config.conversation_id for task agents (see getAgentToolConfig call sites)
        config.execution_id = conversationId;
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
   * Resume agent processing after a handoff was refused by an operator.
   *
   * The conversation must already have been reverted to agent_controlled and
   * have a system message explaining the refusal (added by Conversation#refuseHandoff).
   * This method runs the normal reasoning loop so the AI can reply to the user.
   *
   * @param {string} conversationId
   * @returns {Promise<{response: string, tools_used: Array, token_usage: Object}>}
   */
  async resumeAfterHandoffRefusal(conversationId) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const agent = await Agent.findById(conversation.agent).populate({
      path: 'api_key',
      populate: { path: 'provider' },
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    const useGraph = agent.config?.enable_small_agent_graph === true;
    const dynamicContext = conversation.dynamic_context || {};

    const response = useGraph
      ? await this.executeChatbotAgentGraph(agent, conversation, dynamicContext)
      : await this.executeAgentReasoning(agent, conversation, dynamicContext);

    if (response.content) {
      await conversation.addMessage({
        role: 'assistant',
        content: response.content,
        thinking_process: response.thinking_process,
        tools_used: response.tools_used,
        token_usage: response.token_usage,
        timestamp: new Date(),
      });
    }

    return {
      response: response.content,
      tools_used: response.tools_used,
      token_usage: response.token_usage,
    };
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

      // Generate display summary text — either via custom prompt or fallback formatter
      let displaySummaryText;
      let displaySummaryUsage = null;
      const displayPrompt = agent.config?.display_summary_prompt;
      if (displayPrompt) {
        const displayResult = await summarizationService.generateDisplaySummary(
          result.summary,
          displayPrompt,
          agent,
          messagesToSummarize
        );
        displaySummaryText = displayResult.text || this.generateSimpleSummaryText(result.summary);
        displaySummaryUsage = displayResult.usage;
      } else {
        displaySummaryText = this.generateSimpleSummaryText(result.summary);
      }

      // Generate translations for the simple summary text if required languages are configured
      const requiredLanguages = agent.config?.required_languages || [];
      let summaryTranslations = [];
      let translationUsage = null;
      if (requiredLanguages.length > 0) {
        const translationResult = await summarizationService.generateTranslations(
          displaySummaryText,
          requiredLanguages,
          agent
        );
        summaryTranslations = translationResult.translations;
        translationUsage = translationResult.usage;
      }

      // Update conversation with new summary and translations
      await conversation.updateSummary(result.summary, summaryTranslations, displaySummaryText);

      // Accumulate background LLM costs (summarization + translations + display summary) into conversation metadata
      const summaryCost = result.token_usage?.cost || 0;
      const summaryTokens = result.token_usage?.total_tokens || 0;
      const translationCost = translationUsage?.cost || 0;
      const translationTokens = translationUsage?.total_tokens || 0;
      const displayCost = displaySummaryUsage?.cost || 0;
      const displayTokens = displaySummaryUsage?.total_tokens || 0;
      if (summaryCost + translationCost + displayCost > 0) {
        conversation.metadata.total_cost = (conversation.metadata.total_cost || 0) + summaryCost + translationCost + displayCost;
        conversation.metadata.total_tokens_used = (conversation.metadata.total_tokens_used || 0) + summaryTokens + translationTokens + displayTokens;
        await conversation.save();
      }

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
   * Build a plain-text representation of a summary object for use as
   * translation source. Mirrors the Conversation model's generateSimpleSummary.
   */
  generateSimpleSummaryText(summaryData) {
    const parts = [];
    if (summaryData.key_topics?.length > 0) {
      parts.push(`Topics: ${summaryData.key_topics.join(', ')}`);
    }
    if (summaryData.important_decisions?.length > 0) {
      parts.push(`Decisions: ${summaryData.important_decisions.join('; ')}`);
    }
    if (summaryData.unresolved_issues?.length > 0) {
      parts.push(`Open issues: ${summaryData.unresolved_issues.join('; ')}`);
    }
    return parts.join(' | ') || 'No summary available';
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
   * Build enhanced system prompt with static content for caching optimization
   * OpenAI caches prompts >= 1024 tokens automatically. To maximize cache hits:
   * - Static content (personality, tools, format) goes first and gets cached
   * - Dynamic context is appended last and changes per request
   */
  buildEnhancedSystemPrompt(baseSystemPrompt, agent, dynamicContext = {}, currentTurnLanguage = null) {
    // LAYER 1: Base personality and behavior (static per agent)
    let enhancedPrompt = baseSystemPrompt;

    // LAYER 2: Tool definitions (static per agent) - critical for caching
    enhancedPrompt += `\n\n## Available Tools\n\nYou have access to the following tools:\n\n`;
    
    agent.tools.forEach(tool => {
      enhancedPrompt += `### ${tool.name}\n`;
      enhancedPrompt += `Description: ${tool.description}\n`;
      
      // Include endpoint information for api_caller
      if (tool.name === 'api_caller' && tool.parameters && tool.parameters.endpoints) {
        const endpoints = Object.keys(tool.parameters.endpoints);
        enhancedPrompt += `Available endpoints: ${endpoints.join(', ')}\n`;
      }
      
      enhancedPrompt += `\n`;
    });

    // LAYER 3: Response format instructions (static) - critical for caching
    enhancedPrompt += `\n## Response Format\n\nYou must respond in one of these formats:\n\n`;
    enhancedPrompt += `**1. To use a tool (including request_human_handoff):**\n`;
    enhancedPrompt += `ACTION: use_tool\n`;
    enhancedPrompt += `TOOL: tool_name\n`;
    enhancedPrompt += `PARAMETERS: {"param1": "value1", "param2": "value2"}\n`;
    enhancedPrompt += `REASONING: Why you need to use this tool\n\n`;
    
    enhancedPrompt += `IMPORTANT: ALL tools must be called with ACTION: use_tool. Never use the tool name as the action.\n\n`;
    
    // Only include the handoff example if this agent actually has the tool
    if (agent.tools.some(t => t.name === 'request_human_handoff')) {
      enhancedPrompt += `Example for human handoff:\n`;
      enhancedPrompt += `ACTION: use_tool\n`;
      enhancedPrompt += `TOOL: request_human_handoff\n`;
      enhancedPrompt += `PARAMETERS: {"reason": "Customer requested human assistance", "urgency": "low", "handoff_message": "I understand you'd like to speak with a human agent. Let me connect you with one of our team members."}\n`;
      enhancedPrompt += `REASONING: User explicitly asked to speak with a human representative\n\n`;
      enhancedPrompt += `Note: The handoff_message parameter is optional but recommended. It allows you to provide a contextual message in the user's language.\n\n`;
    }
    
    enhancedPrompt += `For api_caller tool, use this format:\n`;
    enhancedPrompt += `PARAMETERS: {\n`;
    enhancedPrompt += `  "endpoint_name": "endpoint_name",\n`;
    enhancedPrompt += `  "method": "GET|POST|PUT|DELETE",\n`;
    enhancedPrompt += `  "query_params": {"key": "value"},\n`;
    enhancedPrompt += `  "path_params": {"key": "value"},\n`;
    enhancedPrompt += `  "body_data": {"key": "value"}\n`;
    enhancedPrompt += `}\n\n`;
    
    enhancedPrompt += `**2. To respond to the user:**\n`;
    enhancedPrompt += `ACTION: respond\n`;
    enhancedPrompt += `RESPONSE: Your response to the user\n`;
    enhancedPrompt += `REASONING: Why this response is appropriate\n\n`;
    
    enhancedPrompt += `**3. To continue thinking:**\n`;
    enhancedPrompt += `ACTION: think\n`;
    enhancedPrompt += `REASONING: What you're thinking about\n`;

    // LAYER 3.5: Summary handling instructions (static)
    enhancedPrompt += `\n## Summary Handling\n`;
    enhancedPrompt += `When a "Previous Context Summary" is provided, treat it as background knowledge about earlier parts of the conversation. `;
    enhancedPrompt += `NEVER reference or repeat the summary format, structure, or categories (topics, decisions, issues, etc.) in your response to the user. `;
    enhancedPrompt += `Always respond naturally and conversationally as if you remember the full conversation. `;
    enhancedPrompt += `Use the factual data from the summary (names, numbers, statuses, dates) when relevant to the user's question.\n`;

    // LAYER 4: Dynamic context (changes per request) - appended last to preserve cache
    if (Object.keys(dynamicContext).length > 0) {
      const contextString = Object.entries(dynamicContext)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n');

      enhancedPrompt += `\n\n## Additional Context\n${contextString}`;
    }

    // LAYER 5: Language enforcement (per-turn, appended last)
    if (currentTurnLanguage && agent.config.enforce_language_detection !== false) {
      enhancedPrompt += `\n\n## Language Requirement\n`;
      enhancedPrompt += `CRITICAL: The user's current message is written in language code "${currentTurnLanguage}" (ISO 639-1). `;
      enhancedPrompt += `You MUST write your entire response (the RESPONSE field) in this language ("${currentTurnLanguage}"). `;
      enhancedPrompt += `Do NOT switch to another language unless the user explicitly asks you to. `;
      enhancedPrompt += `Tool parameters, action fields, and reasoning may remain in English.`;
    }

    return enhancedPrompt;
  }

  // ---------------------------------------------------------------------------
  // Small Agent Graph — multi-role orchestrator for chatbot agents.
  // Implementation lives in ./agentGraph; these wrappers keep the call sites
  // (executeChatbotAgent / executeChatbotAgentStream / resumeAfterHandoffRefusal)
  // unchanged.
  // ---------------------------------------------------------------------------

  async executeChatbotAgentGraph(agent, conversation, dynamicContext = {}, cancellationToken = null) {
    return runAgentGraph(this, agent, conversation, dynamicContext, { cancellationToken });
  }

  async executeChatbotAgentGraphStream(
    agent,
    conversation,
    dynamicContext = {},
    streamCallback = null,
    cancellationToken = null,
    statusCallback = null
  ) {
    return runAgentGraph(this, agent, conversation, dynamicContext, {
      cancellationToken,
      streamCallback,
      statusCallback,
    });
  }
}

module.exports = new AgentService();
