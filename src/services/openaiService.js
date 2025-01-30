const OpenAI = require('openai');

// Price per 1K tokens (as of current OpenAI pricing)
const OPENAI_PRICING = {
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
};

class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  calculateCost(model, promptTokens, completionTokens) {
    const pricing = OPENAI_PRICING[model];
    if (!pricing) return 0;

    const inputCost = (promptTokens / 1000) * pricing.input;
    const outputCost = (completionTokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }

  async generateCompletion(model, prompt, parameters) {
    try {
      const completion = await this.client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        ...parameters
      });

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
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }
}

module.exports = OpenAIService;
