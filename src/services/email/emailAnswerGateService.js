'use strict';

/**
 * EmailAnswerGateService
 *
 * Second stage after triage. Triage decides whether an email is in scope;
 * the answer gate decides how confident we are that the agent should answer
 * it — `high`, `medium` or `low` — and maps that level to an action:
 *
 *   reply          → follow `reply_policy` as usual (draft or send)
 *   draft          → always a draft, never auto-sent
 *   draft_flagged  → a draft tagged for human review
 *   skip           → no draft at all; the thread is left for a human
 *
 * Every check caps the level when it fails; the result is the lowest cap hit.
 *   1. Signals (free, deterministic): triage confidence/topic/intent, sender
 *      history, thread length, attachments, tool failures, handoffs.
 *   2. Criteria (plain-English rules) judged against the drafted reply by an
 *      LLM or by Jev — `answer_gate.provider` / `answer_gate.model`.
 *
 * Runs in two phases so the costly reasoning call can be skipped:
 *   - evaluateInbound: inbound-only signals, before the agent writes a reply.
 *   - evaluateReply:   reply signals + criteria, once the reply exists.
 *
 * A judge that errors fails closed (level `low`), same stance as triage.
 * Jev failures fall back to the LLM judge first, like every other Jev use.
 */

const ApiKey = require('../../models/ApiKey');
const Conversation = require('../../models/Conversation');
const OutboundEmail = require('../../models/OutboundEmail');
const OpenAIService = require('../openaiService');
const jevService = require('../jevService');
const emailTriageService = require('./emailTriageService');

// Ascending — a lower index is a lower level.
const LEVELS = ['low', 'medium', 'high'];
const DEFAULT_ACTIONS = { high: 'reply', medium: 'draft_flagged', low: 'skip' };

const INBOUND_SIGNALS = new Set([
  'triage_confidence_below',
  'triage_topic_in',
  'triage_intent_in',
  'sender_has_prior_threads',
  'thread_messages_above',
  'has_attachments',
]);
const REPLY_SIGNALS = new Set(['tool_failed', 'tool_not_called', 'handoff_requested']);

// Keeps the judge state well under Jev's 60k-char limit.
const MAX_INSTRUCTIONS_CHARS = 12_000;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOOL_RESULTS_CHARS = 20_000;
const MAX_REPLY_CHARS = 8000;
const CONVERSATION_MESSAGES = 6;

function truncate(text, max) {
  const str = typeof text === 'string' ? text : JSON.stringify(text ?? '');
  return str.length > max ? `${str.slice(0, max)}…[truncated]` : str;
}

function listIncludes(list, value) {
  if (!Array.isArray(list) || !value) return false;
  const needle = String(value).toLowerCase();
  return list.some(item => String(item).toLowerCase() === needle);
}

class EmailAnswerGateService {
  constructor() {
    this.systemPrompt = [
      'You review a reply that an AI assistant drafted for an incoming customer email, before anyone sees it.',
      'For each criterion, decide whether the drafted reply meets it, using only the material provided:',
      'the agent instructions, the conversation, the tool results and the drafted reply itself.',
      '',
      'Be strict: when you are not sure a criterion is met, mark it as not passed.',
      'Give a short reason for every criterion, written for the staff member who will handle the email.',
      '',
      'Always respond with a strict JSON object matching the provided schema. No prose.',
    ].join('\n');
  }

  isEnabled(account) {
    return account?.answer_gate?.enabled === true;
  }

  _config(account) {
    const gate = (account.toObject ? account.toObject().answer_gate : account.answer_gate) || {};
    return {
      enforce: gate.enforce !== false,
      provider: gate.provider || 'llm',
      model: gate.model || null,
      api_key: gate.api_key || null,
      min_confidence: gate.min_confidence ?? null,
      custom_prompt: gate.custom_prompt || null,
      actions: { ...DEFAULT_ACTIONS, ...this._plain(gate.actions) },
      signals: (gate.signals || []).map(s => this._plain(s)),
      criteria: (gate.criteria || []).map(c => this._plain(c)),
    };
  }

  /** Drops unset keys so defaults can fill them. */
  _plain(value) {
    return Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== undefined && v !== null));
  }

  _levelFrom(checks) {
    let level = 'high';
    for (const check of checks) {
      if (!check.passed && LEVELS.indexOf(check.caps_at) < LEVELS.indexOf(level)) {
        level = check.caps_at;
      }
    }
    return level;
  }

  /**
   * Later checks can only lower the level, so skipping early is safe only
   * when every level at or below the current one would skip too.
   */
  _canSkipEarly(level, actions) {
    return LEVELS.slice(0, LEVELS.indexOf(level) + 1).every(l => actions[l] === 'skip');
  }

  _result(config, checks, extra = {}) {
    const level = this._levelFrom(checks);
    return {
      level,
      action: config.actions[level],
      enforced: config.enforce,
      checks,
      reasons: checks.filter(c => !c.passed).map(c => c.reason),
      evaluated_at: new Date(),
      ...extra,
    };
  }

  // ---- Signals ---------------------------------------------------------------

  /** Returns a reason string when the signal fires, otherwise null. */
  async _signalFired(signal, ctx) {
    const { value } = signal;
    const tools = ctx.reasoning?.tools_used || [];

    switch (signal.type) {
      case 'triage_confidence_below': {
        const confidence = ctx.triage?.confidence;
        // Triage disabled → no confidence to compare against.
        if (typeof confidence !== 'number') return null;
        return confidence < Number(value)
          ? `Unclear what is being asked (triage confidence ${confidence.toFixed(2)} < ${value}).`
          : null;
      }

      case 'triage_topic_in':
        return listIncludes(value, ctx.triage?.topic)
          ? `Topic "${ctx.triage.topic}" needs a human.`
          : null;

      case 'triage_intent_in':
        return listIncludes(value, ctx.triage?.intent)
          ? `Intent "${ctx.triage.intent}" needs a human.`
          : null;

      case 'sender_has_prior_threads': {
        const count = await this._priorThreadCount(ctx);
        const min = Number(value) || 1;
        return count >= min ? `Returning customer with ${count} earlier thread(s).` : null;
      }

      case 'thread_messages_above': {
        const count = (ctx.conversation.messages || []).filter(m => m.role === 'user').length;
        return count > Number(value)
          ? `Long thread (${count} customer messages).`
          : null;
      }

      case 'has_attachments':
        return (ctx.email.attachments || []).length > 0 ? 'Email has attachments.' : null;

      case 'tool_failed': {
        const failed = tools.filter(t => t.success === false).map(t => t.tool_name);
        return failed.length > 0 ? `Lookup failed: ${[...new Set(failed)].join(', ')}.` : null;
      }

      case 'tool_not_called': {
        const names = Array.isArray(value) ? value : [];
        const called = tools.some(t => t.success !== false && (names.length === 0 || names.includes(t.tool_name)));
        return called ? null : `No successful lookup via ${names.join(', ') || 'any tool'}.`;
      }

      case 'handoff_requested':
        return ctx.reasoning?.thinking_process?.some(step => step.step === 'human_handoff_requested')
          ? 'The agent asked for a human handoff.'
          : null;

      default:
        return null;
    }
  }

  /**
   * Earlier threads with the same customer. A resolved reply target (lead
   * notifications) is matched on the replies we wrote to it, since those
   * conversations are keyed on the notification sender.
   */
  async _priorThreadCount(ctx) {
    const address = ctx.customerAddress || ctx.email.from_address;
    if (!address) return 0;

    const count = await Conversation.countDocuments({
      agent: ctx.agent._id,
      channel: 'email',
      user_identifier: address,
      _id: { $ne: ctx.conversation._id },
    });
    if (count > 0 || address === ctx.email.from_address) return count;

    const replied = await OutboundEmail.distinct('conversation', {
      agent: ctx.agent._id,
      to: address,
      conversation: { $ne: ctx.conversation._id },
    });
    return replied.length;
  }

  async _evaluateSignals(signals, ctx) {
    const checks = [];
    for (const signal of signals) {
      const fired = await this._signalFired(signal, ctx);
      checks.push({
        id: signal.id || signal.type,
        kind: 'signal',
        type: signal.type,
        passed: !fired,
        caps_at: signal.caps_at || 'low',
        reason: fired ? (signal.reason || fired) : null,
      });
    }
    return checks;
  }

  // ---- Criteria judge --------------------------------------------------------

  _judgeState(ctx, config) {
    const messages = (ctx.conversation.getDecryptedMessages?.() || ctx.conversation.messages || [])
      .filter(m => !m.is_summarized && (m.role === 'user' || m.role === 'assistant'))
      .slice(-CONVERSATION_MESSAGES)
      .map(m => ({ role: m.role, text: truncate(m.content || '', MAX_MESSAGE_CHARS) }));

    const tools = ctx.reasoning?.tools_used || [];
    let budget = MAX_TOOL_RESULTS_CHARS;
    const toolResults = tools.map((t, i) => {
      const perTool = Math.max(500, Math.floor(budget / Math.max(1, tools.length - i)));
      const output = t.success === false ? truncate(t.error, 500) : truncate(t.result, perTool);
      budget -= output.length;
      return { tool: t.tool_name, status: t.success === false ? 'failed' : 'success', output };
    });

    return {
      mailbox_guidance: config.custom_prompt || undefined,
      agent_instructions: truncate(ctx.agent.system_prompt || '', MAX_INSTRUCTIONS_CHARS),
      conversation: messages,
      tool_results: toolResults,
      draft_reply: truncate(ctx.reasoning?.content || '', MAX_REPLY_CHARS),
    };
  }

  _criteriaSchema(criteria) {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'email_answer_gate',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            criteria: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', enum: criteria.map(c => c.id) },
                  passed: { type: 'boolean' },
                  reason: { type: 'string' },
                },
                required: ['id', 'passed', 'reason'],
              },
            },
          },
          required: ['criteria'],
        },
      },
    };
  }

  _criteriaPrompt(criteria, state) {
    const lines = [];
    if (state.mailbox_guidance) {
      lines.push('## Customer-specific guidance', state.mailbox_guidance, '');
    }
    lines.push('## Criteria');
    criteria.forEach(c => lines.push(`- ${c.id}: ${c.description}`));
    lines.push('', '## Agent instructions', state.agent_instructions || '(none)', '');
    lines.push('## Conversation (oldest first)');
    state.conversation.forEach(m => lines.push(`[${m.role}] ${m.text}`));
    lines.push('', '## Tool results', JSON.stringify(state.tool_results), '');
    lines.push('## Drafted reply', '---', state.draft_reply, '---', '');
    lines.push('Respond with JSON only, one entry per criterion.');
    return lines.join('\n');
  }

  async _llmClient(agent, config) {
    let apiKey = agent.api_key;
    if (config.api_key) {
      apiKey = await ApiKey.findOne({
        _id: config.api_key,
        project: agent.project?._id || agent.project,
        is_active: true,
      }).populate('provider');
      if (!apiKey?.provider) {
        throw new Error(`answer_gate.api_key ${config.api_key} is missing or inactive in this project`);
      }
    }
    const providerName = apiKey.provider.name;
    // `model` names a Jev model when provider is jev, so the fallback uses the default.
    const model = (config.provider === 'llm' && config.model) || emailTriageService.getModelForProvider(providerName);
    return { client: new OpenAIService(apiKey.getDecryptedKey(), providerName), model };
  }

  async _judgeWithLlm(criteria, state, ctx, config) {
    const { client, model } = await this._llmClient(ctx.agent, config);
    const responseFormat = client.supportsStructuredOutputs?.(model) ? this._criteriaSchema(criteria) : null;

    const response = await client.generateCompletion(
      model,
      this._criteriaPrompt(criteria, state),
      // Cap leaves room for models that think by default.
      { temperature: 0, max_tokens: 2048 },
      this.systemPrompt,
      responseFormat,
      { prompt_cache_key: `email_answer_gate_${ctx.account._id}` }
    );

    let parsed;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      const match = response.content?.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!Array.isArray(parsed?.criteria)) {
      throw new Error('Answer gate judge output could not be parsed.');
    }

    const byId = new Map(parsed.criteria.map(r => [r.id, r]));
    return {
      results: criteria.map(c => {
        const r = byId.get(c.id);
        // A criterion the judge skipped counts as failed.
        return { id: c.id, passed: r?.passed === true, judge_reason: r?.reason || 'Not assessed by the judge.' };
      }),
      judge: { provider: 'llm', model },
      usage: response.usage,
    };
  }

  async _judgeWithJev(criteria, state, ctx, config) {
    const questions = {};
    for (const c of criteria) {
      questions[c.id] = {
        type: 'noul',
        instructions: `About \`draft_reply\`, judged against \`conversation\`, \`tool_results\` and \`agent_instructions\`: ${c.description}`,
      };
    }

    const result = await jevService.ask(ctx.agent, state, questions, 'email_answer_gate', { model: config.model });
    if (!result) return null;

    const threshold = config.min_confidence ?? jevService.minConfidence(ctx.agent);
    return {
      results: criteria.map(c => {
        const p = result.answers?.[c.id]?.noul;
        const score = typeof p === 'number' ? p : null;
        return {
          id: c.id,
          passed: score !== null && score >= threshold,
          score,
          judge_reason: score === null ? 'Not assessed by Jev.' : `Jev probability ${score.toFixed(2)} (threshold ${threshold}).`,
        };
      }),
      judge: { provider: 'jev', model: result.model },
      usage: result.usage,
    };
  }

  async _evaluateCriteria(criteria, ctx, config) {
    if (criteria.length === 0 || !ctx.reasoning?.content) return { checks: [], judge: null, usage: null };

    const state = this._judgeState(ctx, config);
    let verdict = null;
    let fallback = false;
    try {
      if (config.provider === 'jev') {
        if (jevService.getConfig(ctx.agent)) {
          verdict = await this._judgeWithJev(criteria, state, ctx, config);
        } else {
          console.warn(`[AnswerGate] account=${ctx.account._id} provider=jev but the agent has no Jev API key; using the LLM judge.`);
        }
        fallback = !verdict;
      }
      if (!verdict) verdict = await this._judgeWithLlm(criteria, state, ctx, config);
    } catch (err) {
      console.error(`[AnswerGate] account=${ctx.account._id} judge error:`, err.message);
      return {
        checks: [{
          id: 'judge_error',
          kind: 'criterion',
          passed: false,
          caps_at: 'low',
          reason: `The answer gate could not judge the reply (${err.message}).`,
        }],
        judge: { provider: config.provider, error: err.message },
        usage: null,
      };
    }

    const byId = new Map(verdict.results.map(r => [r.id, r]));
    const checks = criteria.map(c => {
      const r = byId.get(c.id);
      return {
        id: c.id,
        kind: 'criterion',
        passed: r.passed,
        caps_at: c.caps_at || 'low',
        score: r.score ?? null,
        judge_reason: r.judge_reason,
        reason: r.passed ? null : (c.reason || r.judge_reason),
      };
    });
    return { checks, judge: { ...verdict.judge, fallback }, usage: verdict.usage };
  }

  // ---- Public API ------------------------------------------------------------

  /**
   * Inbound phase. `skip_early` is true when the reply can no longer reach a
   * level that would do anything but skip, so reasoning can be skipped.
   *
   * @param {Object} ctx - { account, agent, conversation, email, triage, customerAddress }
   */
  async evaluateInbound(ctx) {
    const config = this._config(ctx.account);
    const signals = config.signals.filter(s => INBOUND_SIGNALS.has(s.type));
    const checks = await this._evaluateSignals(signals, ctx);
    const result = this._result(config, checks, { phase: 'inbound' });
    result.skip_early = this._canSkipEarly(result.level, config.actions);
    this._log(ctx, result);
    return result;
  }

  /**
   * Reply phase. Adds reply signals and the criteria verdict to the inbound
   * checks and returns the final gate result.
   *
   * @param {Object} ctx - inbound ctx plus `reasoning`
   * @param {Object} inbound - result of evaluateInbound
   */
  async evaluateReply(ctx, inbound) {
    const config = this._config(ctx.account);
    const signals = config.signals.filter(s => REPLY_SIGNALS.has(s.type));
    const signalChecks = await this._evaluateSignals(signals, ctx);
    const { checks: criteriaChecks, judge, usage } = await this._evaluateCriteria(config.criteria, ctx, config);

    const result = this._result(
      config,
      [...(inbound?.checks || []), ...signalChecks, ...criteriaChecks],
      { phase: 'reply', judge, usage }
    );
    this._log(ctx, result);
    return result;
  }

  /**
   * Fold a non-skip gate action into the reply decision. `skip` is handled
   * by the caller, which never creates an outbound row.
   */
  applyToDecision(decision, gate) {
    decision.answer_gate_level = gate.level;
    const notes = `answer_gate=${gate.level}${gate.reasons.length ? `: ${gate.reasons.join(' ')}` : ''}`;

    if (gate.action === 'draft' && decision.action === 'auto_send') {
      Object.assign(decision, { action: 'draft_only', reason: 'answer_gate', notes });
    } else if (gate.action === 'draft_flagged') {
      if (decision.action === 'human_review') {
        decision.notes = [decision.notes, notes].filter(Boolean).join('; ');
      } else {
        Object.assign(decision, { action: 'human_review', reason: 'answer_gate', notes });
      }
    }
    return decision;
  }

  _log(ctx, result) {
    console.log(
      `[AnswerGate] account=${ctx.account._id} phase=${result.phase} level=${result.level} action=${result.action} ` +
      `enforced=${result.enforced} judge=${result.judge?.provider ?? 'n/a'}${result.judge?.fallback ? '(fallback)' : ''} ` +
      `failed=${result.checks.filter(c => !c.passed).map(c => c.id).join(',') || 'none'}`
    );
  }
}

module.exports = new EmailAnswerGateService();
module.exports.LEVELS = LEVELS;
module.exports.DEFAULT_ACTIONS = DEFAULT_ACTIONS;
