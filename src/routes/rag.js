const express = require('express');
const router = express.Router({ mergeParams: true });
const { body, param, query } = require('express-validator');
const ragController = require('../controllers/ragController');
const auth = require('../middleware/auth');
const orgAuth = require('../middleware/organizationAuth');
const validate = require('../middleware/validate');

const validateKnowledgeBaseId = body('knowledge_base_id')
  .optional({ nullable: true })
  .isString()
  .withMessage('knowledge_base_id must be a string');

// Validation middleware
const validateIndexRequest = [
  body('documents').isArray().withMessage('Documents must be an array'),
  validateKnowledgeBaseId,
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
  validateKnowledgeBaseId,
];

const validateBatchRequest = [
  body('document_batches')
    .isArray()
    .withMessage('Document batches must be an array'),
  validateKnowledgeBaseId,
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

/**
 * @route   GET /rag/jobs/:jobId
 * @desc    Get indexing job status
 * @access  Private (Organization Viewer)
 */
router.get(
  '/jobs/:jobId',
  auth,
  orgAuth.hasRole('viewer'),
  param('jobId').notEmpty().withMessage('Job ID is required'),
  validate,
  ragController.getJobStatus
);

/**
 * @route   GET /rag/jobs
 * @desc    Get indexing jobs for project
 * @access  Private (Organization Viewer)
 */
router.get(
  '/jobs',
  auth,
  orgAuth.hasRole('viewer'),
  ragController.getJobs
);

/**
 * @route   GET /rag/jobs/stats
 * @desc    Get indexing job statistics
 * @access  Private (Organization Viewer)
 */
router.get(
  '/jobs/stats',
  auth,
  orgAuth.hasRole('viewer'),
  ragController.getJobStats
);

/**
 * @route   DELETE /rag/jobs/:jobId
 * @desc    Cancel a pending indexing job
 * @access  Private (Organization Member)
 */
router.delete(
  '/jobs/:jobId',
  auth,
  orgAuth.hasRole('member'),
  param('jobId').notEmpty().withMessage('Job ID is required'),
  validate,
  ragController.cancelJob
);

const validateDocumentId = param('documentId')
  .isLength({ min: 1, max: 256 })
  .withMessage('Document ID must be 1-256 characters');

const validateUpsertDocumentRequest = [
  validateDocumentId,
  body('chunks')
    .isArray({ min: 1, max: 5000 })
    .withMessage('chunks must be an array of 1-5000 items'),
  body('chunks.*.content')
    .isString()
    .notEmpty()
    .withMessage('Each chunk needs non-empty content'),
  body('chunks.*.embed_text').optional().isString(),
  body('chunks.*.metadata').optional().isObject(),
  body('metadata').optional().isObject(),
  validateKnowledgeBaseId,
];

/**
 * @route   PUT /rag/documents/:documentId
 * @desc    Index or replace a client-owned document from pre-chunked content
 * @access  Private (Organization Member)
 */
router.put(
  '/documents/:documentId',
  auth,
  orgAuth.hasRole('member'),
  validateUpsertDocumentRequest,
  validate,
  ragController.upsertDocument
);

/**
 * @route   GET /rag/documents
 * @desc    List client-owned documents and their indexing state
 * @access  Private (Organization Viewer)
 */
router.get(
  '/documents',
  auth,
  orgAuth.hasRole('viewer'),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('skip').optional().isInt({ min: 0 }),
  query('status')
    .optional()
    .isIn(['pending', 'indexing', 'indexed', 'failed', 'deleting']),
  validate,
  ragController.listDocuments
);

/**
 * @route   GET /rag/documents/:documentId
 * @desc    Get a client-owned document's indexing state
 * @access  Private (Organization Viewer)
 */
router.get(
  '/documents/:documentId',
  auth,
  orgAuth.hasRole('viewer'),
  validateDocumentId,
  validate,
  ragController.getDocument
);

/**
 * @route   DELETE /rag/documents/:documentId
 * @desc    Delete document by document_id (all chunks)
 * @access  Private (Organization Member)
 */
router.delete(
  '/documents/:documentId',
  auth,
  orgAuth.hasRole('member'),
  param('documentId').notEmpty().withMessage('Document ID is required'),
  validate,
  ragController.deleteByDocumentId
);

module.exports = router;
