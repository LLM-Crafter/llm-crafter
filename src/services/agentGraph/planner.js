// Planner + tool execution for the small agent graph.
//
// Native mode (default): the planner is a tool-calling loop. Every batch of
// tool calls runs in parallel, the results go back to the planner, and the loop
// ends when the planner stops calling tools. The planner therefore always sees
// what its tools returned before the responder runs.
//
// JSON mode (graph_planner_mode: "json", or automatic fallback when the
// provider rejects native tool calling): the planner returns a JSON plan per
// round and only runs again when it sets needs_another_round.

const toolService = require('../toolService');
const procedureService = require('../procedureService');
const jevService = require('../jevService');
const prompts = require('./prompts');
const { buildToolCatalog } = require('./toolCatalog');
const {
  MAX_PLANNER_ROUNDS,
  accumulateUsage,
  getGraphModel,
  throwIfCancelled,
  toolStatus,
} = require('./shared');

const DEFAULT_HANDOFF_MESSAGE =
  'I understand this requires specialized assistance. Let me connect you with one of our team members who can better help you with this. Please wait a moment.';

/**
 * Run the planner and execute the tools it asks for. Tool entries are pushed
 * onto ctx.toolsUsed.
 *
 * @returns {Promise<{ funnelState: string, handoff: Object|null }>} handoff is a
 *   complete graph result when a human handoff was requested.
 */
async function planAndAct(ctx) {
  const { agent } = ctx;

  if (jevService.isEnabled(agent, 'planner_gate') && agent.tools.length > 0) {
    const gate = await jevService.assessToolNeed(agent, {
      conversationHistory: ctx.context.conversation_history,
      tools: agent.tools,
      procedureDirective: ctx.context.procedure_directive,
    });
    if (gate) {
      accumulateUsage(ctx.usage, gate.usage);
      ctx.thinking.push({
        step: gate.skip ? 'planner_skipped' : 'planner_gate',
        reasoning: gate.skip
          ? `Jev: no tools needed (p=${gate.probability.toFixed(2)}, ${gate.latency_ms}ms, funnel_state=${gate.funnel_state}). Planner skipped.`
          : `Jev: tools may be needed (p_no_tools=${gate.probability.toFixed(2)}, ${gate.latency_ms}ms). Running planner.`,
      });
      if (gate.skip) {
        return { funnelState: gate.funnel_state, handoff: null };
      }
    }
  }

  const maxToolCalls = agent.config.max_tool_calls || 5;
  const budget = { total: maxToolCalls, remaining: maxToolCalls };

  if (agent.config?.graph_planner_mode === 'json') {
    return runJsonPlanner(ctx, budget);
  }

  try {
    return await runNativePlanner(ctx, budget);
  } catch (error) {
    if (!error.nativePlannerUnavailable) {
      throw error;
    }
    console.warn(`[Graph Planner] Native tool calling failed (${error.message}); falling back to the JSON planner.`);
    ctx.thinking.push({
      step: 'planner_fallback',
      reasoning: `Native tool calling failed (${error.message}). Using the JSON planner for this turn.`,
    });
    return runJsonPlanner(ctx, budget);
  }
}

async function runNativePlanner(ctx, budget) {
  const { openai, agent } = ctx;
  const catalog = buildToolCatalog(agent);

  if (catalog.functions.length === 0) {
    ctx.thinking.push({ step: 'planner_skipped', reasoning: 'No callable tools configured. Planner skipped.' });
    return { funnelState: 'general', handoff: null };
  }

  const model = getGraphModel(agent, 'planner');
  const systemPrompt = prompts.nativePlannerSystemPrompt(agent);
  const userPrompt = prompts.nativePlannerUserPrompt(ctx.context, ctx.dynamicContext, budget.total);
  const parameters = {
    ...agent.llm_settings.parameters,
    temperature: 0.2,
    // Reasoning-style models spend hidden reasoning tokens from the same budget.
    max_tokens: openai.isFixedTemperatureModel(model) ? 2000 : 1000,
  };
  const rounds = [];

  ctx.emitStatus('planning');

  for (let round = 1; round <= MAX_PLANNER_ROUNDS; round++) {
    throwIfCancelled(ctx.cancellationToken);

    let step;
    try {
      step = await openai.generateToolCompletion(
        model,
        userPrompt,
        catalog.functions,
        rounds,
        parameters,
        systemPrompt,
        { prompt_cache_key: `agent_graph_planner_${agent._id}` }
      );
    } catch (error) {
      if (round === 1) {
        error.nativePlannerUnavailable = true;
        throw error;
      }
      console.warn(`[Graph Planner] Round ${round} failed: ${error.message}. Continuing with collected results.`);
      ctx.thinking.push({
        step: 'planner_error',
        round,
        reasoning: `Planner call failed (${error.message}). Continuing with the tool results collected so far.`,
      });
      return { funnelState: 'general', handoff: null };
    }

    accumulateUsage(ctx.usage, step.usage);

    if (step.tool_calls.length === 0) {
      const funnelState = prompts.parseFunnelState(step.content);
      ctx.thinking.push({
        step: 'planner',
        round,
        reasoning: round === 1 ? 'No tools needed.' : 'No more tools needed.',
        funnel_state: funnelState,
        tools_planned: [],
      });
      console.log(`[Graph Planner] Round ${round}: done, funnel_state=${funnelState}, remaining_budget=${budget.remaining}`);
      return { funnelState, handoff: null };
    }

    const invocations = step.tool_calls.map(call => ({ id: call.id, label: call.name, ...catalog.resolve(call) }));
    ctx.thinking.push({
      step: 'planner',
      round,
      reasoning: step.content || `Planner round ${round}.`,
      tools_planned: invocations.map(inv => inv.tool_name || inv.label),
    });
    console.log(
      `[Graph Planner] Round ${round}: tools=${invocations.map(inv => inv.label).join(', ')}, remaining_budget=${budget.remaining}`
    );

    const { outcomes, handoff } = await executeBatch(ctx, invocations, round, budget);
    if (handoff) {
      return { funnelState: 'general', handoff };
    }

    rounds.push({
      assistantMessage: step.assistantMessage,
      results: invocations.map((inv, i) => ({ id: inv.id, content: outcomes[i].content, is_error: outcomes[i].is_error })),
    });

    if (budget.remaining <= 0) {
      ctx.thinking.push({
        step: 'budget_exhausted',
        round,
        reasoning: `Tool-call budget (${budget.total}) exhausted. Proceeding to responder with results collected so far.`,
      });
      return { funnelState: 'general', handoff: null };
    }
  }

  ctx.thinking.push({
    step: 'planner_round_cap',
    reasoning: `Planner reached the ${MAX_PLANNER_ROUNDS}-round cap. Proceeding to responder with results collected so far.`,
  });
  return { funnelState: 'general', handoff: null };
}

async function runJsonPlanner(ctx, budget) {
  const { openai, agent } = ctx;
  const model = getGraphModel(agent, 'planner');
  const responseFormat = openai.supportsStructuredOutputs(model) ? prompts.jsonPlannerSchema() : null;
  const systemPrompt = responseFormat
    ? prompts.jsonPlannerSystemPrompt(agent)
    : prompts.withJsonOutputInstructions(prompts.jsonPlannerSystemPrompt(agent), prompts.jsonPlannerSchema());
  const parameters = {
    ...agent.llm_settings.parameters,
    temperature: 0.2,
    max_tokens: openai.isFixedTemperatureModel(model) ? 2000 : 600,
  };
  const validToolNames = new Set(agent.tools.map(t => t.name));
  const collected = [];
  let funnelState = 'general';

  ctx.emitStatus('planning');

  for (let round = 1; round <= MAX_PLANNER_ROUNDS && budget.remaining > 0; round++) {
    throwIfCancelled(ctx.cancellationToken);

    const userPrompt = prompts.jsonPlannerUserPrompt(ctx.context, ctx.dynamicContext, {
      remainingBudget: budget.remaining,
      previousResults: collected,
      roundNumber: round,
      toolResultForPrompt: ctx.toolResultForPrompt,
    });

    const llm = await openai.generateCompletion(
      model,
      userPrompt,
      parameters,
      systemPrompt,
      responseFormat,
      { prompt_cache_key: `agent_graph_planner_${agent._id}` }
    );
    accumulateUsage(ctx.usage, llm.usage);

    let plan = procedureService.parseJsonResponse(llm.content);
    if (!plan) {
      console.warn(`[Graph Planner] Round ${round}: failed to parse JSON (finish_reason=${llm.finish_reason}), stopping.`);
      plan = {
        funnel_state: 'general',
        needs_tools: false,
        tools_to_call: [],
        needs_another_round: false,
        reasoning: 'Planner output was not valid JSON; proceeding without tools.',
      };
    }
    funnelState = plan.funnel_state || funnelState;

    const planned = plan.tools_to_call || [];
    ctx.thinking.push({
      step: 'planner',
      round,
      reasoning: plan.reasoning || `Planner round ${round}.`,
      dependency_reasoning: plan.dependency_reasoning || '',
      funnel_state: plan.funnel_state,
      tools_planned: planned.map(t => t.tool_name),
      needs_another_round: !!plan.needs_another_round,
    });
    console.log(
      `[Graph Planner] Round ${round}: funnel_state=${plan.funnel_state}, tools=${planned.length}, ` +
      `needs_another_round=${!!plan.needs_another_round}, remaining_budget=${budget.remaining}`
    );

    if (!plan.needs_tools || planned.length === 0) {
      break;
    }

    const invocations = planned.map(p => (validToolNames.has(p.tool_name)
      ? { tool_name: p.tool_name, tool_parameters: p.tool_parameters || {}, reason: p.reason }
      : { label: p.tool_name, error: 'Not an available tool.' }));

    const { outcomes, handoff } = await executeBatch(ctx, invocations, round, budget);
    if (handoff) {
      return { funnelState, handoff };
    }
    outcomes.forEach(outcome => outcome.entry && collected.push(outcome.entry));

    if (!plan.needs_another_round) {
      break;
    }
    if (budget.remaining <= 0) {
      ctx.thinking.push({
        step: 'budget_exhausted',
        round,
        reasoning: `Tool-call budget (${budget.total}) exhausted. Proceeding to responder with results collected so far.`,
      });
      break;
    }
  }

  return { funnelState, handoff: null };
}

/**
 * Validate and run one batch of planned tool calls in parallel.
 *
 * @param {Array} invocations - { tool_name, tool_parameters, reason? } or { label, error }
 * @returns {Promise<{ outcomes: Array<{ content: string, is_error: boolean, entry?: Object }>, handoff: Object|null }>}
 *   outcomes line up with invocations; content is what the planner sees as the result.
 */
async function executeBatch(ctx, invocations, round, budget) {
  const { agent, conversation, thinking, toolsUsed } = ctx;
  const outcomes = new Array(invocations.length);
  const runnable = [];

  invocations.forEach((inv, index) => {
    if (inv.error) {
      thinking.push({
        step: 'tool_skipped',
        round,
        tool_name: inv.label,
        reasoning: `Planner requested "${inv.label}": ${inv.error} Skipping.`,
      });
      outcomes[index] = { content: `ERROR: ${inv.error}`, is_error: true };
      return;
    }

    const procedureGate = procedureService.checkToolAllowed(conversation, inv.tool_name);
    if (!procedureGate.allowed) {
      thinking.push({ step: 'procedure_tool_blocked', round, tool_name: inv.tool_name, reasoning: procedureGate.reason });
      const entry = {
        tool_name: inv.tool_name,
        parameters: inv.tool_parameters,
        execution_time_ms: 0,
        success: false,
        error: procedureGate.reason,
      };
      toolsUsed.push(entry);
      outcomes[index] = { entry, content: `ERROR: ${procedureGate.reason}`, is_error: true };
      return;
    }

    if (runnable.length >= budget.remaining) {
      thinking.push({
        step: 'tool_skipped',
        round,
        tool_name: inv.tool_name,
        reasoning: 'Tool-call budget exhausted; not executed.',
      });
      outcomes[index] = { content: 'ERROR: Not executed — the tool-call budget for this turn is exhausted.', is_error: true };
      return;
    }

    runnable.push({ inv, index });
  });

  for (const { inv } of runnable) {
    ctx.emitStatus(toolStatus(inv.tool_name));
    thinking.push({
      step: 'tool_execution',
      round,
      tool_name: inv.tool_name,
      reasoning: inv.reason || `Executing planned tool: ${inv.tool_name}`,
    });
  }

  const results = await Promise.all(runnable.map(async ({ inv, index }) => ({
    inv,
    index,
    toolResult: await toolService.executeToolWithConfig(
      inv.tool_name,
      inv.tool_parameters,
      ctx.service.getAgentToolConfig(agent, inv.tool_name, conversation._id)
    ),
  })));

  let handoff = null;
  for (const { inv, index, toolResult } of results) {
    const entry = {
      tool_name: inv.tool_name,
      parameters: inv.tool_parameters,
      execution_time_ms: toolResult.execution_time_ms,
      success: toolResult.success,
    };
    if (toolResult.success) {
      entry.result = toolResult.result;
    } else {
      entry.error = toolResult.error;
      thinking.push({ step: 'tool_failed', round, reasoning: `Tool ${inv.tool_name} failed: ${toolResult.error}` });
    }

    procedureService.recordToolResult(conversation, inv.tool_name, toolResult);
    toolsUsed.push(entry);
    budget.remaining--;

    outcomes[index] = {
      entry,
      content: toolResult.success
        ? JSON.stringify(ctx.toolResultForPrompt(inv.tool_name, toolResult.result)) ?? 'null'
        : `ERROR: ${toolResult.error}`,
      is_error: !toolResult.success,
    };

    if (inv.tool_name === 'request_human_handoff' && toolResult.success && !handoff) {
      thinking.push({
        step: 'human_handoff_requested',
        round,
        reasoning: inv.reason || 'Human handoff was requested by planner.',
      });
      handoff = {
        content: inv.tool_parameters.handoff_message || DEFAULT_HANDOFF_MESSAGE,
        thinking_process: thinking,
        tools_used: toolsUsed,
        token_usage: ctx.usage,
      };
    }
  }

  return { outcomes, handoff };
}

module.exports = { planAndAct };
