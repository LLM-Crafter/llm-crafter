const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const projectController = require('../controllers/projectController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const orgAuth = require('../middleware/organizationAuth');
const {
  generalLimiter,
  apiKeyLimiter,
  generalSlowDown,
} = require('../middleware/rateLimiting');

const promptRoutes = require('./prompts');
const apiKeyRoutes = require('./apiKeys');
const agentRoutes = require('./agents');
const userApiKeyRoutes = require('./userApiKeys');
router.use('/:orgId/projects/:projectId/api-keys', apiKeyRoutes);
router.use('/:orgId/projects/:projectId/agents', agentRoutes);
router.use('/:orgId/user-api-keys', userApiKeyRoutes);

// Organization validation
const organizationValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim(),
];

// Project validation
const projectValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim(),
  body('llm_configurations').optional().isArray(),
];

router.use('/:orgId/projects/:projectId/prompts', promptRoutes);

// Organization routes
router.post(
  '/',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  generalSlowDown, // Progressive delays
  auth,
  organizationValidation,
  validate,
  organizationController.createOrganization
);

router.get(
  '/',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  organizationController.getOrganizations
);

router.get(
  '/:orgId',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  orgAuth.isMember,
  organizationController.getOrganization
);

// Project routes (nested under organizations)
router.post(
  '/:orgId/projects',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  generalSlowDown, // Progressive delays
  auth,
  orgAuth.isMember,
  projectValidation,
  validate,
  projectController.createProject
);

router.get(
  '/:orgId/projects',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  orgAuth.isMember,
  projectController.getProjects
);

router.get(
  '/:orgId/projects/:projectId',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  orgAuth.isMember,
  projectController.getProject
);

router.post(
  '/:orgId/members',
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.isAdmin,
  [
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(['admin', 'member', 'viewer']),
  ],
  validate,
  organizationController.inviteUserToOrg
);

router.put(
  '/:orgId/members/:userId',
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.isAdmin,
  [body('role').isIn(['admin', 'member', 'viewer'])],
  validate,
  organizationController.updateMemberRole
);

router.delete(
  '/:orgId/members/:userId',
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.isAdmin,
  organizationController.removeMember
);

module.exports = router;
