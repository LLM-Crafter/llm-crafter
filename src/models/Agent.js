const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const agentSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['chatbot', 'task', 'workflow', 'api'],
      required: true,
      default: 'chatbot',
    },
    organization: {
      type: String,
      ref: 'Organization',
      required: true,
    },
    project: {
      type: String,
      ref: 'Project',
      required: true,
    },
    system_prompt: {
      type: String,
      required: true,
    },
    api_key: {
      type: String,
      ref: 'ApiKey',
      required: true,
    },
    llm_settings: {
      model: {
        type: String,
        required: true,
      },
      parameters: {
        temperature: {
          type: Number,
          min: 0,
          max: 2,
          default: 0.7,
        },
        max_tokens: {
          type: Number,
          min: 1,
          default: 1000,
        },
        top_p: {
          type: Number,
          min: 0,
          max: 1,
          default: 1,
        },
        frequency_penalty: {
          type: Number,
          min: -2,
          max: 2,
          default: 0,
        },
        presence_penalty: {
          type: Number,
          min: -2,
          max: 2,
          default: 0,
        },
      },
    },
    tools: [
      {
        name: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        parameters: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
        enabled: {
          type: Boolean,
          default: true,
        },
      },
    ],
    config: {
      // Chatbot specific config
      max_conversation_length: {
        type: Number,
        default: 50,
      },
      auto_end_after_minutes: {
        type: Number,
        default: 30,
      },
      context_window_strategy: {
        type: String,
        enum: ['truncate', 'summarize', 'sliding'],
        default: 'truncate',
      },
      // Task agent specific config
      timeout_seconds: {
        type: Number,
        default: 300,
      },
      max_tool_calls: {
        type: Number,
        default: 10,
      },
      // General config
      enable_thinking: {
        type: Boolean,
        default: true,
      },
      thinking_depth: {
        type: String,
        enum: ['basic', 'detailed', 'verbose'],
        default: 'basic',
      },
      // Streaming config
      enable_streaming: {
        type: Boolean,
        default: false,
      },
    },
    question_suggestions: {
      enabled: {
        type: Boolean,
        default: false,
      },
      count: {
        type: Number,
        default: 3,
        min: 1,
        max: 5,
      },
      api_key: {
        type: String,
        ref: 'ApiKey',
      },
      model: {
        type: String,
      },
      custom_prompt: {
        type: String,
      },
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure unique agent names within a project
agentSchema.index({ project: 1, name: 1 }, { unique: true });

// Virtual for conversations (only relevant for chatbot agents)
agentSchema.virtual('conversations', {
  ref: 'Conversation',
  localField: '_id',
  foreignField: 'agent',
  justOne: false,
});

// Virtual for executions (for task/workflow agents)
agentSchema.virtual('executions', {
  ref: 'AgentExecution',
  localField: '_id',
  foreignField: 'agent',
  justOne: false,
});

// Method to configure API endpoints for api_caller tool
agentSchema.methods.configureApiEndpoints = function (
  endpointsConfig,
  authConfig,
  summarizationConfig
) {
  const apiCallerTool = this.tools.find(tool => tool.name === 'api_caller');
  if (!apiCallerTool) {
    throw new Error('API caller tool not found in agent tools');
  }

  // Merge new configuration with existing parameters
  apiCallerTool.parameters = {
    ...apiCallerTool.parameters,
    endpoints: endpointsConfig,
    authentication: authConfig,
  };

  // Add summarization config if provided
  if (summarizationConfig && Object.keys(summarizationConfig).length > 0) {
    apiCallerTool.parameters.summarization = summarizationConfig;
  }

  return this.save();
};

// Method to get API endpoints configuration
agentSchema.methods.getApiEndpoints = function () {
  const apiCallerTool = this.tools.find(tool => tool.name === 'api_caller');
  if (!apiCallerTool) {
    return null;
  }

  return {
    endpoints: apiCallerTool.parameters?.endpoints || {},
    authentication: apiCallerTool.parameters?.authentication || {},
    summarization: apiCallerTool.parameters?.summarization || {},
  };
};

// Method to configure FAQ questions and answers for faq tool
agentSchema.methods.configureFAQs = function (faqsConfig) {
  const faqTool = this.tools.find(tool => tool.name === 'faq');
  if (!faqTool) {
    throw new Error('FAQ tool not found in agent tools');
  }

  // Merge new configuration with existing parameters
  faqTool.parameters = {
    ...faqTool.parameters,
    faqs: faqsConfig,
  };

  return this.save();
};

// Method to get FAQ configuration
agentSchema.methods.getFAQs = function () {
  const faqTool = this.tools.find(tool => tool.name === 'faq');
  if (!faqTool) {
    return null;
  }

  return {
    faqs: faqTool.parameters?.faqs || [],
    enable_partial_matching:
      faqTool.parameters?.enable_partial_matching !== false,
    default_threshold: faqTool.parameters?.default_threshold || 0.7,
  };
};

// Method to configure question suggestions
agentSchema.methods.configureQuestionSuggestions = function (config) {
  this.question_suggestions = {
    ...this.question_suggestions,
    ...config,
  };
  return this.save();
};

// Method to get question suggestions configuration
agentSchema.methods.getQuestionSuggestions = function () {
  return {
    enabled: this.question_suggestions.enabled || false,
    count: this.question_suggestions.count || 3,
    api_key: this.question_suggestions.api_key,
    model: this.question_suggestions.model,
    custom_prompt: this.question_suggestions.custom_prompt,
  };
};

module.exports = mongoose.model('Agent', agentSchema);
