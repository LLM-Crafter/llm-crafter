const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const providerSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  models: [{
    type: String,
    required: true
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Provider', providerSchema);
