const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "assistant", "system", "tool"],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  // Agent thinking process (only for assistant messages)
  thinking_process: [
    {
      step: String,
      reasoning: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // Tools used in this message
  tools_used: [
    {
      tool_name: String,
      parameters: mongoose.Schema.Types.Mixed,
      result: mongoose.Schema.Types.Mixed,
      execution_time_ms: Number,
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // Token usage for this message
  token_usage: {
    prompt_tokens: Number,
    completion_tokens: Number,
    total_tokens: Number,
    cost: Number,
  },
});

const conversationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    agent: {
      type: String,
      ref: "Agent",
      required: true,
    },
    user_identifier: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    messages: [messageSchema],
    status: {
      type: String,
      enum: ["active", "ended", "timeout", "error"],
      default: "active",
    },
    metadata: {
      total_tokens_used: {
        type: Number,
        default: 0,
      },
      total_cost: {
        type: Number,
        default: 0,
      },
      tools_executed_count: {
        type: Number,
        default: 0,
      },
      last_activity: {
        type: Date,
        default: Date.now,
      },
      user_agent: String,
      ip_address: String,
    },
    summary: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
conversationSchema.index({ agent: 1, user_identifier: 1 });
conversationSchema.index({ agent: 1, status: 1 });
conversationSchema.index({ "metadata.last_activity": 1 });

// Update last activity on message addition
conversationSchema.pre("save", function (next) {
  if (this.isModified("messages")) {
    this.metadata.last_activity = new Date();
  }
  next();
});

// Method to add message and update metadata
conversationSchema.methods.addMessage = function (messageData) {
  this.messages.push(messageData);

  // Update metadata
  if (messageData.token_usage) {
    this.metadata.total_tokens_used +=
      messageData.token_usage.total_tokens || 0;
    this.metadata.total_cost += messageData.token_usage.cost || 0;
  }

  if (messageData.tools_used && messageData.tools_used.length > 0) {
    this.metadata.tools_executed_count += messageData.tools_used.length;
  }

  this.metadata.last_activity = new Date();

  return this.save();
};

// Method to get recent messages (for context management)
conversationSchema.methods.getRecentMessages = function (limit = 10) {
  return this.messages.slice(-limit);
};

// Method to get conversation context for agent
conversationSchema.methods.getContextForAgent = function (maxTokens = 4000) {
  // Simple implementation - can be enhanced with token counting
  const systemMessages = this.messages.filter((m) => m.role === "system");
  const recentMessages = this.messages.slice(-20); // Last 20 messages

  return [...systemMessages, ...recentMessages];
};

module.exports = mongoose.model("Conversation", conversationSchema);
