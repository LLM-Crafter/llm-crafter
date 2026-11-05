// Cheapest suitable model per provider, for small classification calls such as
// language detection and skill selection. Callers fall back to their own default
// when a provider isn't listed or its model is unavailable.
const SMALL_MODELS = {
  openai: 'gpt-6-luna',
  anthropic: 'claude-haiku-5-5',
  google: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  xai: 'grok-4.20-0309-non-reasoning', // No reasoning tokens
  openrouter: 'deepseek/deepseek-chat',
};

module.exports = { SMALL_MODELS };
