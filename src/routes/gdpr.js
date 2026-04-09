const express = require('express');
const router = express.Router({ mergeParams: true });
const gdprController = require('../controllers/gdprController');
const auth = require('../middleware/auth');
const orgAuth = require('../middleware/organizationAuth');

// All GDPR routes require authentication + admin role on the organisation
router.use(auth);
router.use(orgAuth.hasRole('admin'));

/**
 * POST /:orgId/gdpr/agents/:agentId/run-retention
 * Manually trigger the retention deletion job for a single agent.
 */
router.post('/agents/:agentId/run-retention', gdprController.runRetentionForAgent);

/**
 * DELETE /:orgId/gdpr/users/:userIdentifier
 * Hard-erase all conversations, executions, and session tokens for a user.
 */
router.delete('/users/:userIdentifier', gdprController.eraseUser);

/**
 * GET /:orgId/gdpr/users/:userIdentifier/export
 * Export all stored data for a user as JSON (messages auto-decrypted).
 */
router.get('/users/:userIdentifier/export', gdprController.exportUser);

module.exports = router;
