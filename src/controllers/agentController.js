const Agent = require("../models/Agent");
const Conversation = require("../models/Conversation");
const AgentExecution = require("../models/AgentExecution");
const Project = require("../models/Project");
const ApiKey = require("../models/ApiKey");
const agentService = require("../services/agentService");
const toolService = require("../services/toolService");

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
        .json({ error: "Project not found in this organization" });
    }

    // Verify API key exists and belongs to the project
    const apiKey = await ApiKey.findOne({
      _id: req.body.api_key,
      project: req.params.projectId,
    }).populate("provider");

    if (!apiKey) {
      return res
        .status(404)
        .json({ error: "API key not found in this project" });
    }

    // Verify the model belongs to the provider
    if (!apiKey.provider.models.includes(req.body.llm_settings.model)) {
      return res
        .status(400)
        .json({ error: "Invalid model for selected provider" });
    }

    // Get available tools
    const availableTools = await toolService.getAvailableTools();
    const requestedTools = req.body.tools || [];

    // Validate requested tools exist
    const toolNames = availableTools.map((tool) => tool.name);
    const invalidTools = requestedTools.filter(
      (toolName) => !toolNames.includes(toolName)
    );

    if (invalidTools.length > 0) {
      return res.status(400).json({
        error: `Invalid tools: ${invalidTools.join(", ")}`,
      });
    }

    // Build tools array with full tool information
    const agentTools = requestedTools.map((toolName) => {
      const tool = availableTools.find((t) => t.name === toolName);
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters_schema,
        enabled: true,
      };
    });

    const agent = new Agent({
      name: req.body.name,
      description: req.body.description,
      type: req.body.type || "chatbot",
      organization: req.params.orgId,
      project: req.params.projectId,
      system_prompt: req.body.system_prompt,
      api_key: req.body.api_key,
      llm_settings: req.body.llm_settings,
      tools: agentTools,
      config: req.body.config || {},
    });

    await agent.save();

    res.status(201).json(agent);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: "Agent name already exists in this project" });
    }
    console.error("Create agent error:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find({
      project: req.params.projectId,
      organization: req.params.orgId,
    })
      .populate("api_key", "name provider")
      .populate({
        path: "api_key",
        populate: {
          path: "provider",
          select: "name",
        },
      });

    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agents" });
  }
};

const getAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      project: req.params.projectId,
      organization: req.params.orgId,
    })
      .populate("api_key")
      .populate({
        path: "api_key",
        populate: {
          path: "provider",
        },
      });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agent" });
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
      return res.status(404).json({ error: "Agent not found" });
    }

    // Validate API key if being updated
    if (req.body.api_key) {
      const apiKey = await ApiKey.findOne({
        _id: req.body.api_key,
        project: req.params.projectId,
      }).populate("provider");

      if (!apiKey) {
        return res
          .status(404)
          .json({ error: "API key not found in this project" });
      }

      // Verify the model belongs to the provider
      if (
        req.body.llm_settings?.model &&
        !apiKey.provider.models.includes(req.body.llm_settings.model)
      ) {
        return res
          .status(400)
          .json({ error: "Invalid model for selected provider" });
      }

      agent.api_key = apiKey._id;
    }

    // Update tools if provided
    if (req.body.tools) {
      const availableTools = await toolService.getAvailableTools();
      const toolNames = availableTools.map((tool) => tool.name);
      const invalidTools = req.body.tools.filter(
        (toolName) => !toolNames.includes(toolName)
      );

      if (invalidTools.length > 0) {
        return res.status(400).json({
          error: `Invalid tools: ${invalidTools.join(", ")}`,
        });
      }

      const agentTools = req.body.tools.map((toolName) => {
        const tool = availableTools.find((t) => t.name === toolName);
        return {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters_schema,
          enabled: true,
        };
      });

      agent.tools = agentTools;
    }

    // Update other fields
    if (req.body.name !== undefined) agent.name = req.body.name;
    if (req.body.description !== undefined)
      agent.description = req.body.description;
    if (req.body.system_prompt !== undefined)
      agent.system_prompt = req.body.system_prompt;
    if (req.body.llm_settings) {
      agent.llm_settings = { ...agent.llm_settings, ...req.body.llm_settings };
    }
    if (req.body.config) {
      agent.config = { ...agent.config, ...req.body.config };
    }
    if (req.body.is_active !== undefined) agent.is_active = req.body.is_active;

    // Increment version on update
    agent.version += 1;

    await agent.save();

    // Fetch updated agent with populated fields
    const updatedAgent = await Agent.findById(agent._id)
      .populate("api_key")
      .populate({
        path: "api_key",
        populate: {
          path: "provider",
        },
      });

    res.json(updatedAgent);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: "Agent name already exists in this project" });
    }
    res.status(500).json({ error: "Failed to update agent" });
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
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({ message: "Agent deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete agent" });
  }
};

// ===== AGENT EXECUTION ENDPOINTS =====

const executeChatbotAgent = async (req, res) => {
  try {
    const { message, conversation_id, user_identifier } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!user_identifier) {
      return res.status(400).json({ error: "User identifier is required" });
    }

    const result = await agentService.executeChatbotAgent(
      req.params.agentId,
      conversation_id,
      message,
      user_identifier
    );

    res.json(result);
  } catch (error) {
    console.error("Chatbot execution error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to execute chatbot agent" });
  }
};

const executeTaskAgent = async (req, res) => {
  try {
    const { input, user_identifier } = req.body;

    if (!input) {
      return res.status(400).json({ error: "Input is required" });
    }

    const result = await agentService.executeTaskAgent(
      req.params.agentId,
      input,
      user_identifier
    );

    res.json(result);
  } catch (error) {
    console.error("Task execution error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to execute task agent" });
  }
};

// ===== CONVERSATION MANAGEMENT =====

const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 10, user_identifier, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { agent: req.params.agentId };
    if (user_identifier) filter.user_identifier = user_identifier;
    if (status) filter.status = status;

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ "metadata.last_activity": -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select(
          "_id user_identifier title status metadata createdAt updatedAt"
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
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      agent: req.params.agentId,
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
};

// ===== EXECUTION HISTORY =====

const getAgentExecutions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;

    const filter = { agent: req.params.agentId };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const [executions, total] = await Promise.all([
      AgentExecution.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("_id type status usage execution_time_ms createdAt metadata"),

      AgentExecution.countDocuments(filter),
    ]);

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      executions,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agent executions" });
  }
};

const getAgentExecution = async (req, res) => {
  try {
    const execution = await AgentExecution.findOne({
      _id: req.params.executionId,
      agent: req.params.agentId,
    });

    if (!execution) {
      return res.status(404).json({ error: "Execution not found" });
    }

    res.json(execution);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch execution" });
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
      return res.status(404).json({ error: "Agent not found" });
    }

    // Check if agent has api_caller tool
    const hasApiCallerTool = agent.tools.some(
      (tool) => tool.name === "api_caller"
    );
    if (!hasApiCallerTool) {
      return res
        .status(400)
        .json({ error: "Agent does not have api_caller tool configured" });
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
      const validAuthTypes = ["bearer_token", "api_key", "cookie"];
      if (!validAuthTypes.includes(authentication.type)) {
        return res.status(400).json({
          error: `Invalid authentication type. Must be one of: ${validAuthTypes.join(", ")}`,
        });
      }
    }

    // Validate summarization configuration
    if (summarization) {
      if (
        typeof summarization.enabled !== "undefined" &&
        typeof summarization.enabled !== "boolean"
      ) {
        return res.status(400).json({
          error: "Summarization 'enabled' field must be a boolean",
        });
      }

      if (
        summarization.max_tokens &&
        (typeof summarization.max_tokens !== "number" ||
          summarization.max_tokens < 10 ||
          summarization.max_tokens > 1000)
      ) {
        return res.status(400).json({
          error:
            "Summarization 'max_tokens' must be a number between 10 and 1000",
        });
      }

      if (
        summarization.min_size &&
        (typeof summarization.min_size !== "number" ||
          summarization.min_size < 100)
      ) {
        return res.status(400).json({
          error: "Summarization 'min_size' must be a number >= 100",
        });
      }

      if (summarization.model && typeof summarization.model !== "string") {
        return res.status(400).json({
          error: "Summarization 'model' must be a string",
        });
      }

      if (
        summarization.endpoint_rules &&
        typeof summarization.endpoint_rules !== "object"
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
            (typeof rules.max_tokens !== "number" ||
              rules.max_tokens < 10 ||
              rules.max_tokens > 1000)
          ) {
            return res.status(400).json({
              error: `Endpoint rule '${endpointName}' max_tokens must be a number between 10 and 1000`,
            });
          }
          if (rules.focus && typeof rules.focus !== "string") {
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
      message: "API configuration updated successfully",
      endpoints: endpoints || {},
      authentication: authentication ? { type: authentication.type } : {},
    };

    // Include summarization in response if provided
    if (summarization) {
      responseData.summarization = summarization;
    }

    res.json(responseData);
  } catch (error) {
    console.error("Configure API endpoints error:", error);
    res.status(500).json({ error: "Failed to configure API endpoints" });
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
      return res.status(404).json({ error: "Agent not found" });
    }

    const apiConfig = agent.getApiEndpoints();
    if (!apiConfig) {
      return res
        .status(404)
        .json({ error: "Agent does not have api_caller tool configured" });
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
    console.error("Get API endpoints error:", error);
    res.status(500).json({ error: "Failed to get API endpoints" });
  }
};

module.exports = {
  createAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  executeChatbotAgent,
  executeTaskAgent,
  getConversations,
  getConversation,
  getAgentExecutions,
  getAgentExecution,
  configureApiEndpoints,
  getApiEndpoints,
};
