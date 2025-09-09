const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const sessionTokenSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4
    },
    token_hash: {
      type: String,
      required: true,
      unique: true
    },
    user_api_key: {
      type: String,
      ref: 'UserApiKey',
      required: true
    },
    agent: {
      type: String,
      ref: 'Agent',
      required: true
    },

    // Security
    expires_at: {
      type: Date,
      required: true
    }, // Short-lived (15-60 minutes)
    client_ip: String,
    client_domain: String,

    // Usage limits for this session
    max_interactions: {
      type: Number,
      default: 100
    },
    interactions_used: {
      type: Number,
      default: 0
    },

    // Metadata
    last_used_at: Date,
    is_revoked: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform (doc, ret) {
        // Never expose the actual token hash
        delete ret.token_hash;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient lookups
sessionTokenSchema.index({ token_hash: 1 });
sessionTokenSchema.index({ user_api_key: 1, agent: 1 });
sessionTokenSchema.index({ expires_at: 1 }); // For cleanup of expired tokens
sessionTokenSchema.index({ is_revoked: 1, expires_at: 1 });

// Static method to generate a secure session token
sessionTokenSchema.statics.generateSessionToken = function () {
  return crypto.randomBytes(32).toString('hex');
};

// Static method to hash a session token
sessionTokenSchema.statics.hashSessionToken = function (sessionToken) {
  return crypto.createHash('sha256').update(sessionToken).digest('hex');
};

// Method to check if the session token is expired
sessionTokenSchema.methods.isExpired = function () {
  return this.expires_at < new Date();
};

// Method to check if the session token is valid (not expired and not revoked)
sessionTokenSchema.methods.isValid = function () {
  return !this.is_revoked && !this.isExpired();
};

// Method to check if the session can handle more interactions
sessionTokenSchema.methods.canInteract = function () {
  return this.interactions_used < this.max_interactions;
};

// Method to use an interaction
sessionTokenSchema.methods.useInteraction = async function () {
  if (!this.canInteract()) {
    throw new Error('Session interaction limit exceeded');
  }

  this.interactions_used += 1;
  this.last_used_at = new Date();
  await this.save();

  return this.max_interactions - this.interactions_used; // Return remaining interactions
};

// Method to revoke the session
sessionTokenSchema.methods.revoke = async function () {
  this.is_revoked = true;
  await this.save();
};

// Static method to cleanup expired tokens (can be run as a scheduled job)
sessionTokenSchema.statics.cleanupExpired = async function () {
  const result = await this.deleteMany({
    $or: [
      { expires_at: { $lt: new Date() } },
      {
        is_revoked: true,
        updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      } // Remove revoked tokens older than 24 hours
    ]
  });

  return result.deletedCount;
};

module.exports = mongoose.model('SessionToken', sessionTokenSchema);
