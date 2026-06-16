const OpenAI = require('openai');
const { calculateVoiceCost } = require('../../config/voicePricing');

const DEFAULT_MODEL = 'tts-1';
const DEFAULT_VOICE = 'alloy';
const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const VALID_MODELS = ['tts-1', 'tts-1-hd'];

class OpenAIVoiceProvider {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  async synthesize(text, options = {}) {
    const model = VALID_MODELS.includes(options.model) ? options.model : DEFAULT_MODEL;
    const voice = VALID_VOICES.includes(options.voice_id) ? options.voice_id : DEFAULT_VOICE;
    const responseFormat = options.output_format || 'mp3';

    const response = await this.client.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: responseFormat,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const characters = text.length;
    const cost = calculateVoiceCost('openai', model, characters);

    return {
      audioBuffer,
      format: responseFormat,
      characters_used: characters,
      cost,
      provider: 'openai',
      model,
      voice_id: voice,
    };
  }
}

module.exports = OpenAIVoiceProvider;
