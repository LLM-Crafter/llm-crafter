'use strict';

/**
 * EmailTriageService
 *
 * Cheap classifier that runs BEFORE the expensive agent reasoning loop.
 * Decides whether an incoming email is worth handing to the agent at all,
 * and tags it with topic + intent + confidence.
 *
 * Two layers:
 *   1. Deterministic guards (free):
 *        - allow/deny sender + domain lists
 *        - bounce / auto-submitted / list mail headers
 *        - "this is our own outbound message bouncing back" detection
 *   2. LLM classifier (cheap model) — only when deterministic guards pass.
 *
 * The classifier model follows the same pattern as languageDetectionService:
 * cheapest model per provider, JSON-only output.
 */

const OpenAIService = require('../openaiService');

class EmailTriageService {
  constructor() {
    // Mirror languageDetectionService — same providers, same cheapest models.
    this.modelByProvider = {
      openai: 'gpt-5.4-nano',
      anthropic: 'claude-3-5-haiku-20241022',
      google: 'gemini-2.0-flash',
      deepseek: 'deepseek-chat',
      xai: 'grok-3-mini',
      openrouter: 'deepseek/deepseek-chat',
    };

    this.systemPrompt = [
      'You triage incoming emails for an AI customer-support assistant.',
      'Decide whether the email is in-scope for the assistant and classify topic + intent.',
      '',
      'Always respond with a strict JSON object matching the provided schema. No prose.',
      '',
      'For the `topic` field: when a list of in-scope topics is provided in the prompt, pick',
      'the single best matching label from that list verbatim. When no list is provided, use',
      'one of: support | sales | billing | complaint | spam | newsletter | bounce | other.',
      '',
      'Intent taxonomy (pick exactly one):',
      '- question | request | complaint | fyi | unsubscribe | reply | other',
      '',
      'in_scope is true only when the message is something the assistant could plausibly answer or escalate.',
      'Set confidence between 0 and 1 reflecting how sure you are of the topic+in_scope decision.',
    ].join('\n');
  }

  getModelForProvider(providerName) {
    const key = (providerName || '').toLowerCase();
    return this.modelByProvider[key] || 'gpt-5.4-nano';
  }

  /**
   * JSON schema for structured outputs (compatible with OpenAI/OpenRouter
   * structured output mode — see OpenAIService.supportsStructuredOutputs).
   */
  getTriageSchema() {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'email_triage',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            in_scope: { type: 'boolean' },
            topic: {
              type: 'string',
              enum: [
                'support',
                'sales',
                'billing',
                'complaint',
                'spam',
                'newsletter',
                'bounce',
                'other',
              ],
            },
            intent: {
              type: 'string',
              enum: [
                'question',
                'request',
                'complaint',
                'fyi',
                'unsubscribe',
                'reply',
                'other',
              ],
            },
            confidence: { type: 'number' },
            language: { type: 'string', description: 'ISO 639-1 code' },
            reasons: { type: 'string' },
          },
          required: ['in_scope', 'topic', 'intent', 'confidence', 'reasons'],
        },
      },
    };
  }

  /**
   * Run deterministic guards. Returns either:
   *   - `null` — guards passed, continue to LLM classification
   *   - `{ in_scope: false, decision: '...', reasons: '...' }` — short-circuit
   *
   * Guard list (cheap, regex/string only):
   *   - explicit deny lists (sender, domain) on the account
   *   - auto-submitted / list / bulk headers (loop and newsletter protection)
   *   - our own outbound message coming back (X-LLMCrafter-Agent header)
   *   - mailer-daemon / postmaster / no-reply patterns (bounce protection)
   */
  runDeterministicGuards(email, account) {
    const triage = account.triage || {};
    const fromAddress = (email.from_address || '').toLowerCase();
    const fromDomain = fromAddress.includes('@')
      ? fromAddress.split('@')[1]
      : '';

    // Allow list overrides everything else when populated.
    const inAllow =
      (triage.allow_senders || []).some(s => s.toLowerCase() === fromAddress) ||
      (triage.allow_domains || []).some(d => d.toLowerCase() === fromDomain);

    // Deny lists
    if (!inAllow) {
      if ((triage.deny_senders || []).some(s => s.toLowerCase() === fromAddress)) {
        return { decision: 'denied_sender', in_scope: false };
      }
      if ((triage.deny_domains || []).some(d => d.toLowerCase() === fromDomain)) {
        return { decision: 'denied_domain', in_scope: false };
      }
    }

    const headers = email.headers || {};
    const headerVal = name => {
      const v = headers[name] || headers[name.toLowerCase()];
      if (!v) return '';
      return Array.isArray(v) ? v.join(' ') : String(v);
    };

    // Loop protection: stop if THIS system sent the message originally.
    if (headerVal('x-llmcrafter-agent')) {
      return { decision: 'loop_self', in_scope: false };
    }

    // RFC 3834 auto-submitted (auto-reply, OOF, vacation responder)
    const autoSubmitted = headerVal('auto-submitted').toLowerCase();
    if (autoSubmitted && autoSubmitted !== 'no') {
      return { decision: 'auto_submitted', in_scope: false };
    }

    // Mailing-list / bulk markers
    if (
      headerVal('list-id') ||
      headerVal('list-unsubscribe') ||
      headerVal('precedence').toLowerCase() === 'bulk' ||
      headerVal('precedence').toLowerCase() === 'list'
    ) {
      return { decision: 'mailing_list', in_scope: false };
    }

    // Bounce / NDR markers
    const bouncePatterns = [
      /mailer-daemon/i,
      /postmaster@/i,
      /^bounce[s]?@/i,
      /no-?reply@/i,
    ];
    if (bouncePatterns.some(rx => rx.test(fromAddress))) {
      return { decision: 'bounce_or_no_reply', in_scope: false };
    }

    // Sender is our own mailbox — circular loop guard
    const ownAddress = (account.send_profile?.from_email || '').toLowerCase();
    if (ownAddress && fromAddress === ownAddress) {
      return { decision: 'loop_self_address', in_scope: false };
    }

    return null;
  }

  /**
   * Build the LLM classification prompt with the (truncated) email content.
   */
  buildClassificationPrompt(email, account) {
    const lines = [];

    if (account.triage?.custom_prompt) {
      lines.push('## Customer-specific guidance');
      lines.push(account.triage.custom_prompt);
      lines.push('');
    }

    const allowTopics = account.triage?.allow_topics || [];
    const denyTopics = account.triage?.deny_topics || [];

    if (allowTopics.length > 0) {
      lines.push(`## In-scope topics for this mailbox`);
      lines.push('Pick the single best matching topic from this list for the `topic` field.');
      lines.push('Set in_scope=true ONLY when the email clearly matches one of these topics:');
      allowTopics.forEach(t => lines.push(`- ${t}`));
      lines.push('');
    }

    if (denyTopics.length > 0) {
      lines.push('## Always out-of-scope topics (set in_scope=false when matched):');
      denyTopics.forEach(t => lines.push(`- ${t}`));
      lines.push('');
    }

    lines.push('## Email to classify');
    lines.push(`From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}`);
    lines.push(`To: ${(email.to_addresses || []).join(', ')}`);
    lines.push(`Subject: ${email.subject || '(no subject)'}`);
    lines.push('');
    // Truncate body — classification quality doesn't improve past ~2k chars
    // and we want this call to stay cheap.
    const body = (email.body_text || '').slice(0, 2000);
    lines.push('---');
    lines.push(body);
    lines.push('---');
    lines.push('');
    lines.push('Respond with JSON only.');
    return lines.join('\n');
  }

  /**
   * Classify a single email against an account's triage configuration.
   *
   * @param {Object} email   - normalized inbound email (see emailParser)
   * @param {Object} account - MailAccount document
   * @param {Object} agent   - populated Agent (needs api_key + provider)
   * @returns {Promise<Object>} triage decision
   */
  async classify(email, account, agent) {
    // 1. Deterministic guards
    const guard = this.runDeterministicGuards(email, account);
    if (guard) {
      return {
        in_scope: false,
        topic: 'other',
        intent: 'other',
        confidence: 1.0,
        decision: guard.decision,
        reasons: `Deterministic guard: ${guard.decision}`,
        used_llm: false,
        usage: null,
      };
    }

    // 2. LLM classification
    const minConfidence = account.triage?.min_confidence_to_process ?? 0.6;

    try {
      const apiKey = agent.api_key.getDecryptedKey();
      const openai = new OpenAIService(apiKey, agent.api_key.provider.name);
      const model = this.getModelForProvider(agent.api_key.provider.name);

      const responseFormat = openai.supportsStructuredOutputs?.(model)
        ? this.getTriageSchema()
        : null;

      const llmResponse = await openai.generateCompletion(
        model,
        this.buildClassificationPrompt(email, account),
        { temperature: 0, max_tokens: 200 },
        this.systemPrompt,
        responseFormat,
        { prompt_cache_key: `email_triage_${account._id}` }
      );

      let parsed;
      try {
        parsed = JSON.parse(llmResponse.content);
      } catch {
        // Best-effort recovery — find the first JSON object in the response.
        const match = llmResponse.content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
      }

      if (!parsed || typeof parsed.in_scope !== 'boolean') {
        return {
          in_scope: false,
          topic: 'other',
          intent: 'other',
          confidence: 0,
          decision: 'classifier_unparseable',
          reasons: 'Classifier output could not be parsed.',
          used_llm: true,
          usage: llmResponse.usage,
        };
      }

      // Apply allow/deny topic lists server-side as a safety net.
      // Use case-insensitive matching — the LLM may vary capitalisation or
      // pick a close synonym, so we also check whether any allow_topic is a
      // substring of the returned topic or vice-versa.
      const allow = (account.triage?.allow_topics || []).map(t => t.toLowerCase());
      const deny  = (account.triage?.deny_topics  || []).map(t => t.toLowerCase());
      const topicLower = (parsed.topic || '').toLowerCase();

      const topicInList = list =>
        list.some(t => t === topicLower || topicLower.includes(t) || t.includes(topicLower));

      let inScope = parsed.in_scope === true;
      let decision = 'classified';
      if (inScope && allow.length > 0 && !topicInList(allow)) {
        inScope = false;
        decision = 'topic_not_allowed';
      }
      if (inScope && deny.length > 0 && topicInList(deny)) {
        inScope = false;
        decision = 'topic_denied';
      }
      if (inScope && parsed.confidence < minConfidence) {
        inScope = false;
        decision = 'low_confidence';
      }

      return {
        in_scope: inScope,
        topic: parsed.topic || 'other',
        intent: parsed.intent || 'other',
        confidence: Number(parsed.confidence) || 0,
        language: parsed.language || null,
        decision,
        reasons: parsed.reasons || '',
        used_llm: true,
        usage: llmResponse.usage,
      };
    } catch (e) {
      // Fail closed — when the classifier itself errors we do NOT auto-reply.
      console.error('[EmailTriage] classifier error:', e.message);
      return {
        in_scope: false,
        topic: 'other',
        intent: 'other',
        confidence: 0,
        decision: 'classifier_error',
        reasons: e.message,
        used_llm: true,
        usage: null,
      };
    }
  }
}

module.exports = new EmailTriageService();
