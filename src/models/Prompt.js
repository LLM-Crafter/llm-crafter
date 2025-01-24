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
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  project: {
    type: String,
    ref: 'Project',
    required: true
  },
  version: {
    type: Number,
    default: 1
  },
  default_llm: {
    provider: String,
    model: String,
    parameters: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Prompt', promptSchema);
