const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const userApiKeySchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    key_hash: {
      type: String,
      required: true,
      unique: true
    },
    user: {
      type: String,
      ref: 'User',
      required: true
    },
    organization: {
      type: String,
      ref: 'Organization',
      required: true
    },

    // Scopes define what this key can access
    scopes: [
      {
        type: String,
        enum: [
          'prompts:execute', // Execute prompts
          'agents:read', // Read agent configurations
          'agents:execute', // Execute agents (generates session tokens)
          'agents:chat', // Direct agent chat (restricted)
          'projects:read', // Read project info
          'statistics:read' // Read usage statistics
        ]
      }
    ],

    // Security restrictions
    restrictions: {
      ip_whitelist: [String], // Allowed IP addresses
      domain_whitelist: [String], // Allowed referring domains
      rate_limit_override: Number, // Custom rate limit (requests/minute)
      max_executions_per_day: Number // Daily execution limit
    },

    // Usage tracking
    usage: {
      total_requests: { type: Number, default: 0 },
      last_used_at: Date,
      executions_today: { type: Number, default: 0 },
      last_reset_date: { type: Date, default: Date.now }
    },

    // Metadata
    expires_at: Date, // Optional expiration
    is_active: { type: Boolean, default: true },
    created_by: { type: String, ref: 'User' },
    last_rotated_at: Date,

    // Projects this key can access (if empty, can access all projects in org)
    allowed_projects: [{ type: String, ref: 'Project' }]
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform (doc, ret) {
        // Never expose the actual key hash
        delete ret.key_hash;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Index for efficient lookups
userApiKeySchema.index({ key_hash: 1 });
userApiKeySchema.index({ user: 1, organization: 1 });
userApiKeySchema.index({ organization: 1, is_active: 1 });

// Static method to generate a secure API key
userApiKeySchema.statics.generateApiKey = function () {
  return crypto.randomBytes(32).toString('hex');
};

// Static method to hash an API key
userApiKeySchema.statics.hashApiKey = function (apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

// Method to check if the API key is expired
userApiKeySchema.methods.isExpired = function () {
  return this.expires_at && this.expires_at < new Date();
};

// Method to check if the API key has a specific scope
userApiKeySchema.methods.hasScope = function (scope) {
  return this.scopes.includes(scope);
};

// Method to check if the API key can access a specific project
userApiKeySchema.methods.canAccessProject = function (projectId) {
  // If no allowed_projects specified, can access all projects in the organization
  if (this.allowed_projects.length === 0) {
    return true;
  }
  return this.allowed_projects.includes(projectId);
};

// Method to update usage statistics
userApiKeySchema.methods.updateUsage = async function () {
  // Reset counter if new day
  const today = new Date().toDateString();
  const lastReset = new Date(this.usage.last_reset_date).toDateString();

  if (today !== lastReset) {
    this.usage.executions_today = 0;
    this.usage.last_reset_date = new Date();
  }

  this.usage.total_requests += 1;
  this.usage.executions_today += 1;
  this.usage.last_used_at = new Date();

  await this.save();
};

// Method to check daily limits
userApiKeySchema.methods.isWithinDailyLimit = function () {
  if (!this.restrictions.max_executions_per_day) {
    return true;
  }

  // Reset counter if new day
  const today = new Date().toDateString();
  const lastReset = new Date(this.usage.last_reset_date).toDateString();

  if (today !== lastReset) {
    return true; // New day, so within limit
  }

  return this.usage.executions_today < this.restrictions.max_executions_per_day;
};

module.exports = mongoose.model('UserApiKey', userApiKeySchema);
