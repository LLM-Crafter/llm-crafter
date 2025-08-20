const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  getPasswordPolicyDescription,
  validatePassword,
} = require("../utils/passwordPolicy");

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const getPasswordPolicy = async (req, res) => {
  try {
    const policyDescription = getPasswordPolicyDescription();
    res.json({
      success: true,
      data: policyDescription,
    });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch password policy" });
  }
};

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Additional password validation with detailed feedback
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: "Password does not meet security requirements",
        details: passwordValidation.errors,
        policy: passwordValidation.policy,
      });
    }

    const user = new User({ email, password, name });
    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
      passwordStrength: passwordValidation.strength,
      warnings: passwordValidation.warnings,
    });
  } catch (error) {
    console.error("Registration error:", error);

    // Handle validation errors specifically
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        error: "Validation failed",
        details: validationErrors,
      });
    }

    res.status(500).json({ error: "Registration failed" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const shouldUpdatePassword = user.shouldUpdatePassword();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      security: {
        shouldUpdatePassword,
        passwordStrength: user.passwordStrength,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch profile" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.password) {
      // Validate new password
      const passwordValidation = validatePassword(req.body.password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          error: "New password does not meet security requirements",
          details: passwordValidation.errors,
          policy: passwordValidation.policy,
        });
      }
      updates.password = req.body.password;
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    Object.assign(user, updates);
    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      security: {
        shouldUpdatePassword: user.shouldUpdatePassword(),
        passwordStrength: user.passwordStrength,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);

    // Handle validation errors specifically
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        error: "Validation failed",
        details: validationErrors,
      });
    }

    res.status(500).json({ error: "Could not update profile" });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  getPasswordPolicy,
};
