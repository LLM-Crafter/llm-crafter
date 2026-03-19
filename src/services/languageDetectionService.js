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
 */
class LanguageDetectionService {
  constructor() {
    // Cheapest model per provider — used exclusively for language detection.
    // If a provider is missing or its model is unavailable the service
    // falls back gracefully to "en".
    this.modelByProvider = {
      openai: 'gpt-4.1-nano',           // ~$0.10 / 1M input tokens
      anthropic: 'claude-3-5-haiku-20241022', // cheapest Anthropic model
      google: 'gemini-2.0-flash',        // cheapest Google model
      deepseek: 'deepseek-chat',         // DeepSeek V3 chat, very cheap
      xai: 'grok-3-mini',               // cheapest xAI model
      openrouter: 'deepseek/deepseek-chat', // cheapest openrouter route
    };

    // System prompt is kept short to minimize tokens & maximize cache hits
    this.systemPrompt =
      'You are a language identifier. Given a user message, reply with ONLY the ISO 639-1 two-letter language code (e.g. en, fr, pt, es, de, nl, it, ja, zh, ko, ar, ru, hi, tr, pl, sv, da, fi, no, cs, ro, hu, el, he, th, vi, id, ms, uk, bg, hr, sk, sl, sr, lt, lv, et, ca, gl, eu, cy). Output nothing else — no punctuation, no explanation.';
  }

  /**
   * Return the cheapest detection model for a given provider.
   * Falls back to 'gpt-4.1-nano' when the provider is unknown.
   *
   * @param {string} providerName
   * @returns {string} model identifier
   */
  getModelForProvider(providerName) {
    const key = (providerName || '').toLowerCase();
    return this.modelByProvider[key] || 'gpt-4.1-nano';
  }

  /**
   * Detect the language of a text message.
   *
   * @param {string} text - The user message to analyse
   * @param {string} decryptedApiKey - Decrypted API key string
   * @param {string} providerName - Provider name (e.g. "openai", "anthropic", "google", …)
   * @returns {Promise<{ language: string, confidence: string }>}
   *   language  — ISO 639-1 code (lowercase), e.g. "en"
   *   confidence — "high" when the detector produced a clean code, "low" otherwise
   */
  async detectLanguage(text, decryptedApiKey, providerName) {
    // Guard: empty / very short input → default to "en"
    if (!text || text.trim().length === 0) {
      return { language: 'en', confidence: 'low' };
    }

    try {
      const openai = new OpenAIService(decryptedApiKey, providerName);
      const model = this.getModelForProvider(providerName);

      const response = await openai.generateCompletion(
        model,
        text,
        { temperature: 0, max_tokens: 5 },
        this.systemPrompt
      );

      const raw = (response.content || '').trim().toLowerCase();

      // Validate the response is a proper ISO 639-1 code (exactly 2 alpha chars)
      const isoMatch = raw.match(/^([a-z]{2})$/);

      if (isoMatch) {
        console.log(`[LanguageDetection] Detected language "${isoMatch[1]}" with high confidence for input: "${text}"`);
        return { language: isoMatch[1], confidence: 'high' };
      }

      // Try to extract a 2-letter code from a longer response
      const fallbackMatch = raw.match(/\b([a-z]{2})\b/);
      if (fallbackMatch) {
        return { language: fallbackMatch[1], confidence: 'low' };
      }

      // Unable to parse — default
      console.warn(
        `[LanguageDetection] Could not parse LLM response: "${raw}", defaulting to "en"`
      );
      return { language: 'en', confidence: 'low' };
    } catch (error) {
      console.error('[LanguageDetection] Detection failed:', error.message);
      // Non-blocking — fall back to English so the conversation continues
      return { language: 'en', confidence: 'low' };
    }
  }
}

module.exports = new LanguageDetectionService();
