const OpenAIVoiceProvider = require('./voice/openaiVoiceProvider');
const ElevenLabsProvider = require('./voice/elevenLabsProvider');
const VoiceUsage = require('../models/VoiceUsage');

class VoiceService {
  /**
   * Synthesize speech from text.
   *
   * @param {string} text - Text to convert to speech
   * @param {object} options
   * @param {string} options.provider - 'openai' | 'elevenlabs'
   * @param {string} options.api_key - Decrypted API key for the provider
   * @param {string} [options.voice_id] - Provider-specific voice ID
   * @param {string} [options.model] - Provider-specific model name
   * @param {string} [options.output_format] - Audio format (mp3, wav, pcm, etc.)
   * @param {object} [options.meta] - Metadata for cost tracking
   * @param {string} [options.meta.agent_id]
   * @param {string} [options.meta.organization_id]
   * @param {string} [options.meta.project_id]
   * @param {string} [options.meta.execution_id]
   * @param {string} [options.meta.conversation_id]
   * @param {string} [options.meta.use_case] - 'presentation' | 'chatbot_response' | 'telephony'
   *
   * @returns {{ audioBuffer, format, characters_used, cost, provider, model, voice_id }}
   */
  async synthesize(text, options = {}) {
    const { provider = 'openai', api_key, meta = {} } = options;

    if (!api_key) {
      throw new Error(`Voice synthesis requires an API key for provider '${provider}'`);
    }

    let result;
    if (provider === 'openai') {
      const p = new OpenAIVoiceProvider(api_key);
      result = await p.synthesize(text, options);
    } else if (provider === 'elevenlabs') {
      const p = new ElevenLabsProvider(api_key);
      result = await p.synthesize(text, options);
    } else {
      throw new Error(`Unsupported voice provider: '${provider}'`);
    }

    await this._logUsage(result, meta, 'tts').catch(err =>
      console.error('[VoiceService] Failed to log usage:', err.message)
    );

    return result;
  }

  async _logUsage(result, meta, operation) {
    if (!meta.agent_id) return;

    await VoiceUsage.create({
      agent: meta.agent_id,
      organization: meta.organization_id || null,
      project: meta.project_id || null,
      execution_id: meta.execution_id || null,
      conversation_id: meta.conversation_id || null,
      use_case: meta.use_case || 'other',
      operation,
      provider: result.provider,
      model: result.model,
      voice_id: result.voice_id || null,
      characters_used: result.characters_used,
      cost: result.cost,
    });
  }
}

module.exports = new VoiceService();
