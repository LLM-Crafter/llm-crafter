const express = require('express');
const router = express.Router({ mergeParams: true });
const { body, param } = require('express-validator');
const ragController = require('../controllers/ragController');
const auth = require('../middleware/auth');
const orgAuth = require('../middleware/organizationAuth');
const validate = require('../middleware/validate');

// Validation middleware
const validateIndexRequest = [
  body('documents').isArray().withMessage('Documents must be an array'),
];

const validateSearchRequest = [
  body('query').notEmpty().withMessage('Query is required'),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  body('threshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Threshold must be between 0 and 1'),
  body('search_type')
    .optional()
    .isIn(['semantic', 'hybrid', 'keyword'])
    .withMessage('Invalid search type'),
];

const validateBatchRequest = [
  body('document_batches')
    .isArray()
    .withMessage('Document batches must be an array'),
];

/**
 * @route   POST /rag/index
 * @desc    Index JSON documents for RAG search
 * @access  Private (Organization Member)
 */
router.post(
  '/index',
  auth,
  orgAuth.hasRole('member'),
  validateIndexRequest,
  validate,
  ragController.indexDocuments
);

/**
 * @route   POST /rag/search
 * @desc    Search indexed documents using RAG
 * @access  Private (Organization Member)
 */
router.post(
  '/search',
  auth,
  orgAuth.hasRole('member'),
  validateSearchRequest,
  validate,
  ragController.searchDocuments
);

/**
 * @route   GET /rag/stats
 * @desc    Get RAG system statistics
 * @access  Private (Organization Viewer)
 */
router.get('/stats', auth, orgAuth.hasRole('viewer'), ragController.getStats);

/**
 * @route   DELETE /rag/clear
 * @desc    Clear RAG knowledge base
 * @access  Private (Organization Admin)
 */
router.delete(
  '/clear',
  auth,
  orgAuth.hasRole('admin'),
  ragController.clearKnowledgeBase
);

/**
 * @route   POST /rag/batch-index
 * @desc    Batch index multiple document sets
 * @access  Private (Organization Member)
 */
router.post(
  '/batch-index',
  auth,
  orgAuth.hasRole('member'),
  validateBatchRequest,
  validate,
  ragController.batchIndexDocuments
);

module.exports = router;
