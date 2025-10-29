const express = require('express');
const router = express.Router();
const handoffController = require('../controllers/handoffController');
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

// Stream conversation updates (Server-Sent Events)
router.get(
  '/conversations/:conversationId/stream',
  handoffController.streamConversation
);

module.exports = router;
