const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const promptCacheSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    hash: {
      type: String,
      required: true,
    },
    prompt: {
      type: String,
      ref: 'Prompt',
      required: true,
    },
    result: {
      type: String,
      required: true,
    },
    usage: {
      prompt_tokens: Number,
      completion_tokens: Number,
      total_tokens: Number,
      cost: Number,
    },
    metadata: {
      model: String,
      finish_reason: String,
    },
    hits: {
      type: Number,
      default: 1,
    },
    last_accessed: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

promptCacheSchema.index({ hash: 1 }, { unique: true });
promptCacheSchema.index({ last_accessed: 1 });

module.exports = mongoose.model('PromptCache', promptCacheSchema);
