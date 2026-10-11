// Small agent graph — multi-role orchestrator for chatbot agents.
//
// When agent.config.enable_small_agent_graph === true the ReAct loop is replaced by:
//
//   [Jev gate] → planner ⇄ tools → responder → [Jev pre-check] → critic → (one revision)
//
//   - Planner  decides which tools to run (see planner.js). No user-facing text.
//   - Responder writes the reply from the conversation and tool results.
//   - Critic   approves the draft or lists concrete issues; on rejection the
//              responder revises once using those issues. The revision is not
//              re-checked, to bound latency.
//
// Streaming and non-streaming share this one code path: without a
// streamCallback nothing is streamed. A draft that still has to pass the
// critic is buffered; with no critic it streams straight to the client.
// The result has the same shape as agentService.executeAgentReasoning.

const OpenAIService = require('../openaiService');
const procedureService = require('../procedureService');
const jevService = require('../jevService');
const prompts = require('./prompts');
const { planAndAct } = require('./planner');
const { newUsage, accumulateUsage, getGraphModel, createStatusEmitter } = require('./shared');

const EMPTY_REPLY =
  "I apologize, but I wasn't able to complete your request within the allowed processing time. Please try rephrasing your request.";
const ERROR_REPLY = "I'm sorry, something went wrong while processing your request. Please try again.";

/**
 * @param {Object} service        - agentService (context building and tool helpers)
 * @param {Object} agent          - populated Agent document
 * @param {Object} conversation   - Conversation document
 * @param {Object} dynamicContext - per-request dynamic context
 * @param {Object} [options]
 * @param {Object}   [options.cancellationToken] - { cancelled } set when a newer message arrives
 * @param {Function} [options.streamCallback]    - receives reply text chunks
 * @param {Function} [options.statusCallback]    - receives { stage } progress events
 * @returns {Promise<{content: string, thinking_process: Array, tools_used: Array, token_usage: Object}>}
 */
async function runAgentGraph(service, agent, conversation, dynamicContext = {}, options = {}) {
  const { cancellationToken = null, streamCallback = null, statusCallback = null } = options;

  const ctx = {
    service,
    agent,
    conversation,
    dynamicContext: dynamicContext || {},
    cancellationToken,
    streaming: !!streamCallback,
    thinking: [],
    toolsUsed: [],
    usage: newUsage(),
    emitStatus: createStatusEmitter(statusCallback),
    toolResultForPrompt: (toolName, result) => service.getToolResultForPrompt(toolName, result),
  };

  // Everything already sent to the client. The saved message must match it.
  let delivered = '';
  const deliver = text => {
    if (streamCallback && text) {
      streamCallback(text);
      delivered += text;
    }
  };

  try {
    ctx.openai = new OpenAIService(agent.api_key.getDecryptedKey(), agent.api_key.provider.name);
    ctx.context = service.buildAgentContext(agent, conversation);
    const routingPromise = startResponderRouting(agent, ctx.context);

    const { funnelState, handoff } = await planAndAct(ctx);
    if (handoff) {
      deliver(handoff.content);
      return handoff;
    }

    const responderModel = await resolveResponderModel(ctx, routingPromise);
    const runCritic = shouldRunCritic(ctx, funnelState);

    ctx.emitStatus('writing');
    const draft = await respond(ctx, responderModel, funnelState, {
      onChunk: !runCritic && ctx.streaming ? deliver : null,
    });

    let finalResponse = draft;
    if (runCritic && draft) {
      const verdict = await critique(ctx, draft, { onApproved: () => deliver(draft) });
      if (!verdict.approved) {
        finalResponse = await revise(ctx, responderModel, funnelState, draft, verdict, deliver);
      }
    }

    if (!finalResponse) {
      finalResponse = EMPTY_REPLY;
    }
    if (!delivered) {
      deliver(finalResponse);
    }

    return {
      content: finalResponse,
      thinking_process: ctx.thinking,
      tools_used: ctx.toolsUsed,
      token_usage: ctx.usage,
    };
  } catch (error) {
    // A newer message superseded this turn; the caller drops it silently.
    if (error.code === 'EXECUTION_CANCELLED') {
      throw error;
    }

    console.error('[Graph] agent graph failed:', error);
    ctx.thinking.push({ step: 'graph_error', reasoning: `Graph pipeline error: ${error.message}` });
    if (!delivered) {
      deliver(ERROR_REPLY);
    }
    return {
      content: delivered || ERROR_REPLY,
      thinking_process: ctx.thinking,
      tools_used: ctx.toolsUsed,
      token_usage: ctx.usage,
    };
  }
}

// ---- Responder ------------------------------------------------------------------

async function respond(ctx, model, funnelState, { onChunk = null, revision = null } = {}) {
  const { openai, agent, conversation } = ctx;
  const systemPrompt = prompts.responderSystemPrompt(agent, ctx.dynamicContext, conversation.current_turn_language);
  const userPrompt = prompts.responderUserPrompt(ctx.context, ctx.toolsUsed, funnelState, {
    toolResultForPrompt: ctx.toolResultForPrompt,
    revision,
  });
  const extraOptions = { prompt_cache_key: `agent_graph_responder_${agent._id}` };

  const llm = onChunk
    ? await openai.generateStreamingCompletion(
      model, userPrompt, agent.llm_settings.parameters, systemPrompt, onChunk, null, extraOptions
    )
    : await openai.generateCompletion(
      model, userPrompt, agent.llm_settings.parameters, systemPrompt, null, extraOptions
    );
  accumulateUsage(ctx.usage, llm.usage);

  const content = llm.content || '';
  ctx.thinking.push({
    step: revision ? 'responder_revision' : 'responder',
    reasoning: `${revision ? 'Revised' : 'Generated'} user-facing reply (${content.length} chars, model=${model}) in funnel state "${funnelState}".`,
  });
  console.log(`[Graph Responder] ${revision ? 'Revised' : 'Generated'} ${content.length} char reply (model=${model}).`);
  return content;
}

/** Kick off Jev responder routing early so it overlaps with the planner. */
function startResponderRouting(agent, context) {
  if (!jevService.isEnabled(agent, 'responder_routing')) {
    return null;
  }
  return jevService.routeResponder(agent, { conversationHistory: context.conversation_history });
}

async function resolveResponderModel(ctx, routingPromise) {
  const { agent } = ctx;
  const defaultModel = getGraphModel(agent, 'responder');
  const route = routingPromise ? await routingPromise : null;
  if (!route) {
    return defaultModel;
  }

  accumulateUsage(ctx.usage, route.usage);
  const routing = agent.config.jev.responder_routing;
  const model = (route.tier === 'fast' ? routing.fast_model : routing.powerful_model) || defaultModel;
  ctx.thinking.push({
    step: 'responder_routing',
    reasoning: `Jev routed responder to "${route.tier}" tier (confidence=${route.confidence.toFixed(2)}, ${route.latency_ms}ms) → ${model}.`,
  });
  return model;
}

// ---- Critic -------------------------------------------------------------------

function shouldRunCritic(ctx, funnelState) {
  if (ctx.agent.config?.graph_enable_critic === false) {
    ctx.thinking.push({ step: 'critic', reasoning: 'Critic disabled via agent.config.graph_enable_critic.' });
    return false;
  }
  if (funnelState === 'greeting' && ctx.toolsUsed.length === 0) {
    ctx.thinking.push({ step: 'critic', reasoning: 'Critic skipped — greeting turn with no tool use.' });
    return false;
  }
  return true;
}

/**
 * Judge the draft. Returns { approved, issues, reasoning }. When streaming,
 * onApproved fires as soon as the critic's output shows approval, so the
 * buffered draft reaches the client before the critic finishes its reasoning.
 */
async function critique(ctx, draft, { onApproved }) {
  const { openai, agent, conversation } = ctx;

  if (await jevCriticPrecheck(ctx, draft)) {
    return { approved: true, issues: [] };
  }

  ctx.emitStatus('reviewing');

  const model = getGraphModel(agent, 'critic');
  const responseFormat = openai.supportsStructuredOutputs(model) ? prompts.criticSchema() : null;
  const baseSystemPrompt = prompts.criticSystemPrompt(agent, conversation.current_turn_language);
  const systemPrompt = responseFormat
    ? baseSystemPrompt
    : prompts.withJsonOutputInstructions(baseSystemPrompt, prompts.criticSchema());
  const userPrompt = prompts.criticUserPrompt(ctx.context, ctx.toolsUsed, draft, ctx.dynamicContext, {
    toolResultForPrompt: ctx.toolResultForPrompt,
  });
  // The critic only returns a verdict now, so it needs far fewer tokens than the reply.
  const parameters = {
    ...agent.llm_settings.parameters,
    temperature: 0.1,
    max_tokens: openai.isFixedTemperatureModel(model) ? 2000 : 500,
  };
  const extraOptions = { prompt_cache_key: `agent_graph_critic_${agent._id}` };

  let flushed = false;
  let llm;
  if (ctx.streaming) {
    let buffer = '';
    llm = await openai.generateStreamingCompletion(model, userPrompt, parameters, systemPrompt, chunk => {
      buffer += chunk;
      if (!flushed && /"approved"\s*:\s*true/.test(buffer)) {
        flushed = true;
        onApproved();
      }
    }, responseFormat, extraOptions);
  } else {
    llm = await openai.generateCompletion(model, userPrompt, parameters, systemPrompt, responseFormat, extraOptions);
  }
  accumulateUsage(ctx.usage, llm.usage);

  let verdict = procedureService.parseJsonResponse(llm.content);
  if (!verdict || typeof verdict.approved !== 'boolean') {
    console.warn(`[Graph Critic] Failed to parse critic JSON (finish_reason=${llm.finish_reason}), approving by default.`);
    verdict = { approved: true, issues: [], reasoning: 'Critic output was not valid JSON; approved by default.' };
  }
  if (flushed && !verdict.approved) {
    // The draft already reached the client; it can't be revised any more.
    verdict = { ...verdict, approved: true, reasoning: `${verdict.reasoning || ''} (Draft was already delivered; kept.)`.trim() };
  }

  ctx.thinking.push({
    step: 'critic',
    reasoning: verdict.reasoning || 'Critic evaluated the draft reply.',
    approved: verdict.approved,
    issues: verdict.issues || [],
  });
  console.log(`[Graph Critic] approved=${verdict.approved}${verdict.issues?.length ? `, issues=${verdict.issues.length}` : ''}`);
  return verdict;
}

/** Jev pre-check in front of the LLM critic. True when Jev confidently approves. */
async function jevCriticPrecheck(ctx, draft) {
  const { agent, conversation } = ctx;
  if (!jevService.isEnabled(agent, 'critic_precheck')) {
    return false;
  }

  const check = await jevService.checkDraftReply(agent, {
    conversationHistory: ctx.context.conversation_history,
    toolResults: ctx.toolsUsed.map(tr => ({
      tool_name: tr.tool_name,
      success: tr.success,
      result: tr.success ? ctx.toolResultForPrompt(tr.tool_name, tr.result) : undefined,
      error: tr.error,
    })),
    draftReply: draft,
    agentInstructions: prompts.criticInstructions(agent),
    procedureDirective: ctx.context.procedure_directive,
    language: agent.config.enforce_language_detection !== false ? conversation.current_turn_language : null,
  });
  if (!check) {
    return false;
  }

  accumulateUsage(ctx.usage, check.usage);
  ctx.thinking.push({
    step: check.passed ? 'critic' : 'critic_precheck',
    reasoning: check.passed
      ? `Approved by Jev pre-check (${check.summary}; ${check.latency_ms}ms). LLM critic skipped.`
      : `Jev pre-check not confident (${check.summary}; ${check.latency_ms}ms). Running LLM critic.`,
  });
  console.log(`[Graph Critic] Jev pre-check passed=${check.passed} (${check.summary}, ${check.latency_ms}ms)`);
  return check.passed;
}

/**
 * Have the responder fix a rejected draft. Streams the revision when streaming.
 * Falls back to the original draft if the revision fails before any text was sent.
 */
async function revise(ctx, model, funnelState, draft, verdict, deliver) {
  ctx.emitStatus('revising');
  const issues = verdict.issues?.length
    ? verdict.issues
    : [verdict.reasoning || 'The draft did not meet the quality criteria.'];

  let streamed = '';
  const onChunk = ctx.streaming
    ? chunk => {
      streamed += chunk;
      deliver(chunk);
    }
    : null;

  try {
    const revised = await respond(ctx, model, funnelState, { onChunk, revision: { draft, issues } });
    if (revised) {
      return revised;
    }
    ctx.thinking.push({ step: 'responder_revision_failed', reasoning: 'Revision came back empty; keeping the original draft.' });
    return draft;
  } catch (error) {
    if (error.code === 'EXECUTION_CANCELLED') {
      throw error;
    }
    console.warn(`[Graph Responder] Revision failed: ${error.message}`);
    ctx.thinking.push({
      step: 'responder_revision_failed',
      reasoning: streamed
        ? `Revision failed mid-stream (${error.message}); keeping the text already sent.`
        : `Revision failed (${error.message}); keeping the original draft.`,
    });
    return streamed || draft;
  }
}

module.exports = { runAgentGraph };
