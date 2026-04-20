const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const externalOperatorSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    // The 3rd party's own identifier for this operator
    external_id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    avatar_url: {
      type: String,
      trim: true,
    },
    organization: {
      type: String,
      ref: 'Organization',
      required: true,
    },
    project: {
      type: String,
      ref: 'Project',
      required: true,
    },
    // Skills for routing (e.g. ['billing', 'technical', 'sales'])
    skills: {
      type: [String],
      default: [],
    },
    // Online status — updated by the 3rd party app
    status: {
      type: String,
      enum: ['online', 'offline', 'busy'],
      default: 'offline',
    },
    // Arbitrary metadata the 3rd party can store
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Unique external_id per project
externalOperatorSchema.index(
  { project: 1, external_id: 1 },
  { unique: true }
);

// Fast lookup of online operators per project
externalOperatorSchema.index({ project: 1, status: 1 });

module.exports = mongoose.model('ExternalOperator', externalOperatorSchema);
