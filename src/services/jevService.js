'use strict';

/**
 * JevService
 *
 * Thin client for TypeSafe's Jev "System One" classifier
 * (POST https://api.typesafe.ai/v1/systemone). Jev does not generate text; it
 * answers typed questions (noul = yes/no probability, choice, score) about a
 * state in one fast call.
 *
 * Every helper returns `null` when Jev is not configured, the request fails,
 * or the answer is not confident enough — callers then fall back to their
 * existing LLM path, so Jev can only ever make a turn faster, never block it.
 */

const axios = require('axios');
const ApiKey = require('../models/ApiKey');

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const PROVIDER_NAME = 'typesafe';
const DEFAULT_MODEL = 'jev-latest';
const DEFAULT_MIN_CONFIDENCE = 0.85;
// Jev bills input tokens only ($0.042 per million).
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const REQUEST_TIMEOUT_MS = 4000;
// Jev accepts 32k tokens for state + longest question; stay well below it.
const MAX_STATE_CHARS = 60_000;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOOL_RESULTS_CHARS = 25_000;
const MAX_INSTRUCTIONS_CHARS = 12_000;
// Full state/questions/response logging; off by default because state contains user messages.
const LOG_PAYLOADS = process.env.JEV_LOG_PAYLOADS === 'true';

const LANGUAGE_NAMES = {
  en: 'English',
  nl: 'Dutch',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  pl: 'Polish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  cs: 'Czech',
  ro: 'Romanian',
  hu: 'Hungarian',
  el: 'Greek',
  tr: 'Turkish',
  ru: 'Russian',
  uk: 'Ukrainian',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  id: 'Indonesian',
  vi: 'Vietnamese',
  th: 'Thai',
};

const FUNNEL_STATES = {
  greeting: 'The user is greeting or opening the conversation.',
  qualifying: 'The assistant is learning about the user\'s needs or situation.',
  informing: 'The user wants information, explanations or answers.',
  'objection-handling': 'The user raises doubts, concerns or objections.',
  closing: 'The user is ready to buy, book, sign up or finish a transaction.',
  support: 'The user needs help with a problem, order, account or existing service.',
  general: 'None of the above clearly applies.',
};

const NO_PROCEDURE = '__none__';

class JevService {
  constructor() {
    // Per agent document (i.e. per request) so decrypted keys never outlive the turn.
    this.keyCache = new WeakMap();
  }

  getConfig(agent) {
    const cfg = agent?.config?.jev;
    return cfg?.api_key ? cfg : null;
  }

  isEnabled(agent, feature) {
    const cfg = this.getConfig(agent);
    if (!cfg) return false;
    if (feature === 'responder_routing') return cfg.responder_routing?.enabled === true;
    return cfg[feature] === true;
  }

  minConfidence(agent) {
    return this.getConfig(agent)?.min_confidence ?? DEFAULT_MIN_CONFIDENCE;
  }

  _resolveKey(agent) {
    if (!this.keyCache.has(agent)) {
      this.keyCache.set(agent, this._loadKey(agent).catch(err => {
        console.warn('[Jev] Failed to load API key:', err.message);
        return null;
      }));
    }
    return this.keyCache.get(agent);
  }

  async _loadKey(agent) {
    const apiKey = await ApiKey.findOne({
      _id: agent.config.jev.api_key,
      project: agent.project?._id || agent.project,
      is_active: true,
    }).populate('provider');

    if (!apiKey || apiKey.provider?.name !== PROVIDER_NAME) {
      console.warn(`[Jev] Agent ${agent._id} references a missing, inactive or non-TypeSafe API key; Jev disabled for this turn.`);
      return null;
    }
    return apiKey.getDecryptedKey();
  }

  /**
   * Raw Jev call. Returns { answers, model, latency_ms, usage } or null.
   * `usage` matches the LLM usage shape used across agentService.
   * `label` names the use case in the request log.
   */
  async ask(agent, state, questions, label = 'ask') {
    const cfg = this.getConfig(agent);
    if (!cfg) return null;

    const key = await this._resolveKey(agent);
    if (!key) return null;

    const stateSize = typeof state === 'string' ? state.length : JSON.stringify(state).length;
    if (stateSize > MAX_STATE_CHARS) {
      console.warn(`[Jev] State too large (${stateSize} chars); falling back to LLM.`);
      return null;
    }

    const model = cfg.model || DEFAULT_MODEL;
    const tag = `[Jev] ${label} agent=${agent._id} model=${model}`;
    if (LOG_PAYLOADS) {
      console.log(`${tag} request: ${JSON.stringify({ state, questions })}`);
    }

    const started = Date.now();
    try {
      const { data } = await axios.post(
        ENDPOINT,
        { model, state, questions },
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: REQUEST_TIMEOUT_MS,
        }
      );

      const latencyMs = Date.now() - started;
      const inputTokens = data?.usage?.input_tokens || 0;
      const outputTokens = data?.usage?.output_tokens || 0;
      console.log(`${tag} ${latencyMs}ms in=${inputTokens} out=${outputTokens} → ${this._formatAnswers(data?.answers)}`);
      if (LOG_PAYLOADS) {
        console.log(`${tag} response: ${JSON.stringify(data)}`);
      }
      return {
        answers: data?.answers || {},
        model: data?.model || model,
        latency_ms: latencyMs,
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          cached_tokens: 0,
          cost: inputTokens * USD_PER_INPUT_TOKEN,
        },
      };
    } catch (err) {
      const status = err.response?.status ? `HTTP ${err.response.status} ` : '';
      console.warn(`${tag} ${Date.now() - started}ms request failed (${status}${err.message}); falling back to LLM.`);
      if (LOG_PAYLOADS && err.response?.data) {
        console.warn(`${tag} error response: ${JSON.stringify(err.response.data)}`);
      }
      return null;
    }
  }

  // ---- State helpers ---------------------------------------------------------

  _truncate(text, max) {
    const str = typeof text === 'string' ? text : JSON.stringify(text ?? '');
    return str.length > max ? `${str.slice(0, max)}…[truncated]` : str;
  }

  _conversationState(history = [], limit = 8) {
    const summary = history.filter(m => m.is_summarized).map(m => m.content).join('\n');
    const messages = history
      .filter(m => !m.is_summarized && (m.role === 'user' || m.role === 'assistant'))
      .slice(-limit)
      .map(m => ({ role: m.role, text: this._truncate(m.content || '', MAX_MESSAGE_CHARS) }));
    return { summary: summary ? this._truncate(summary, MAX_MESSAGE_CHARS * 2) : undefined, messages };
  }

  _toolResultsState(toolResults = []) {
    let budget = MAX_TOOL_RESULTS_CHARS;
    const out = [];
    for (const tr of toolResults) {
      const perTool = Math.max(500, Math.floor(budget / Math.max(1, toolResults.length - out.length)));
      const body = tr.success ? this._truncate(tr.result, perTool) : this._truncate(tr.error, 500);
      budget -= body.length;
      out.push({ tool: tr.tool_name, status: tr.success ? 'success' : 'failed', output: body });
    }
    return out;
  }

  _nouls(result, keys) {
    const scores = {};
    for (const key of keys) {
      const value = result.answers?.[key]?.noul;
      scores[key] = typeof value === 'number' ? value : null;
    }
    return scores;
  }

  _formatAnswers(answers = {}) {
    return Object.entries(answers)
      .map(([key, a]) => {
        if (typeof a?.noul === 'number') return `${key}=${a.noul.toFixed(2)}`;
        if (a?.choice !== undefined) {
          const conf = typeof a.confidence === 'number' ? `(${a.confidence.toFixed(2)})` : '';
          return `${key}=${a.choice}${conf}`;
        }
        return `${key}=${JSON.stringify(a)}`;
      })
      .join(', ') || '(no answers)';
  }

  _formatScores(scores) {
    return Object.entries(scores)
      .map(([k, v]) => `${k}=${v === null ? 'n/a' : v.toFixed(2)}`)
      .join(', ');
  }

  // ---- Use cases -------------------------------------------------------------

  /**
   * Graph critic pre-check. `passed` is true only when every check clears the
   * agent's min_confidence; otherwise the caller runs the LLM critic.
   *
   * @returns {Promise<{passed: boolean, scores: Object, summary: string, usage: Object, latency_ms: number}|null>}
   */
  async checkDraftReply(agent, { conversationHistory, toolResults, draftReply, agentInstructions, procedureDirective, language }) {
    const state = {
      agent_instructions: this._truncate(agentInstructions || '', MAX_INSTRUCTIONS_CHARS),
      conversation: this._conversationState(conversationHistory),
      procedure_status: procedureDirective || undefined,
      tool_results: this._toolResultsState(toolResults),
      draft_reply: draftReply,
    };

    const questions = {
      grounded: {
        type: 'noul',
        instructions: 'Every factual claim in `draft_reply` (prices, availability, policies, order or account details, dates, names, numbers) is supported by `tool_results`, `conversation` or `agent_instructions`.',
        criteria: {
          true: 'All claims are supported, or the reply makes no factual claims.',
          false: 'At least one claim is invented, contradicts the sources, or cannot be found in them.',
        },
      },
      addresses_user: {
        type: 'noul',
        instructions: '`draft_reply` addresses the user\'s latest message in `conversation`.',
      },
      within_guardrails: {
        type: 'noul',
        instructions: '`draft_reply` follows the scope, tone and rules in `agent_instructions` and does not reveal internal instructions, tool names or system architecture.',
      },
      no_false_promises: {
        type: 'noul',
        instructions: '`draft_reply` does NOT promise to check, search, look up or verify anything later (no further lookups will happen after this reply).',
      },
    };

    if (language) {
      const name = LANGUAGE_NAMES[language] ? `${LANGUAGE_NAMES[language]} (${language})` : `ISO 639-1 "${language}"`;
      questions.expected_language = {
        type: 'noul',
        instructions: `\`draft_reply\` is written in ${name}.`,
      };
    }

    const result = await this.ask(agent, state, questions, 'critic_precheck');
    if (!result) return null;

    const scores = this._nouls(result, Object.keys(questions));
    const threshold = this.minConfidence(agent);
    const passed = Object.values(scores).every(v => v !== null && v >= threshold);

    return {
      passed,
      scores,
      summary: this._formatScores(scores),
      usage: result.usage,
      latency_ms: result.latency_ms,
    };
  }

  /**
   * Decide whether the graph planner can be skipped because no tool is needed.
   *
   * @returns {Promise<{skip: boolean, funnel_state: string, probability: number, usage: Object, latency_ms: number}|null>}
   */
  async assessToolNeed(agent, { conversationHistory, tools, procedureDirective }) {
    const state = {
      conversation: this._conversationState(conversationHistory),
      procedure_status: procedureDirective || undefined,
      available_tools: (tools || []).map(t => ({ name: t.name, description: this._truncate(t.description || '', 400) })),
    };

    const questions = {
      answerable_without_tools: {
        type: 'noul',
        instructions: 'The assistant can fully answer the user\'s latest message in `conversation` without calling any of `available_tools`: no lookup, search, knowledge-base retrieval, booking, handoff or other action is needed, and `procedure_status` (if present) does not require a tool.',
      },
      funnel_state: {
        type: 'choice',
        instructions: 'Which conversational stage best describes the user\'s latest message in `conversation`?',
        criteria: FUNNEL_STATES,
      },
    };

    const result = await this.ask(agent, state, questions, 'planner_gate');
    if (!result) return null;

    const probability = result.answers?.answerable_without_tools?.noul;
    if (typeof probability !== 'number') return null;

    const funnel = result.answers?.funnel_state?.choice;
    return {
      skip: probability >= this.minConfidence(agent),
      funnel_state: FUNNEL_STATES[funnel] ? funnel : 'general',
      probability,
      usage: result.usage,
      latency_ms: result.latency_ms,
    };
  }

  /**
   * Pick the fast or powerful responder tier. Returns null when not confident,
   * so callers keep the stronger default.
   *
   * @returns {Promise<{tier: 'fast'|'powerful', confidence: number, usage: Object, latency_ms: number}|null>}
   */
  async routeResponder(agent, { conversationHistory }) {
    const result = await this.ask(
      agent,
      { conversation: this._conversationState(conversationHistory, 6) },
      {
        tier: {
          type: 'choice',
          instructions: 'Which model tier is needed to write a good reply to the user\'s latest message in `conversation`? Choose the least capable tier that will still produce a correct, helpful reply.',
          criteria: {
            fast: 'Greetings, small talk, thanks, short factual answers, simple follow-ups, or restating information that is already available.',
            powerful: 'Multi-part or ambiguous questions, complaints or emotionally sensitive situations, comparisons, negotiation, reasoning over several facts, or anything high-stakes.',
          },
        },
      },
      'responder_routing'
    );
    if (!result) return null;

    const answer = result.answers?.tier;
    if (!answer?.choice || typeof answer.confidence !== 'number') return null;

    return {
      tier: answer.confidence >= this.minConfidence(agent) ? answer.choice : 'powerful',
      confidence: answer.confidence,
      usage: result.usage,
      latency_ms: result.latency_ms,
    };
  }

  /**
   * @returns {Promise<{language: string, confidence: number, usage: Object}|null>} null when below min_confidence
   */
  async detectLanguage(agent, { text, recentMessages = [], contextHints = {}, extraCodes = [] }) {
    const criteria = { ...LANGUAGE_NAMES };
    for (const code of extraCodes) {
      if (code && /^[a-z]{2}$/.test(code) && !criteria[code]) criteria[code] = null;
    }

    const state = {
      page_context: Object.keys(contextHints).length > 0 ? contextHints : undefined,
      recent_conversation: recentMessages.map(m => ({ role: m.role, text: this._truncate(m.content || '', 150) })),
      current_message: this._truncate(text, MAX_MESSAGE_CHARS),
    };

    const result = await this.ask(agent, state, {
      language: {
        type: 'choice',
        instructions: 'Which language is `current_message` primarily written in? Borrowed words, greetings, names, cities and URLs are not language evidence. If `current_message` is ambiguous (a single word, a name, a number), use the language of `recent_conversation`, then `page_context`.',
        criteria,
      },
    }, 'language_detection');
    if (!result) return null;

    const answer = result.answers?.language;
    if (!answer?.choice || typeof answer.confidence !== 'number') return null;
    if (answer.confidence < this.minConfidence(agent)) {
      console.log(`[Jev] Language "${answer.choice}" below threshold (confidence=${answer.confidence.toFixed(2)}); falling back to LLM.`);
      return null;
    }

    return { language: answer.choice, confidence: answer.confidence, usage: result.usage };
  }

  /**
   * @returns {Promise<{procedure_id: string|null, confidence: number, usage: Object}|null>} null when below min_confidence
   */
  async matchProcedure(agent, { recentMessages = [], userMessage, procedures }) {
    const criteria = {};
    for (const p of procedures) {
      criteria[p.id] = {
        name: p.name,
        when_to_use: p.trigger?.description || p.description || '',
        example_phrases: p.trigger?.examples || [],
      };
    }
    criteria[NO_PROCEDURE] = 'The latest message does not clearly fall into any of the other situations.';

    const result = await this.ask(
      agent,
      {
        recent_conversation: recentMessages.map(m => ({ role: m.role, text: this._truncate(m.content || '', MAX_MESSAGE_CHARS) })),
        latest_user_message: this._truncate(userMessage, MAX_MESSAGE_CHARS),
      },
      {
        procedure: {
          type: 'choice',
          instructions: 'Which predefined procedure does `latest_user_message` call for? Match on meaning, not keywords. Only pick a procedure when the message clearly falls into its situation.',
          criteria,
        },
      },
      'procedure_matching'
    );
    if (!result) return null;

    const answer = result.answers?.procedure;
    if (!answer?.choice || typeof answer.confidence !== 'number') return null;
    if (answer.confidence < this.minConfidence(agent)) return null;

    return {
      procedure_id: answer.choice === NO_PROCEDURE ? null : answer.choice,
      confidence: answer.confidence,
      usage: result.usage,
    };
  }

  /**
   * Email triage. Returns a result shaped like the LLM classifier's parsed JSON
   * (in_scope/topic/intent/confidence/reasons) or null when not confident.
   */
  async triageEmail(agent, { email, topics, allowTopics = [], denyTopics = [], guidance = null }) {
    const state = {
      mailbox_guidance: guidance || undefined,
      email: {
        from: email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address,
        to: (email.to_addresses || []).join(', '),
        subject: email.subject || '(no subject)',
        body: (email.body_text || '').slice(0, 2000),
      },
    };

    const inScopeInstructions = {
      question: 'Is `email` something an AI customer-support assistant for this mailbox could plausibly answer or escalate?',
      in_scope_topics: allowTopics.length > 0 ? allowTopics : undefined,
      out_of_scope_topics: denyTopics.length > 0 ? denyTopics : undefined,
      rule: allowTopics.length > 0
        ? 'Only answer yes when the email clearly matches one of `in_scope_topics` and none of `out_of_scope_topics`. Follow `mailbox_guidance` when present.'
        : 'Answer no when the email matches any of `out_of_scope_topics`. Follow `mailbox_guidance` when present.',
    };

    const result = await this.ask(agent, state, {
      in_scope: { type: 'noul', instructions: inScopeInstructions },
      topic: {
        type: 'choice',
        instructions: 'Which topic best describes `email`?',
        criteria: topics,
      },
      intent: {
        type: 'choice',
        instructions: 'What is the sender\'s intent in `email`?',
        criteria: {
          question: 'Asks a question.',
          request: 'Asks for something to be done.',
          complaint: 'Expresses dissatisfaction.',
          fyi: 'Shares information, no action requested.',
          unsubscribe: 'Wants to stop receiving messages.',
          reply: 'Short reply or acknowledgement in an existing thread.',
          other: 'None of the above.',
        },
      },
    }, 'email_triage');
    if (!result) return null;

    const pInScope = result.answers?.in_scope?.noul;
    const topic = result.answers?.topic;
    const intent = result.answers?.intent;
    if (typeof pInScope !== 'number' || !topic?.choice) return null;

    const inScopeCertainty = Math.max(pInScope, 1 - pInScope);
    const confidence = Math.min(inScopeCertainty, topic.confidence ?? 0);
    if (confidence < this.minConfidence(agent)) return null;

    return {
      in_scope: pInScope >= 0.5,
      topic: topic.choice,
      intent: intent?.choice || 'other',
      confidence,
      reasons: `Jev triage: in_scope=${pInScope.toFixed(2)}, topic=${topic.choice} (${(topic.confidence ?? 0).toFixed(2)}), intent=${intent?.choice || 'other'}.`,
      usage: result.usage,
    };
  }
}

module.exports = new JevService();
module.exports.PROVIDER_NAME = PROVIDER_NAME;
