const Prompt = require("../models/Prompt");
const APIKey = require("../models/ApiKey");
const PromptExecution = require("../models/PromptExecution");
const OpenAIService = require("../services/openaiService");
const cacheService = require("../services/cacheService");
const Mustache = require("mustache");

const testPrompt = async (req, res) => {
  try {
    // Assume all data is in body: { content, system_prompt, llm_settings, api_key_id, variables }
    const { content, system_prompt, llm_settings, api_key_id, variables } =
      req.body;

    if (!content) {
      return res.status(400).json({ error: "Prompt content is required" });
    }

    if (!api_key_id) {
      return res.status(400).json({ error: "API key ID is required" });
    }

    if (!llm_settings || !llm_settings.model) {
      return res
        .status(400)
        .json({ error: "LLM settings with model required" });
    }

    // Fetch API key from database
    const apiKey = await APIKey.findById(api_key_id).populate("provider");

    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    if (!apiKey.is_active) {
      return res.status(400).json({ error: "API key is not active" });
    }

    // Get decrypted API key
    let decryptedKey;
    try {
      decryptedKey = apiKey.getDecryptedKey();
    } catch (error) {
      return res.status(500).json({ error: "Failed to decrypt API key" });
    }

    // Validate provider
    const supportedProviders = [
      "openai",
      "deepseek",
      "openrouter",
      "anthropic",
      "google",
    ];
    if (!supportedProviders.includes(apiKey.provider.name)) {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    // Mustache render
    const processedPrompt = Mustache.render(content, variables || {});
    const processedSystemPrompt = system_prompt
      ? Mustache.render(system_prompt, variables || {})
      : null;

    // No caching -- always live
    let result;
    if (
      apiKey.provider.name === "openai" ||
      apiKey.provider.name === "deepseek" ||
      apiKey.provider.name === "openrouter" ||
      apiKey.provider.name === "anthropic" ||
      apiKey.provider.name === "google"
    ) {
      const openai = new OpenAIService(decryptedKey, apiKey.provider.name);
      result = await openai.generateCompletion(
        llm_settings.model,
        processedPrompt,
        llm_settings.parameters, // can be undefined
        processedSystemPrompt
      );
    }

    // Respond -- no execution ID, not saved
    res.json({
      result: result.content,
      usage: result.usage,
      finish_reason: result.finish_reason,
      cached: false, // always false for tests
    });
  } catch (error) {
    console.error("Proxy test prompt error:", error);
    res
      .status(500)
      .json({ error: "Failed to test prompt", details: error.message });
  }
};

const executePrompt = async (req, res) => {
  let executionRecord;

  try {
    // Find prompt by name in the project
    const prompt = await Prompt.findOne({
      project: req.params.projectId,
      name: req.params.promptName,
    }).populate({
      path: "api_key",
      populate: {
        path: "provider",
      },
    });

    if (!prompt) {
      return res.status(404).json({ error: "Prompt not found" });
    }

    if (!prompt.content) {
      return res.status(400).json({ error: "Prompt content not configured" });
    }

    if (!prompt.api_key) {
      return res
        .status(400)
        .json({ error: "No API key configured for this prompt" });
    }

    // Get decrypted API key
    let decryptedApiKey;
    try {
      decryptedApiKey = prompt.api_key.getDecryptedKey();
    } catch (error) {
      return res.status(500).json({ error: "Failed to decrypt API key" });
    }

    // Verify provider is supported
    const supportedProviders = ["openai", "deepseek", "openrouter"];
    if (!supportedProviders.includes(prompt.api_key.provider.name)) {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    // Replace variables in prompt template
    const processedPrompt = Mustache.render(
      prompt.content,
      req.body.variables || {}
    );

    // Replace variables in system prompt template if it exists
    const processedSystemPrompt = prompt.system_prompt
      ? Mustache.render(prompt.system_prompt, req.body.variables || {})
      : null;

    // Generate cache hash
    const hash = cacheService.generateHash(
      prompt,
      processedPrompt,
      req.body.variables,
      prompt.llm_settings,
      processedSystemPrompt
    );

    // Check cache
    const cached = await cacheService.getCachedResult(hash);
    let result;

    if (cached) {
      // Use cached result
      result = {
        content: cached.result,
        finish_reason: cached.metadata.finish_reason,
        usage: cached.usage,
        cached: true,
      };
    } else {
      // Execute the prompt
      if (
        prompt.api_key.provider.name == "openai" ||
        prompt.api_key.provider.name == "deepseek" ||
        prompt.api_key.provider.name == "openrouter"
      ) {
        const openai = new OpenAIService(
          decryptedApiKey,
          prompt.api_key.provider.name
        );
        result = await openai.generateCompletion(
          prompt.llm_settings.model,
          processedPrompt,
          prompt.llm_settings.parameters,
          processedSystemPrompt
        );
      }

      // Cache the result
      await cacheService.cacheResult(
        hash,
        prompt._id,
        result.content,
        result.usage,
        {
          model: prompt.llm_settings.model,
          finish_reason: result.finish_reason,
        }
      );
    }

    if (cached) {
      result = {
        content: cached.result,
        finish_reason: cached.metadata.finish_reason,
        usage: cached.usage,
        cached: true,
      };

      executionRecord = new PromptExecution({
        prompt: prompt._id,
        project: req.params.projectId,
        api_key: prompt.api_key._id,
        metadata: {
          model: prompt.llm_settings.model,
          finish_reason: result.finish_reason,
        },
        status: "cached",
        usage: {
          ...result.usage,
          cost: 0, // Set cost to 0 for cached results
        },
      });
    } else {
      executionRecord = new PromptExecution({
        prompt: prompt._id,
        project: req.params.projectId,
        api_key: prompt.api_key._id,
        metadata: {
          model: prompt.llm_settings.model,
          finish_reason: result.finish_reason,
        },
        status: "success",
        usage: result.usage,
      });
    }

    await executionRecord.save();

    // Only update API key usage if not cached
    if (!result.cached) {
      await APIKey.findByIdAndUpdate(prompt.api_key._id, {
        $inc: {
          "usage.total_tokens": result.usage.total_tokens,
          "usage.total_cost": result.usage.cost,
        },
        $push: {
          "usage.usage_by_model": {
            model: prompt.llm_settings.model,
            input_tokens: result.usage.prompt_tokens,
            output_tokens: result.usage.completion_tokens,
            cost: result.usage.cost,
          },
        },
      });
    }

    res.json({
      execution_id: executionRecord._id,
      result: result.content,
      usage: result.usage,
      cached: result.cached || false,
    });
  } catch (error) {
    if (executionRecord) {
      executionRecord.status = "error";
      executionRecord.error = {
        message: error.message,
        code: error.code,
      };
      await executionRecord.save();
    }

    console.error("Proxy execution error:", error);
    res.status(500).json({ error: "Failed to execute prompt" });
  }
};

const getPromptExecutions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const [executions, total] = await Promise.all([
      PromptExecution.find({
        prompt: req.params.promptId,
        project: req.params.projectId,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),

      PromptExecution.countDocuments({
        prompt: req.params.promptId,
        project: req.params.projectId,
      }),
    ]);

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      executions,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch execution history" });
  }
};

module.exports = {
  executePrompt,
  getPromptExecutions,
  testPrompt,
};
