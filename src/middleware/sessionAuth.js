const SessionToken = require("../models/SessionToken");
const crypto = require("crypto");

/**
 * Middleware to authenticate requests using session tokens
 * This is used for agent execution after a session token has been generated
 */
const sessionAuth = async (req, res, next) => {
  try {
    // Extract session token from headers
    const sessionToken =
      req.header("X-Session-Token") ||
      (req.header("Authorization")?.startsWith("Session ")
        ? req.header("Authorization").replace("Session ", "")
        : null);

    if (!sessionToken) {
      return res.status(401).json({
        error: "Session token required",
        code: "SESSION_TOKEN_REQUIRED",
      });
    }

    // Hash the provided token to compare with stored hash
    const tokenHash = SessionToken.hashSessionToken(sessionToken);

    // Find and validate the session
    const session = await SessionToken.findOne({
      token_hash: tokenHash,
      is_revoked: false,
      expires_at: { $gt: new Date() },
    }).populate([
      {
        path: "user_api_key",
        populate: {
          path: "user organization",
        },
      },
      "agent",
    ]);

    if (!session) {
      return res.status(401).json({
        error: "Invalid or expired session token",
        code: "INVALID_SESSION_TOKEN",
      });
    }

    // Additional validation
    if (!session.isValid()) {
      return res.status(401).json({
        error: "Session token is no longer valid",
        code: "SESSION_INVALID",
      });
    }

    // Check interaction limits
    if (!session.canInteract()) {
      return res.status(429).json({
        error: "Session interaction limit exceeded",
        code: "INTERACTION_LIMIT_EXCEEDED",
        max_interactions: session.max_interactions,
        interactions_used: session.interactions_used,
      });
    }

    // Validate that the session's API key is still active
    if (!session.user_api_key.is_active) {
      return res.status(401).json({
        error: "Associated API key is no longer active",
        code: "API_KEY_INACTIVE",
      });
    }

    // Check if API key is expired
    if (session.user_api_key.isExpired()) {
      return res.status(401).json({
        error: "Associated API key has expired",
        code: "API_KEY_EXPIRED",
      });
    }

    // Optional: Validate IP consistency (if enabled)
    if (process.env.ENFORCE_SESSION_IP_CONSISTENCY === "true") {
      const currentIP = req.ip || req.connection.remoteAddress;
      if (session.client_ip && session.client_ip !== currentIP) {
        return res.status(403).json({
          error: "IP address mismatch",
          code: "IP_MISMATCH",
        });
      }
    }

    // Use an interaction (this will save the session)
    const remainingInteractions = await session.useInteraction();

    // Attach session data to request
    req.session = session;
    req.user = session.user_api_key.user;
    req.organization = session.user_api_key.organization;
    req.apiKey = session.user_api_key;
    req.agent = session.agent;
    req.remainingInteractions = remainingInteractions;

    next();
  } catch (error) {
    console.error("Session authentication error:", error);

    if (error.message === "Session interaction limit exceeded") {
      return res.status(429).json({
        error: error.message,
        code: "INTERACTION_LIMIT_EXCEEDED",
      });
    }

    res.status(401).json({
      error: "Session authentication failed",
      code: "SESSION_AUTH_FAILED",
    });
  }
};

/**
 * Middleware to authenticate requests using either session tokens or API keys
 * Useful for endpoints that can work with both authentication methods
 */
const flexibleSessionAuth = (options = {}) => {
  const {
    allowSessionToken = true,
    allowApiKey = true,
    requiredScopes = [],
  } = options;

  return async (req, res, next) => {
    const sessionTokenHeader = req.header("X-Session-Token");
    const authHeader = req.header("Authorization");
    const apiKeyHeader = req.header("X-API-Key");

    // Try session token first if provided
    if (allowSessionToken && sessionTokenHeader) {
      return sessionAuth(req, res, next);
    }

    // Try session token in Authorization header
    if (allowSessionToken && authHeader?.startsWith("Session ")) {
      return sessionAuth(req, res, next);
    }

    // Try API key if provided and no session token
    if (allowApiKey && (apiKeyHeader || authHeader?.startsWith("Bearer "))) {
      const { apiKeyAuth } = require("./apiKeyAuth");
      return apiKeyAuth(requiredScopes)(req, res, next);
    }

    return res.status(401).json({
      error: "Authentication required",
      code: "AUTH_REQUIRED",
      accepted_methods: [
        ...(allowSessionToken
          ? [
              "Session Token (X-Session-Token: <token> or Authorization: Session <token>)",
            ]
          : []),
        ...(allowApiKey
          ? ["API Key (X-API-Key: <key> or Authorization: Bearer <key>)"]
          : []),
      ],
    });
  };
};

/**
 * Middleware to validate that a session is for a specific agent
 * Use this when the agent ID is in the URL parameters
 */
const validateSessionAgent = (req, res, next) => {
  const agentIdFromUrl = req.params.agentId;

  if (!req.session) {
    return res.status(401).json({
      error: "Session authentication required",
      code: "SESSION_REQUIRED",
    });
  }

  if (req.session.agent._id.toString() !== agentIdFromUrl) {
    return res.status(403).json({
      error: "Session is not authorized for this agent",
      code: "AGENT_MISMATCH",
    });
  }

  next();
};

module.exports = {
  sessionAuth,
  flexibleSessionAuth,
  validateSessionAgent,
};
