const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system', 'tool'],
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
  // Mark if message is part of a summary
  is_summarized: {
    type: Boolean,
    default: false,
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
      ref: 'Agent',
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
      enum: ['active', 'ended', 'timeout', 'error'],
      default: 'active',
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
      // Summarization metadata
      last_summary_index: {
        type: Number,
        default: -1, // Index of last message included in summary
      },
      summary_version: {
        type: Number,
        default: 0,
      },
      requires_summarization: {
        type: Boolean,
        default: false,
      },
    },
    summary: {
      type: String,
      trim: true,
    },
    // Detailed conversation summary for better context preservation
    conversation_summary: {
      key_topics: [String],
      user_preferences: mongoose.Schema.Types.Mixed,
      important_decisions: [String],
      unresolved_issues: [String],
      context_data: mongoose.Schema.Types.Mixed,
      created_at: {
        type: Date,
        default: Date.now,
      },
      message_count_when_summarized: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
conversationSchema.index({ agent: 1, user_identifier: 1 });
conversationSchema.index({ agent: 1, status: 1 });
conversationSchema.index({ 'metadata.last_activity': 1 });

// Update last activity on message addition and check for summarization needs
conversationSchema.pre('save', function (next) {
  if (this.isModified('messages')) {
    this.metadata.last_activity = new Date();

    // Check if summarization is needed (every 15 messages after the last summary)
    const messagesSinceLastSummary =
      this.messages.length - (this.metadata.last_summary_index + 1);
    if (messagesSinceLastSummary >= 15) {
      this.metadata.requires_summarization = true;
    }
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

// Enhanced method to get optimized conversation context for agent
conversationSchema.methods.getContextForAgent = function (maxTokens = 4000) {
  const messages = [];

  // Always include system messages
  const systemMessages = this.messages.filter(m => m.role === 'system');
  messages.push(...systemMessages);

  // If we have a summary, include it as context
  if (this.conversation_summary && this.metadata.last_summary_index >= 0) {
    const summaryContext = this.buildSummaryContext();
    messages.push({
      role: 'system',
      content: summaryContext,
      timestamp: this.conversation_summary.created_at,
      is_summarized: true,
    });

    // Include only recent messages after the last summary
    const recentMessages = this.messages.slice(
      this.metadata.last_summary_index + 1
    );
    messages.push(...recentMessages);
  } else {
    // No summary yet, include recent messages with smart truncation
    const recentMessages = this.getSmartTruncatedMessages(maxTokens);
    messages.push(...recentMessages);
  }

  return messages;
};

// Method to estimate token count for messages (rough approximation)
conversationSchema.methods.estimateTokenCount = function (messages) {
  return messages.reduce((total, msg) => {
    // Rough estimate: 1 token ≈ 4 characters
    const contentTokens = Math.ceil(msg.content.length / 4);
    const metadataTokens = msg.thinking_process
      ? Math.ceil(JSON.stringify(msg.thinking_process).length / 4)
      : 0;
    return total + contentTokens + metadataTokens;
  }, 0);
};

// Method to get smartly truncated messages within token limit
conversationSchema.methods.getSmartTruncatedMessages = function (
  maxTokens = 4000
) {
  const allMessages = this.messages;
  const systemMessages = allMessages.filter(m => m.role === 'system');
  const conversationMessages = allMessages.filter(m => m.role !== 'system');

  // Reserve tokens for system messages
  const systemTokens = this.estimateTokenCount(systemMessages);
  const availableTokens = maxTokens - systemTokens;

  // Start from the end and work backwards
  const selectedMessages = [];
  let currentTokens = 0;

  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    const message = conversationMessages[i];
    const messageTokens = this.estimateTokenCount([message]);

    if (currentTokens + messageTokens <= availableTokens) {
      selectedMessages.unshift(message);
      currentTokens += messageTokens;
    } else {
      break;
    }
  }

  return [...systemMessages, ...selectedMessages];
};

// Method to build summary context string
conversationSchema.methods.buildSummaryContext = function () {
  if (!this.conversation_summary) {
    return '';
  }

  const summary = this.conversation_summary;
  let context = '=== CONVERSATION SUMMARY ===\n';

  if (summary.key_topics && summary.key_topics.length > 0) {
    context += `Key Topics Discussed: ${summary.key_topics.join(', ')}\n`;
  }

  if (summary.important_decisions && summary.important_decisions.length > 0) {
    context += `Important Decisions Made: ${summary.important_decisions.join('; ')}\n`;
  }

  if (summary.unresolved_issues && summary.unresolved_issues.length > 0) {
    context += `Unresolved Issues: ${summary.unresolved_issues.join('; ')}\n`;
  }

  if (
    summary.user_preferences &&
    Object.keys(summary.user_preferences).length > 0
  ) {
    context += `User Preferences: ${JSON.stringify(summary.user_preferences)}\n`;
  }

  if (summary.context_data && Object.keys(summary.context_data).length > 0) {
    context += `Important Context: ${JSON.stringify(summary.context_data)}\n`;
  }

  context += `(Summary covers ${summary.message_count_when_summarized} messages up to ${summary.created_at.toISOString()})\n`;
  context += '=== END SUMMARY ===\n';

  return context;
};

// Method to update conversation summary
conversationSchema.methods.updateSummary = function (summaryData) {
  this.conversation_summary = {
    key_topics: summaryData.key_topics || [],
    user_preferences: summaryData.user_preferences || {},
    important_decisions: summaryData.important_decisions || [],
    unresolved_issues: summaryData.unresolved_issues || [],
    context_data: summaryData.context_data || {},
    created_at: new Date(),
    message_count_when_summarized: this.messages.length,
  };

  this.metadata.last_summary_index = this.messages.length - 1;
  this.metadata.summary_version += 1;
  this.metadata.requires_summarization = false;

  // Also update the simple summary field for backwards compatibility
  this.summary = this.generateSimpleSummary(summaryData);

  return this.save();
};

// Method to generate a simple text summary
conversationSchema.methods.generateSimpleSummary = function (summaryData) {
  const parts = [];

  if (summaryData.key_topics && summaryData.key_topics.length > 0) {
    parts.push(`Topics: ${summaryData.key_topics.join(', ')}`);
  }

  if (
    summaryData.important_decisions &&
    summaryData.important_decisions.length > 0
  ) {
    parts.push(`Decisions: ${summaryData.important_decisions.join('; ')}`);
  }

  return parts.join(' | ');
};

// Method to check if conversation needs summarization
conversationSchema.methods.needsSummarization = function () {
  return this.metadata.requires_summarization;
};

// Method to summarize conversation
conversationSchema.methods.summarizeConversation = function () {
  // Simple summary logic - to be enhanced
  const assistantMessages = this.messages.filter(
    m => m.role === 'assistant' && !m.is_summarized
  );

  if (assistantMessages.length === 0) {
    return this.summary; // No new messages to summarize
  }

  // Create a summary from the content of assistant messages
  const summaryContent = assistantMessages
    .map(m => m.content)
    .join(' ')
    .trim();

  // Update summary fields
  this.summary = summaryContent;
  this.metadata.last_summary_index = this.messages.length - 1;
  this.metadata.summary_version += 1;
  this.metadata.requires_summarization = false;

  // Mark messages as summarized
  assistantMessages.forEach(m => {
    m.is_summarized = true;
  });

  return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);
