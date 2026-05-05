const OpenAIService = require('./openaiService');
const toolService = require('./toolService');
const crypto = require('crypto');

class HookService {
  /**
   * Execute all matching hooks for an agent on a given event.
   *
   * Hooks run asynchronously in the background — they do NOT block
   * the main conversation flow or the response to the user.
   *
   * @param {Object}  agent        – populated Agent document (with api_key.provider)
   * @param {Object}  conversation – Conversation document
   * @param {string}  message      – the raw message content
   * @param {string}  messageRole  – 'user' | 'human_operator' | 'system'
   * @param {string}  event        – 'message' | 'new_conversation'
   */
  async executeHooks(agent, conversation, message, messageRole, event = 'message') {
    const hooks = (agent.hooks || []).filter(h => h.enabled);
    if (hooks.length === 0) return;

    const isHumanControlled =
      conversation.current_handler === 'human' ||
      conversation.status === 'human_controlled' ||
      conversation.status === 'handoff_requested';

    const matchingHooks = hooks.filter(hook =>
      this._shouldTrigger(hook, messageRole, isHumanControlled, event)
    );

    if (matchingHooks.length === 0) return;

    // Fire all matching hooks in parallel, non-blocking
    const results = await Promise.allSettled(
      matchingHooks.map(hook =>
        this._executeHook(hook, agent, conversation, message, messageRole)
      )
    );

    // Log failures (but never throw — hooks must not break the main flow)
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        console.error(
          `[Hook] "${matchingHooks[i].name}" failed:`,
          results[i].reason?.message || results[i].reason
        );
      } else {
        console.log(
          `[Hook] "${matchingHooks[i].name}" completed`,
          results[i].value?.tools_used?.length
            ? `(${results[i].value.tools_used.length} tool calls)`
            : ''
        );
      }
    }

    return results;
  }

  /**
   * Check if a hook should fire for the current event.
   */
  _shouldTrigger(hook, messageRole, isHumanControlled, event) {
    if (event === 'new_conversation') {
      return hook.trigger === 'new_conversation';
    }

    // For message events
    switch (hook.trigger) {
      case 'every_message':
        return true;
      case 'user_message_only':
        return messageRole === 'user';
      case 'human_controlled_only':
        return isHumanControlled;
      case 'new_conversation':
        return false; // Only fires on 'new_conversation' event
      default:
        return false;
    }
  }

  /**
   * Execute a single hook (LLM or webhook).
   */
  async _executeHook(hook, agent, conversation, message, messageRole) {
    if (hook.type === 'webhook') {
      return this._executeWebhook(hook, agent, conversation, message, messageRole);
    }
    return this._executeLLMHook(hook, agent, conversation, message, messageRole);
  }

  // ---------------------------------------------------------------------------
  // Webhook hooks
  // ---------------------------------------------------------------------------

  /**
   * POST message content + conversation context to an external URL.
   */
  async _executeWebhook(hook, agent, conversation, message, messageRole) {
    if (!hook.webhook_url) {
      throw new Error('Webhook URL is not configured');
    }

    const payload = {
      event: 'message_hook',
      hook_name: hook.name,
      timestamp: new Date().toISOString(),
      agent_id: agent._id,
      conversation_id: conversation._id,
      user_identifier: conversation.user_identifier,
      message: {
        role: messageRole,
        content: message,
      },
      conversation_status: conversation.status,
      current_handler: conversation.current_handler,
    };

    // Include external operator info if conversation was taken over
    if (conversation.handoff_info?.assigned_external_operator) {
      payload.external_operator = {
        external_id: conversation.handoff_info.assigned_external_operator.external_id,
        name: conversation.handoff_info.assigned_external_operator.name,
        email: conversation.handoff_info.assigned_external_operator.email,
      };
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    // Sign the payload if a secret is configured
    if (hook.webhook_secret) {
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', hook.webhook_secret)
        .update(rawBody)
        .digest('hex');
      headers['X-Webhook-Signature'] = signature;
    }

    const response = await fetch(hook.webhook_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }

    return { webhook: true, status: response.status };
  }

  // ---------------------------------------------------------------------------
  // LLM hooks
  // ---------------------------------------------------------------------------

  /**
   * Run a lightweight LLM call with the hook's prompt.
   * The LLM has access to the same tools as the main agent.
   */
  async _executeLLMHook(hook, agent, conversation, message, messageRole) {
    if (!hook.prompt) {
      throw new Error('Hook prompt is not configured');
    }

    const decryptedKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(decryptedKey, agent.api_key.provider.name);

    const model = hook.model || agent.llm_settings.model;
    const maxIterations = 3; // Keep hook tool calls limited

    // Build a minimal system prompt with tool definitions + hook instructions
    const systemPrompt = this._buildHookSystemPrompt(hook, agent);

    // Build conversation context (limited window)
    const recentMessages = this._getRecentMessages(conversation, hook.context_messages || 5);
    const userPrompt = this._buildHookUserPrompt(recentMessages, message, messageRole);

    const toolsUsed = [];
    const totalUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: 0,
    };

    // Use structured output if supported
    const responseFormat = openai.supportsStructuredOutputs(model)
      ? this._getHookResponseSchema()
      : null;

    let iteration = 0;
    let thinkingSteps = [];

    while (iteration < maxIterations) {
      iteration++;

      // Build prompt with any tool results from previous iterations
      const iterationPrompt =
        iteration === 1
          ? userPrompt
          : this._buildHookIterationPrompt(userPrompt, thinkingSteps, toolsUsed);

      const llmResponse = await openai.generateCompletion(
        model,
        iterationPrompt,
        { temperature: 0.2, max_tokens: 500 },
        systemPrompt,
        responseFormat
      );

      totalUsage.prompt_tokens += llmResponse.usage.prompt_tokens;
      totalUsage.completion_tokens += llmResponse.usage.completion_tokens;
      totalUsage.total_tokens += llmResponse.usage.total_tokens;
      totalUsage.cost += llmResponse.usage.cost;

      const parsed = this._parseHookResponse(llmResponse.content);

      if (parsed.action === 'use_tool') {
        // Validate tool exists on agent
        const agentHasTool = agent.tools.some(t => t.name === parsed.tool_name);
        if (!agentHasTool) {
          thinkingSteps.push({
            step: 'tool_rejected',
            tool_name: parsed.tool_name,
            reason: 'Tool not available on this agent',
          });
          continue;
        }

        const toolResult = await toolService.executeToolWithConfig(
          parsed.tool_name,
          parsed.tool_parameters,
          this._getToolConfig(agent, parsed.tool_name, conversation._id)
        );

        const entry = {
          tool_name: parsed.tool_name,
          parameters: parsed.tool_parameters,
          success: toolResult.success,
          result: toolResult.success ? toolResult.result : null,
          error: toolResult.success ? null : toolResult.error,
          execution_time_ms: toolResult.execution_time_ms,
        };
        toolsUsed.push(entry);
        thinkingSteps.push({ step: 'tool_execution', ...entry });
        continue;
      }

      // 'done' or 'respond' — hook finished
      break;
    }

    console.log(
      `[Hook LLM] "${hook.name}" completed in ${iteration} iteration(s), ` +
        `${toolsUsed.length} tool call(s), cost: $${totalUsage.cost.toFixed(4)}`
    );

    return { tools_used: toolsUsed, token_usage: totalUsage };
  }

  /**
   * Structured output schema for hook LLM responses.
   */
  _getHookResponseSchema() {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'hook_response',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['use_tool', 'done'],
              description:
                'use_tool to call a tool, done when finished (no more actions needed)',
            },
            tool_name: {
              type: 'string',
              description: 'Name of the tool to call (when action is use_tool)',
            },
            tool_parameters: {
              type: 'object',
              description: 'Parameters for the tool call',
            },
            reasoning: {
              type: 'string',
              description: 'Why this action was chosen',
            },
          },
          required: ['action', 'reasoning'],
        },
      },
    };
  }

  /**
   * Build the system prompt for a hook LLM call.
   */
  _buildHookSystemPrompt(hook, agent) {
    let prompt = `You are a background processing hook. Your task:\n\n${hook.prompt}\n\n`;
    prompt += `IMPORTANT: You are running in the background. The user does NOT see your output.\n`;
    prompt += `You must ONLY use tools to take action. You do NOT generate user-facing replies.\n`;
    prompt += `When you are done (nothing to do, or action completed), respond with action: "done".\n\n`;

    // Add tool definitions (same as main agent)
    prompt += `## Available Tools\n\n`;
    agent.tools.forEach(tool => {
      if (tool.enabled !== false) {
        prompt += `### ${tool.name}\n${tool.description}\n`;
        if (
          tool.parameters &&
          typeof tool.parameters === 'object' &&
          Object.keys(tool.parameters).length > 0
        ) {
          prompt += `Configuration: ${JSON.stringify(tool.parameters)}\n`;
        }
        prompt += `\n`;
      }
    });

    prompt += `## Response Format\n\n`;
    prompt += `To use a tool:\n`;
    prompt += `ACTION: use_tool\nTOOL: tool_name\nPARAMETERS: {"key": "value"}\nREASONING: why\n\n`;
    prompt += `When finished:\n`;
    prompt += `ACTION: done\nREASONING: why\n`;

    return prompt;
  }

  /**
   * Get recent messages from conversation for hook context.
   */
  _getRecentMessages(conversation, limit) {
    const messages = conversation.getDecryptedMessages
      ? conversation.getDecryptedMessages()
      : conversation.messages || [];
    return messages.slice(-limit);
  }

  /**
   * Build the user prompt for the first hook iteration.
   */
  _buildHookUserPrompt(recentMessages, currentMessage, messageRole) {
    let prompt = `## Recent Conversation\n`;
    for (const msg of recentMessages) {
      prompt += `${msg.role}: ${msg.content}\n`;
    }
    prompt += `\n## Latest Message\n${messageRole}: ${currentMessage}\n\n`;
    prompt += `Analyze the conversation and take action if needed.`;
    return prompt;
  }

  /**
   * Build prompt for subsequent hook iterations (with tool results).
   */
  _buildHookIterationPrompt(basePrompt, thinkingSteps, toolsUsed) {
    let prompt = basePrompt;
    if (toolsUsed.length > 0) {
      prompt += `\n\n## Tool Results\n`;
      for (const tool of toolsUsed) {
        prompt += `- ${tool.tool_name}: ${tool.success ? 'SUCCESS' : 'FAILED'}`;
        if (tool.result) prompt += ` — ${JSON.stringify(tool.result).slice(0, 500)}`;
        if (tool.error) prompt += ` — Error: ${tool.error}`;
        prompt += `\n`;
      }
    }
    prompt += `\n\nDecide your next action.`;
    return prompt;
  }

  /**
   * Parse the hook LLM response (same pattern as agentService).
   */
  _parseHookResponse(content) {
    // Try JSON first
    try {
      const parsed = JSON.parse(content);
      return {
        action: parsed.action || 'done',
        tool_name: parsed.tool_name,
        tool_parameters: parsed.tool_parameters || {},
        reasoning: parsed.reasoning,
      };
    } catch {
      // Fall back to text parsing
    }

    const result = { action: 'done' };
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^ACTION:\s*/i)) {
        const val = trimmed.replace(/^ACTION:\s*/i, '').trim().toLowerCase();
        result.action = val === 'use_tool' ? 'use_tool' : 'done';
      } else if (trimmed.match(/^TOOL:\s*/i)) {
        result.tool_name = trimmed.replace(/^TOOL:\s*/i, '').trim();
      } else if (trimmed.match(/^REASONING:\s*/i)) {
        result.reasoning = trimmed.replace(/^REASONING:\s*/i, '').trim();
      }
    }

    // Parse PARAMETERS block
    const paramsIdx = content.indexOf('PARAMETERS:');
    if (paramsIdx !== -1) {
      const after = content.substring(paramsIdx + 'PARAMETERS:'.length);
      const braceStart = after.indexOf('{');
      if (braceStart !== -1) {
        let depth = 0;
        let end = braceStart;
        for (let i = braceStart; i < after.length; i++) {
          if (after[i] === '{') depth++;
          else if (after[i] === '}') depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
        try {
          result.tool_parameters = JSON.parse(
            after.substring(braceStart, end + 1)
          );
        } catch {
          result.tool_parameters = {};
        }
      }
    }

    return result;
  }

  /**
   * Build tool config for hook tool execution (mirrors agentService.getAgentToolConfig).
   */
  _getToolConfig(agent, toolName, conversationId) {
    const tool = agent.tools.find(t => t.name === toolName);
    const config = { ...(tool?.parameters || {}) };

    config.organization_id = agent.organization;
    config.project_id = agent.project;
    config.conversation_id = conversationId || null;

    if (agent.api_key) {
      if (toolName === 'rag_search') {
        config._agent_api_key_id = agent.api_key._id;
        config._agent_api_key = agent.api_key;
      }
      if (config.summarization?.enabled) {
        config._agent_api_key = {
          key: agent.api_key.key,
          provider: agent.api_key.provider.name,
        };
      }
      if (toolName === 'faq') {
        config._agent_api_key = agent.api_key;
      }
    }

    return config;
  }
}

module.exports = new HookService();
