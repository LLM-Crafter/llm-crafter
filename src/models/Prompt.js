const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const promptSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  name: {
    type: String,
    required: true,
    trim: true,
    match: /^[a-z0-9_]+$/  // Only lowercase letters, numbers, and underscores
  },
  description: String,
  content: String,
  project: {
    type: String,
    ref: 'Project',
    required: true
  },
  version: {
    type: Number,
    default: 1
  },
  api_key: {
    type: String,
    ref: 'APIKey'
  },
  llm_settings: {
    model: String,
    parameters: {
      temperature: Number,
      max_tokens: Number,
      top_p: Number,
      frequency_penalty: Number,
      presence_penalty: Number
    }
  }
}, {
  timestamps: true
});

// Ensure unique prompt names within a project
promptSchema.index({ project: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Prompt', promptSchema);
