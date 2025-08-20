const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { validatePassword } = require("../utils/passwordPolicy");

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
      required: true,
      validate: {
        validator: function (password) {
          // Skip validation if password is already hashed (during save operations)
          if (this.isModified("password") && !password.startsWith("$2a$")) {
            const result = validatePassword(password);
            return result.isValid;
          }
          return true;
        },
        message: function (props) {
          const result = validatePassword(props.value);
          return (
            result.errors[0] || "Password does not meet security requirements"
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
      enum: ["very-weak", "weak", "medium", "strong", "very-strong"],
      default: "weak",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.passwordStrength;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    // Calculate password strength before hashing
    const { calculatePasswordStrength } = require("../utils/passwordPolicy");
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
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if password needs updating (for security audits)
userSchema.methods.shouldUpdatePassword = function () {
  // Suggest update if password strength is very weak or weak
  return ["very-weak", "weak"].includes(this.passwordStrength);
};

module.exports = mongoose.model("User", userSchema);
