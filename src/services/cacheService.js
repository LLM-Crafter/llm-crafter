const crypto = require('crypto');
const PromptCache = require('../models/PromptCache');

class CacheService {
  generateHash(prompt, content, variables, llmSettings, systemPrompt = null) {
    // Create a string containing all relevant parameters
    const dataToHash = JSON.stringify({
      prompt_id: prompt._id,
      content,
      system_prompt: systemPrompt,
      variables,
      model: llmSettings.model,
      parameters: llmSettings.parameters,
    });

    // Create SHA-256 hash
    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }

  async getCachedResult(hash) {
    const cached = await PromptCache.findOne({ hash });
    if (cached) {
      // Update hits and last accessed
      await PromptCache.updateOne(
        { _id: cached._id },
        {
          $inc: { hits: 1 },
          $set: { last_accessed: new Date() },
        }
      );
      return cached;
    }
    return null;
  }

  async cacheResult(hash, promptId, result, usage, metadata) {
    const cached = new PromptCache({
      hash,
      prompt: promptId,
      result,
      usage,
      metadata,
    });
    await cached.save();
    return cached;
  }
}

module.exports = new CacheService();
