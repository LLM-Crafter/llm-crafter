const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const agentExecutionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4
    },
    agent: {
      type: String,
      ref: 'Agent',
      required: true
    },
    type: {
      type: String,
      enum: ['task', 'workflow', 'api'],
      required: true
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    output: {
      type: mongoose.Schema.Types.Mixed
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'timeout'],
      default: 'pending'
    },
    thinking_process: [
      {
        step: {
          type: String,
          required: true
        },
        reasoning: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        data: mongoose.Schema.Types.Mixed
      }
    ],
    tools_executed: [
      {
        tool_name: {
          type: String,
          required: true
        },
        parameters: mongoose.Schema.Types.Mixed,
        result: mongoose.Schema.Types.Mixed,
        execution_time_ms: Number,
        status: {
          type: String,
          enum: ['success', 'error', 'timeout'],
          default: 'success'
        },
        error_message: String,
        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ],
    usage: {
      prompt_tokens: {
        type: Number,
        default: 0
      },
      completion_tokens: {
        type: Number,
        default: 0
      },
      total_tokens: {
        type: Number,
        default: 0
      },
      cost: {
        type: Number,
        default: 0
      },
      tool_calls_count: {
        type: Number,
        default: 0
      },
      suggestions: {
        prompt_tokens: {
          type: Number,
          default: 0
        },
        completion_tokens: {
          type: Number,
          default: 0
        },
        total_tokens: {
          type: Number,
          default: 0
        },
        cost: {
          type: Number,
          default: 0
        },
        model: String,
        execution_time_ms: Number,
        generated: {
          type: Boolean,
          default: false
        }
      }
    },
    execution_time_ms: Number,
    started_at: Date,
    completed_at: Date,
    error: {
      message: String,
      code: String,
      stack: String
    },
    metadata: {
      user_identifier: String,
      request_id: String,
      user_agent: String,
      ip_address: String,
      priority: {
        type: String,
        enum: ['low', 'normal', 'high'],
        default: 'normal'
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
agentExecutionSchema.index({ agent: 1, status: 1 });
agentExecutionSchema.index({ agent: 1, createdAt: -1 });
agentExecutionSchema.index({ status: 1, createdAt: 1 });

// Methods for execution management
agentExecutionSchema.methods.start = function () {
  this.status = 'running';
  this.started_at = new Date();
  return this.save();
};

agentExecutionSchema.methods.complete = function (output) {
  this.status = 'completed';
  this.output = output;
  this.completed_at = new Date();
  this.execution_time_ms = this.completed_at - this.started_at;
  return this.save();
};

agentExecutionSchema.methods.fail = function (error) {
  this.status = 'failed';
  this.error = {
    message: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    stack: error.stack
  };
  this.completed_at = new Date();
  this.execution_time_ms = this.completed_at - this.started_at;
  return this.save();
};

agentExecutionSchema.methods.addThinkingStep = function (
  step,
  reasoning,
  data = null
) {
  this.thinking_process.push({
    step,
    reasoning,
    data,
    timestamp: new Date()
  });
  return this.save();
};

agentExecutionSchema.methods.addToolExecution = function (
  toolName,
  parameters,
  result,
  executionTime,
  status = 'success',
  errorMessage = null
) {
  this.tools_executed.push({
    tool_name: toolName,
    parameters,
    result,
    execution_time_ms: executionTime,
    status,
    error_message: errorMessage,
    timestamp: new Date()
  });

  this.usage.tool_calls_count += 1;
  return this.save();
};

module.exports = mongoose.model('AgentExecution', agentExecutionSchema);
