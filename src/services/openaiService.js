const OpenAI = require('openai');

// Price per 1K tokens (as of current OpenAI pricing)
const PRICING = {
  openai: {
    'gpt-5.2': {
      input: 0.00175, // $1.75 per million tokens input
      output: 0.014, // $14.00 per million tokens output
    },
    'gpt-5.2-pro': {
      input: 0.021, // $21.00 per million tokens input
      output: 0.168, // $168.00 per million tokens output
    },
    'gpt-5.2-chat-latest': {
      input: 0.00175, // $1.75 per million tokens input
      output: 0.014, // $14.00 per million tokens output
    },
    'gpt-5.1': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-5.1-chat-latest': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-5.1-codex': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-5.1-codex-max': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-5.1-codex-mini': {
      input: 0.00025, // $0.25 per million tokens input
      output: 0.002, // $2.00 per million tokens output
    },
    'gpt-5': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-5-codex': {
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
    'gpt-5-chat-latest': {
      input: 0.00125,
      output: 0.01,
    },
    'gpt-4o': {
      input: 0.0025, // $2.50 per million tokens input
      output: 0.01, // $10.00 per million tokens output
    },
    'gpt-4o-mini': {
      input: 0.00015, // $0.15 per million tokens input
      output: 0.0006, // $0.60 per million tokens output
    },
    'gpt-4-turbo': {
      input: 0.01, // $10.00 per million tokens input
      output: 0.03, // $30.00 per million tokens output
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
    'o4-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    o3: {
      input: 0.002, // $2.00 per million tokens input
      output: 0.008, // $8.00 per million tokens output
    },
    'o3-pro': {
      input: 0.02, // $20.00 per million tokens input
      output: 0.08, // $80.00 per million tokens output
    },
    'o3-deep-research': {
      input: 0.01, // $10.00 per million tokens input
      output: 0.04, // $40.00 per million tokens output
    },
    'o3-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    'o1-pro': {
      input: 0.15, // $150.00 per million tokens input
      output: 0.6, // $600.00 per million tokens output
    },
    'o4-mini-deep-research': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.008, // $8.00 per million tokens output
    },
    o1: {
      input: 0.015, // $15.00 per million tokens input
      output: 0.06, // $60.00 per million tokens output
    },
    'o1-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    'codex-mini-latest': {
      input: 0.0015, // $1.50 per million tokens input
      output: 0.006, // $6.00 per million tokens output
    },
    'gpt-oss-120b': {
      input: 0, // Free/open-weight models with no pricing info available
      output: 0,
    },
    'gpt-oss-20b': {
      input: 0,
      output: 0,
    },
  },
  anthropic: {
    // Claude Opus 4.1
    'claude-opus-4-1': {
      input: 0.015, // $15 per million input tokens
      output: 0.075, // $75 per million output tokens
    },
    // Claude Sonnet 4.5 (≤ 200K context)
    'claude-sonnet-4-5': {
      input: 0.003, // $3 per million input tokens
      output: 0.015, // $15 per million output tokens
    },
    // Claude Sonnet 4.5 (> 200K context)
    'claude-sonnet-4-5-long': {
      input: 0.006, // $6 per million input tokens
      output: 0.0225, // $22.50 per million output tokens
    },
    // Claude Haiku 4.5
    'claude-haiku-4-5': {
      input: 0.001, // $1 per million input tokens
      output: 0.005, // $5 per million output tokens
    },
    // Legacy/compatibility (fallback to Haiku/Sonnet pricing)
    'claude-opus-4': {
      input: 0.015,
      output: 0.075,
    },
    'claude-sonnet-4': {
      input: 0.003,
      output: 0.015,
    },
    'claude-3-5-sonnet': {
      input: 0.003,
      output: 0.015,
    },
    'claude-3-5-haiku': {
      input: 0.001,
      output: 0.005,
    },
    'claude-3-opus': {
      input: 0.015,
      output: 0.075,
    },
    'claude-3-sonnet': {
      input: 0.003,
      output: 0.015,
    },
    'claude-3-haiku': {
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
    // Grok 4 series (prices per 1M tokens divided by 1000 for per 1K tokens)
    'grok-4': {
      input: 0.003, // $3.00 per million tokens input
      output: 0.015, // $15.00 per million tokens output
    },
    'grok-4-fast-reasoning': {
      input: 0.0002, // $0.20 per million tokens input
      output: 0.0005, // $0.50 per million tokens output
    },
    'grok-4-fast-non-reasoning': {
      input: 0.0002, // $0.20 per million tokens input
      output: 0.0005, // $0.50 per million tokens output
    },
    // Specialized coding model
    'grok-code-fast-1': {
      input: 0.0002, // $0.20 per million tokens input
      output: 0.0015, // $1.50 per million tokens output
    },
    // Grok 3 series
    'grok-3': {
      input: 0.003, // $3.00 per million tokens input
      output: 0.015, // $15.00 per million tokens output
    },
    'grok-3-mini': {
      input: 0.0003, // $0.30 per million tokens input
      output: 0.0005, // $0.50 per million tokens output
    },
    // Image generation (per image, not per token)
    'grok-2-image-1212': {
      input: 0, // Text input has no cost
      output: 0.07, // $0.07 per image
    },
    // Grok 2 series (using Grok 3 pricing as fallback)
    'grok-2': {
      input: 0.003,
      output: 0.015,
    },
    'grok-2-1212': {
      input: 0.003,
      output: 0.015,
    },
    'grok-2-mini': {
      input: 0.0003,
      output: 0.0005,
    },
    // Grok 1.5 series (using Grok 3 pricing as fallback)
    'grok-1.5': {
      input: 0.003,
      output: 0.015,
    },
    'grok-1.5-vision': {
      input: 0.003,
      output: 0.015,
    },
    // Grok 1 series (legacy, using Grok 3 pricing as fallback)
    'grok-1': {
      input: 0.003,
      output: 0.015,
    },
    // Beta models (using Grok 3 pricing as fallback)
    'grok-beta': {
      input: 0.003,
      output: 0.015,
    },
    'grok-vision-beta': {
      input: 0.003,
      output: 0.015,
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

  calculateCost(model, promptTokens, completionTokens) {
    console.log(this.provider);
    console.log(model);
    const pricing = PRICING[this.provider]?.[model];
    if (!pricing) {
      return 0;
    }

    const inputCost = (promptTokens / 1000) * pricing.input;
    const outputCost = (completionTokens / 1000) * pricing.output;

    return inputCost + outputCost;
  }

  mapParameters(parameters) {
    const mappedParams = { ...parameters };

    if ('max_tokens' in mappedParams) {
      mappedParams.max_completion_tokens = mappedParams.max_tokens;
      delete mappedParams.max_tokens;
    }

    if (this.provider === 'google') {
      delete mappedParams.frequency_penalty;
      delete mappedParams.presence_penalty;
    }

    if (this.provider === 'xai') {
      delete mappedParams.frequency_penalty;
      delete mappedParams.presence_penalty;
    }

    return mappedParams;
  }

  async generateCompletion(model, prompt, parameters, systemPrompt = null) {
    const mappedParams = this.mapParameters(parameters);

    // Build messages array
    const messages = [];

    // Add system message if provided
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    // Add user message
    messages.push({ role: 'user', content: prompt });

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages,
        ...mappedParams,
      });

      if (!completion.choices || completion.choices.length === 0) {
        throw new Error('No completion choices returned');
      }

      const usage = completion.usage;
      const cost = this.calculateCost(
        model,
        usage.prompt_tokens,
        usage.completion_tokens
      );

      return {
        content: completion.choices[0].message.content,
        finish_reason: completion.choices[0].finish_reason,
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
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
    onChunk = null
  ) {
    const mappedParams = this.mapParameters(parameters);

    // Build messages array
    const messages = [];

    // Add system message if provided
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    // Add user message
    messages.push({ role: 'user', content: prompt });

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...mappedParams,
      });

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

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
        }
      }

      // If usage wasn't provided in stream, estimate token counts
      if (promptTokens === 0 && completionTokens === 0) {
        // Estimate tokens: ~4 characters per token on average
        const promptText = messages.map(m => m.content).join(' ');
        promptTokens = Math.ceil(promptText.length / 4);
        completionTokens = Math.ceil(fullContent.length / 4);
      }

      const cost = this.calculateCost(model, promptTokens, completionTokens);

      return {
        content: fullContent,
        finish_reason: 'stop',
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          cost,
        },
      };
    } catch (error) {
      throw new Error(`${this.provider} API Error: ${error.message}`);
    }
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
