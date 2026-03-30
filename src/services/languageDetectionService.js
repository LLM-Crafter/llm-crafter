const OpenAIService = require('./openaiService');

/**
 * Language Detection Service
 *
 * Detects the language of user messages using a lightweight LLM call.
 * Returns ISO 639-1 language codes (e.g. "en", "fr", "pt", "es").
 *
 * Picks the cheapest available model for the agent's provider so the
 * cost per detection is negligible.  This approach is far more accurate
 * on short messages than n-gram libraries like franc-min.
 *
 * Conversation history is passed as context so the model can resolve
 * ambiguous inputs (emails, numbers, mixed-language greetings, etc.)
 * by looking at what language the conversation has been using.
 */
class LanguageDetectionService {
  constructor() {
    // Cheapest model per provider — used exclusively for language detection.
    // If a provider is missing or its model is unavailable the service
    // falls back gracefully to the previous turn language or "en".
    this.modelByProvider = {
      openai: 'gpt-5.4-nano',           // newest cheapest OpenAI model
      anthropic: 'claude-3-5-haiku-20241022', // cheapest Anthropic model
      google: 'gemini-2.0-flash',        // cheapest Google model
      deepseek: 'deepseek-chat',         // DeepSeek V3 chat, very cheap
      xai: 'grok-3-mini',               // cheapest xAI model
      openrouter: 'deepseek/deepseek-chat', // cheapest openrouter route
    };

    this.systemPrompt = [
      'You are an expert language identifier.',
      'Given a user message and optional conversation history, determine the PRIMARY language the user is communicating in.',
      '',
      'Rules:',
      '- Reply with ONLY the ISO 639-1 two-letter code (en, fr, pt, es, de, nl, it, ja, zh, ko, ar, ru, hi, tr, pl, sv, da, fi, no, cs, ro, hu, etc.).',
      '- If the message is a mix of multiple languages (e.g. Arabic greeting + Dutch sentence), identify the DOMINANT language of the overall message, not borrowed words or greetings.',
      '- If the message contains ONLY numbers, email addresses, URLs, emojis, or other non-linguistic content, use the conversation history to determine the language. If there is no history, reply with "en".',
      '- PROPER NOUNS RULE: City names, country names, street names, person names, brand names, and product names are NOT language indicators on their own. If the message consists solely of a proper noun (e.g. a city like "Amsterdam", "Paris", "Berlin"), treat it as non-linguistic content and use conversation history to determine the language. Do NOT infer language from where a city is located.',
      '- URL/LINK RULE: If the message consists solely of a URL or hyperlink (e.g. https://..., www...), treat it as non-linguistic content and use conversation history to determine the language.',
      '- CONVERSATION HISTORY IS AUTHORITATIVE: When the current message is ambiguous, a single word, a proper noun, a number, or a URL, the conversation history ALWAYS takes precedence. If the last few messages were in French, the answer is "fr" unless there is clear multi-word evidence of a language switch.',
      '- Use conversation history as strong context: if the user has been writing in Dutch and sends a number, the language is still Dutch.',
      '- Output ONLY the two-letter code. No punctuation, no explanation.',
    ].join('\n');
  }

  /**
   * Return the cheapest detection model for a given provider.
   * Falls back to 'gpt-5.4-nano' when the provider is unknown.
   *
   * @param {string} providerName
   * @returns {string} model identifier
   */
  getModelForProvider(providerName) {
    const key = (providerName || '').toLowerCase();
    return this.modelByProvider[key] || 'gpt-5.4-nano';
  }

  /**
   * Build the user prompt for language detection.
   * Includes recent conversation history so the model can disambiguate
   * non-linguistic messages (numbers, emails) and mixed-language inputs.
   *
   * @param {string} text - Current user message
   * @param {Array} conversationMessages - Recent messages [{role, content}]
   * @returns {string}
   */
  buildDetectionPrompt(text, conversationMessages = []) {
    let prompt = '';

    // Add recent conversation context (last 4 messages, excluding the current one)
    if (conversationMessages.length > 0) {
      const recentMessages = conversationMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-4);

      if (recentMessages.length > 0) {
        prompt += 'Conversation history:\n';
        for (const msg of recentMessages) {
          const label = msg.role === 'user' ? 'User' : 'Assistant';
          // Truncate long messages to save tokens
          const content = (msg.content || '').substring(0, 150);
          prompt += `${label}: ${content}\n`;
        }
        prompt += '\n';
      }
    }

    prompt += `Current user message to classify:\n${text}`;
    return prompt;
  }

  /**
   * Detect the language of a text message.
   *
   * @param {string} text - The user message to analyse
   * @param {string} decryptedApiKey - Decrypted API key string
   * @param {string} providerName - Provider name (e.g. "openai", "anthropic", "google", …)
   * @param {Array} [conversationMessages=[]] - Recent conversation messages for context
   * @param {string|null} [previousLanguage=null] - Language detected on the previous turn
   * @returns {Promise<{ language: string, confidence: string }>}
   *   language  — ISO 639-1 code (lowercase), e.g. "en"
   *   confidence — "high" when the detector produced a clean code, "low" otherwise
   */
  async detectLanguage(text, decryptedApiKey, providerName, conversationMessages = [], previousLanguage = null) {
    // Guard: empty input → use previous language or default to "en"
    if (!text || text.trim().length === 0) {
      return { language: previousLanguage || 'en', confidence: 'low' };
    }

    // Fast path: if the message is ONLY numbers, punctuation, emails, or URLs
    // skip the LLM call and carry forward the previous language
    const stripped = text.trim();
    if (/^[\d\s\-+().,:;@#&*!?\/\\=<>{}[\]|~`$%^_"']+$/.test(stripped)) {
      return { language: previousLanguage || 'en', confidence: 'low' };
    }
    // Email-only check
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stripped)) {
      return { language: previousLanguage || 'en', confidence: 'low' };
    }
    // URL-only check (http/https/www links) — words inside URLs are not language indicators
    if (/^(https?:\/\/|www\.)[^\s]+$/i.test(stripped)) {
      return { language: previousLanguage || 'en', confidence: 'low' };
    }

    try {
      const openai = new OpenAIService(decryptedApiKey, providerName);
      const model = this.getModelForProvider(providerName);

      const prompt = this.buildDetectionPrompt(text, conversationMessages);

      const response = await openai.generateCompletion(
        model,
        prompt,
        { temperature: 0, max_tokens: 5 },
        this.systemPrompt
      );

      const raw = (response.content || '').trim().toLowerCase();

      // Validate the response is a proper ISO 639-1 code (exactly 2 alpha chars)
      const isoMatch = raw.match(/^([a-z]{2})$/);

      if (isoMatch) {
        console.log(`[LanguageDetection] Detected language "${isoMatch[1]}" with high confidence for message: "${text}"`);
        return { language: isoMatch[1], confidence: 'high' };
      }

      // Try to extract a 2-letter code from a longer response
      const fallbackMatch = raw.match(/\b([a-z]{2})\b/);
      if (fallbackMatch) {
        return { language: fallbackMatch[1], confidence: 'low' };
      }

      // Unable to parse — use previous language or default
      console.warn(
        `[LanguageDetection] Could not parse LLM response: "${raw}", falling back`
      );
      return { language: previousLanguage || 'en', confidence: 'low' };
    } catch (error) {
      console.error('[LanguageDetection] Detection failed:', error.message);
      // Non-blocking — fall back so the conversation continues
      return { language: previousLanguage || 'en', confidence: 'low' };
    }
  }
}

module.exports = new LanguageDetectionService();
