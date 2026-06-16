const axios = require('axios');
const { calculateVoiceCost } = require('../../config/voicePricing');

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_turbo_v2_5';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel

class ElevenLabsProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async synthesize(text, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const voiceId = options.voice_id || DEFAULT_VOICE;
    const outputFormat = options.output_format || 'mp3_44100_128';

    const response = await axios.post(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
      {
        text,
        model_id: model,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarity_boost ?? 0.75,
          speed: options.speed ?? 1.0,
        },
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        params: { output_format: outputFormat },
        responseType: 'arraybuffer',
      }
    );

    const audioBuffer = Buffer.from(response.data);
    const characters = text.length;
    const cost = calculateVoiceCost('elevenlabs', model, characters);

    return {
      audioBuffer,
      format: 'mp3',
      characters_used: characters,
      cost,
      provider: 'elevenlabs',
      model,
      voice_id: voiceId,
    };
  }
}

module.exports = ElevenLabsProvider;
