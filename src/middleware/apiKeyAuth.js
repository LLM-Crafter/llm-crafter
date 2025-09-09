const UserApiKey = require("../models/UserApiKey");
const crypto = require("crypto");

/**
 * Middleware to authenticate requests using API keys
 * @param {Array} requiredScopes - Array of required scopes for this endpoint
 * @returns {Function} Express middleware function
 */
const apiKeyAuth = (requiredScopes = []) => {
  return async (req, res, next) => {
    try {
      // Extract API key from headers
      const apiKey =
        req.header("X-API-Key") ||
        (req.header("Authorization")?.startsWith("Bearer ")
          ? req.header("Authorization").replace("Bearer ", "")
          : null);

      if (!apiKey) {
        return res.status(401).json({
          error: "API key required",
          code: "API_KEY_REQUIRED",
        });
      }

      // Hash the provided key to compare with stored hash
      const keyHash = UserApiKey.hashApiKey(apiKey);

      // Find and validate the key
      const userApiKey = await UserApiKey.findOne({
        key_hash: keyHash,
        is_active: true,
      }).populate(["user", "organization"]);

      if (!userApiKey) {
        return res.status(401).json({
          error: "Invalid API key",
          code: "INVALID_API_KEY",
        });
      }

      // Check expiration
      if (userApiKey.isExpired()) {
        return res.status(401).json({
          error: "API key expired",
          code: "API_KEY_EXPIRED",
        });
      }

      // Check scopes
      if (requiredScopes.length > 0) {
        const hasRequiredScope = requiredScopes.some((scope) =>
          userApiKey.hasScope(scope)
        );
        if (!hasRequiredScope) {
          return res.status(403).json({
            error: "Insufficient permissions",
            code: "INSUFFICIENT_PERMISSIONS",
            required_scopes: requiredScopes,
            available_scopes: userApiKey.scopes,
          });
        }
      }

      // Validate API key restrictions
      await validateApiKeyRestrictions(userApiKey, req);

      // Update usage statistics
      await userApiKey.updateUsage();

      // Attach to request object
      req.apiKey = userApiKey;
      req.user = userApiKey.user;
      req.organization = userApiKey.organization;

      next();
    } catch (error) {
      console.error("API key authentication error:", error);

      if (
        error.message.includes("IP address not allowed") ||
        error.message.includes("Domain not allowed") ||
        error.message.includes("Daily execution limit exceeded")
      ) {
        return res.status(403).json({
          error: error.message,
          code: "ACCESS_RESTRICTED",
        });
      }

      res.status(401).json({
        error: "API key authentication failed",
        code: "AUTH_FAILED",
      });
    }
  };
};

/**
 * Validate API key restrictions (IP, domain, rate limits)
 * @param {Object} userApiKey - The UserApiKey document
 * @param {Object} req - Express request object
 */
const validateApiKeyRestrictions = async (userApiKey, req) => {
  // Check IP whitelist
  if (
    userApiKey.restrictions.ip_whitelist &&
    userApiKey.restrictions.ip_whitelist.length > 0
  ) {
    const clientIP = req.ip || req.connection.remoteAddress;
    if (!userApiKey.restrictions.ip_whitelist.includes(clientIP)) {
      throw new Error("IP address not allowed");
    }
  }

  // Check domain whitelist
  const origin = req.get("Origin") || req.get("Referer");
  if (
    userApiKey.restrictions.domain_whitelist &&
    userApiKey.restrictions.domain_whitelist.length > 0 &&
    origin
  ) {
    try {
      const domain = new URL(origin).hostname;
      if (!userApiKey.restrictions.domain_whitelist.includes(domain)) {
        throw new Error("Domain not allowed");
      }
    } catch (urlError) {
      // Invalid URL in Origin/Referer header
      throw new Error("Invalid origin domain");
    }
  }

  // Check daily execution limits
  if (!userApiKey.isWithinDailyLimit()) {
    throw new Error("Daily execution limit exceeded");
  }
};

/**
 * Middleware that supports both JWT and API key authentication
 * @param {Object} options - Configuration options
 * @param {Boolean} options.allowApiKey - Allow API key authentication
 * @param {Boolean} options.allowJWT - Allow JWT authentication
 * @param {Array} options.requiredScopes - Required scopes for API key auth
 * @returns {Function} Express middleware function
 */
const flexibleAuth = (options = {}) => {
  const { allowApiKey = true, allowJWT = true, requiredScopes = [] } = options;

  return async (req, res, next) => {
    const authHeader = req.header("Authorization");
    const apiKeyHeader = req.header("X-API-Key");

    // Try API key first if provided
    if (allowApiKey && apiKeyHeader) {
      return apiKeyAuth(requiredScopes)(req, res, next);
    }

    // Try JWT token if provided and no API key
    if (allowJWT && authHeader?.startsWith("Bearer ") && !apiKeyHeader) {
      // Import auth middleware here to avoid circular dependencies
      const auth = require("./auth");
      return auth(req, res, next);
    }

    // If API key is in Authorization header (Bearer format)
    if (
      allowApiKey &&
      authHeader?.startsWith("Bearer ") &&
      !req.header("X-API-Key")
    ) {
      return apiKeyAuth(requiredScopes)(req, res, next);
    }

    return res.status(401).json({
      error: "Authentication required",
      code: "AUTH_REQUIRED",
      accepted_methods: [
        ...(allowJWT ? ["JWT Token (Authorization: Bearer <token>)"] : []),
        ...(allowApiKey
          ? ["API Key (X-API-Key: <key> or Authorization: Bearer <key>)"]
          : []),
      ],
    });
  };
};

module.exports = {
  apiKeyAuth,
  flexibleAuth,
  validateApiKeyRestrictions,
};
