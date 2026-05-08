/**
 * Message Transformer Service
 *
 * Post-processes AI responses before they are sent to channel services.
 * Each transformer matches a regex pattern in the AI text, calls an external
 * webhook with the captured groups, and receives a rich card payload back.
 *
 * The result splits the original text into plain segments and rich cards.
 * The channel orchestrator sends the plain text first, then each card
 * using the channel service's native rich-message API.
 */

const axios = require('axios');
const crypto = require('crypto');

class MessageTransformerService {
  /**
   * Process AI response text through the agent's message transformers.
   *
   * @param {string} text - Raw AI response text
   * @param {Array} transformers - Agent.message_transformers array
   * @param {string} channel - Target channel ('whatsapp', 'telegram', etc.)
   * @param {Object} context - Extra context: { agentId, conversationId }
   * @returns {Promise<{ text: string, cards: Array }>}
   *   - text: the response with matched patterns removed
   *   - cards: array of rich card objects returned by webhooks
   */
  async process(text, transformers, channel, context = {}) {
    if (!text || !transformers || transformers.length === 0) {
      return { text, cards: [] };
    }

    // Filter to enabled transformers that apply to this channel
    const applicable = transformers.filter(t => {
      if (!t.enabled) return false;
      if (t.channels && t.channels.length > 0 && !t.channels.includes(channel)) return false;
      return true;
    });

    if (applicable.length === 0) {
      return { text, cards: [] };
    }

    const cards = [];
    let processedText = text;

    for (const transformer of applicable) {
      let regex;
      try {
        regex = new RegExp(transformer.pattern, 'g');
      } catch (err) {
        console.error(`[MessageTransformer] Invalid pattern "${transformer.pattern}" in transformer "${transformer.name}":`, err.message);
        continue;
      }

      const matches = [...processedText.matchAll(regex)];
      if (matches.length === 0) continue;

      // Call webhook for each match (sequentially to preserve order)
      for (const match of matches) {
        const fullMatch = match[0];
        const captureGroups = match.slice(1);

        try {
          const card = await this._callWebhook(transformer, {
            match: fullMatch,
            captures: captureGroups,
            channel,
            agent_id: context.agentId,
            conversation_id: context.conversationId,
            language: context.language || null,
          });

          if (card) {
            cards.push(card);
            // Remove the matched pattern from the text
            processedText = processedText.replace(fullMatch, '');
          } else {
            // Webhook returned no card — apply fallback
            processedText = this._applyFallback(processedText, fullMatch, transformer);
          }
        } catch (err) {
          console.error(`[MessageTransformer] Webhook failed for transformer "${transformer.name}":`, err.message);
          processedText = this._applyFallback(processedText, fullMatch, transformer);
        }
      }
    }

    // Clean up extra whitespace left after removing patterns
    processedText = processedText.replace(/\n{3,}/g, '\n\n').trim();

    return { text: processedText, cards };
  }

  /**
   * Call the transformer's webhook with HMAC signature.
   * @returns {Object|null} - Rich card payload or null
   */
  async _callWebhook(transformer, payload) {
    const body = JSON.stringify(payload);

    const headers = {
      'Content-Type': 'application/json',
    };

    // HMAC-SHA256 signature if webhook_secret is configured
    if (transformer.webhook_secret) {
      const signature = crypto
        .createHmac('sha256', transformer.webhook_secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = signature;
    }

    const response = await axios.post(transformer.webhook_url, body, {
      headers,
      timeout: transformer.timeout_ms || 5000,
      validateStatus: status => status >= 200 && status < 300,
    });

    const data = response.data;

    // Validate that the response has the expected card structure
    if (!data || !data.type) {
      console.warn(`[MessageTransformer] Webhook "${transformer.name}" returned invalid payload (missing "type")`);
      return null;
    }

    return data;
  }

  /**
   * Apply fallback strategy when a webhook fails or returns no data.
   */
  _applyFallback(text, matchedStr, transformer) {
    const fallback = transformer.fallback?.type || 'passthrough';

    switch (fallback) {
      case 'remove':
        return text.replace(matchedStr, '');
      case 'text':
        // Keep the raw text (strip brackets if present)
        return text;
      case 'passthrough':
      default:
        // Leave the original pattern in the text as-is
        return text;
    }
  }
}

module.exports = new MessageTransformerService();
