const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const projectSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  organization: {
    type: String,
    ref: 'Organization',
    required: true
  },
  llm_configurations: [{
    provider: {
      type: String,
      required: true
    },
    api_key: {
      type: String,
      required: true
    },
    model: String,
    default_parameters: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Project', projectSchema);
