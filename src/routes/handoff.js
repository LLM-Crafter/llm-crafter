const express = require('express');
const router = express.Router();
const handoffController = require('../controllers/handoffController');
const externalOperatorController = require('../controllers/externalOperatorController');
const auth = require('../middleware/auth');
const orgAuth = require('../middleware/organizationAuth');

// All routes require authentication
router.use(auth);

// Get pending handoff requests (filtered by user's organizations)
router.get('/pending', handoffController.getPendingHandoffs);

// Get pending handoff requests for a specific organization
router.get(
  '/organizations/:orgId/pending',
  orgAuth.isMember,
  handoffController.getOrganizationPendingHandoffs
);

// Get my active conversations
router.get('/my-conversations', handoffController.getMyConversations);

// Get all conversations for an organization (requires org member auth)
router.get(
  '/organizations/:orgId/conversations',
  orgAuth.isMember,
  handoffController.getOrganizationConversations
);

// Get conversation details
router.get(
  '/conversations/:conversationId',
  handoffController.getConversationDetails
);

// Get latest messages for polling
router.get(
  '/conversations/:conversationId/messages/latest',
  handoffController.getLatestMessages
);

// Take over a conversation
router.post(
  '/conversations/:conversationId/takeover',
  handoffController.takeoverConversation
);

// Send message as human operator
router.post(
  '/conversations/:conversationId/message',
  handoffController.sendHumanMessage
);

// Hand conversation back to agent
router.post(
  '/conversations/:conversationId/handback',
  handoffController.handBackToAgent
);

// Archive or unarchive a conversation
router.patch(
  '/conversations/:conversationId/archive',
  handoffController.archiveConversation
);

// Stream conversation updates (Server-Sent Events)
router.get(
  '/conversations/:conversationId/stream',
  handoffController.streamConversation
);

// ===== EXTERNAL OPERATOR MANAGEMENT (JWT auth) =====

// Register or update an external operator
router.put(
  '/organizations/:orgId/projects/:projectId/operators',
  orgAuth.isMember,
  externalOperatorController.upsertOperator
);

// List external operators for a project
router.get(
  '/organizations/:orgId/projects/:projectId/operators',
  orgAuth.isMember,
  externalOperatorController.listOperators
);

// Get a single external operator
router.get(
  '/organizations/:orgId/projects/:projectId/operators/:externalId',
  orgAuth.isMember,
  externalOperatorController.getOperator
);

// Update operator status
router.patch(
  '/organizations/:orgId/projects/:projectId/operators/:externalId/status',
  orgAuth.isMember,
  externalOperatorController.updateOperatorStatus
);

// Delete an external operator
router.delete(
  '/organizations/:orgId/projects/:projectId/operators/:externalId',
  orgAuth.isMember,
  externalOperatorController.deleteOperator
);

// Bulk update operator statuses
router.patch(
  '/organizations/:orgId/projects/:projectId/operators/bulk/status',
  orgAuth.isMember,
  externalOperatorController.bulkUpdateStatus
);

module.exports = router;
