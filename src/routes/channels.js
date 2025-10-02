/**
 * Channel Routes
 * Webhook endpoints and channel configuration routes
 */

const express = require('express');
const router = express.Router();
const channelController = require('../controllers/channelController');
const auth = require('../middleware/auth');
const organizationAuth = require('../middleware/organizationAuth');

// ===== PUBLIC WEBHOOK ENDPOINTS (No authentication) =====
// These are called by external services (WhatsApp, Telegram, etc.)

// WhatsApp webhooks
router.get(
  '/webhooks/whatsapp/:agentId',
  channelController.handleWhatsAppWebhook
);
router.post(
  '/webhooks/whatsapp/:agentId',
  channelController.handleWhatsAppWebhook
);

// Telegram webhooks
router.post(
  '/webhooks/telegram/:agentId',
  channelController.handleTelegramWebhook
);

// Email webhooks
router.post('/webhooks/email/:agentId', channelController.handleEmailWebhook);

// ===== AUTHENTICATED CHANNEL CONFIGURATION ROUTES =====

// Get channel configuration for an agent
router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/channels',
  auth,
  organizationAuth.hasRole('viewer'),
  channelController.getChannelConfig
);

// Update channel configuration
router.put(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/channels',
  auth,
  organizationAuth.hasRole('member'),
  channelController.updateChannelConfig
);

// Get enabled channels for an agent
router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/channels/enabled',
  auth,
  organizationAuth.hasRole('viewer'),
  channelController.getEnabledChannels
);

// Test channel connection
router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/channels/:channel/test',
  auth,
  organizationAuth.hasRole('member'),
  channelController.testChannelConnection
);

// ===== TELEGRAM SPECIFIC ROUTES =====

// Setup Telegram webhook
router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/setup',
  auth,
  organizationAuth.hasRole('member'),
  channelController.setupTelegramWebhook
);

// Get Telegram webhook info
router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/info',
  auth,
  organizationAuth.hasRole('viewer'),
  channelController.getTelegramWebhookInfo
);

module.exports = router;
