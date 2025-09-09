const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true });
const userApiKeyController = require('../controllers/userApiKeyController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const orgAuth = require('../middleware/organizationAuth');
const { apiKeyLimiter, generalLimiter } = require('../middleware/rateLimiting');

// Validation middleware
const createApiKeyValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Name must be between 3 and 50 characters'),
  body('scopes')
    .isArray({ min: 1 })
    .withMessage('At least one scope is required')
    .custom((scopes) => {
      const validScopes = [
        'prompts:execute',
        'agents:read',
        'agents:execute',
        'agents:chat',
        'projects:read',
        'statistics:read'
      ];
      const invalidScopes = scopes.filter(
        (scope) => !validScopes.includes(scope)
      );
      if (invalidScopes.length > 0) {
        throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`);
      }
      return true;
    }),
  body('restrictions')
    .optional()
    .isObject()
    .withMessage('Restrictions must be an object'),
  body('restrictions.ip_whitelist')
    .optional()
    .isArray()
    .withMessage('IP whitelist must be an array'),
  body('restrictions.domain_whitelist')
    .optional()
    .isArray()
    .withMessage('Domain whitelist must be an array'),
  body('restrictions.rate_limit_override')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Rate limit override must be between 1 and 1000'),
  body('restrictions.max_executions_per_day')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max executions per day must be at least 1'),
  body('expires_at')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiration date format'),
  body('allowed_projects')
    .optional()
    .isArray()
    .withMessage('Allowed projects must be an array')
];

const updateApiKeyValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 3, max: 50 })
    .withMessage('Name must be between 3 and 50 characters'),
  body('scopes')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one scope is required')
    .custom((scopes) => {
      const validScopes = [
        'prompts:execute',
        'agents:read',
        'agents:execute',
        'agents:chat',
        'projects:read',
        'statistics:read'
      ];
      const invalidScopes = scopes.filter(
        (scope) => !validScopes.includes(scope)
      );
      if (invalidScopes.length > 0) {
        throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`);
      }
      return true;
    }),
  body('restrictions')
    .optional()
    .isObject()
    .withMessage('Restrictions must be an object'),
  body('restrictions.ip_whitelist')
    .optional()
    .isArray()
    .withMessage('IP whitelist must be an array'),
  body('restrictions.domain_whitelist')
    .optional()
    .isArray()
    .withMessage('Domain whitelist must be an array'),
  body('restrictions.rate_limit_override')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Rate limit override must be between 1 and 1000'),
  body('restrictions.max_executions_per_day')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max executions per day must be at least 1'),
  body('expires_at')
    .optional()
    .custom((value) => {
      if (value === null) {return true;} // Allow null to remove expiration
      if (!value) {return true;} // Allow undefined/empty

      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid expiration date format');
      }
      return true;
    }),
  body('allowed_projects')
    .optional()
    .isArray()
    .withMessage('Allowed projects must be an array')
];

// ===== API KEY MANAGEMENT ROUTES =====

// Create a new API key
router.post(
  '/',
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.hasRole('member'), // Only members and above can create API keys
  createApiKeyValidation,
  validate,
  userApiKeyController.createApiKey
);

// Get all API keys for the user in this organization
router.get(
  '/',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  orgAuth.hasRole('viewer'), // Viewers can see their own API keys
  userApiKeyController.getApiKeys
);

// Get a specific API key
router.get(
  '/:keyId',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  orgAuth.hasRole('viewer'), // Viewers can see their own API keys
  userApiKeyController.getApiKey
);

// Update an API key
router.put(
  '/:keyId',
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.hasRole('member'), // Only members and above can update API keys
  updateApiKeyValidation,
  validate,
  userApiKeyController.updateApiKey
);

// Rotate an API key (generate new key)
router.post(
  '/:keyId/rotate',
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.hasRole('member'), // Only members and above can rotate API keys
  userApiKeyController.rotateApiKey
);

// Revoke an API key
router.delete(
  '/:keyId',
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.hasRole('member'), // Only members and above can revoke API keys
  userApiKeyController.revokeApiKey
);

// Get API key usage statistics
router.get(
  '/:keyId/usage',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  orgAuth.hasRole('viewer'), // Viewers can see their own API key usage
  userApiKeyController.getApiKeyUsage
);

module.exports = router;
