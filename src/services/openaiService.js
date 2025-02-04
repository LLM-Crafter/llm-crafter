const OpenAI = require('openai');

// Price per 1K tokens (as of current OpenAI pricing)
const PRICING  = {
    'openai': {
        'gpt-4o': {
            input: 0.0025,    
            output: 0.01   
        },
        'gpt-4o-mini': {
            input: 0.00015,  
            output: 0.0006 
        },
        'o1': {
            input: 0.015,  
            output: 0.06  
        },
        'o1-mini': {
          input: 0.0011,  
          output: 0.0044
      },
      'o3-mini': {
        input: 0.0011,  
        output: 0.0044  
    },
    },
    'deepseek': {
        'deepseek-chat': {
            input: 0.00014,   
            output: 0.00028 
        },
        'deepseek-reasoner': {
        input: 0.00055,   
        output: 0.00219   // Update with actual Deepseek pricing
        }
  },
  'openrouter': {
        'deepseek/deepseek-r1:free': {
            input: 0,   
            output: 0
        },
        'deepseek/deepseek-chat': {
            input: 0.00014,   
            output: 0.00028 
        },
  }
};

class OpenAIService {
    constructor(apiKey, provider = 'openai') {
      const configuration = {
        apiKey,
        baseURL: this.getBaseUrl(provider)
      };
      
      this.client = new OpenAI(configuration);
      this.provider = provider;
    }
  
    getBaseUrl(provider) {
      switch(provider.toLowerCase()) {
        case 'deepseek':
          return 'https://api.deepseek.com/v1';
        case 'openrouter':
            return 'https://openrouter.ai/api/v1';
        case 'openai':
        default:
          return 'https://api.openai.com/v1';
      }
    }
  
    calculateCost(model, promptTokens, completionTokens) {
      const pricing = PRICING[this.provider]?.[model];
      if (!pricing) return 0;
  
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
  
      return mappedParams;
    }
  
    async generateCompletion(model, prompt, parameters) {
      const mappedParams = this.mapParameters(parameters);

      try {
        const completion = await this.client.chat.completions.create({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          ...mappedParams
        });

        if (!completion.choices || completion.choices.length === 0) {
          throw new Error('No completion choices returned');
        }
  
        const usage = completion.usage;
        const cost = this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens);
  
        return {
          content: completion.choices[0].message.content,
          finish_reason: completion.choices[0].finish_reason,
          usage: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            cost
          }
        };
      } catch (error) {
        throw new Error(`${this.provider} API Error: ${error.message}`);
      }
    }
  }
  
  module.exports = OpenAIService;