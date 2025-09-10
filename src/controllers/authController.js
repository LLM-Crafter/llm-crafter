const jwt = require('jsonwebtoken');
const passport = require('passport');
const User = require('../models/User');
const {
  getPasswordPolicyDescription,
  validatePassword,
} = require('../utils/passwordPolicy');
const {
  getAuthConfig,
  isEmailPasswordEnabled,
  isOAuthEnabled,
} = require('../utils/authMethods');

// Helper function to check domain restrictions
const isDomainAllowed = email => {
  const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;
  if (!allowedDomains) return true; // No restrictions if not configured

  const domains = allowedDomains.split(',').map(d => d.trim().toLowerCase());
  const emailDomain = email.split('@')[1]?.toLowerCase();

  return domains.includes(emailDomain);
};

const generateToken = userId => {
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
    res.status(500).json({ error: 'Could not fetch password policy' });
  }
};

const register = async (req, res) => {
  try {
    // Check if email/password registration is enabled
    if (!isEmailPasswordEnabled()) {
      return res.status(400).json({
        error: 'Email/password registration is disabled',
        code: 'AUTH_METHOD_DISABLED',
        enabledMethods: getAuthConfig().enabledMethods,
      });
    }

    const { email, password, name } = req.body;

    // Check domain restrictions
    if (!isDomainAllowed(email)) {
      return res.status(400).json({
        error: 'Email domain not allowed. Contact administrator for access.',
        code: 'DOMAIN_NOT_ALLOWED',
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Additional password validation with detailed feedback
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
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
        emailVerified: user.emailVerified,
        isOAuthUser: user.isOAuthUser(),
        avatar: user.avatar,
      },
      passwordStrength: passwordValidation.strength,
      warnings: passwordValidation.warnings,
    });
  } catch (error) {
    console.error('Registration error:', error);

    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(
        err => err.message
      );
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    // Check if email/password login is enabled
    if (!isEmailPasswordEnabled()) {
      return res.status(400).json({
        error: 'Email/password login is disabled',
        code: 'AUTH_METHOD_DISABLED',
        enabledMethods: getAuthConfig().enabledMethods,
      });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is OAuth-only
    if (user.isOAuthUser()) {
      return res.status(400).json({
        error: 'Please sign in using your OAuth provider',
        code: 'OAUTH_ONLY_USER',
        availableProviders: Object.keys(user.oauth || {}),
      });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        isOAuthUser: user.isOAuthUser(),
        avatar: user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
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
      emailVerified: user.emailVerified,
      isOAuthUser: user.isOAuthUser(),
      avatar: user.avatar,
      primaryOAuthProvider: user.getPrimaryOAuthProvider(),
      connectedProviders: user.oauth
        ? Object.keys(user.oauth).filter(provider => user.oauth[provider]?.id)
        : [],
      security: {
        shouldUpdatePassword,
        passwordStrength: user.passwordStrength,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const updates = {};
    if (req.body.name) {
      updates.name = req.body.name;
    }
    if (req.body.password) {
      // Validate new password
      const passwordValidation = validatePassword(req.body.password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          error: 'New password does not meet security requirements',
          details: passwordValidation.errors,
          policy: passwordValidation.policy,
        });
      }
      updates.password = req.body.password;
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
    console.error('Profile update error:', error);

    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(
        err => err.message
      );
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors,
      });
    }

    res.status(500).json({ error: 'Could not update profile' });
  }
};

// OAuth success handler
const oauthSuccess = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=authentication_failed`
      );
    }

    const token = generateToken(req.user._id);

    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/success?token=${token}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth success error:', error);
    res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=token_generation_failed`
    );
  }
};

// OAuth failure handler
const oauthFailure = (req, res) => {
  const error = req.query.error || 'authentication_failed';
  res.redirect(
    `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=${error}`
  );
};

// Get available OAuth providers
const getOAuthProviders = (req, res) => {
  const providers = [];

  // Only show providers if OAuth is enabled
  if (isOAuthEnabled()) {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      providers.push({
        name: 'google',
        displayName: 'Google',
        authUrl: '/api/v1/auth/google',
      });
    }

    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      providers.push({
        name: 'github',
        displayName: 'GitHub',
        authUrl: '/api/v1/auth/github',
      });
    }
  }

  const authConfig = getAuthConfig();

  res.json({
    success: true,
    data: {
      providers,
      authMethods: authConfig,
      domainRestricted: !!process.env.ALLOWED_EMAIL_DOMAINS,
      allowedDomains: process.env.ALLOWED_EMAIL_DOMAINS
        ? process.env.ALLOWED_EMAIL_DOMAINS.split(',').map(d => d.trim())
        : null,
    },
  });
};

// Unlink OAuth provider
const unlinkOAuthProvider = async (req, res) => {
  try {
    const { provider } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has a password or other OAuth providers before unlinking
    const hasPassword = !!user.password;
    const otherProviders = user.oauth
      ? Object.keys(user.oauth).filter(p => p !== provider && user.oauth[p]?.id)
      : [];

    if (!hasPassword && otherProviders.length === 0) {
      return res.status(400).json({
        error:
          'Cannot unlink the only authentication method. Set a password first.',
        code: 'LAST_AUTH_METHOD',
      });
    }

    // Remove the provider
    if (user.oauth && user.oauth[provider]) {
      user.oauth[provider] = undefined;
      user.markModified('oauth');
      await user.save();
    }

    res.json({
      success: true,
      message: `${provider} account unlinked successfully`,
    });
  } catch (error) {
    console.error('Unlink OAuth provider error:', error);
    res.status(500).json({ error: 'Failed to unlink OAuth provider' });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  getPasswordPolicy,
  oauthSuccess,
  oauthFailure,
  getOAuthProviders,
  unlinkOAuthProvider,
};
