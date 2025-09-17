const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const vectorDatabaseController = require('../controllers/vectorDatabaseController');
const auth = require('../middleware/auth');
const orgAuth = require('../middleware/organizationAuth');

// Validation middleware
const validateCreateConfig = [
  body('name').notEmpty().trim().withMessage('Configuration name is required'),
  body('provider')
    .isIn(['weaviate', 'pinecone', 'qdrant', 'memory'])
    .withMessage('Valid provider required'),
  body('config').isObject().withMessage('Configuration object is required'),
  body('description').optional().trim(),
  body('is_default').optional().isBoolean(),
];

const validateUpdateConfig = [
  param('configId').isMongoId().withMessage('Valid configuration ID required'),
  body('name').optional().notEmpty().trim(),
  body('provider')
    .optional()
    .isIn(['weaviate', 'pinecone', 'qdrant', 'memory']),
  body('config').optional().isObject(),
  body('description').optional().trim(),
  body('is_active').optional().isBoolean(),
  body('is_default').optional().isBoolean(),
];

const validateConfigId = [];

// Routes

/**
 * @route   GET /api/v1/vector-databases/providers
 * @desc    Get supported vector database providers
 * @access  Private
 */
router.get(
  '/vector-databases/providers',
  auth,
  vectorDatabaseController.getProviders
);

/**
 * @route   GET /api/v1/organizations/:organizationId/projects/:projectId/vector-databases
 * @desc    Get all vector database configurations for a project
 * @access  Private
 */
router.get(
  '/organizations/:orgId/projects/:projectId/vector-databases',
  auth,
  orgAuth.hasRole('member'),
  [
    param('orgId').isMongoId().withMessage('Valid organization ID required'),
    param('projectId').isMongoId().withMessage('Valid project ID required'),
  ],
  vectorDatabaseController.getConfigurations
);

/**
 * @route   POST /api/v1/organizations/:organizationId/projects/:projectId/vector-databases
 * @desc    Create a new vector database configuration
 * @access  Private
 */
router.post(
  '/organizations/:orgId/projects/:projectId/vector-databases',
  auth,
  orgAuth.isMember,
  validateCreateConfig,
  vectorDatabaseController.createConfiguration
);

/**
 * @route   PUT /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId
 * @desc    Update vector database configuration
 * @access  Private
 */
router.put(
  '/organizations/:orgId/projects/:projectId/vector-databases/:configId',
  auth,
  orgAuth.isMember,
  validateUpdateConfig,
  vectorDatabaseController.updateConfiguration
);

/**
 * @route   DELETE /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId
 * @desc    Delete vector database configuration
 * @access  Private
 */
router.delete(
  '/organizations/:orgId/projects/:projectId/vector-databases/:configId',
  auth,
  orgAuth.isMember,
  validateConfigId,
  vectorDatabaseController.deleteConfiguration
);

/**
 * @route   POST /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId/test
 * @desc    Test vector database connection
 * @access  Private
 */
router.post(
  '/organizations/:orgId/projects/:projectId/vector-databases/:configId/test',
  auth,
  orgAuth.isMember,
  validateConfigId,
  vectorDatabaseController.testConnection
);

/**
 * @route   PUT /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId/default
 * @desc    Set configuration as default
 * @access  Private
 */
router.put(
  '/organizations/:orgId/projects/:projectId/vector-databases/:configId/default',
  auth,
  orgAuth.isMember,
  validateConfigId,
  vectorDatabaseController.setDefault
);

/**
 * @route   GET /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId/stats
 * @desc    Get vector database statistics
 * @access  Private
 */
router.get(
  '/organizations/:orgId/projects/:projectId/vector-databases/:configId/stats',
  auth,
  orgAuth.isMember,
  validateConfigId,
  vectorDatabaseController.getStats
);

module.exports = router;
