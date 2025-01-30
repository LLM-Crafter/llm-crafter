const Prompt = require('../models/Prompt');
const APIKey = require('../models/ApiKey');
const PromptExecution = require('../models/PromptExecution');
const OpenAIService = require('../services/openaiService');
const cacheService = require('../services/cacheService');
const Mustache = require('mustache');

const executePrompt = async (req, res) => {
  let executionRecord;

  try {
    // Find prompt by name in the project
    const prompt = await Prompt.findOne({
      project: req.params.projectId,
      name: req.params.promptName
    }).populate({
      path: 'api_key',
      populate: {
        path: 'provider'
      }
    });

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    if (!prompt.content) {
      return res.status(400).json({ error: 'Prompt content not configured' });
    }

    if (!prompt.api_key) {
      return res.status(400).json({ error: 'No API key configured for this prompt' });
    }

    // Verify provider is OpenAI
    if (prompt.api_key.provider.name !== 'openai') {
      return res.status(400).json({ error: 'Only OpenAI provider is supported currently' });
    }

    // Replace variables in prompt template
    const processedPrompt = Mustache.render(prompt.content, req.body.variables || {});

    // Generate cache hash
    const hash = cacheService.generateHash(
      prompt,
      processedPrompt,
      req.body.variables,
      prompt.llm_settings
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
        cached: true
      };
    } else {
      // Execute the prompt
      const openai = new OpenAIService(prompt.api_key.key);
      result = await openai.generateCompletion(
        prompt.llm_settings.model,
        processedPrompt,
        prompt.llm_settings.parameters
      );

      // Cache the result
      await cacheService.cacheResult(
        hash,
        prompt._id,
        result.content,
        result.usage,
        {
          model: prompt.llm_settings.model,
          finish_reason: result.finish_reason
        }
      );
    }

    if (cached) {
        result = {
          content: cached.result,
          finish_reason: cached.metadata.finish_reason,
          usage: cached.usage,
          cached: true
        };
        
        executionRecord = new PromptExecution({
          prompt: prompt._id,
          project: req.params.projectId,
          api_key: prompt.api_key._id,
          metadata: {
            model: prompt.llm_settings.model,
            finish_reason: result.finish_reason
          },
          status: 'cached',
          usage: {
            ...result.usage,
            cost: 0  // Set cost to 0 for cached results
          }
        });
      } else {
            executionRecord = new PromptExecution({
            prompt: prompt._id,
            project: req.params.projectId,
            api_key: prompt.api_key._id,
            metadata: {
                model: prompt.llm_settings.model,
                finish_reason: result.finish_reason
            },
            status: 'success',
            usage: result.usage
            });
      }

    await executionRecord.save();

    // Only update API key usage if not cached
    if (!result.cached) {
      await APIKey.findByIdAndUpdate(prompt.api_key._id, {
        $inc: {
          'usage.total_tokens': result.usage.total_tokens,
          'usage.total_cost': result.usage.cost
        },
        $push: {
          'usage.usage_by_model': {
            model: prompt.llm_settings.model,
            input_tokens: result.usage.prompt_tokens,
            output_tokens: result.usage.completion_tokens,
            cost: result.usage.cost
          }
        }
      });
    }

    res.json({
      execution_id: executionRecord._id,
      result: result.content,
      usage: result.usage,
      cached: result.cached || false
    });

  } catch (error) {
    if (executionRecord) {
      executionRecord.status = 'error';
      executionRecord.error = {
        message: error.message,
        code: error.code
      };
      await executionRecord.save();
    }

    console.error('Proxy execution error:', error);
    res.status(500).json({ error: 'Failed to execute prompt' });
  }
};

const getPromptExecutions = async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;
  
      const [executions, total] = await Promise.all([
        PromptExecution.find({
          prompt: req.params.promptId,
          project: req.params.projectId
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
  
        PromptExecution.countDocuments({
          prompt: req.params.promptId,
          project: req.params.projectId
        })
      ]);
  
      res.json({
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        executions
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch execution history' });
    }
  };


module.exports = {
    executePrompt,
    getPromptExecutions

  };
  