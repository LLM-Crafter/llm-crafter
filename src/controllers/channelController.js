/**
 * Channel Controller
 * Handles webhook endpoints and channel configuration
 */

const channelOrchestrator = require('../services/channelOrchestrator');
const ChannelConfig = require('../models/ChannelConfig');
const Agent = require('../models/Agent');
const encryption = require('../utils/encryption');

// ===== WEBHOOK HANDLERS =====

/**
 * WhatsApp webhook handler
 */
const handleWhatsAppWebhook = async (req, res) => {
  try {
    const agentId = req.params.agentId;

    // WhatsApp webhook verification (for Meta)
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const channelConfig = await ChannelConfig.findOne({ agent: agentId });

      if (
        mode === 'subscribe' &&
        token === channelConfig?.whatsapp?.verify_token
      ) {
        console.log('[WhatsApp] Webhook verified');
        return res.status(200).send(challenge);
      } else {
        return res.status(403).send('Verification failed');
      }
    }

    // Handle incoming message
    console.log(
      '[WhatsApp] Received webhook:',
      JSON.stringify(req.body, null, 2)
    );

    // Process message asynchronously
    channelOrchestrator
      .handleIncomingMessage(agentId, 'whatsapp', req.body, {
        ip_address: req.ip,
      })
      .then(result => {
        console.log('[WhatsApp] Message processed:', result.conversation_id);
      })
      .catch(error => {
        console.error('[WhatsApp] Error processing message:', error);
      });

    // Respond to webhook quickly (within 5 seconds for Meta)
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[WhatsApp] Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Telegram webhook handler
 */
const handleTelegramWebhook = async (req, res) => {
  try {
    const agentId = req.params.agentId;

    console.log(
      '[Telegram] Received webhook:',
      JSON.stringify(req.body, null, 2)
    );

    // Process message asynchronously
    channelOrchestrator
      .handleIncomingMessage(agentId, 'telegram', req.body, {
        ip_address: req.ip,
      })
      .then(result => {
        console.log('[Telegram] Message processed:', result.conversation_id);
      })
      .catch(error => {
        console.error('[Telegram] Error processing message:', error);
      });

    // Respond to webhook quickly
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Telegram] Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Email webhook handler (for services like SendGrid, Mailgun)
 */
const handleEmailWebhook = async (req, res) => {
  try {
    const agentId = req.params.agentId;

    console.log('[Email] Received webhook:', JSON.stringify(req.body, null, 2));

    // Process email asynchronously
    channelOrchestrator
      .handleIncomingMessage(agentId, 'email', req.body, {
        ip_address: req.ip,
      })
      .then(result => {
        console.log('[Email] Message processed:', result.conversation_id);
      })
      .catch(error => {
        console.error('[Email] Error processing message:', error);
      });

    // Respond to webhook
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Email] Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ===== CHANNEL CONFIGURATION =====

/**
 * Get channel configuration for an agent
 */
const getChannelConfig = async (req, res) => {
  try {
    const { agentId, orgId, projectId } = req.params;

    // Verify agent exists and belongs to org/project
    const agent = await Agent.findOne({
      _id: agentId,
      organization: orgId,
      project: projectId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    let channelConfig = await ChannelConfig.findOne({ agent: agentId });

    if (!channelConfig) {
      // Return default empty config
      return res.json({
        agent: agentId,
        whatsapp: { enabled: false },
        telegram: { enabled: false },
        email: { enabled: false },
        website: { enabled: true },
      });
    }

    res.json(channelConfig);
  } catch (error) {
    console.error('Get channel config error:', error);
    res.status(500).json({ error: 'Failed to fetch channel configuration' });
  }
};

/**
 * Update channel configuration for an agent
 */
const updateChannelConfig = async (req, res) => {
  try {
    const { agentId, orgId, projectId } = req.params;
    const updates = req.body;

    // Verify agent exists and belongs to org/project
    const agent = await Agent.findOne({
      _id: agentId,
      organization: orgId,
      project: projectId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    let channelConfig = await ChannelConfig.findOne({ agent: agentId });

    if (!channelConfig) {
      // Create new config
      channelConfig = new ChannelConfig({
        agent: agentId,
        organization: orgId,
        project: projectId,
      });
    }

    // Update WhatsApp config
    if (updates.whatsapp) {
      // Initialize credentials object if it doesn't exist
      if (!channelConfig.whatsapp) {
        channelConfig.whatsapp = { credentials: {} };
      }
      if (!channelConfig.whatsapp.credentials) {
        channelConfig.whatsapp.credentials = {};
      }

      // Handle credentials that might be at top level or nested
      const incomingCreds = updates.whatsapp.credentials || updates.whatsapp;

      // Encrypt and move credentials to the credentials object
      if (incomingCreds.account_sid) {
        channelConfig.whatsapp.credentials.account_sid =
          incomingCreds.account_sid;
      }

      if (incomingCreds.auth_token) {
        // Only encrypt if it's NOT already encrypted (check for U2FsdGVkX1 prefix from CryptoJS)
        if (!incomingCreds.auth_token.startsWith('U2FsdGVkX1')) {
          channelConfig.whatsapp.credentials.auth_token = encryption.encrypt(
            incomingCreds.auth_token
          );
        } else {
          channelConfig.whatsapp.credentials.auth_token =
            incomingCreds.auth_token;
        }
      }

      if (incomingCreds.access_token) {
        if (!incomingCreds.access_token.startsWith('U2FsdGVkX1')) {
          channelConfig.whatsapp.credentials.access_token = encryption.encrypt(
            incomingCreds.access_token
          );
        } else {
          channelConfig.whatsapp.credentials.access_token =
            incomingCreds.access_token;
        }
      }

      if (incomingCreds.api_key) {
        if (!incomingCreds.api_key.startsWith('U2FsdGVkX1')) {
          channelConfig.whatsapp.credentials.api_key = encryption.encrypt(
            incomingCreds.api_key
          );
        } else {
          channelConfig.whatsapp.credentials.api_key = incomingCreds.api_key;
        }
      }

      if (incomingCreds.phone_number_id) {
        channelConfig.whatsapp.credentials.phone_number_id =
          incomingCreds.phone_number_id;
      }

      if (incomingCreds.business_account_id) {
        channelConfig.whatsapp.credentials.business_account_id =
          incomingCreds.business_account_id;
      }

      // Copy other non-credential fields
      if (updates.whatsapp.enabled !== undefined) {
        channelConfig.whatsapp.enabled = updates.whatsapp.enabled;
      }
      if (updates.whatsapp.provider) {
        channelConfig.whatsapp.provider = updates.whatsapp.provider;
      }
      if (updates.whatsapp.phone_number) {
        channelConfig.whatsapp.phone_number = updates.whatsapp.phone_number;
      }
      if (updates.whatsapp.verify_token) {
        channelConfig.whatsapp.verify_token = updates.whatsapp.verify_token;
      }
      if (updates.whatsapp.webhook_url) {
        channelConfig.whatsapp.webhook_url = updates.whatsapp.webhook_url;
      }
    }

    // Update Telegram config
    if (updates.telegram) {
      channelConfig.telegram = {
        ...channelConfig.telegram,
        ...updates.telegram,
      };

      // Encrypt bot token
      if (
        updates.telegram.bot_token &&
        !updates.telegram.bot_token.startsWith('encrypted:')
      ) {
        channelConfig.telegram.bot_token = encryption.encrypt(
          updates.telegram.bot_token
        );
      }
    }

    // Update Email config
    if (updates.email) {
      channelConfig.email = {
        ...channelConfig.email,
        ...updates.email,
      };

      // Encrypt email credentials
      if (updates.email.smtp_config?.password) {
        if (!updates.email.smtp_config.password.startsWith('encrypted:')) {
          channelConfig.email.smtp_config.password = encryption.encrypt(
            updates.email.smtp_config.password
          );
        }
      }

      if (updates.email.imap_config?.password) {
        if (!updates.email.imap_config.password.startsWith('encrypted:')) {
          channelConfig.email.imap_config.password = encryption.encrypt(
            updates.email.imap_config.password
          );
        }
      }

      // Encrypt API keys
      if (updates.email.api_keys) {
        const apiKeys = updates.email.api_keys;
        Object.keys(apiKeys).forEach(key => {
          if (apiKeys[key] && !apiKeys[key].startsWith('encrypted:')) {
            channelConfig.email.api_keys[key] = encryption.encrypt(
              apiKeys[key]
            );
          }
        });
      }
    }

    // Update Website config
    if (updates.website) {
      channelConfig.website = {
        ...channelConfig.website,
        ...updates.website,
      };
    }

    // Update global settings
    if (updates.global_settings) {
      channelConfig.global_settings = {
        ...channelConfig.global_settings,
        ...updates.global_settings,
      };
    }

    await channelConfig.save();

    // Clear orchestrator cache to reload with new config
    channelOrchestrator.clearAgentCache(agentId);

    res.json({
      message: 'Channel configuration updated successfully',
      config: channelConfig,
    });
  } catch (error) {
    console.error('Update channel config error:', error);
    res.status(500).json({ error: 'Failed to update channel configuration' });
  }
};

/**
 * Test channel connection
 */
const testChannelConnection = async (req, res) => {
  try {
    const { agentId, orgId, projectId, channel } = req.params;

    // Verify agent exists
    const agent = await Agent.findOne({
      _id: agentId,
      organization: orgId,
      project: projectId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const result = await channelOrchestrator.testChannelConnection(
      agentId,
      channel
    );

    res.json(result);
  } catch (error) {
    console.error('Test channel connection error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test channel connection',
    });
  }
};

/**
 * Setup Telegram webhook
 */
const setupTelegramWebhook = async (req, res) => {
  try {
    const { agentId, orgId, projectId } = req.params;
    const { webhook_url } = req.body;

    if (!webhook_url) {
      return res.status(400).json({ error: 'webhook_url is required' });
    }

    // Verify agent exists
    const agent = await Agent.findOne({
      _id: agentId,
      organization: orgId,
      project: projectId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Initialize channels
    await channelOrchestrator.initializeChannelsForAgent(agentId);

    // Get Telegram service
    const telegramService = channelOrchestrator.getChannelService(
      agentId,
      'telegram'
    );

    if (!telegramService) {
      return res
        .status(400)
        .json({ error: 'Telegram channel not configured or not enabled' });
    }

    // Setup webhook
    const result = await telegramService.setupWebhook(webhook_url, {
      dropPendingUpdates: req.body.drop_pending_updates || false,
    });

    // Update webhook URL in config
    const channelConfig = await ChannelConfig.findOne({ agent: agentId });
    if (channelConfig) {
      channelConfig.telegram.webhook_url = webhook_url;
      await channelConfig.save();
    }

    res.json({
      success: true,
      message: 'Telegram webhook configured successfully',
      ...result,
    });
  } catch (error) {
    console.error('Setup Telegram webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to setup Telegram webhook',
    });
  }
};

/**
 * Get Telegram webhook info
 */
const getTelegramWebhookInfo = async (req, res) => {
  try {
    const { agentId, orgId, projectId } = req.params;

    // Verify agent exists
    const agent = await Agent.findOne({
      _id: agentId,
      organization: orgId,
      project: projectId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Initialize channels
    await channelOrchestrator.initializeChannelsForAgent(agentId);

    // Get Telegram service
    const telegramService = channelOrchestrator.getChannelService(
      agentId,
      'telegram'
    );

    if (!telegramService) {
      return res
        .status(400)
        .json({ error: 'Telegram channel not configured or not enabled' });
    }

    const webhookInfo = await telegramService.getWebhookInfo();

    res.json({
      success: true,
      webhook_info: webhookInfo,
    });
  } catch (error) {
    console.error('Get Telegram webhook info error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get Telegram webhook info',
    });
  }
};

/**
 * Get enabled channels for an agent
 */
const getEnabledChannels = async (req, res) => {
  try {
    const { agentId, orgId, projectId } = req.params;

    // Verify agent exists
    const agent = await Agent.findOne({
      _id: agentId,
      organization: orgId,
      project: projectId,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Initialize channels
    const result =
      await channelOrchestrator.initializeChannelsForAgent(agentId);

    res.json({
      agent_id: agentId,
      enabled_channels: result.enabled || [],
    });
  } catch (error) {
    console.error('Get enabled channels error:', error);
    res.status(500).json({ error: 'Failed to fetch enabled channels' });
  }
};

module.exports = {
  // Webhooks
  handleWhatsAppWebhook,
  handleTelegramWebhook,
  handleEmailWebhook,

  // Configuration
  getChannelConfig,
  updateChannelConfig,
  testChannelConnection,

  // Telegram specific
  setupTelegramWebhook,
  getTelegramWebhookInfo,

  // Utility
  getEnabledChannels,
};
