const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { validatePassword } = require('../utils/passwordPolicy');

const userSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function () {
        // Password is only required if no OAuth providers are configured
        return !this.oauth || Object.keys(this.oauth).length === 0;
      },
      validate: {
        validator(password) {
          // Skip validation if no password (OAuth user) or if password is already hashed
          if (
            !password ||
            (this.isModified('password') && !password.startsWith('$2a$'))
          ) {
            if (!password) return true; // Allow empty password for OAuth users
            const result = validatePassword(password);
            return result.isValid;
          }
          return true;
        },
        message(props) {
          if (!props.value) return 'Password is required for non-OAuth users';
          const result = validatePassword(props.value);
          return (
            result.errors[0] || 'Password does not meet security requirements'
          );
        },
      },
    },
    name: {
      type: String,
      required: true,
    },
    passwordStrength: {
      type: String,
      enum: ['very-weak', 'weak', 'medium', 'strong', 'very-strong'],
      default: 'weak',
    },
    // OAuth provider data
    oauth: {
      google: {
        id: String,
        email: String,
        verified: { type: Boolean, default: false },
      },
      github: {
        id: String,
        username: String,
        email: String,
      },
      // Can add more providers here (microsoft, facebook, etc.)
    },
    // Email verification status
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // Avatar/profile picture URL (from OAuth or uploaded)
    avatar: String,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.password;
        delete ret.passwordStrength;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    // Calculate password strength before hashing
    const { calculatePasswordStrength } = require('../utils/passwordPolicy');
    this.passwordStrength = calculatePasswordStrength(this.password);

    // Hash the password
    const salt = await bcrypt.genSalt(12); // Increased salt rounds for better security
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false; // OAuth users don't have passwords
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if password needs updating (for security audits)
userSchema.methods.shouldUpdatePassword = function () {
  // OAuth users don't need password updates
  if (!this.password) return false;
  // Suggest update if password strength is very weak or weak
  return ['very-weak', 'weak'].includes(this.passwordStrength);
};

// Method to check if user is OAuth-only
userSchema.methods.isOAuthUser = function () {
  return !this.password && this.oauth && Object.keys(this.oauth).length > 0;
};

// Method to get primary OAuth provider
userSchema.methods.getPrimaryOAuthProvider = function () {
  if (!this.oauth) return null;

  // Return the first configured OAuth provider
  for (const [provider, data] of Object.entries(this.oauth)) {
    if (data && data.id) {
      return provider;
    }
  }
  return null;
};

module.exports = mongoose.model('User', userSchema);
