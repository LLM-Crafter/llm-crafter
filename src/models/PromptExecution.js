const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const promptExecutionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    prompt: {
      type: String,
      ref: 'Prompt',
      required: true,
    },
    project: {
      type: String,
      ref: 'Project',
      required: true,
    },
    api_key: {
      type: String,
      ref: 'APIKey',
      required: true,
    },
    usage: {
      prompt_tokens: Number,
      completion_tokens: Number,
      total_tokens: Number,
      cost: Number, // Cost in USD
    },
    metadata: {
      model: String,
      finish_reason: String,
    },
    status: {
      type: String,
      enum: ['success', 'error', 'cached'],
      required: true,
    },
    error: {
      message: String,
      code: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('PromptExecution', promptExecutionSchema);
