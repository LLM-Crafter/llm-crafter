const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');
const AgentExecution = require('../models/AgentExecution');
const Project = require('../models/Project');
const ApiKey = require('../models/ApiKey');
const agentService = require('../services/agentService');
const toolService = require('../services/toolService');
const summarizationService = require('../services/summarizationService');

const createAgent = async (req, res) => {
  try {
    // Verify project exists and belongs to the organization
    const project = await Project.findOne({
      _id: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: 'Project not found in this organization' });
    }

    // Verify API key exists and belongs to the project
    const apiKey = await ApiKey.findOne({
      _id: req.body.api_key,
      project: req.params.projectId,
    }).populate('provider');

    if (!apiKey) {
      return res
        .status(404)
        .json({ error: 'API key not found in this project' });
    }

    // Verify the model belongs to the provider
    if (!apiKey.provider.models.includes(req.body.llm_settings.model)) {
      return res
        .status(400)
        .json({ error: 'Invalid model for selected provider' });
    }

    // Get available tools
    const availableTools = await toolService.getAvailableTools();
    const requestedTools = req.body.tools || [];

    // Validate requested tools exist
    const toolNames = availableTools.map(tool => tool.name);
    const invalidTools = requestedTools.filter(
      toolName => !toolNames.includes(toolName)
    );

    if (invalidTools.length > 0) {
      return res.status(400).json({
        error: `Invalid tools: ${invalidTools.join(', ')}`,
      });
    }

    // Build tools array with full tool information
    const agentTools = requestedTools.map(toolName => {
      const tool = availableTools.find(t => t.name === toolName);
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters_schema, // For new agents, use schema defaults
        enabled: true,
      };
    });

    // Validate question suggestions if provided
    let questionSuggestions = {};
    if (req.body.question_suggestions) {
      const { enabled, count, api_key, model, custom_prompt } =
        req.body.question_suggestions;

      // If enabled, validate required fields
      if (enabled) {
        if (!api_key || !model) {
          return res.status(400).json({
            error:
              'API key and model are required when enabling question suggestions',
          });
        }

        // Validate suggestion API key exists and belongs to the project
        const suggestionApiKey = await ApiKey.findOne({
          _id: api_key,
          project: req.params.projectId,
        }).populate('provider');

        if (!suggestionApiKey) {
          return res
            .status(404)
            .json({ error: 'Suggestion API key not found in this project' });
        }

        // Verify the model belongs to the provider
        if (!suggestionApiKey.provider.models.includes(model)) {
          return res
            .status(400)
            .json({ error: 'Invalid suggestion model for selected provider' });
        }

        // Validate count if provided
        if (count && (count < 1 || count > 5)) {
          return res.status(400).json({
            error: 'Question count must be between 1 and 5',
          });
        }

        questionSuggestions = {
          enabled: true,
          count: count || 3,
          api_key,
          model,
          custom_prompt: custom_prompt || null,
        };
      } else {
        questionSuggestions = {
          enabled: false,
          count: count || 3,
          api_key: api_key || null,
          model: model || null,
          custom_prompt: custom_prompt || null,
        };
      }
    }

    const agent = new Agent({
      name: req.body.name,
      description: req.body.description,
      type: req.body.type || 'chatbot',
      organization: req.params.orgId,
      project: req.params.projectId,
      system_prompt: req.body.system_prompt,
      api_key: req.body.api_key,
      llm_settings: req.body.llm_settings,
      tools: agentTools,
      config: req.body.config || {},
      question_suggestions: questionSuggestions,
    });

    await agent.save();

    res.status(201).json(agent);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: 'Agent name already exists in this project' });
    }
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find({
      project: req.params.projectId,
      organization: req.params.orgId,
    })
      .populate('api_key', 'name provider')
      .populate({
        path: 'api_key',
        populate: {
          path: 'provider',
          select: 'name',
        },
      });

    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};

const getAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    })
      .populate('api_key')
      .populate({
        path: 'api_key',
        populate: {
          path: 'provider',
        },
      });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
};

const updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Validate API key if being updated
    if (req.body.api_key) {
      const apiKey = await ApiKey.findOne({
        _id: req.body.api_key,
        project: req.params.projectId,
      }).populate('provider');

      if (!apiKey) {
        return res
          .status(404)
          .json({ error: 'API key not found in this project' });
      }

      // Verify the model belongs to the provider
      if (
        req.body.llm_settings?.model &&
        !apiKey.provider.models.includes(req.body.llm_settings.model)
      ) {
        return res
          .status(400)
          .json({ error: 'Invalid model for selected provider' });
      }

      agent.api_key = apiKey._id;
    }

    // Update tools if provided
    if (req.body.tools) {
      const availableTools = await toolService.getAvailableTools();
      const toolNames = availableTools.map(tool => tool.name);
      const invalidTools = req.body.tools.filter(
        toolName => !toolNames.includes(toolName)
      );

      if (invalidTools.length > 0) {
        return res.status(400).json({
          error: `Invalid tools: ${invalidTools.join(', ')}`,
        });
      }

      const agentTools = req.body.tools.map(toolName => {
        const tool = availableTools.find(t => t.name === toolName);

        // Check if this tool already exists in the agent and preserve its parameters
        const existingTool = agent.tools.find(
          existingTool => existingTool.name === toolName
        );

        return {
          name: tool.name,
          description: tool.description,
          // Preserve existing parameters if tool was already configured, otherwise use schema default
          parameters: existingTool
            ? existingTool.parameters
            : tool.parameters_schema,
          enabled: existingTool ? existingTool.enabled : true,
        };
      });

      agent.tools = agentTools;
    }

    // Update other fields
    if (req.body.name !== undefined) {
      agent.name = req.body.name;
    }
    if (req.body.description !== undefined) {
      agent.description = req.body.description;
    }
    if (req.body.system_prompt !== undefined) {
      agent.system_prompt = req.body.system_prompt;
    }
    if (req.body.llm_settings) {
      agent.llm_settings = { ...agent.llm_settings, ...req.body.llm_settings };
    }
    if (req.body.config) {
      agent.config = { ...agent.config, ...req.body.config };
    }
    if (req.body.is_active !== undefined) {
      agent.is_active = req.body.is_active;
    }

    // Update question suggestions if provided
    if (req.body.question_suggestions !== undefined) {
      const { enabled, count, api_key, model, custom_prompt } =
        req.body.question_suggestions;

      // If enabling, validate required fields
      if (enabled) {
        if (!api_key || !model) {
          return res.status(400).json({
            error:
              'API key and model are required when enabling question suggestions',
          });
        }

        // Validate suggestion API key exists and belongs to the project
        const suggestionApiKey = await ApiKey.findOne({
          _id: api_key,
          project: req.params.projectId,
        }).populate('provider');

        if (!suggestionApiKey) {
          return res
            .status(404)
            .json({ error: 'Suggestion API key not found in this project' });
        }

        // Verify the model belongs to the provider
        if (!suggestionApiKey.provider.models.includes(model)) {
          return res
            .status(400)
            .json({ error: 'Invalid suggestion model for selected provider' });
        }
      }

      // Validate count if provided
      if (count !== undefined && (count < 1 || count > 5)) {
        return res.status(400).json({
          error: 'Question count must be between 1 and 5',
        });
      }

      // Update question suggestions configuration
      agent.question_suggestions = {
        enabled:
          enabled !== undefined ? enabled : agent.question_suggestions.enabled,
        count: count !== undefined ? count : agent.question_suggestions.count,
        api_key:
          api_key !== undefined ? api_key : agent.question_suggestions.api_key,
        model: model !== undefined ? model : agent.question_suggestions.model,
        custom_prompt:
          custom_prompt !== undefined
            ? custom_prompt
            : agent.question_suggestions.custom_prompt,
      };
    }

    // Increment version on update
    agent.version += 1;

    await agent.save();

    // Fetch updated agent with populated fields
    const updatedAgent = await Agent.findById(agent._id)
      .populate('api_key')
      .populate({
        path: 'api_key',
        populate: {
          path: 'provider',
        },
      });

    res.json(updatedAgent);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: 'Agent name already exists in this project' });
    }
    res.status(500).json({ error: 'Failed to update agent' });
  }
};

const deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findOneAndDelete({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete agent' });
  }
};

// ===== AGENT EXECUTION ENDPOINTS =====

const executeChatbotAgent = async (req, res) => {
  try {
    const { message, conversation_id, user_identifier, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!user_identifier) {
      return res.status(400).json({ error: 'User identifier is required' });
    }

    const result = await agentService.executeChatbotAgent(
      req.params.agentId,
      conversation_id,
      message,
      user_identifier,
      context
    );

    res.json(result);
  } catch (error) {
    console.error('Chatbot execution error:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to execute chatbot agent' });
  }
};

const executeTaskAgent = async (req, res) => {
  try {
    const { input, user_identifier, context } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    const result = await agentService.executeTaskAgent(
      req.params.agentId,
      input,
      user_identifier,
      context
    );

    res.json(result);
  } catch (error) {
    console.error('Task execution error:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to execute task agent' });
  }
};

const executeTaskAgentStream = async (req, res) => {
  try {
    const { input, user_identifier, context } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );

    // Send connection established event
    res.write(
      'data: {"type": "connected", "message": "Stream established"}\n\n'
    );

    let isResponseComplete = false;

    // Stream callback function
    const streamCallback = chunk => {
      if (!isResponseComplete) {
        const data = JSON.stringify({
          type: 'response_chunk',
          content: chunk,
        });
        res.write(`data: ${data}\n\n`);
      }
    };

    try {
      // Execute task agent with streaming
      const result = await agentService.executeTaskAgentStream(
        req.params.agentId,
        input,
        user_identifier,
        context,
        streamCallback
      );

      isResponseComplete = true;

      // Send completion event with metadata
      const completionData = JSON.stringify({
        type: 'complete',
        execution_id: result.execution_id,
        token_usage: result.token_usage,
        tools_used: result.tools_used,
        status: result.status,
      });
      res.write(`data: ${completionData}\n\n`);

      res.end();
    } catch (error) {
      console.error('Task streaming error:', error);
      isResponseComplete = true;

      const errorData = JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to execute task agent',
      });
      res.write(`data: ${errorData}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Task streaming setup error:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to setup task agent streaming' });
  }
};

const executeChatbotAgentStream = async (req, res) => {
  try {
    const { message, conversation_id, user_identifier, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!user_identifier) {
      return res.status(400).json({ error: 'User identifier is required' });
    }

    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );

    // Send connection established event
    res.write(
      'data: {"type": "connected", "message": "Stream established"}\n\n'
    );

    let isResponseComplete = false;

    // Stream callback function
    const streamCallback = chunk => {
      if (!isResponseComplete) {
        const data = JSON.stringify({
          type: 'response_chunk',
          content: chunk,
        });
        res.write(`data: ${data}\n\n`);
      }
    };

    try {
      // Execute agent with streaming
      const result = await agentService.executeChatbotAgentStream(
        req.params.agentId,
        conversation_id,
        message,
        user_identifier,
        context,
        streamCallback
      );

      isResponseComplete = true;

      // Send completion event with handoff info if present
      const completionData = JSON.stringify({
        type: 'complete',
        conversation_id: result.conversation_id,
        token_usage: result.token_usage,
        handoff_requested: result.handoff_requested || false,
        handoff_info: result.handoff_info || null,
        suggestions: result.suggestions || null,
      });
      res.write(`data: ${completionData}\n\n`);
    } catch (error) {
      console.error('Streaming chatbot execution error:', error);
      const errorData = JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to execute chatbot agent',
      });
      res.write(`data: ${errorData}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('Streaming setup error:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to setup streaming' });
  }
};

// ===== CONVERSATION MANAGEMENT =====

const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 10, user_identifier, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { agent: req.params.agentId };
    if (user_identifier) {
      filter.user_identifier = user_identifier;
    }
    if (status) {
      filter.status = status;
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ 'metadata.last_activity': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select(
          '_id user_identifier title status metadata createdAt updatedAt'
        ),

      Conversation.countDocuments(filter),
    ]);

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      conversations,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      agent: req.params.agentId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
};

// ===== EXECUTION HISTORY =====

const getAgentExecutions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;

    const filter = { agent: req.params.agentId };
    if (status) {
      filter.status = status;
    }
    if (type) {
      filter.type = type;
    }

    const [executions, total] = await Promise.all([
      AgentExecution.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('_id type status usage execution_time_ms createdAt metadata'),

      AgentExecution.countDocuments(filter),
    ]);

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      executions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agent executions' });
  }
};

const getAgentExecution = async (req, res) => {
  try {
    const execution = await AgentExecution.findOne({
      _id: req.params.executionId,
      agent: req.params.agentId,
    });

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(execution);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
};

// ===== API ENDPOINTS CONFIGURATION =====

const configureApiEndpoints = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if agent has api_caller tool
    const hasApiCallerTool = agent.tools.some(
      tool => tool.name === 'api_caller'
    );
    if (!hasApiCallerTool) {
      return res
        .status(400)
        .json({ error: 'Agent does not have api_caller tool configured' });
    }

    const { endpoints, authentication, summarization } = req.body;

    // Validate endpoints configuration
    if (endpoints) {
      for (const [endpointName, config] of Object.entries(endpoints)) {
        if (!config.base_url || !config.path) {
          return res.status(400).json({
            error: `Endpoint '${endpointName}' must have base_url and path`,
          });
        }

        // Validate methods array
        if (config.methods && !Array.isArray(config.methods)) {
          return res.status(400).json({
            error: `Endpoint '${endpointName}' methods must be an array`,
          });
        }
      }
    }

    // Validate authentication configuration
    if (authentication && authentication.type) {
      const validAuthTypes = ['bearer_token', 'api_key', 'cookie'];
      if (!validAuthTypes.includes(authentication.type)) {
        return res.status(400).json({
          error: `Invalid authentication type. Must be one of: ${validAuthTypes.join(', ')}`,
        });
      }
    }

    // Validate summarization configuration
    if (summarization) {
      if (
        typeof summarization.enabled !== 'undefined' &&
        typeof summarization.enabled !== 'boolean'
      ) {
        return res.status(400).json({
          error: "Summarization 'enabled' field must be a boolean",
        });
      }

      if (
        summarization.max_tokens &&
        (typeof summarization.max_tokens !== 'number' ||
          summarization.max_tokens < 10 ||
          summarization.max_tokens > 72000)
      ) {
        return res.status(400).json({
          error:
            "Summarization 'max_tokens' must be a number between 10 and 72000",
        });
      }

      if (
        summarization.min_size &&
        (typeof summarization.min_size !== 'number' ||
          summarization.min_size < 100)
      ) {
        return res.status(400).json({
          error: "Summarization 'min_size' must be a number >= 100",
        });
      }

      if (summarization.model && typeof summarization.model !== 'string') {
        return res.status(400).json({
          error: "Summarization 'model' must be a string",
        });
      }

      if (
        summarization.endpoint_rules &&
        typeof summarization.endpoint_rules !== 'object'
      ) {
        return res.status(400).json({
          error: "Summarization 'endpoint_rules' must be an object",
        });
      }

      // Validate endpoint-specific rules
      if (summarization.endpoint_rules) {
        for (const [endpointName, rules] of Object.entries(
          summarization.endpoint_rules
        )) {
          if (
            rules.max_tokens &&
            (typeof rules.max_tokens !== 'number' ||
              rules.max_tokens < 10 ||
              rules.max_tokens > 1000)
          ) {
            return res.status(400).json({
              error: `Endpoint rule '${endpointName}' max_tokens must be a number between 10 and 1000`,
            });
          }
          if (rules.focus && typeof rules.focus !== 'string') {
            return res.status(400).json({
              error: `Endpoint rule '${endpointName}' focus must be a string`,
            });
          }
        }
      }
    }

    await agent.configureApiEndpoints(
      endpoints || {},
      authentication || {},
      summarization || {}
    );

    const responseData = {
      message: 'API configuration updated successfully',
      endpoints: endpoints || {},
      authentication: authentication ? { type: authentication.type } : {},
    };

    // Include summarization in response if provided
    if (summarization) {
      responseData.summarization = summarization;
    }

    res.json(responseData);
  } catch (error) {
    console.error('Configure API endpoints error:', error);
    res.status(500).json({ error: 'Failed to configure API endpoints' });
  }
};

const getApiEndpoints = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const apiConfig = agent.getApiEndpoints();
    if (!apiConfig) {
      return res
        .status(404)
        .json({ error: 'Agent does not have api_caller tool configured' });
    }

    // Don't expose sensitive authentication details
    const sanitizedAuth = apiConfig.authentication
      ? {
          type: apiConfig.authentication.type,
          configured: !!(
            apiConfig.authentication.token ||
            apiConfig.authentication.api_key ||
            apiConfig.authentication.cookie
          ),
        }
      : {};

    res.json({
      endpoints: apiConfig.endpoints,
      authentication: sanitizedAuth,
      summarization: apiConfig.summarization || {},
    });
  } catch (error) {
    console.error('Get API endpoints error:', error);
    res.status(500).json({ error: 'Failed to get API endpoints' });
  }
};

// ===== FAQ CONFIGURATION =====

const configureFAQs = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if agent has FAQ tool
    const hasFAQTool = agent.tools.some(tool => tool.name === 'faq');
    if (!hasFAQTool) {
      return res
        .status(400)
        .json({ error: 'Agent does not have faq tool configured' });
    }

    const { faqs } = req.body;

    // Validate FAQs configuration
    if (faqs && !Array.isArray(faqs)) {
      return res.status(400).json({
        error: 'FAQs must be an array',
      });
    }

    if (faqs) {
      for (let i = 0; i < faqs.length; i++) {
        const faq = faqs[i];
        if (!faq.question || !faq.answer) {
          return res.status(400).json({
            error: `FAQ at index ${i} must have both question and answer`,
          });
        }
        if (
          typeof faq.question !== 'string' ||
          typeof faq.answer !== 'string'
        ) {
          return res.status(400).json({
            error: `FAQ at index ${i} question and answer must be strings`,
          });
        }
        if (faq.category && typeof faq.category !== 'string') {
          return res.status(400).json({
            error: `FAQ at index ${i} category must be a string`,
          });
        }
      }
    }

    await agent.configureFAQs(faqs || []);

    res.json({
      message: 'FAQ configuration updated successfully',
      faqs: faqs || [],
      count: (faqs || []).length,
    });
  } catch (error) {
    console.error('Configure FAQs error:', error);
    res.status(500).json({ error: 'Failed to configure FAQs' });
  }
};

const getFAQs = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const faqConfig = agent.getFAQs();
    if (!faqConfig) {
      return res
        .status(404)
        .json({ error: 'Agent does not have faq tool configured' });
    }

    res.json({
      faqs: faqConfig.faqs,
      enable_partial_matching: faqConfig.enable_partial_matching,
      default_threshold: faqConfig.default_threshold,
      count: faqConfig.faqs.length,
    });
  } catch (error) {
    console.error('Get FAQs error:', error);
    res.status(500).json({ error: 'Failed to get FAQs' });
  }
};

// ===== CONVERSATION SUMMARIZATION =====

const summarizeConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      agent: req.params.agentId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const agent = await Agent.findById(req.params.agentId).populate('api_key');
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if summarization is needed
    if (!summarizationService.shouldSummarize(conversation)) {
      return res.json({
        message: 'Conversation does not need summarization',
        summary_status: {
          has_summary: !!conversation.conversation_summary,
          messages_count: conversation.messages.length,
          last_summary_index: conversation.metadata.last_summary_index,
          requires_summarization: conversation.metadata.requires_summarization,
        },
      });
    }

    // Force summarization
    await agentService.handleConversationSummarization(conversation, agent);

    // Reload conversation to get updated summary
    const updatedConversation = await Conversation.findById(conversation._id);

    res.json({
      message: 'Conversation summarized successfully',
      summary: updatedConversation.conversation_summary,
      summary_status: {
        has_summary: true,
        messages_count: updatedConversation.messages.length,
        last_summary_index: updatedConversation.metadata.last_summary_index,
        summary_version: updatedConversation.metadata.summary_version,
        requires_summarization: false,
      },
    });
  } catch (error) {
    console.error('Manual summarization error:', error);
    res.status(500).json({ error: 'Failed to summarize conversation' });
  }
};

const getConversationSummary = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      agent: req.params.agentId,
    }).select(
      'conversation_summary metadata.last_summary_index metadata.summary_version metadata.requires_summarization messages'
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messagesSinceLastSummary =
      conversation.messages.length -
      (conversation.metadata.last_summary_index + 1);
    const estimatedTokenSavings = conversation.conversation_summary
      ? summarizationService.estimateTokenSavings(
          conversation.messages.slice(
            0,
            conversation.metadata.last_summary_index + 1
          )
        )
      : 0;

    res.json({
      summary: conversation.conversation_summary,
      summary_status: {
        has_summary: !!conversation.conversation_summary,
        messages_count: conversation.messages.length,
        messages_since_last_summary: messagesSinceLastSummary,
        last_summary_index: conversation.metadata.last_summary_index,
        summary_version: conversation.metadata.summary_version || 0,
        requires_summarization: conversation.metadata.requires_summarization,
        estimated_token_savings: estimatedTokenSavings,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversation summary' });
  }
};

// ===== QUESTION SUGGESTIONS CONFIGURATION =====

const configureQuestionSuggestions = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { enabled, count, api_key, model, custom_prompt } = req.body;

    // Validate configuration
    if (enabled && (!api_key || !model)) {
      return res.status(400).json({
        error:
          'API key and model are required when enabling question suggestions',
      });
    }

    if (count && (count < 1 || count > 5)) {
      return res.status(400).json({
        error: 'Question count must be between 1 and 5',
      });
    }

    // Validate API key exists and belongs to the project
    if (api_key) {
      const apiKeyObj = await ApiKey.findOne({
        _id: api_key,
        project: req.params.projectId,
      }).populate('provider');

      if (!apiKeyObj) {
        return res
          .status(404)
          .json({ error: 'API key not found in this project' });
      }

      // Verify the model belongs to the provider
      if (model && !apiKeyObj.provider.models.includes(model)) {
        return res
          .status(400)
          .json({ error: 'Invalid model for selected provider' });
      }
    }

    const config = {};
    if (enabled !== undefined) {
      config.enabled = enabled;
    }
    if (count !== undefined) {
      config.count = count;
    }
    if (api_key !== undefined) {
      config.api_key = api_key;
    }
    if (model !== undefined) {
      config.model = model;
    }
    if (custom_prompt !== undefined) {
      config.custom_prompt = custom_prompt;
    }

    await agent.configureQuestionSuggestions(config);

    res.json({
      message: 'Question suggestions configuration updated successfully',
      configuration: agent.getQuestionSuggestions(),
    });
  } catch (error) {
    console.error('Configure question suggestions error:', error);
    res.status(500).json({ error: 'Failed to configure question suggestions' });
  }
};

const getQuestionSuggestions = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const config = agent.getQuestionSuggestions();

    // Don't expose the API key ID in the response for security
    const sanitizedConfig = {
      enabled: config.enabled,
      count: config.count,
      model: config.model,
      custom_prompt: config.custom_prompt,
      api_key_configured: !!config.api_key,
    };

    res.json(sanitizedConfig);
  } catch (error) {
    console.error('Get question suggestions error:', error);
    res
      .status(500)
      .json({ error: 'Failed to get question suggestions configuration' });
  }
};

// ===== EXTERNAL API EXECUTION METHODS =====

/**
 * Execute chatbot agent using session token (for external API access)
 */
const executeChatbotAgentWithSession = async (req, res) => {
  try {
    const { message, conversationId, userIdentifier, dynamicContext } =
      req.body;

    // req.session is populated by sessionAuth middleware
    // req.agent is the agent this session is authorized for
    // req.remainingInteractions shows how many interactions are left

    const result = await agentService.executeChatbotAgent(
      req.agent._id,
      conversationId,
      message,
      userIdentifier || `session_${req.sessionID}`,
      dynamicContext
    );

    let parsedResult = { ...result };
    delete parsedResult.thinking_process; // Remove internal thinking process details
    delete parsedResult.tools_used; // Remove tool call details
    delete parsedResult.token_usage; // Remove token usage details
    delete parsedResult.suggestion_usage; // Remove question suggestion usage details

    // Add session information to the response
    res.json({
      ...parsedResult,
      session_info: {
        session_id: req.sessionID,
        remaining_interactions: req.remainingInteractions,
        expires_at: req.session.expires_at,
      },
    });
  } catch (error) {
    console.error('Session-based chatbot execution error:', error);
    res.status(500).json({
      error: error.message || 'Failed to execute chatbot agent',
      code: 'EXECUTION_FAILED',
    });
  }
};

/**
 * Execute task agent using session token (for external API access)
 */
const executeTaskAgentWithSession = async (req, res) => {
  try {
    const { input, context } = req.body;

    // req.session is populated by sessionAuth middleware
    // req.agent is the agent this session is authorized for

    const result = await agentService.executeTaskAgent(
      req.agent._id,
      input,
      `session_${req.sessionID}`,
      context
    );

    // Add session information to the response
    res.json({
      ...result,
      session_info: {
        session_id: req.sessionToken._id,
        remaining_interactions: req.remainingInteractions,
        expires_at: req.sessionToken.expires_at,
      },
    });
  } catch (error) {
    console.error('Session-based task execution error:', error);
    res.status(500).json({
      error: error.message || 'Failed to execute task agent',
      code: 'EXECUTION_FAILED',
    });
  }
};

/**
 * Execute chatbot agent using session token with streaming (for external API access)
 */
const executeChatbotAgentWithSessionStream = async (req, res) => {
  try {
    const { message, conversationId, userIdentifier, dynamicContext } =
      req.body;

    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );

    // Send connection established event
    res.write(
      'data: {"type": "connected", "message": "Stream established"}\n\n'
    );

    let isResponseComplete = false;

    // Stream callback function
    const streamCallback = chunk => {
      if (!isResponseComplete) {
        const data = JSON.stringify({
          type: 'response_chunk',
          content: chunk,
        });
        res.write(`data: ${data}\n\n`);
      }
    };

    try {
      // Execute agent with streaming
      const result = await agentService.executeChatbotAgentStream(
        req.agent._id,
        conversationId,
        message,
        userIdentifier || `session_${req.sessionID}`,
        dynamicContext,
        streamCallback
      );

      isResponseComplete = true;

      // Send completion event with session info (excluding sensitive details)
      const completionData = JSON.stringify({
        type: 'complete',
        conversation_id: result.conversation_id,
        suggestions: result.suggestions,
        handoff_requested: result.handoff_requested || false,
        handoff_info: result.handoff_info || null,
        session_info: {
          session_id: req.sessionID,
          remaining_interactions: req.remainingInteractions,
          expires_at: req.session.expires_at,
        },
      });
      res.write(`data: ${completionData}\n\n`);

      res.end();
    } catch (error) {
      console.error('Session-based chatbot streaming error:', error);
      isResponseComplete = true;

      const errorData = JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to execute chatbot agent',
        code: 'EXECUTION_FAILED',
      });
      res.write(`data: ${errorData}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Session-based chatbot streaming setup error:', error);
    res.status(500).json({
      error: error.message || 'Failed to setup chatbot agent streaming',
      code: 'STREAMING_SETUP_FAILED',
    });
  }
};

/**
 * Execute task agent using session token with streaming (for external API access)
 */
const executeTaskAgentWithSessionStream = async (req, res) => {
  try {
    const { input, context } = req.body;

    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );

    // Send connection established event
    res.write(
      'data: {"type": "connected", "message": "Stream established"}\n\n'
    );

    let isResponseComplete = false;

    // Stream callback function
    const streamCallback = chunk => {
      if (!isResponseComplete) {
        const data = JSON.stringify({
          type: 'response_chunk',
          content: chunk,
        });
        res.write(`data: ${data}\n\n`);
      }
    };

    try {
      // Execute task agent with streaming
      const result = await agentService.executeTaskAgentStream(
        req.agent._id,
        input,
        `session_${req.sessionID}`,
        context,
        streamCallback
      );

      isResponseComplete = true;

      // Send completion event with session info
      const completionData = JSON.stringify({
        type: 'complete',
        execution_id: result.execution_id,
        status: result.status,
        session_info: {
          session_id: req.sessionToken._id,
          remaining_interactions: req.remainingInteractions,
          expires_at: req.sessionToken.expires_at,
        },
      });
      res.write(`data: ${completionData}\n\n`);

      res.end();
    } catch (error) {
      console.error('Session-based task streaming error:', error);
      isResponseComplete = true;

      const errorData = JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to execute task agent',
        code: 'EXECUTION_FAILED',
      });
      res.write(`data: ${errorData}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Session-based task streaming setup error:', error);
    res.status(500).json({
      error: error.message || 'Failed to setup task agent streaming',
      code: 'STREAMING_SETUP_FAILED',
    });
  }
};

/**
 * Execute chatbot agent using API key (for simple external access)
 * This bypasses the session system but requires agents:chat scope
 */
const executeChatbotAgentWithApiKey = async (req, res) => {
  try {
    const { message, conversationId, userIdentifier, dynamicContext } =
      req.body;

    // req.apiKey is populated by apiKeyAuth middleware
    // Validate that the API key can access this agent's project
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const result = await agentService.executeChatbotAgent(
      req.params.agentId,
      conversationId,
      message,
      userIdentifier || `apikey_${req.apiKey._id}`,
      dynamicContext
    );

    // Add API key usage information to the response
    res.json({
      ...result,
      api_key_info: {
        api_key_id: req.apiKey._id,
        daily_limit_remaining: req.apiKey.restrictions.max_executions_per_day
          ? Math.max(
              0,
              req.apiKey.restrictions.max_executions_per_day -
                req.apiKey.usage.executions_today
            )
          : null,
      },
    });
  } catch (error) {
    console.error('API key-based chatbot execution error:', error);
    res.status(500).json({
      error: error.message || 'Failed to execute chatbot agent',
      code: 'EXECUTION_FAILED',
    });
  }
};

/**
 * Get agent information for API key access (read-only)
 */
const getAgentForApiKey = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    })
      .select(
        'name description type system_prompt tools config version is_active'
      )
      .populate('api_key', 'name provider')
      .populate({
        path: 'api_key',
        populate: {
          path: 'provider',
          select: 'name',
        },
      });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Don't expose sensitive configuration details for external access
    const sanitizedAgent = {
      id: agent._id,
      name: agent.name,
      description: agent.description,
      type: agent.type,
      version: agent.version,
      is_active: agent.is_active,
      tools: agent.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        enabled: tool.enabled,
      })),
      // Don't expose system_prompt or detailed config
      api_key: agent.api_key
        ? {
            name: agent.api_key.name,
            provider: agent.api_key.provider?.name,
          }
        : null,
    };

    res.json({
      success: true,
      data: sanitizedAgent,
    });
  } catch (error) {
    console.error('Get agent for API key error:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
};

/**
 * List agents accessible via API key
 */
const getAgentsForApiKey = async (req, res) => {
  try {
    const agents = await Agent.find({
      project: req.params.projectId,
      organization: req.params.orgId,
      is_active: true,
    })
      .select('name description type version is_active')
      .sort({ name: 1 });

    const sanitizedAgents = agents.map(agent => ({
      id: agent._id,
      name: agent.name,
      description: agent.description,
      type: agent.type,
      version: agent.version,
      is_active: agent.is_active,
    }));

    res.json({
      success: true,
      data: sanitizedAgents,
    });
  } catch (error) {
    console.error('Get agents for API key error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};

// ===== WEB SEARCH CONFIGURATION =====

const configureWebSearch = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if agent has web_search tool
    const hasWebSearchTool = agent.tools.some(
      tool => tool.name === 'web_search'
    );
    if (!hasWebSearchTool) {
      return res
        .status(400)
        .json({ error: 'Agent does not have web_search tool configured' });
    }

    const { provider, api_key, default_max_results } = req.body;

    // Prepare config object
    const config = {};
    if (provider) config.provider = provider;
    if (default_max_results) config.default_max_results = default_max_results;

    // If API key is provided, encrypt it and store directly in tool config
    if (api_key) {
      const encryptionUtil = require('../utils/encryption');
      config.encrypted_api_key = encryptionUtil.encrypt(api_key);
    }

    await agent.configureWebSearch(config);

    res.json({
      message: 'Web search configuration updated successfully',
      provider: provider || 'brave',
      has_api_key: !!api_key,
      default_max_results: default_max_results || 5,
    });
  } catch (error) {
    console.error('Configure web search error:', error);
    res.status(500).json({ error: 'Failed to configure web search' });
  }
};

const getWebSearchConfig = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const webSearchConfig = agent.getWebSearchConfig();
    if (!webSearchConfig) {
      return res
        .status(404)
        .json({ error: 'Agent does not have web_search tool configured' });
    }

    res.json({
      success: true,
      data: webSearchConfig,
    });
  } catch (error) {
    console.error('Get web search config error:', error);
    res.status(500).json({ error: 'Failed to get web search configuration' });
  }
};

// ===== WEBPAGE SCRAPER CONFIGURATION =====

const configureWebpageScraper = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if agent has webpage_scraper tool
    const hasWebpageScraperTool = agent.tools.some(
      tool => tool.name === 'webpage_scraper'
    );
    if (!hasWebpageScraperTool) {
      return res
        .status(400)
        .json({ error: 'Agent does not have webpage_scraper tool configured' });
    }

    const { provider, api_key } = req.body;

    // Prepare config object
    const config = {};
    if (provider) config.provider = provider;

    // If API key is provided, encrypt it and store directly in tool config
    if (api_key) {
      const encryptionUtil = require('../utils/encryption');
      config.encrypted_api_key = encryptionUtil.encrypt(api_key);
    }

    await agent.configureWebpageScraper(config);

    res.json({
      message: 'Webpage scraper configuration updated successfully',
      provider: provider || 'local',
      has_api_key: !!api_key,
    });
  } catch (error) {
    console.error('Configure webpage scraper error:', error);
    res.status(500).json({ error: 'Failed to configure webpage scraper' });
  }
};

const getWebpageScraperConfig = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const webpageScraperConfig = agent.getWebpageScraperConfig();
    if (!webpageScraperConfig) {
      return res
        .status(404)
        .json({ error: 'Agent does not have webpage_scraper tool configured' });
    }

    res.json({
      success: true,
      data: webpageScraperConfig,
    });
  } catch (error) {
    console.error('Get webpage scraper config error:', error);
    res.status(500).json({ error: 'Failed to get webpage scraper configuration' });
  }
};

module.exports = {
  createAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  executeChatbotAgent,
  executeChatbotAgentStream,
  executeTaskAgent,
  executeTaskAgentStream,
  getConversations,
  getConversation,
  getAgentExecutions,
  getAgentExecution,
  configureApiEndpoints,
  getApiEndpoints,
  configureFAQs,
  getFAQs,
  summarizeConversation,
  getConversationSummary,
  configureQuestionSuggestions,
  getQuestionSuggestions,
  // New external API methods
  executeChatbotAgentWithSession,
  executeChatbotAgentWithSessionStream,
  executeTaskAgentWithSession,
  executeTaskAgentWithSessionStream,
  executeChatbotAgentWithApiKey,
  getAgentForApiKey,
  getAgentsForApiKey,
  configureWebSearch,
  getWebSearchConfig,
  configureWebpageScraper,
  getWebpageScraperConfig,
};
