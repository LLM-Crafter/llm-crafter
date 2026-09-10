const OpenAIService = require('./openaiService');
const toolService = require('./toolService');

/**
 * Procedure Service
 *
 * Runs deterministic, multi-step "procedures" configured on a chatbot agent
 * (see Agent.procedures) — e.g. a refund request that must collect an order
 * number, a reason, and a photo before a human is looped in.
 *
 * The LLM is used only for language understanding (matching the right
 * procedure, extracting field values from the user's message). All
 * completion tracking, conditional logic, and tool authorization is
 * deterministic and enforced in code via `conversation.procedure_state`.
 */
class ProcedureService {
  /**
   * Run one turn of procedure matching/extraction/validation.
   * Mutates and persists conversation.procedure_state.
   */
  async processTurn(agent, conversation, userMessage, dynamicContext = {}) {
    if (!Array.isArray(agent.procedures) || agent.procedures.length === 0) {
      return;
    }
    if (!agent.api_key || !agent.api_key.provider) {
      return;
    }

    // Accumulates cost/tokens across this turn's matching + extraction LLM calls
    // so they can be folded into conversation.metadata like title/summarization costs.
    const usage = { total_tokens: 0, cost: 0 };

    let state = conversation.procedure_state;
    let procedureDef = null;

    if (state?.procedure_id && state.status === 'active') {
      procedureDef = state.procedure_snapshot;
    } else {
      const candidates = agent.procedures.filter(p => p.enabled !== false);
      if (candidates.length === 0) return;

      const matchedId = await this.matchProcedure(agent, conversation, userMessage, candidates, usage);
      if (!matchedId) {
        await this.persistUsage(conversation, usage);
        return;
      }

      procedureDef = candidates.find(p => p.id === matchedId);
      if (!procedureDef) {
        await this.persistUsage(conversation, usage);
        return;
      }

      state = this.startRun(conversation, procedureDef);
    }

    await this.extractAndValidateFields(agent, conversation, procedureDef, userMessage, usage);
    this.checkDocumentSteps(conversation, procedureDef);
    this.recomputeCompletion(conversation, procedureDef);

    conversation.markModified('procedure_state');
    await this.persistUsage(conversation, usage);
  }

  /** Add accumulated LLM usage from a response into a running total. */
  _accumulateUsage(total, respUsage) {
    if (!respUsage) return;
    total.total_tokens += respUsage.total_tokens || 0;
    total.cost += respUsage.cost || 0;
  }

  /** Fold this turn's procedure LLM cost/tokens into conversation metadata and save. */
  async persistUsage(conversation, usage) {
    if (usage.cost > 0 || usage.total_tokens > 0) {
      conversation.metadata.total_cost = (conversation.metadata.total_cost || 0) + usage.cost;
      conversation.metadata.total_tokens_used = (conversation.metadata.total_tokens_used || 0) + usage.total_tokens;
    }
    await conversation.save();
  }

  /**
   * Ask the LLM which configured procedure (if any) matches the user's
   * latest message, based on the procedure's semantic trigger description.
   */
  async matchProcedure(agent, conversation, userMessage, procedures, usage = null) {
    const openai = new OpenAIService(
      agent.api_key.getDecryptedKey(),
      agent.api_key.provider.name
    );

    const catalogue = procedures
      .map(p => {
        const examples = (p.trigger?.examples || []).join(', ');
        return `- id: ${p.id}\n  name: ${p.name}\n  when to use: ${p.trigger?.description || p.description || ''}\n  example phrases: ${examples}`;
      })
      .join('\n');

    const systemPrompt = [
      'You match a user\'s latest message to a predefined procedure, based on MEANING, not exact keywords.',
      'Only select a procedure when the message clearly falls into one of the described situations. Return null if none apply.',
      '',
      'Available procedures:',
      catalogue,
      '',
      // Always spell out the required JSON shape — response_format/schema enforcement is only
      // applied when the model is on the structured-outputs allow-list (see
      // OpenAIService#supportsStructuredOutputs). Every other model (non-OpenAI providers,
      // reasoning models, etc.) relies entirely on this instruction to produce parseable JSON.
      'Respond with JSON only, in the exact shape: {"procedure_id": "<id-or-null>", "reasoning": "<why>"}',
      'Do not include any text before or after the JSON object.',
    ].join('\n');

    const recent = conversation
      .getDecryptedMessages()
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    const userPrompt = `Recent conversation:\n${recent}\n\nLatest user message:\n${userMessage}\n\nWhich procedure applies?`;

    const schema = {
      type: 'json_schema',
      json_schema: {
        name: 'procedure_match',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            procedure_id: {
              type: ['string', 'null'],
              description: 'ID of the best matching procedure, or null if none apply.',
            },
            reasoning: { type: 'string' },
          },
          required: ['procedure_id'],
        },
      },
    };

    const supportsStructured = openai.supportsStructuredOutputs(agent.llm_settings.model);
    // Reasoning-style models spend hidden reasoning tokens from the same completion
    // budget, so a small cap can leave 0 tokens for the actual JSON output.
    const maxTokens = openai.isFixedTemperatureModel(agent.llm_settings.model) ? 1000 : 200;

    try {
      const resp = await openai.generateCompletion(
        agent.llm_settings.model,
        userPrompt,
        { ...agent.llm_settings.parameters, temperature: 0, max_tokens: maxTokens },
        systemPrompt,
        supportsStructured ? schema : null,
        { prompt_cache_key: `agent_procedure_match_${agent._id}` }
      );
      this._accumulateUsage(usage || {}, resp.usage);
      const parsed = this.parseJsonResponse(resp.content);
      if (parsed?.procedure_id && procedures.some(p => p.id === parsed.procedure_id)) {
        return parsed.procedure_id;
      }
      if (parsed && parsed.procedure_id !== null && parsed.procedure_id !== undefined) {
        console.warn(`[Procedure] match LLM returned unknown procedure_id "${parsed.procedure_id}"`);
      }
    } catch (e) {
      console.warn('[Procedure] match LLM call failed:', e.message);
    }
    return null;
  }

  /**
   * Best-effort JSON parsing for LLM output. Handles models that wrap the
   * JSON in prose or code fences despite being told to respond with JSON only.
   */
  parseJsonResponse(content) {
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  /** Initialize a new procedure run on the conversation, pinning the definition. */
  startRun(conversation, procedureDef) {
    conversation.procedure_state = {
      procedure_id: procedureDef.id,
      procedure_snapshot: JSON.parse(JSON.stringify(procedureDef)),
      status: 'active',
      started_at: new Date(),
      completed_at: null,
      collected_fields: {},
      step_status: procedureDef.steps.map(s => ({ step_id: s.id, status: 'pending', attempts: 0 })),
    };
    return conversation.procedure_state;
  }

  /** Extract candidate field values for pending collect/ask steps and validate them. */
  async extractAndValidateFields(agent, conversation, procedureDef, userMessage, usage = null) {
    const state = conversation.procedure_state;
    const pendingFieldSteps = procedureDef.steps.filter(
      s =>
        ['collect', 'ask'].includes(s.type) &&
        s.field_key &&
        !state.collected_fields?.[s.field_key]?.validated &&
        this.isStepEligible(state, procedureDef, s)
    );
    if (pendingFieldSteps.length === 0) return;

    const extracted = await this.runExtractionLLM(agent, conversation, userMessage, pendingFieldSteps, usage);
    if (!extracted) return;

    for (const step of pendingFieldSteps) {
      const value = extracted[step.field_key];
      if (value === undefined || value === null || value === '') continue;

      const fieldEntry = {
        value,
        validated: !step.validation_tool,
        validation_error: null,
        updated_at: new Date(),
      };

      if (step.validation_tool) {
        try {
          const params = this.renderTemplate(step.validation_parameters || {}, {
            [step.field_key]: value,
            ...this.flattenFieldValues(state.collected_fields),
          });
          const result = await toolService.executeToolWithConfig(
            step.validation_tool,
            params,
            this.buildToolConfig(agent, step.validation_tool, conversation._id)
          );
          fieldEntry.validated = !!result.success;
          fieldEntry.validation_error = result.success ? null : result.error;
        } catch (e) {
          fieldEntry.validated = false;
          fieldEntry.validation_error = e.message;
        }
      }

      state.collected_fields[step.field_key] = fieldEntry;
      this.setStepStatus(state, step.id, fieldEntry.validated ? 'completed' : 'failed');
    }
    conversation.markModified('procedure_state.collected_fields');
  }

  /** Ask the LLM to extract field values the user has provided so far. */
  async runExtractionLLM(agent, conversation, userMessage, steps, usage = null) {
    const openai = new OpenAIService(
      agent.api_key.getDecryptedKey(),
      agent.api_key.provider.name
    );

    const fieldList = steps
      .map(s => `- ${s.field_key} (${s.field_type || 'string'}): ${s.description || s.name}`)
      .join('\n');

    const fieldKeys = steps.map(s => s.field_key);
    const supportsStructured = openai.supportsStructuredOutputs(agent.llm_settings.model);

    const systemPrompt = [
      'Extract structured field values the user has actually provided (in their latest message, or earlier in the conversation).',
      'Only include a field if the user provided that specific information. Omit fields that are not mentioned.',
      '',
      'Fields to extract:',
      fieldList,
      '',
      // Required regardless of structured-output support — see matchProcedure for rationale.
      `Respond with JSON only, in the exact shape: {${fieldKeys.map(k => `"${k}": <value-or-omit>`).join(', ')}}`,
      'Do not include any text before or after the JSON object.',
    ].join('\n');

    const recent = conversation
      .getDecryptedMessages()
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    const userPrompt = `Conversation:\n${recent}\n\nLatest user message:\n${userMessage}`;

    const schema = {
      type: 'json_schema',
      json_schema: {
        name: 'procedure_field_extraction',
        strict: false,
        schema: {
          type: 'object',
          properties: Object.fromEntries(
            steps.map(s => [
              s.field_key,
              {
                type: s.field_type === 'number' ? 'number' : s.field_type === 'boolean' ? 'boolean' : 'string',
                description: s.description || s.name,
              },
            ])
          ),
        },
      },
    };

    // Reasoning-style models spend hidden reasoning tokens from the same completion
    // budget, so a small cap can leave 0 tokens for the actual JSON output.
    const maxTokens = openai.isFixedTemperatureModel(agent.llm_settings.model) ? 1200 : 300;

    try {
      const resp = await openai.generateCompletion(
        agent.llm_settings.model,
        userPrompt,
        { ...agent.llm_settings.parameters, temperature: 0, max_tokens: maxTokens },
        systemPrompt,
        supportsStructured ? schema : null,
        { prompt_cache_key: `agent_procedure_extract_${agent._id}` }
      );
      this._accumulateUsage(usage || {}, resp.usage);
      return this.parseJsonResponse(resp.content);
    } catch (e) {
      console.warn('[Procedure] extraction LLM call failed:', e.message);
      return null;
    }
  }

  /** Mark request_document steps complete once a stored attachment has arrived since the run started. */
  checkDocumentSteps(conversation, procedureDef) {
    const state = conversation.procedure_state;
    const docSteps = procedureDef.steps.filter(s => s.type === 'request_document');
    if (docSteps.length === 0) return;

    const startedAt = state.started_at;
    const hasEvidence = conversation.messages
      .filter(m => !startedAt || new Date(m.timestamp) >= new Date(startedAt))
      .some(m => (m.channel_info?.media || []).some(item => item.stored));

    if (!hasEvidence) return;
    for (const step of docSteps) {
      if (!this.isStepEligible(state, procedureDef, step)) continue;
      if (this.getStepStatus(state, step.id) !== 'completed') {
        this.setStepStatus(state, step.id, 'completed');
      }
    }
  }

  /** Recompute skip status for unmet conditions and close the run once all required steps are done. */
  recomputeCompletion(conversation, procedureDef) {
    const state = conversation.procedure_state;
    for (const step of procedureDef.steps) {
      if (!step.condition?.field_key) continue;
      const fieldEntry = state.collected_fields?.[step.condition.field_key];
      if (!fieldEntry || !fieldEntry.validated) continue; // condition not yet resolved
      const conditionMet = String(fieldEntry.value).toLowerCase() === String(step.condition.equals).toLowerCase();
      if (!conditionMet) {
        const entry = state.step_status.find(s => s.step_id === step.id);
        if (entry && entry.status !== 'completed') entry.status = 'skipped';
      }
    }

    const allRequiredDone = procedureDef.steps
      .filter(s => s.required !== false)
      .every(s => {
        if (!this.isStepEligible(state, procedureDef, s)) return true; // not (yet) applicable
        const entry = state.step_status.find(x => x.step_id === s.id);
        return entry?.status === 'completed' || entry?.status === 'skipped';
      });

    if (allRequiredDone && state.status === 'active') {
      state.status = 'completed';
      state.completed_at = new Date();
    }
  }

  /** Whether a step's condition (if any) is currently satisfied. */
  isStepEligible(state, procedureDef, step) {
    if (!step.condition?.field_key) return true;
    const fieldEntry = state.collected_fields?.[step.condition.field_key];
    if (!fieldEntry || !fieldEntry.validated) return false;
    return String(fieldEntry.value).toLowerCase() === String(step.condition.equals).toLowerCase();
  }

  getStepStatus(state, stepId) {
    return state.step_status?.find(s => s.step_id === stepId)?.status || 'pending';
  }

  setStepStatus(state, stepId, status) {
    const entry = state.step_status?.find(s => s.step_id === stepId);
    if (!entry) return;
    entry.status = status;
    entry.attempts = (entry.attempts || 0) + 1;
    if (status === 'completed') entry.completed_at = new Date();
  }

  /**
   * Whether `toolName` may be executed right now. Tools bound to a
   * tool_action/escalate step via `gated_tool` are blocked until every
   * preceding required (and currently-applicable) step is complete.
   */
  checkToolAllowed(conversation, toolName) {
    const state = conversation.procedure_state;
    if (!state?.procedure_id || state.status !== 'active') return { allowed: true };
    const procedureDef = state.procedure_snapshot;
    if (!procedureDef) return { allowed: true };

    const gatingSteps = procedureDef.steps.filter(s => s.gated_tool === toolName);
    if (gatingSteps.length === 0) return { allowed: true };

    for (const step of gatingSteps) {
      if (!this.isStepEligible(state, procedureDef, step)) continue;

      const stepIndex = procedureDef.steps.findIndex(s => s.id === step.id);
      const unmetPrereqs = procedureDef.steps
        .slice(0, stepIndex)
        .filter(s => s.required !== false && this.isStepEligible(state, procedureDef, s))
        .filter(s => this.getStepStatus(state, s.id) !== 'completed');

      if (unmetPrereqs.length > 0) {
        return {
          allowed: false,
          reason: `Cannot use '${toolName}' yet — required step(s) not complete: ${unmetPrereqs.map(s => s.name).join(', ')}.`,
        };
      }
    }
    return { allowed: true };
  }

  /** Advance gated tool_action/escalate steps after a tool has executed. */
  recordToolResult(conversation, toolName, toolResult) {
    const state = conversation.procedure_state;
    if (!state?.procedure_id || state.status !== 'active') return;
    const procedureDef = state.procedure_snapshot;
    if (!procedureDef) return;

    const matchingSteps = procedureDef.steps.filter(
      s => s.gated_tool === toolName && ['tool_action', 'escalate'].includes(s.type)
    );
    if (matchingSteps.length === 0) return;

    for (const step of matchingSteps) {
      this.setStepStatus(state, step.id, toolResult.success ? 'completed' : 'failed');
    }
    this.recomputeCompletion(conversation, procedureDef);
    conversation.markModified('procedure_state');
  }

  /** Next eligible, incomplete required step, or null when nothing is outstanding. */
  getNextRequiredStep(state, procedureDef) {
    for (const step of procedureDef.steps) {
      if (step.required === false) continue;
      if (!this.isStepEligible(state, procedureDef, step)) continue;
      if (this.getStepStatus(state, step.id) !== 'completed') return step;
    }
    return null;
  }

  /** Human-readable directive injected into planner/responder prompts. */
  getPromptDirective(conversation) {
    const state = conversation.procedure_state;
    if (!state?.procedure_id) return null;
    const procedureDef = state.procedure_snapshot;
    if (!procedureDef) return null;

    const lines = [`## Active Procedure: ${procedureDef.name}`];

    if (state.status === 'completed') {
      lines.push('Status: all required steps are complete. Proceed normally.');
      return lines.join('\n');
    }

    lines.push(
      procedureDef.response_policy === 'answer_while_collecting'
        ? 'Policy: you may answer the user\'s question while continuing to collect any missing required information below.'
        : 'Policy: do NOT give the final answer/resolution until all required steps below are complete. You may acknowledge, ask questions, and collect information.'
    );

    lines.push('Steps:');
    for (const step of procedureDef.steps) {
      if (!this.isStepEligible(state, procedureDef, step)) continue;
      const status = this.getStepStatus(state, step.id);
      const marker =
        status === 'completed'
          ? '[done]'
          : status === 'skipped'
            ? '[skipped]'
            : step.required === false
              ? '[optional, pending]'
              : '[REQUIRED, pending]';
      lines.push(`- ${marker} ${step.name}: ${step.description || ''}`);
    }

    const next = this.getNextRequiredStep(state, procedureDef);
    lines.push(
      next
        ? `Next action: ask the user for — ${next.name}. ${next.description || ''}`
        : 'All required steps satisfied — you may proceed with the resolution/answer and any gated actions.'
    );

    return lines.join('\n');
  }

  /** Minimal tool config for server-side validation calls (no agent LLM key needed). */
  buildToolConfig(agent, toolName, conversationId) {
    const tool = agent.tools.find(t => t.name === toolName);
    return {
      ...(tool?.parameters || {}),
      organization_id: agent.organization,
      project_id: agent.project,
      conversation_id: conversationId || null,
    };
  }

  flattenFieldValues(collectedFields = {}) {
    return Object.fromEntries(Object.entries(collectedFields).map(([k, v]) => [k, v.value]));
  }

  /** Substitute {{field}} placeholders in a template object's string values. */
  renderTemplate(template, values) {
    const render = str => str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (values[key] !== undefined ? values[key] : ''));
    const walk = node => {
      if (typeof node === 'string') return render(node);
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
      }
      return node;
    };
    return walk(template);
  }
}

module.exports = new ProcedureService();
