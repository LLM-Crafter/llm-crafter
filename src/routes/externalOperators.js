const express = require('express');
const router = express.Router();
const externalOperatorController = require('../controllers/externalOperatorController');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const { generalLimiter } = require('../middleware/rateLimiting');

// All routes use API key auth with handoff scope
const authMiddleware = apiKeyAuth(['handoffs:manage']);

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

// Register or update an external operator
router.put(
  '/organizations/:orgId/projects/:projectId/operators',
  generalLimiter,
  authMiddleware,
  validateProjectAccess,
  externalOperatorController.upsertOperator
);

// List external operators for a project
router.get(
  '/organizations/:orgId/projects/:projectId/operators',
  generalLimiter,
  authMiddleware,
  validateProjectAccess,
  externalOperatorController.listOperators
);

// Get a single external operator
router.get(
  '/organizations/:orgId/projects/:projectId/operators/:externalId',
  generalLimiter,
  authMiddleware,
  validateProjectAccess,
  externalOperatorController.getOperator
);

// Update operator status
router.patch(
  '/organizations/:orgId/projects/:projectId/operators/:externalId/status',
  generalLimiter,
  authMiddleware,
  validateProjectAccess,
  externalOperatorController.updateOperatorStatus
);

// Delete an external operator
router.delete(
  '/organizations/:orgId/projects/:projectId/operators/:externalId',
  generalLimiter,
  authMiddleware,
  validateProjectAccess,
  externalOperatorController.deleteOperator
);

// Bulk update operator statuses
router.patch(
  '/organizations/:orgId/projects/:projectId/operators/bulk/status',
  generalLimiter,
  authMiddleware,
  validateProjectAccess,
  externalOperatorController.bulkUpdateStatus
);

module.exports = router;
