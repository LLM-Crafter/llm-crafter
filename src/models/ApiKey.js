const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const encryptionUtil = require('../utils/encryption');

const apiKeySchema = new mongoose.Schema(
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
      usage_by_model: [
        {
          model: String,
          input_tokens: Number,
          output_tokens: Number,
          cost: Number
        }
      ]
    },
    is_active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Encrypt API key before saving
apiKeySchema.pre('save', function (next) {
  if (this.isModified('key') && this.key) {
    try {
      // Only encrypt if it's not already encrypted
      if (!encryptionUtil.isEncrypted(this.key)) {
        this.key = encryptionUtil.encrypt(this.key);
      }
    } catch (error) {
      return next(new Error(`API key encryption failed: ${error.message}`));
    }
  }
  next();
});

// Add method to get decrypted API key
apiKeySchema.methods.getDecryptedKey = function () {
  try {
    if (!this.key) {
      throw new Error('No API key stored');
    }

    // If it looks encrypted, decrypt it
    if (encryptionUtil.isEncrypted(this.key)) {
      return encryptionUtil.decrypt(this.key);
    }

    // If not encrypted (for backward compatibility), return as-is
    // This allows for gradual migration of existing keys
    return this.key;
  } catch (error) {
    throw new Error(`API key decryption failed: ${error.message}`);
  }
};

// Add virtual for decrypted key (but don't include in JSON by default for security)
apiKeySchema.virtual('decryptedKey').get(function () {
  return this.getDecryptedKey();
});

// Ensure virtual fields are not included in JSON output by default
apiKeySchema.set('toJSON', {
  transform (doc, ret) {
    delete ret.key; // Never expose encrypted key in JSON
    delete ret.decryptedKey; // Never expose decrypted key in JSON
    return ret;
  }
});

// Add static method to find and decrypt API key
apiKeySchema.statics.findByIdWithDecryptedKey = async function (id) {
  const apiKey = await this.findById(id).populate('provider');
  if (!apiKey) {
    return null;
  }

  return {
    ...apiKey.toObject(),
    decryptedKey: apiKey.getDecryptedKey()
  };
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
