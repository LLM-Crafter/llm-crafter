const OpenAI = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');

// Claude models that reject non-default sampling params (temperature/top_p)
// and support the "xhigh" effort level.
const ANTHROPIC_CURRENT_GEN_MODELS = /^claude-(fable|mythos|opus-5|opus-4-[78]|sonnet-5|haiku-5)/i;
// Claude models that support structured outputs (output_config.format).
const ANTHROPIC_STRUCTURED_OUTPUT_MODELS = /^claude-(fable|mythos|opus-(5|4-[5-9])|sonnet-(5|4-[5-9])|haiku-(5|4-5))/i;
// Claude models that accept output_config.effort.
const ANTHROPIC_EFFORT_MODELS = /^claude-(fable|mythos|opus-(5|4-[5-9])|sonnet-(5|4-6)|haiku-5)/i;
// Claude models with server-side refusal fallback (fallbacks: "default").
const ANTHROPIC_FALLBACK_MODELS = /^claude-(fable-5-1|opus-5|sonnet-5-5)/i;
const ANTHROPIC_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Anthropic stop_reason -> OpenAI finish_reason
const ANTHROPIC_FINISH_REASONS = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  pause_turn: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
  refusal: 'content_filter',
};

// Price per 1K tokens (as of current OpenAI pricing)
const PRICING = {
  openai: {
    // GPT-6 series — short-context pricing (long context is 2x input/cached, 1.5x output)
    'gpt-6-astra': {
      input: 0.01, // $10.00 per million tokens input
      cachedInput: 0.001, // $1.00 per million tokens cached input
      output: 0.05, // $50.00 per million tokens output
    },
    'gpt-6.1-sol': {
      input: 0.002, // $2.00 per million tokens input
      cachedInput: 0.0001, // $0.10 per million tokens cached input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-6-luna': {
      input: 0.0001, // $0.10 per million tokens input
      cachedInput: 0.00001, // $0.01 per million tokens cached input
      output: 0.0005, // $0.50 per million tokens output
    },
    'gpt-5.6-sol': {
      input: 0.004, // $4.00 per million tokens input
      output: 0.02, // $20.00 per million tokens output
    },
    'gpt-5.6-terra': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.012, // $12.00 per million tokens output
    },
    'gpt-5.6-luna': {
      input: 0.0002, // $0.20 per million tokens input
      output: 0.0012, // $1.20 per million tokens output
    },
    'gpt-5.6-cyber': {
      input: 0.0125, // $12.50 per million tokens input
      output: 0.075, // $75.00 per million tokens output
    },
    'gpt-5.5': {
      input: 0.005, // $5.00 per million tokens input
      output: 0.03, // $30.00 per million tokens output
    },
    'gpt-5.5-pro': {
      input: 0.03, // $30.00 per million tokens input
      output: 0.18, // $180.00 per million tokens output
    },
    'gpt-5.5-cyber': {
      input: 0.0125, // $12.50 per million tokens input
      output: 0.075, // $75.00 per million tokens output
    },
    'gpt-5.4': {
      input: 0.0025, // $2.50 per million tokens input
      output: 0.015, // $15.00 per million tokens output
    },
    'gpt-5.4-mini': {
      input: 0.00075, // $0.75 per million tokens input
      output: 0.0045, // $4.50 per million tokens output
    },
    'gpt-5.4-nano': {
      input: 0.0002, // $0.20 per million tokens input
      output: 0.00125, // $1.25 per million tokens output
    },
    'gpt-5.4-pro': {
      input: 0.03, // $30.00 per million tokens input
      output: 0.18, // $180.00 per million tokens output
    },
    'gpt-5.3-codex': {
      input: 0.00175, // $1.75 per million tokens input
      output: 0.014, // $14.00 per million tokens output
    },
    'gpt-5.2': {
      input: 0.00175, // $1.75 per million tokens input
      output: 0.014, // $14.00 per million tokens output
    },
    'gpt-5.2-pro': {
      input: 0.021, // $21.00 per million tokens input
      output: 0.168, // $168.00 per million tokens output
    },
    'gpt-5.1': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-5.1-pro': {
      input: 0.015, // Not separately listed; estimated from gpt-5-pro/gpt-5.x-pro ratio
      output: 0.12,
    },
    'gpt-5': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-5-mini': {
      input: 0.00025, // $0.25 per million tokens input
      output: 0.002, // $2.00 per million tokens output
    },
    'gpt-5-nano': {
      input: 0.00005, // $0.05 per million tokens input
      output: 0.0004, // $0.40 per million tokens output
    },
    'gpt-5-pro': {
      input: 0.015, // $15.00 per million tokens input
      output: 0.12, // $120.00 per million tokens output
    },
    'gpt-4.1': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.008, // $8.00 per million tokens output
    },
    'gpt-4.1-mini': {
      input: 0.0004, // $0.40 per million tokens input
      output: 0.0016, // $1.60 per million tokens output
    },
    'gpt-4.1-nano': {
      input: 0.0001, // $0.10 per million tokens input
      output: 0.0004, // $0.40 per million tokens output
    },
    'gpt-4o': {
      input: 0.0025, // $2.50 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-4o-mini': {
      input: 0.00015, // $0.15 per million tokens input
      output: 0.0006, // $0.60 per million tokens output
    },
    'gpt-4': {
      input: 0.03, // $30.00 per million tokens input
      output: 0.06, // $60.00 per million tokens output
    },
    'gpt-4-turbo': {
      input: 0.01, // $10.00 per million tokens input
      output: 0.03, // $30.00 per million tokens output
    },
    'gpt-3.5-turbo': {
      input: 0.0005, // $0.50 per million tokens input
      output: 0.0015, // $1.50 per million tokens output
    },
    o1: {
      input: 0.015, // $15.00 per million tokens input
      output: 0.06, // $60.00 per million tokens output
    },
    'o1-pro': {
      input: 0.15, // $150.00 per million tokens input
      output: 0.6, // $600.00 per million tokens output
    },
    o3: {
      input: 0.002, // $2.00 per million tokens input
      output: 0.008, // $8.00 per million tokens output
    },
    'o3-pro': {
      input: 0.02, // $20.00 per million tokens input
      output: 0.08, // $80.00 per million tokens output
    },
    'o3-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    'o4-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    'gpt-5-search-api': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'chat-latest': {
      input: 0.005, // $5.00 per million tokens input
      output: 0.03, // $30.00 per million tokens output
    },
    'gpt-oss-120b': {
      input: 0, // Free/open-weight models with no pricing info available
      output: 0,
    },
    'gpt-oss-20b': {
      input: 0,
      output: 0,
    },
    'text-embedding-3-large': {
      input: 0.00013, // $0.13 per million tokens
      output: 0,
    },
    'text-embedding-3-small': {
      input: 0.00002, // $0.02 per million tokens
      output: 0,
    },
    'text-embedding-ada-002': {
      input: 0.0001, // $0.10 per million tokens
      output: 0,
    },
    'davinci-002': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.002, // $2.00 per million tokens output
    },
    'babbage-002': {
      input: 0.0004, // $0.40 per million tokens input
      output: 0.0004, // $0.40 per million tokens output
    },
    'omni-moderation-latest': {
      input: 0, // Free
      output: 0,
    },
  },
  anthropic: {
    // Cache reads default to 10% of input (cachedInput overrides it).
    // Claude Fable 5.1 — $10 / MTok input, $50 / MTok output, $0.25 / MTok cache reads
    'claude-fable-5-1': {
      input: 0.01,
      output: 0.05,
      cachedInput: 0.00025,
    },
    // Claude Mythos 5.1 (Project Glasswing only) — same pricing as Fable 5.1
    'claude-mythos-5-1': {
      input: 0.01,
      output: 0.05,
      cachedInput: 0.00025,
    },
    // Claude Fable 5 — $10 / MTok input, $50 / MTok output
    'claude-fable-5': {
      input: 0.01,
      output: 0.05,
    },
    // Claude Mythos 5 (limited availability) — $10 / MTok input, $50 / MTok output
    'claude-mythos-5': {
      input: 0.01,
      output: 0.05,
    },
    // Claude Opus 5.5 — $4 / MTok input, $20 / MTok output, $0.20 / MTok cache reads
    'claude-opus-5-5': {
      input: 0.004,
      output: 0.02,
      cachedInput: 0.0002,
    },
    // Claude Opus 5 — $5 / MTok input, $25 / MTok output
    'claude-opus-5': {
      input: 0.005,
      output: 0.025,
    },
    // Claude Opus 4.8 — $5 / MTok input, $25 / MTok output
    'claude-opus-4-8': {
      input: 0.005,
      output: 0.025,
    },
    // Claude Opus 4.7 — $5 / MTok input, $25 / MTok output
    'claude-opus-4-7': {
      input: 0.005,
      output: 0.025,
    },
    // Claude Opus 4.6 — $5 / MTok input, $25 / MTok output
    'claude-opus-4-6': {
      input: 0.005,
      output: 0.025,
    },
    // Claude Opus 4.5 — $5 / MTok input, $25 / MTok output
    'claude-opus-4-5-20251101': {
      input: 0.005,
      output: 0.025,
    },
    // Claude Sonnet 5.5 — $2 / MTok input, $10 / MTok output
    'claude-sonnet-5-5': {
      input: 0.002,
      output: 0.01,
    },
    // Claude Sonnet 5 — $2 / MTok input, $10 / MTok output (standard pricing)
    'claude-sonnet-5': {
      input: 0.002,
      output: 0.01,
    },
    // Claude Sonnet 4.6 — $3 / MTok input, $15 / MTok output
    'claude-sonnet-4-6': {
      input: 0.003,
      output: 0.015,
    },
    // Claude Sonnet 4.5 — $3 / MTok input, $15 / MTok output
    'claude-sonnet-4-5-20250929': {
      input: 0.003,
      output: 0.015,
    },
    // Claude Haiku 5.5 — $0.10 / MTok input, $0.50 / MTok output
    // (prompts up to 100K tokens; $0.50 / $2.50 beyond — not modeled here)
    'claude-haiku-5-5': {
      input: 0.0001,
      output: 0.0005,
    },
    // Claude Haiku 4.5 — $1 / MTok input, $5 / MTok output
    'claude-haiku-4-5-20251001': {
      input: 0.001,
      output: 0.005,
    },
  },
  deepseek: {
    'deepseek-chat': {
      input: 0.00014,
      output: 0.00028,
    },
    'deepseek-reasoner': {
      input: 0.00055,
      output: 0.00219, // Update with actual Deepseek pricing
    },
  },
  openrouter: {
    'deepseek/deepseek-r1:free': {
      input: 0,
      output: 0,
    },
    'deepseek/deepseek-chat': {
      input: 0.00014,
      output: 0.00028,
    },
  },
  xai: {
    // Prices per 1M tokens divided by 1000 for per 1K tokens.
    // Short-context rates (<200k prompt tokens); at >=200k the whole request is
    // billed at 2x — not modeled here.
    // Grok 4.5+ series
    'grok-4.7': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.006, // $6.00 per million tokens output
    },
    'grok-4.6': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.006, // $6.00 per million tokens output
    },
    'grok-4.5': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.006, // $6.00 per million tokens output
    },
    // Grok 4.3 / 4.20 series
    'grok-4.3': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.0025, // $2.50 per million tokens output
    },
    'grok-4.20-0309-reasoning': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.0025, // $2.50 per million tokens output
    },
    'grok-4.20-0309-non-reasoning': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.0025, // $2.50 per million tokens output
    },
    'grok-4.20-multi-agent-0309': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.0025, // $2.50 per million tokens output
    },
    // Specialized coding model
    'grok-build-0.1': {
      input: 0.001, // $1.00 per million tokens input
      output: 0.002, // $2.00 per million tokens output
    },
    // Image generation (per image, not per token)
    'grok-imagine-image-2.0': {
      input: 0, // Text input has no cost
      output: 0.04, // $0.04 per image
    },
    'grok-imagine-image': {
      input: 0, // Text input has no cost
      output: 0.02, // $0.02 per image
    },
    // Retired May 15, 2026 — redirected requests are billed at grok-4.3 rates
    'grok-4-fast-reasoning': {
      input: 0.00125,
      output: 0.0025,
    },
    'grok-4-fast-non-reasoning': {
      input: 0.00125,
      output: 0.0025,
    },
    'grok-code-fast-1': {
      input: 0.00125,
      output: 0.0025,
    },
    'grok-3': {
      input: 0.00125,
      output: 0.0025,
    },
    // Legacy — no longer on xAI's model list; last published pricing
    'grok-4': {
      input: 0.003, // $3.00 per million tokens input
      output: 0.015, // $15.00 per million tokens output
    },
    'grok-3-mini': {
      input: 0.0003, // $0.30 per million tokens input
      output: 0.0005, // $0.50 per million tokens output
    },
  },
};

class OpenAIService {
  constructor(apiKey, provider = 'openai') {
    const configuration = {
      apiKey,
      baseURL: this.getBaseUrl(provider),
    };

    this.client = new OpenAI(configuration);
    this.provider = provider;

    // Claude completions go through Anthropic's native SDK: the OpenAI-compatible
    // endpoint ignores response_format and doesn't support prompt caching.
    if (provider.toLowerCase() === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey });
    }
  }

  getBaseUrl(provider) {
    switch (provider.toLowerCase()) {
      case 'deepseek':
        return 'https://api.deepseek.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'google':
        return 'https://generativelanguage.googleapis.com/v1beta/openai';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      case 'xai':
        return 'https://api.x.ai/v1';
      case 'openai':
      default:
        return 'https://api.openai.com/v1';
    }
  }

  calculateCost(model, promptTokens, completionTokens, cachedTokens = 0, cacheWriteTokens = 0) {
    console.log(this.provider);
    console.log(model);
    const pricing = PRICING[this.provider]?.[model];
    if (!pricing) {
      return 0;
    }

    // For OpenAI and Anthropic, cached tokens use the model's cachedInput rate, or
    // 10% of the normal input cost. Anthropic cache writes cost 1.25x input.
    let inputCost = (promptTokens / 1000) * pricing.input;
    if (
      (this.provider === 'openai' || this.provider === 'anthropic') &&
      (cachedTokens > 0 || cacheWriteTokens > 0)
    ) {
      // Calculate cost for non-cached tokens at full price
      const nonCachedTokens = promptTokens - cachedTokens - cacheWriteTokens;
      const nonCachedCost = (nonCachedTokens / 1000) * pricing.input;
      const cachedRate = pricing.cachedInput ?? pricing.input * 0.1;
      const cachedCost = (cachedTokens / 1000) * cachedRate;
      const cacheWriteCost = (cacheWriteTokens / 1000) * pricing.input * 1.25;
      inputCost = nonCachedCost + cachedCost + cacheWriteCost;
    }

    const outputCost = (completionTokens / 1000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Check if a model supports structured outputs
   * Supported on OpenAI gpt-4o-mini and later, and on Claude 4.5 and later
   * (via the native Anthropic SDK)
   */
  supportsStructuredOutputs(model) {
    if (this.provider === 'anthropic') {
      return ANTHROPIC_STRUCTURED_OUTPUT_MODELS.test(model || '');
    }
    if (this.provider !== 'openai') {
      return false;
    }

    // Models that support structured outputs
    const supportedModels = [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-5-pro',
      'gpt-5-chat-latest',
      'gpt-5-codex',
      'gpt-5.1',
      'gpt-5.1-chat-latest',
      'gpt-5.1-codex',
      'gpt-5.1-codex-max',
      'gpt-5.1-codex-mini',
      'gpt-5.2',
      'gpt-5.2-pro',
      'gpt-5.2-chat-latest',
      'gpt-5.3',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-pro',
      'gpt-5.4-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
    ];

    return supportedModels.includes(model);
  }

  /**
   * Reasoning-style models (o1/o3 family, "-pro" variants, and the gpt-5.6
   * family) only accept the default temperature (1) and reject any other
   * value with a 400 error. Newer Claude models (Fable, Mythos, Opus 4.7+,
   * Sonnet 5+, Haiku 5.5) behave the same way.
   */
  isFixedTemperatureModel(model) {
    if (!model) {
      return false;
    }
    if (this.provider === 'anthropic') {
      return ANTHROPIC_CURRENT_GEN_MODELS.test(model);
    }
    if (this.provider !== 'openai') {
      return false;
    }
    return (
      /^o\d(-|$)/i.test(model) ||
      /-pro$/i.test(model) ||
      /^gpt-5\.6(-|$)/i.test(model)
    );
  }

  /**
   * Detects the "Unsupported value: 'temperature' ... Only the default (1)
   * value is supported" style error so we can transparently retry without it.
   */
  isTemperatureUnsupportedError(error) {
    const msg = error?.message || '';
    return (
      /temperature/i.test(msg) &&
      (/does not support/i.test(msg) || /only the default/i.test(msg) || /unsupported_value/i.test(msg))
    );
  }

  mapParameters(parameters, model) {
    const mappedParams = { ...parameters };

    if ('max_tokens' in mappedParams) {
      mappedParams.max_completion_tokens = mappedParams.max_tokens;
      delete mappedParams.max_tokens;
    }

    if (!mappedParams.reasoning_effort) {
      delete mappedParams.reasoning_effort;
    }

    if (this.provider === 'google') {
      delete mappedParams.frequency_penalty;
      delete mappedParams.presence_penalty;
    }

    if (this.provider === 'xai') {
      delete mappedParams.frequency_penalty;
      delete mappedParams.presence_penalty;
    }

    if (this.isFixedTemperatureModel(model)) {
      delete mappedParams.temperature;
    }

    return mappedParams;
  }

  async generateCompletion(
    model,
    prompt,
    parameters,
    systemPrompt = null,
    responseFormat = null,
    extraOptions = {}
  ) {
    if (this.anthropicClient) {
      return this.generateAnthropicCompletion(
        model, prompt, parameters, systemPrompt, null, responseFormat, extraOptions
      );
    }

    const mappedParams = this.mapParameters(parameters, model);

    // Build messages array
    const messages = [];

    // Add system message if provided
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    // Add user message
    messages.push({ role: 'user', content: prompt });

    // Add structured output configuration if provided and supported
    const completionOptions = {
      model,
      messages,
      ...mappedParams,
      ...extraOptions, // Include extra options like prompt_cache_key
    };

    if (responseFormat && this.supportsStructuredOutputs(model)) {
      completionOptions.response_format = responseFormat;
    }

    // Diagnostic: log estimated prompt size so over-limit errors are traceable.
    const estChars = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
    if (estChars > 200_000) {
      const breakdown = messages.map(m => `${m.role}:${m.content?.length ?? 0}`).join(' ');
      console.warn(`[OpenAI] large prompt estimate=${estChars} chars model=${model} breakdown=${breakdown}`);
    }

    try {
      let completion;
      try {
        completion = await this.client.chat.completions.create(completionOptions);
      } catch (err) {
        // Fallback for models unknown to isFixedTemperatureModel that still reject a custom temperature.
        if (this.isTemperatureUnsupportedError(err) && 'temperature' in completionOptions) {
          delete completionOptions.temperature;
          completion = await this.client.chat.completions.create(completionOptions);
        } else {
          throw err;
        }
      }

      if (!completion.choices || completion.choices.length === 0) {
        throw new Error('No completion choices returned');
      }

      const usage = completion.usage;
      
      // Extract cached token information if available
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
      
      const cost = this.calculateCost(
        model,
        usage.prompt_tokens,
        usage.completion_tokens,
        cachedTokens
      );

      return {
        content: completion.choices[0].message.content,
        finish_reason: completion.choices[0].finish_reason,
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
          cached_tokens: cachedTokens,
          cost,
        },
      };
    } catch (error) {
      throw new Error(`${this.provider} API Error: ${error.message}`);
    }
  }

  async generateStreamingCompletion(
    model,
    prompt,
    parameters,
    systemPrompt = null,
    onChunk = null,
    responseFormat = null,
    extraOptions = {}
  ) {
    if (this.anthropicClient) {
      return this.generateAnthropicCompletion(
        model, prompt, parameters, systemPrompt, onChunk, responseFormat, extraOptions
      );
    }

    const mappedParams = this.mapParameters(parameters, model);

    // Build messages array
    const messages = [];

    // Add system message if provided
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    // Add user message
    messages.push({ role: 'user', content: prompt });

    // Add structured output configuration if provided and supported
    const streamOptions = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...mappedParams,
      ...extraOptions, // Include extra options like prompt_cache_key
    };

    if (responseFormat && this.supportsStructuredOutputs(model)) {
      streamOptions.response_format = responseFormat;
    }

    try {
      let stream;
      try {
        stream = await this.client.chat.completions.create(streamOptions);
      } catch (err) {
        // Fallback for models unknown to isFixedTemperatureModel that still reject a custom temperature.
        if (this.isTemperatureUnsupportedError(err) && 'temperature' in streamOptions) {
          delete streamOptions.temperature;
          stream = await this.client.chat.completions.create(streamOptions);
        } else {
          throw err;
        }
      }

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let cachedTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          if (onChunk) {
            onChunk(delta);
          }
        }

        // Collect usage info when available (usually in the last chunk)
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
          cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        }
      }

      // If usage wasn't provided in stream, estimate token counts
      if (promptTokens === 0 && completionTokens === 0) {
        // Estimate tokens: ~4 characters per token on average
        const promptText = messages.map(m => m.content).join(' ');
        promptTokens = Math.ceil(promptText.length / 4);
        completionTokens = Math.ceil(fullContent.length / 4);
      }

      const cost = this.calculateCost(model, promptTokens, completionTokens, cachedTokens);

      return {
        content: fullContent,
        finish_reason: 'stop',
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          cached_tokens: cachedTokens,
          cost,
        },
      };
    } catch (error) {
      throw new Error(`${this.provider} API Error: ${error.message}`);
    }
  }

  /**
   * Completion via Anthropic's native Messages API. Always streams (even when
   * onChunk is null) to avoid HTTP timeouts on large max_tokens, and returns the
   * same shape as the OpenAI-compatible path.
   */
  async generateAnthropicCompletion(
    model,
    prompt,
    parameters = {},
    systemPrompt = null,
    onChunk = null,
    responseFormat = null,
    extraOptions = {}
  ) {
    const params = {
      model,
      max_tokens: parameters.max_tokens || parameters.max_completion_tokens || 16000,
      messages: [{ role: 'user', content: this.toAnthropicContent(prompt) }],
    };

    if (systemPrompt && systemPrompt.trim()) {
      params.system = systemPrompt.trim();
    }

    // Native API rejects temperature > 1; current-gen models reject anything but the default.
    if (parameters.temperature != null && !this.isFixedTemperatureModel(model)) {
      params.temperature = Math.min(parameters.temperature, 1);
    }

    if (parameters.stop) {
      params.stop_sequences = [].concat(parameters.stop);
    }

    const outputConfig = {};
    const effort = this.toAnthropicEffort(model, parameters.reasoning_effort);
    if (effort) {
      outputConfig.effort = effort;
    }

    // Free-form objects in the schema are requested as JSON strings; these are
    // the paths to decode back into objects once the response arrives.
    const jsonStringPaths = [];
    if (responseFormat?.json_schema?.schema && this.supportsStructuredOutputs(model)) {
      outputConfig.format = {
        type: 'json_schema',
        schema: this.toAnthropicSchema(responseFormat.json_schema.schema, [], jsonStringPaths),
      };
    }

    if (Object.keys(outputConfig).length > 0) {
      params.output_config = outputConfig;
    }

    // Callers pass prompt_cache_key for stable, repeated prompts — enable automatic caching.
    if (extraOptions.prompt_cache_key) {
      params.cache_control = { type: 'ephemeral' };
    }

    // Retry safety-classifier refusals on Anthropic's recommended fallback model.
    let messagesApi = this.anthropicClient.messages;
    if (ANTHROPIC_FALLBACK_MODELS.test(model)) {
      params.betas = [ANTHROPIC_FALLBACK_BETA];
      params.fallbacks = 'default';
      messagesApi = this.anthropicClient.beta.messages;
    }

    try {
      const stream = messagesApi.stream(params);
      if (onChunk) {
        stream.on('text', onChunk);
      }
      const message = await stream.finalMessage();

      if (message.stop_reason === 'refusal') {
        console.warn(
          `[Anthropic] ${model} declined the request (category=${message.stop_details?.category ?? 'unknown'})`
        );
      }

      const text = message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      const usage = message.usage;
      const cachedTokens = usage.cache_read_input_tokens || 0;
      const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
      const promptTokens = usage.input_tokens + cachedTokens + cacheWriteTokens;
      const completionTokens = usage.output_tokens;

      return {
        content: this.decodeJsonStringPaths(text, jsonStringPaths),
        finish_reason: ANTHROPIC_FINISH_REASONS[message.stop_reason] || 'stop',
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          cached_tokens: cachedTokens,
          // A fallback may have served the request, so price by the model that answered.
          cost: this.calculateCost(
            message.model || model,
            promptTokens,
            completionTokens,
            cachedTokens,
            cacheWriteTokens
          ),
        },
      };
    } catch (error) {
      throw new Error(`${this.provider} API Error: ${error.message}`);
    }
  }

  /**
   * One step of a native tool-calling loop. `tools` are provider-neutral
   * { name, description, parameters } definitions. `rounds` replays the earlier
   * steps of the same turn as { assistantMessage, results: [{ id, content, is_error }] },
   * where assistantMessage is exactly what a previous call returned (kept
   * provider-native so reasoning/signature fields survive the round trip).
   *
   * @returns {Promise<{content: string, tool_calls: Array<{id: string, name: string, arguments: string}>,
   *   assistantMessage: Object, finish_reason: string, usage: Object}>}
   *   tool_calls[].arguments is the model's raw JSON string.
   */
  async generateToolCompletion(
    model,
    prompt,
    tools,
    rounds = [],
    parameters = {},
    systemPrompt = null,
    extraOptions = {}
  ) {
    if (this.anthropicClient) {
      return this.generateAnthropicToolCompletion(
        model, prompt, tools, rounds, parameters, systemPrompt, extraOptions
      );
    }

    const messages = [];
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }
    messages.push({ role: 'user', content: prompt });
    for (const round of rounds) {
      messages.push(round.assistantMessage);
      for (const result of round.results) {
        messages.push({ role: 'tool', tool_call_id: result.id, content: result.content });
      }
    }

    const completionOptions = {
      model,
      messages,
      tools: tools.map(tool => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
      tool_choice: 'auto',
      ...this.mapParameters(parameters, model),
      ...extraOptions,
    };

    try {
      let completion;
      try {
        completion = await this.client.chat.completions.create(completionOptions);
      } catch (err) {
        if (this.isTemperatureUnsupportedError(err) && 'temperature' in completionOptions) {
          delete completionOptions.temperature;
          completion = await this.client.chat.completions.create(completionOptions);
        } else {
          throw err;
        }
      }

      if (!completion.choices || completion.choices.length === 0) {
        throw new Error('No completion choices returned');
      }

      const message = completion.choices[0].message;
      // Some OpenAI-compatible providers omit tool call ids; assign stable ones so
      // the tool results we send back can reference them.
      const rawCalls = (message.tool_calls || []).map((call, i) => ({
        ...call,
        id: call.id || `call_${rounds.length}_${i}`,
      }));
      const assistantMessage = rawCalls.length > 0 ? { ...message, tool_calls: rawCalls } : message;

      const usage = completion.usage;
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;

      return {
        content: message.content || '',
        tool_calls: rawCalls.map(call => ({
          id: call.id,
          name: call.function?.name,
          arguments: call.function?.arguments || '{}',
        })),
        assistantMessage,
        finish_reason: completion.choices[0].finish_reason,
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
          cached_tokens: cachedTokens,
          cost: this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens, cachedTokens),
        },
      };
    } catch (error) {
      throw new Error(`${this.provider} API Error: ${error.message}`);
    }
  }

  /** Anthropic variant of generateToolCompletion (native Messages API tool use). */
  async generateAnthropicToolCompletion(
    model,
    prompt,
    tools,
    rounds = [],
    parameters = {},
    systemPrompt = null,
    extraOptions = {}
  ) {
    const messages = [{ role: 'user', content: this.toAnthropicContent(prompt) }];
    for (const round of rounds) {
      messages.push(round.assistantMessage);
      messages.push({
        role: 'user',
        content: round.results.map(result => ({
          type: 'tool_result',
          tool_use_id: result.id,
          content: result.content,
          ...(result.is_error && { is_error: true }),
        })),
      });
    }

    const params = {
      model,
      max_tokens: parameters.max_tokens || parameters.max_completion_tokens || 16000,
      messages,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      })),
    };

    if (systemPrompt && systemPrompt.trim()) {
      params.system = systemPrompt.trim();
    }
    if (parameters.temperature != null && !this.isFixedTemperatureModel(model)) {
      params.temperature = Math.min(parameters.temperature, 1);
    }
    if (parameters.stop) {
      params.stop_sequences = [].concat(parameters.stop);
    }
    const effort = this.toAnthropicEffort(model, parameters.reasoning_effort);
    if (effort) {
      params.output_config = { effort };
    }
    if (extraOptions.prompt_cache_key) {
      params.cache_control = { type: 'ephemeral' };
    }

    let messagesApi = this.anthropicClient.messages;
    if (ANTHROPIC_FALLBACK_MODELS.test(model)) {
      params.betas = [ANTHROPIC_FALLBACK_BETA];
      params.fallbacks = 'default';
      messagesApi = this.anthropicClient.beta.messages;
    }

    try {
      const message = await messagesApi.stream(params).finalMessage();

      const usage = message.usage;
      const cachedTokens = usage.cache_read_input_tokens || 0;
      const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
      const promptTokens = usage.input_tokens + cachedTokens + cacheWriteTokens;
      const completionTokens = usage.output_tokens;

      return {
        content: message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join(''),
        tool_calls: message.content
          .filter(block => block.type === 'tool_use')
          .map(block => ({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) })),
        assistantMessage: { role: 'assistant', content: message.content },
        finish_reason: ANTHROPIC_FINISH_REASONS[message.stop_reason] || 'stop',
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          cached_tokens: cachedTokens,
          cost: this.calculateCost(
            message.model || model,
            promptTokens,
            completionTokens,
            cachedTokens,
            cacheWriteTokens
          ),
        },
      };
    } catch (error) {
      throw new Error(`${this.provider} API Error: ${error.message}`);
    }
  }

  /** Convert OpenAI-style content parts (text / image_url) to Anthropic content blocks. */
  toAnthropicContent(prompt) {
    if (!Array.isArray(prompt)) {
      return prompt;
    }
    return prompt.map(part => {
      if (part.type !== 'image_url') {
        return part; // text parts share the same shape
      }
      const url = part.image_url?.url || '';
      const dataUrl = url.match(/^data:([^;]+);base64,(.*)$/s);
      return dataUrl
        ? { type: 'image', source: { type: 'base64', media_type: dataUrl[1], data: dataUrl[2] } }
        : { type: 'image', source: { type: 'url', url } };
    });
  }

  /** Map the agent's reasoning_effort onto the levels each Claude model accepts. */
  toAnthropicEffort(model, reasoningEffort) {
    if (!reasoningEffort || !ANTHROPIC_EFFORT_MODELS.test(model)) {
      return null;
    }
    if (reasoningEffort === 'none' || reasoningEffort === 'minimal') {
      return 'low';
    }
    if (reasoningEffort === 'xhigh' && !ANTHROPIC_CURRENT_GEN_MODELS.test(model)) {
      return 'high';
    }
    return reasoningEffort;
  }

  /**
   * Convert an OpenAI-style JSON schema into one Claude structured outputs accept:
   * every object needs additionalProperties: false and type arrays become anyOf.
   * Free-form objects (no properties, e.g. tool_parameters) can't be expressed, so
   * they are requested as JSON-encoded strings and their paths recorded in
   * jsonStringPaths for decodeJsonStringPaths.
   */
  toAnthropicSchema(node, path = [], jsonStringPaths = []) {
    if (!node || typeof node !== 'object') {
      return node;
    }

    if (Array.isArray(node.type)) {
      const { type, description, ...rest } = node;
      return {
        ...(description && { description }),
        anyOf: type.map(t => this.toAnthropicSchema({ ...rest, type: t }, path, jsonStringPaths)),
      };
    }

    if (node.type === 'object') {
      const entries = Object.entries(node.properties || {});
      if (entries.length === 0 && path.length > 0) {
        jsonStringPaths.push(path);
        return {
          type: 'string',
          description: `${node.description ? `${node.description} ` : ''}Encode as a JSON object string.`,
        };
      }
      return {
        ...node,
        properties: Object.fromEntries(
          entries.map(([key, value]) => [
            key,
            this.toAnthropicSchema(value, [...path, key], jsonStringPaths),
          ])
        ),
        additionalProperties: false,
      };
    }

    if (node.type === 'array' && node.items) {
      return {
        ...node,
        items: this.toAnthropicSchema(node.items, [...path, '[]'], jsonStringPaths),
      };
    }

    return node;
  }

  /** Decode the JSON-string fields recorded by toAnthropicSchema back into objects. */
  decodeJsonStringPaths(text, jsonStringPaths) {
    if (jsonStringPaths.length === 0) {
      return text;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text;
    }

    const decodeAt = (container, path) => {
      if (!container || typeof container !== 'object') {
        return;
      }
      const [head, ...rest] = path;
      const keys = head === '[]' ? [...container.keys?.() ?? []] : [head];
      for (const key of keys) {
        if (rest.length > 0) {
          decodeAt(container[key], rest);
        } else if (typeof container[key] === 'string') {
          try {
            container[key] = JSON.parse(container[key]);
          } catch {
            // Leave the raw string; callers already handle bad tool parameters.
          }
        }
      }
    };

    jsonStringPaths.forEach(path => decodeAt(parsed, path));
    return JSON.stringify(parsed);
  }

  async createEmbedding(options) {
    const { model = 'text-embedding-3-small', input } = options;

    if (!input) {
      throw new Error('Input text is required for embedding');
    }

    try {
      const response = await this.client.embeddings.create({
        model,
        input,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned');
      }

      return {
        data: response.data,
        model: response.model,
        usage: response.usage,
      };
    } catch (error) {
      throw new Error(`${this.provider} Embedding API Error: ${error.message}`);
    }
  }
}

module.exports = OpenAIService;
