const Template = require('../models/Template');
const Agent = require('../models/Agent');
const ChannelConfig = require('../models/ChannelConfig');
const Conversation = require('../models/Conversation');
const channelOrchestrator = require('../services/channelOrchestrator');
const encryption = require('../utils/encryption');
const axios = require('axios');

const META_GRAPH_VERSION = 'v25.0';

/**
 * Safely decrypt a value (noop if not encrypted)
 */
function safeDecrypt(data) {
  if (!data) return data;
  return encryption.isEncrypted(data) ? encryption.decrypt(data) : data;
}

/**
 * Load agent + verify it belongs to the org/project in the URL
 */
async function loadAgent(req) {
  const { orgId, projectId, agentId } = req.params;
  return Agent.findOne({
    _id: agentId,
    project: projectId,
    organization: orgId,
  });
}

/**
 * Load the Meta WABA credentials for an agent.
 * Returns { accessToken, wabaId, phoneNumberId } or null.
 */
async function getMetaCredentials(agentId) {
  const config = await ChannelConfig.findOne({ agent: agentId });
  if (!config?.whatsapp?.enabled || config.whatsapp.provider !== 'meta') {
    return null;
  }
  const creds = config.whatsapp.credentials;
  const wabaId = creds?.waba_id || creds?.business_account_id;
  if (!wabaId) return null;
  return {
    accessToken: safeDecrypt(creds.access_token),
    wabaId,
    phoneNumberId: creds.phone_number_id,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * List templates for an agent
 * Query params: ?language=xx  ?status=APPROVED  ?channel=whatsapp
 */
const listTemplates = async (req, res) => {
  try {
    const agent = await loadAgent(req);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const filter = { agent: agent._id, organization: agent.organization };
    if (req.query.language) filter.language = req.query.language;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.channel) filter.channel = req.query.channel;

    const templates = await Template.find(filter).sort({ name: 1, language: 1 });
    return res.json(templates);
  } catch (error) {
    console.error('Error listing templates:', error);
    return res.status(500).json({ error: 'Failed to list templates' });
  }
};

/**
 * Get a single template
 */
const getTemplate = async (req, res) => {
  try {
    const agent = await loadAgent(req);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const template = await Template.findOne({
      _id: req.params.templateId,
      agent: agent._id,
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    return res.json(template);
  } catch (error) {
    console.error('Error getting template:', error);
    return res.status(500).json({ error: 'Failed to get template' });
  }
};

/**
 * Create a template locally AND register it with Meta.
 *
 * Body:
 *  - name        (required) — must be lowercase, alphanumeric + underscores
 *  - language    (required) — e.g. "en_US", "pt_BR"
 *  - category    (optional) — UTILITY | MARKETING | AUTHENTICATION
 *  - components  (required) — array of Meta component objects
 *  - label       (optional) — UI display name
 */
const createTemplate = async (req, res) => {
  try {
    const agent = await loadAgent(req);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const meta = await getMetaCredentials(agent._id);
    if (!meta) {
      return res.status(400).json({
        error: 'WhatsApp Meta provider not configured or waba_id missing for this agent',
      });
    }

    // 1. Register template with Meta
    const metaPayload = {
      name: req.body.name,
      language: req.body.language,
      category: req.body.category || 'UTILITY',
      components: req.body.components,
    };

    let metaResponse;
    try {
      metaResponse = await axios.post(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${meta.wabaId}/message_templates`,
        metaPayload,
        {
          headers: {
            Authorization: `Bearer ${meta.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (err) {
      const metaError = err.response?.data?.error;
      return res.status(400).json({
        error: 'Failed to register template with Meta',
        meta_error: metaError
          ? { code: metaError.code, message: metaError.message, error_subcode: metaError.error_subcode }
          : { message: err.message },
      });
    }

    // 2. Save locally
    const template = new Template({
      agent: agent._id,
      organization: agent.organization,
      name: req.body.name,
      language: req.body.language,
      category: req.body.category || 'UTILITY',
      components: req.body.components,
      channel: 'whatsapp',
      label: req.body.label,
      status: metaResponse.data.status || 'PENDING',
      meta_template_id: metaResponse.data.id || null,
    });

    await template.save();
    return res.status(201).json(template);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'A template with this name and language already exists for this agent',
      });
    }
    console.error('Error creating template:', error);
    return res.status(500).json({ error: 'Failed to create template' });
  }
};

/**
 * Delete a template locally AND from Meta.
 * Note: Meta deletes ALL languages for a given template name.
 */
const deleteTemplate = async (req, res) => {
  try {
    const agent = await loadAgent(req);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const template = await Template.findOne({
      _id: req.params.templateId,
      agent: agent._id,
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    // Delete from Meta
    const meta = await getMetaCredentials(agent._id);
    if (meta) {
      try {
        await axios.delete(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${meta.wabaId}/message_templates`,
          {
            params: { name: template.name },
            headers: { Authorization: `Bearer ${meta.accessToken}` },
          }
        );
      } catch (err) {
        console.error('Warning: Failed to delete template from Meta:', err.response?.data || err.message);
        // Continue with local deletion even if Meta delete fails
      }
    }

    await Template.findByIdAndDelete(template._id);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
};

// ─── META SYNC ──────────────────────────────────────────────────────────────

/**
 * Sync template statuses from Meta.
 * Fetches all templates from the WABA and updates local records.
 */
const syncTemplates = async (req, res) => {
  try {
    const agent = await loadAgent(req);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const meta = await getMetaCredentials(agent._id);
    if (!meta) {
      return res.status(400).json({
        error: 'WhatsApp Meta provider not configured or waba_id missing',
      });
    }

    // Paginate through all templates from Meta
    let metaTemplates = [];
    let url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${meta.wabaId}/message_templates?limit=100`;

    while (url) {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${meta.accessToken}` },
      });
      metaTemplates.push(...(response.data.data || []));
      url = response.data.paging?.next || null;
    }

    // Update local templates
    const localTemplates = await Template.find({ agent: agent._id });
    const updated = [];

    for (const local of localTemplates) {
      const metaMatch = metaTemplates.find(
        (mt) => mt.name === local.name && mt.language === local.language
      );

      if (metaMatch) {
        const newStatus = metaMatch.status === 'APPROVED' ? 'APPROVED'
          : metaMatch.status === 'REJECTED' ? 'REJECTED'
          : 'PENDING';

        if (local.status !== newStatus || local.meta_template_id !== metaMatch.id) {
          local.status = newStatus;
          local.meta_template_id = metaMatch.id;
          await local.save();
          updated.push({ name: local.name, language: local.language, status: newStatus });
        }
      }
    }

    return res.json({
      success: true,
      total_from_meta: metaTemplates.length,
      local_templates: localTemplates.length,
      updated,
    });
  } catch (error) {
    console.error('Error syncing templates:', error);

    if (error.response?.data?.error) {
      const metaError = error.response.data.error;
      return res.status(400).json({
        error: 'Failed to fetch templates from Meta',
        meta_error: { code: metaError.code, message: metaError.message },
      });
    }

    return res.status(500).json({ error: 'Failed to sync templates' });
  }
};

// ─── SEND ───────────────────────────────────────────────────────────────────

/**
 * Send a template message to a conversation.
 * Only APPROVED templates can be sent.
 *
 * Body:
 *  - conversationId (required)
 *  - parameters     (optional) — component parameters for variable substitution
 */
const sendTemplate = async (req, res) => {
  try {
    const agent = await loadAgent(req);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { conversationId, parameters } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Only allow sending APPROVED templates
    const template = await Template.findOne({
      _id: req.params.templateId,
      agent: agent._id,
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    if (template.status !== 'APPROVED') {
      return res.status(400).json({
        error: `Template is not approved (current status: ${template.status})`,
      });
    }

    // Fetch conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.channel !== 'whatsapp') {
      return res.status(400).json({ error: 'Template messages are only supported for WhatsApp' });
    }

    const recipientPhone =
      conversation.channel_metadata?.whatsapp?.phone_number ||
      conversation.user_identifier;

    if (!recipientPhone) {
      return res.status(400).json({ error: 'No recipient phone number found' });
    }

    // Get the WhatsApp channel service
    await channelOrchestrator.initializeChannelsForAgent(agent._id);
    const channelService = channelOrchestrator.getChannelService(agent._id, 'whatsapp');

    if (!channelService) {
      return res.status(400).json({ error: 'WhatsApp channel not configured for this agent' });
    }

    if (channelService.whatsappConfig.provider !== 'meta') {
      return res.status(400).json({ error: 'Template messages are only supported with Meta provider' });
    }

    // Send
    const result = await channelService.sendTemplateViaMetaAPI(
      recipientPhone,
      template.name,
      template.language,
      parameters || []
    );

    // Record in conversation
    conversation.messages.push({
      role: 'system',
      content: `Template message sent: ${template.label || template.name} (${template.language})`,
      code: 'TEMPLATE_SENT',
      timestamp: new Date(),
      channel_info: {
        channel: 'whatsapp',
        message_id: result.message_id,
      },
    });
    await conversation.save();

    return res.json({
      success: true,
      message_id: result.message_id,
      template: { name: template.name, language: template.language },
    });
  } catch (error) {
    console.error('Error sending template:', error);

    if (error.response?.data?.error) {
      const metaError = error.response.data.error;
      return res.status(400).json({
        error: 'Failed to send template via Meta API',
        meta_error: {
          code: metaError.code,
          message: metaError.message,
          error_subcode: metaError.error_subcode,
        },
      });
    }

    return res.status(500).json({ error: 'Failed to send template message' });
  }
};

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  syncTemplates,
  sendTemplate,
};
