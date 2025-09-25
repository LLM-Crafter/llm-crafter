const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const proxyController = require('../controllers/proxyController');
const agentController = require('../controllers/agentController');
const { apiKeyAuth, flexibleAuth } = require('../middleware/apiKeyAuth');
const {
  sessionAuth,
  flexibleSessionAuth,
} = require('../middleware/sessionAuth');
const validate = require('../middleware/validate');
const { proxyLimiter, generalLimiter } = require('../middleware/rateLimiting');

// Validation middleware
const promptExecutionValidation = [
  body('variables')
    .optional()
    .isObject()
    .withMessage('Variables must be an object'),
];

const agentChatValidation = [
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 4000 })
    .withMessage('Message must be less than 4000 characters'),
  body('userIdentifier')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('User identifier must be less than 100 characters'),
  body('dynamicContext')
    .optional()
    .isObject()
    .withMessage('Dynamic context must be an object'),
];

const agentTaskValidation = [
  body('input')
    .notEmpty()
    .withMessage('Input is required')
    .isLength({ max: 26000 })
    .withMessage('Input must be less than 12000 characters'),
  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object'),
];

// Middleware to validate project access for API keys
const validateProjectAccess = (req, res, next) => {
  if (req.apiKey && !req.apiKey.canAccessProject(req.params.projectId)) {
    return res.status(403).json({
      error: 'Access denied to this project',
      code: 'PROJECT_ACCESS_DENIED',
    });
  }
  next();
};

// ===== PROMPT EXECUTION ROUTES =====

// Execute a prompt with API key authentication
router.post(
  '/organizations/:orgId/projects/:projectId/prompts/:promptName/execute',
  proxyLimiter, // Rate limit: 60 requests per minute
  apiKeyAuth(['prompts:execute']),
  validateProjectAccess,
  promptExecutionValidation,
  validate,
  proxyController.executePromptWithApiKey
);

// ===== AGENT EXECUTION ROUTES =====

// Chat with an agent using session token
router.post(
  '/agents/chat',
  proxyLimiter, // Rate limit: 60 requests per minute
  sessionAuth,
  agentChatValidation,
  validate,
  agentController.executeChatbotAgentWithSession
);

// Execute a task agent using session token
router.post(
  '/agents/execute',
  proxyLimiter, // Rate limit: 60 requests per minute
  sessionAuth,
  agentTaskValidation,
  validate,
  agentController.executeTaskAgentWithSession
);

// Chat with an agent using session token (streaming)
router.post(
  '/agents/chat/stream',
  proxyLimiter, // Rate limit: 60 requests per minute
  sessionAuth,
  agentChatValidation,
  validate,
  agentController.executeChatbotAgentWithSessionStream
);

// Execute a task agent using session token (streaming)
router.post(
  '/agents/execute/stream',
  proxyLimiter, // Rate limit: 60 requests per minute
  sessionAuth,
  agentTaskValidation,
  validate,
  agentController.executeTaskAgentWithSessionStream
);

// Alternative: Chat with agent using API key (for simple use cases)
// This bypasses the session system but requires agents:chat scope
router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/chat',
  proxyLimiter, // Rate limit: 60 requests per minute (more restrictive)
  apiKeyAuth(['agents:chat']),
  validateProjectAccess,
  agentChatValidation,
  validate,
  agentController.executeChatbotAgentWithApiKey
);

// Get agent information (read-only)
router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  apiKeyAuth(['agents:read']),
  validateProjectAccess,
  agentController.getAgentForApiKey
);

// List agents in a project
router.get(
  '/organizations/:orgId/projects/:projectId/agents',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  apiKeyAuth(['agents:read']),
  validateProjectAccess,
  agentController.getAgentsForApiKey
);

// ===== PROJECT INFORMATION ROUTES =====

// Get project information
router.get(
  '/organizations/:orgId/projects/:projectId',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  apiKeyAuth(['projects:read']),
  validateProjectAccess,
  (req, res) => {
    // Simple project info endpoint
    res.json({
      success: true,
      data: {
        id: req.params.projectId,
        organization: req.params.orgId,
        accessible: true,
      },
    });
  }
);

// List accessible projects
router.get(
  '/organizations/:orgId/projects',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  apiKeyAuth(['projects:read']),
  async (req, res) => {
    try {
      const Project = require('../models/Project');

      // Get projects based on API key restrictions
      const query = { organization: req.params.orgId };

      if (req.apiKey.allowed_projects.length > 0) {
        query._id = { $in: req.apiKey.allowed_projects };
      }

      const projects = await Project.find(query).select('name description');

      res.json({
        success: true,
        data: projects,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  }
);

// ===== USAGE STATISTICS ROUTES =====

// Get API key usage statistics
router.get(
  '/usage/api-key',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  apiKeyAuth(['statistics:read']),
  (req, res) => {
    res.json({
      success: true,
      data: {
        api_key_id: req.apiKey._id,
        usage: req.apiKey.usage,
        restrictions: req.apiKey.restrictions,
        daily_limit_remaining: req.apiKey.restrictions.max_executions_per_day
          ? Math.max(
              0,
              req.apiKey.restrictions.max_executions_per_day -
                req.apiKey.usage.executions_today
            )
          : null,
      },
    });
  }
);

module.exports = router;
