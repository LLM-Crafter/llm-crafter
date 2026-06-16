// Price per 1,000 characters for TTS; per minute for STT
const VOICE_PRICING = {
  openai: {
    'tts-1':    { per_1k_chars: 0.015 },
    'tts-1-hd': { per_1k_chars: 0.030 },
    'whisper-1': { per_minute: 0.006 },
  },
  elevenlabs: {
    'eleven_flash_v2':          { per_1k_chars: 0.008 },
    'eleven_flash_v2_5':        { per_1k_chars: 0.008 },
    'eleven_turbo_v2':          { per_1k_chars: 0.008 },
    'eleven_turbo_v2_5':        { per_1k_chars: 0.008 },
    'eleven_multilingual_v2':   { per_1k_chars: 0.030 },
    'eleven_monolingual_v1':    { per_1k_chars: 0.030 },
  },
};

function calculateVoiceCost(provider, model, characters) {
  const pricing = VOICE_PRICING[provider]?.[model];
  if (!pricing || !pricing.per_1k_chars) return 0;
  return (characters / 1000) * pricing.per_1k_chars;
}

function calculateSttCost(provider, model, durationSeconds) {
  const pricing = VOICE_PRICING[provider]?.[model];
  if (!pricing || !pricing.per_minute) return 0;
  return (durationSeconds / 60) * pricing.per_minute;
}

module.exports = { VOICE_PRICING, calculateVoiceCost, calculateSttCost };
