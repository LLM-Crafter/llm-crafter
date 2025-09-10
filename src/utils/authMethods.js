/**
 * Authentication method utilities
 * Manages which authentication methods are enabled via environment variables
 */

/**
 * Get enabled authentication methods from environment
 * @returns {string[]} Array of enabled auth methods
 */
const getEnabledAuthMethods = () => {
  const authMethods = process.env.AUTH_METHODS || 'emailpassword,oauth';
  return authMethods.split(',').map(method => method.trim().toLowerCase());
};

/**
 * Check if email/password authentication is enabled
 * @returns {boolean}
 */
const isEmailPasswordEnabled = () => {
  const methods = getEnabledAuthMethods();
  return methods.includes('emailpassword');
};

/**
 * Check if OAuth authentication is enabled
 * @returns {boolean}
 */
const isOAuthEnabled = () => {
  const methods = getEnabledAuthMethods();
  return methods.includes('oauth');
};

/**
 * Get authentication configuration for API responses
 * @returns {object} Auth configuration object
 */
const getAuthConfig = () => {
  return {
    enabledMethods: getEnabledAuthMethods(),
    emailPasswordEnabled: isEmailPasswordEnabled(),
    oauthEnabled: isOAuthEnabled(),
  };
};

/**
 * Middleware to check if email/password auth is enabled
 */
const requireEmailPasswordAuth = (req, res, next) => {
  if (!isEmailPasswordEnabled()) {
    return res.status(400).json({
      error: 'Email/password authentication is disabled',
      code: 'AUTH_METHOD_DISABLED',
      enabledMethods: getEnabledAuthMethods(),
    });
  }
  next();
};

/**
 * Middleware to check if OAuth auth is enabled
 */
const requireOAuthAuth = (req, res, next) => {
  if (!isOAuthEnabled()) {
    return res.status(400).json({
      error: 'OAuth authentication is disabled',
      code: 'AUTH_METHOD_DISABLED',
      enabledMethods: getEnabledAuthMethods(),
    });
  }
  next();
};

module.exports = {
  getEnabledAuthMethods,
  isEmailPasswordEnabled,
  isOAuthEnabled,
  getAuthConfig,
  requireEmailPasswordAuth,
  requireOAuthAuth,
};
