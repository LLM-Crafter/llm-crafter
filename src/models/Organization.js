const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const organizationSchema = new mongoose.Schema({
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
  owner: {
    type: String,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: String,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'viewer'],
      default: 'member'
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Organization', organizationSchema);
