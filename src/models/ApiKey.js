const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const apiKeySchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  key: {
    type: String,
    required: true,
    unique: true
  },
  provider: {
    type: String,
    ref: 'Provider',
    required: true
  },
  project: {
    type: String,
    ref: 'Project',
    required: true
  },
  usage: {
    total_tokens: {
      type: Number,
      default: 0
    },
    total_cost: {
      type: Number,
      default: 0
    },
    usage_by_model: [{
      model: String,
      input_tokens: Number,
      output_tokens: Number,
      cost: Number
    }]
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});


module.exports = mongoose.model('ApiKey', apiKeySchema);
