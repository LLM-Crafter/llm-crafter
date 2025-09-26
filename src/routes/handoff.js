const express = require('express');
const router = express.Router();
const handoffController = require('../controllers/handoffController');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get pending handoff requests
router.get('/pending', handoffController.getPendingHandoffs);

// Get my active conversations
router.get('/my-conversations', handoffController.getMyConversations);

// Get conversation details
router.get('/conversations/:conversationId', handoffController.getConversationDetails);

// Get latest messages for polling
router.get('/conversations/:conversationId/messages/latest', handoffController.getLatestMessages);

// Take over a conversation
router.post('/conversations/:conversationId/takeover', handoffController.takeoverConversation);

// Send message as human operator
router.post('/conversations/:conversationId/message', handoffController.sendHumanMessage);

// Hand conversation back to agent
router.post('/conversations/:conversationId/handback', handoffController.handBackToAgent);

// Stream conversation updates (Server-Sent Events)
router.get('/conversations/:conversationId/stream', handoffController.streamConversation);

module.exports = router;
