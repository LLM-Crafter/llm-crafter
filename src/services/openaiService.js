const OpenAI = require('openai');

// Price per 1K tokens (as of current OpenAI pricing)
const PRICING = {
  openai: {
    'gpt-5': {
      input: 0.00125, // $1.25 per million tokens input
      output: 0.01, // $10 per million tokens output
    },
    'gpt-5-mini': {
      input: 0.00025, // $0.25 per million tokens input
      output: 0.002, // $2 per million tokens output
    },
    'gpt-5-nano': {
      input: 0.00005, // $0.05 per million tokens input
      output: 0.0004, // $0.40 per million tokens output
    },
    'gpt-5-chat-latest': {
      input: 0.00125,
      output: 0.01,
    },
    'gpt-4o': {
      input: 0.0025, // $2.50 per million tokens input
      output: 0.01, // $10 per million tokens output
    },
    'gpt-4o-mini': {
      input: 0.00015, // $0.15 per million tokens input
      output: 0.0006, // $0.60 per million tokens output
    },
    'gpt-4-turbo': {
      input: 0.01, // $10 per million tokens input
      output: 0.03, // $30 per million tokens output
    },
    'gpt-4.1': {
      input: 0.002, // $2.00 per million tokens input
      output: 0.008, // $8 per million tokens output
    },
    'gpt-4.1-mini': {
      input: 0.0004, // $0.40 per million tokens input
      output: 0.0016, // $1.60 per million tokens output
    },
    'gpt-4.1-nano': {
      input: 0.0001, // $0.10 per million tokens input
      output: 0.0004, // $0.40 per million tokens output
    },
    o3: {
      input: 0.002, // $2 per million tokens input
      output: 0.008, // $8 per million tokens output
    },
    'o3-pro': {
      input: 0.02, // $20 per million tokens input
      output: 0.08, // $80 per million tokens output
    },
    'o3-deep-research': {
      input: 0.01, // $10 per million tokens input
      output: 0.04, // $40 per million tokens output
    },
    'o3-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    'o4-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    'o4-mini-deep-research': {
      input: 0.002, // $2 per million tokens input
      output: 0.008, // $8 per million tokens output
    },
    o1: {
      input: 0.015, // $15 per million tokens input
      output: 0.06, // $60 per million tokens output
    },
    'o1-mini': {
      input: 0.0011, // $1.10 per million tokens input
      output: 0.0044, // $4.40 per million tokens output
    },
    'codex-mini-latest': {
      input: 0.0015, // $1.50 per million tokens input
      output: 0.006, // $6 per million tokens output
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
    'claude-opus-4-1': {
      input: 15.0, // $15 per million input tokens
      output: 75.0, // $75 per million output tokens
    },
    'claude-opus-4': {
      input: 15.0,
      output: 75.0,
    },
    'claude-sonnet-4': {
      input: 3.0, // $3 per million input tokens
      output: 15.0, // $15 per million output tokens
    },
    'claude-3-5-sonnet': {
      input: 3.0, // $3 per million input tokens
      output: 15.0, // $15 per million output tokens
    },
    'claude-3-5-haiku': {
      input: 0.8, // $0.80 per million input tokens
      output: 4.0, // $4 per million output tokens
    },
    'claude-3-opus': {
      input: 15.0,
      output: 75.0,
    },
    'claude-3-sonnet': {
      input: 3.0,
      output: 15.0,
    },
    'claude-3-haiku': {
      input: 0.8,
      output: 4.0,
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
