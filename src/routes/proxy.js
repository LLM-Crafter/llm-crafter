const express = require("express");
const router = express.Router();
const proxyController = require("../controllers/proxyController");
const auth = require("../middleware/auth");
const {
  proxyLimiter,
  generalLimiter,
  generalSlowDown,
} = require("../middleware/rateLimiting");

router.post(
  "/organizations/:orgId/projects/:projectId/execute/:promptName",
  proxyLimiter, // Rate limit: 60 requests per minute
  generalSlowDown, // Progressive delays after 50 requests
  auth,
  proxyController.executePrompt
);

router.post(
  "/test-prompt",
  proxyLimiter, // Rate limit: 60 requests per minute
  generalSlowDown, // Progressive delays
  auth,
  proxyController.testPrompt
);

router.get(
  "/organizations/:orgId/projects/:projectId/prompts/:promptId/executions",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  proxyController.getPromptExecutions
);

module.exports = router;
