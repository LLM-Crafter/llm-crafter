const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { apiKeyAuth } = require("../middleware/apiKeyAuth");
const validate = require("../middleware/validate");
const { proxyLimiter, generalLimiter } = require("../middleware/rateLimiting");

// Validation middleware
const generateSessionValidation = [
  body("agentId")
    .notEmpty()
    .withMessage("Agent ID is required")
    .isMongoId()
    .withMessage("Invalid agent ID format"),
  body("maxInteractions")
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage("Max interactions must be between 1 and 1000"),
  body("expiresIn")
    .optional()
    .isInt({ min: 60, max: 86400 })
    .withMessage(
      "Expires in must be between 60 and 86400 seconds (1 minute to 24 hours)"
    ),
];

// ===== SESSION TOKEN ROUTES =====

// Generate a new session token for agent execution
router.post(
  "/",
  proxyLimiter, // Rate limit: 60 requests per minute
  apiKeyAuth(["agents:execute"]), // Requires API key with agents:execute scope
  generateSessionValidation,
  validate,
  sessionController.generateSessionToken
);

// Get all active sessions for the API key
router.get(
  "/",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  apiKeyAuth(), // Requires valid API key (any scope)
  sessionController.getSessions
);

// Get a specific session
router.get(
  "/:sessionId",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  apiKeyAuth(), // Requires valid API key (any scope)
  sessionController.getSession
);

// Revoke a specific session
router.delete(
  "/:sessionId",
  proxyLimiter, // Rate limit: 60 requests per minute
  apiKeyAuth(), // Requires valid API key (any scope)
  sessionController.revokeSession
);

// Revoke all sessions for the API key
router.delete(
  "/",
  proxyLimiter, // Rate limit: 60 requests per minute
  apiKeyAuth(), // Requires valid API key (any scope)
  sessionController.revokeAllSessions
);

// Admin endpoint to cleanup expired sessions (requires special scope)
router.post(
  "/cleanup",
  generalLimiter,
  apiKeyAuth(["statistics:read"]), // Reusing statistics scope for admin operations
  sessionController.cleanupExpiredSessions
);

module.exports = router;
