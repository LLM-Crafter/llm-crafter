'use strict';

/**
 * EmailRecipientResolverService
 *
 * Decides whether a reply should go to the envelope sender/Reply-To, or to
 * a different address mentioned in the email body — e.g. an automated lead
 * notification (marketplace, contact-form relay, ...) that forwards a third
 * party's enquiry and expects the reply to go to that third party instead
 * of back to the platform.
 *
 * Fully generic and config-driven per MailAccount (`recipient_resolution`)
 * — nothing here is specific to any one sender or platform.
 *
 * Two stages, mirrors emailTriageService's guard-then-classify split:
 *   1. Deterministic, free candidate extraction (mailto: links, optionally
 *      plain-text email patterns). If nothing turns up, we skip the LLM
 *      entirely — this keeps the common case (real 1:1 correspondence) at
 *      zero token cost.
 *   2. Cheap LLM call (same model tier as triage) — only runs when Stage 1
 *      found a candidate, or a sender_override explicitly forces it (for
 *      platforms that embed the real address as plain text with no mailto:).
 */

const OpenAIService = require('../openaiService');
const { isNoReplyAddress } = require('./emailSenderGuards');

const MAILTO_RX = /mailto:([^"'>\s?]+)/gi;
const EMAIL_RX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

class EmailRecipientResolverService {
  constructor() {
    // Same providers/models as emailTriageService — cheap, structured-output capable.
    this.modelByProvider = {
      openai: 'gpt-5.4-nano',
      anthropic: 'claude-3-5-haiku-20241022',
      google: 'gemini-2.0-flash',
      deepseek: 'deepseek-chat',
      xai: 'grok-3-mini',
      openrouter: 'deepseek/deepseek-chat',
    };

    this.systemPrompt = [
      'You decide the correct reply recipient for an inbound email.',
      'Most emails should simply be replied to at the sender/Reply-To address — that is the default.',
      'Sometimes the message is an automated notification (e.g. a lead/enquiry alert) that forwards a',
      "request from a third party, and the reply should instead go to that third party's address found",
      'in the body, not back to the notification sender.',
      '',
      'Only set redirect=true when the body clearly identifies a specific different person as the one',
      'who should receive the reply (e.g. "message from the buyer", a named contact with their own',
      'email, a "reply to this person" link). Do not invent an address that is not present in the text.',
      '',
      'Always respond with a strict JSON object matching the provided schema. No prose.',
    ].join('\n');
  }

  getModelForProvider(providerName) {
    const key = (providerName || '').toLowerCase();
    return this.modelByProvider[key] || 'gpt-5.4-nano';
  }

  getResolutionSchema() {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'email_recipient_resolution',
        strict: false,
        schema: {
          type: 'object',
          properties: {
            redirect: { type: 'boolean' },
            email: { type: 'string' },
            name: { type: 'string' },
            confidence: { type: 'number' },
            reasons: { type: 'string' },
          },
          required: ['redirect', 'confidence', 'reasons'],
        },
      },
    };
  }

  extractMailtoAddresses(html) {
    if (!html) return [];
    const out = [];
    let m;
    MAILTO_RX.lastIndex = 0;
    while ((m = MAILTO_RX.exec(html))) {
      try {
        out.push(decodeURIComponent(m[1]).toLowerCase());
      } catch {
        out.push(m[1].toLowerCase());
      }
    }
    return out;
  }

  extractPlainTextAddresses(text) {
    if (!text) return [];
    return (text.match(EMAIL_RX) || []).map(a => a.toLowerCase());
  }

  /**
   * Stage 1 — free extraction. Filters out the sender itself, the account's
   * own addresses, and same-domain noise (e.g. an unsubscribe/footer address
   * on the notification sender's own domain).
   */
  extractCandidateAddresses(email, account, { includePlainText = false } = {}) {
    const from = (email.from_address || '').toLowerCase();
    const replyTo = (email.reply_to || '').toLowerCase();
    const ownAddresses = [
      (account.send_profile?.from_email || '').toLowerCase(),
      (account.send_profile?.reply_to || '').toLowerCase(),
    ].filter(Boolean);
    const fromDomain = from.includes('@') ? from.split('@')[1] : '';

    const raw = [
      ...this.extractMailtoAddresses(email.body_html),
      ...(includePlainText ? this.extractPlainTextAddresses(email.body_text) : []),
    ];

    const seen = new Set();
    const candidates = [];
    for (const addr of raw) {
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      if (addr === from || addr === replyTo || ownAddresses.includes(addr)) continue;
      if (isNoReplyAddress(addr)) continue;
      const domain = addr.includes('@') ? addr.split('@')[1] : '';
      if (domain && domain === fromDomain) continue;
      candidates.push(addr);
    }
    return candidates;
  }

  matchSenderOverride(email, account) {
    const from = (email.from_address || '').toLowerCase();
    const domain = from.includes('@') ? from.split('@')[1] : '';
    const overrides = account.recipient_resolution?.sender_overrides || [];
    return overrides.find(o =>
      (o.match_sender && o.match_sender.toLowerCase() === from) ||
      (o.match_domain && o.match_domain.toLowerCase() === domain)
    ) || null;
  }

  buildResolutionPrompt(email, candidates, override, account) {
    const lines = [];

    if (account.recipient_resolution?.custom_prompt) {
      lines.push('## Mailbox-specific guidance');
      lines.push(account.recipient_resolution.custom_prompt);
      lines.push('');
    }
    if (override?.extraction_hint) {
      lines.push('## Sender-specific hint');
      lines.push(override.extraction_hint);
      lines.push('');
    }

    lines.push(`From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}`);
    if (email.reply_to) lines.push(`Reply-To: ${email.reply_to}`);
    lines.push(`Subject: ${email.subject || '(no subject)'}`);
    lines.push('');

    if (candidates.length) {
      lines.push('## Candidate addresses found in the body (links or text)');
      candidates.forEach(c => lines.push(`- ${c}`));
      lines.push('');
    }

    lines.push('## Email body');
    lines.push('---');
    lines.push((email.body_text || '').slice(0, 3000));
    lines.push('---');
    lines.push('');
    lines.push('Respond with JSON only.');
    return lines.join('\n');
  }

  /**
   * @param {Object} email   - normalized inbound email (see emailParser)
   * @param {Object} account - MailAccount document
   * @param {Object} agent   - populated Agent (needs api_key + provider)
   * @returns {Promise<Object|null>} null when no redirection is warranted,
   *   otherwise { to, name, confidence, meets_threshold, reasons, used_llm, usage }
   */
  async resolve(email, account, agent) {
    const config = account.recipient_resolution;
    if (!config?.enabled) return null;

    const override = this.matchSenderOverride(email, account);
    const includePlainText =
      override?.extract_plain_text_candidates ?? config.extract_plain_text_candidates ?? false;
    const candidates = this.extractCandidateAddresses(email, account, { includePlainText });

    // Nothing to resolve and no override forcing it — skip the LLM call entirely.
    if (candidates.length === 0 && !override?.force_ai_resolution) {
      return null;
    }

    try {
      const apiKey = agent.api_key.getDecryptedKey();
      const openai = new OpenAIService(apiKey, agent.api_key.provider.name);
      const model = this.getModelForProvider(agent.api_key.provider.name);

      const responseFormat = openai.supportsStructuredOutputs?.(model)
        ? this.getResolutionSchema()
        : null;

      const llmResponse = await openai.generateCompletion(
        model,
        this.buildResolutionPrompt(email, candidates, override, account),
        { temperature: 0, max_tokens: 200 },
        this.systemPrompt,
        responseFormat,
        { prompt_cache_key: `email_recipient_resolution_${account._id}` }
      );

      let parsed;
      try {
        parsed = JSON.parse(llmResponse.content);
      } catch {
        const match = llmResponse.content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
      }

      if (!parsed || parsed.redirect !== true || !parsed.email) {
        return null;
      }

      const resolvedEmail = String(parsed.email).toLowerCase();
      // Defensive — never act on an automated address even if the model
      // picked one up from the body (e.g. a footer/tracking mailto).
      if (isNoReplyAddress(resolvedEmail)) {
        return null;
      }

      const confidence = Number(parsed.confidence) || 0;
      const minConfidence = config.min_confidence ?? 0.75;

      return {
        to: resolvedEmail,
        name: parsed.name || null,
        confidence,
        meets_threshold: confidence >= minConfidence,
        reasons: parsed.reasons || '',
        used_llm: true,
        usage: llmResponse.usage,
      };
    } catch (e) {
      // Fail closed — on any error we keep the default recipient.
      console.error('[EmailRecipientResolver] resolution error:', e.message);
      return null;
    }
  }
}

module.exports = new EmailRecipientResolverService();
