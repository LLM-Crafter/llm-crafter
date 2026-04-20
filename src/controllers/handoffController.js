const Conversation = require('../models/Conversation');
const User = require('../models/User');
const ExternalOperator = require('../models/ExternalOperator');
const channelOrchestrator = require('../services/channelOrchestrator');

/**
 * Get conversations awaiting handoff (filtered by user's organizations)
 */
const getPendingHandoffs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      urgency,
      organizationId,
      projectId,
    } = req.query;
    const skip = (page - 1) * limit;

    // Get user's organizations
    const Organization = require('../models/Organization');
    const Agent = require('../models/Agent');

    const userOrganizations = await Organization.find({
      'members.user': req.user._id,
    }).select('_id');

    const orgIds = userOrganizations.map(org => org._id);

    // Build agent filter
    const agentFilter = { organization: { $in: orgIds } };

    // If organizationId is provided, filter by that organization only
    if (organizationId) {
      // Verify user has access to this organization
      if (!orgIds.some(id => id.toString() === organizationId)) {
        return res
          .status(403)
          .json({ error: 'Access denied to this organization' });
      }
      agentFilter.organization = organizationId;
    }

    // If projectId is provided, filter by that project
    if (projectId) {
      agentFilter.project = projectId;
    }

    // Find all agents belonging to user's organizations (filtered by params)
    const agents = await Agent.find(agentFilter).select('_id');
    const agentIds = agents.map(agent => agent._id);

    // Build filter for conversations
    const filter = {
      status: 'handoff_requested',
      agent: { $in: agentIds },
    };

    if (urgency) {
      filter['handoff_info.urgency'] = urgency;
    }

    const conversations = await Conversation.find(filter)
      .populate('agent', 'name type')
      .sort({ 'handoff_info.requested_at': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Conversation.countDocuments(filter);

    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching pending handoffs:', error);
    res.status(500).json({ error: 'Failed to fetch pending handoffs' });
  }
};

/**
 * Get pending handoffs for a specific organization
 */
const getOrganizationPendingHandoffs = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { page = 1, limit = 20, urgency } = req.query;
    const skip = (page - 1) * limit;

    // Get Agent model to query agents by organization
    const Agent = require('../models/Agent');

    // Find all agents belonging to this organization
    const agents = await Agent.find({ organization: orgId }).select('_id');
    const agentIds = agents.map(agent => agent._id);

    // Build filter for conversations
    const filter = {
      status: 'handoff_requested',
      agent: { $in: agentIds },
    };

    if (urgency) {
      filter['handoff_info.urgency'] = urgency;
    }

    const conversations = await Conversation.find(filter)
      .populate('agent', 'name type')
      .sort({ 'handoff_info.requested_at': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Conversation.countDocuments(filter);

    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching organization pending handoffs:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch organization pending handoffs' });
  }
};

/**
 * Take over a conversation
 * Supports both internal users (via req.user) and external operators.
 * When `external_operator` is provided in the body, the conversation
 * is assigned to that external operator instead of the authenticated user.
 * The external_operator does not need to be pre-registered.
 */
const takeoverConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, external_operator } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.status === 'human_controlled') {
      return res
        .status(400)
        .json({ error: 'Conversation already under human control' });
    }

    // Determine operator identity
    let operatorInfo; // { type, id, name, email, avatar_url }
    if (external_operator) {
      // External operator path — pre-registration is optional
      if (!external_operator.external_id || !external_operator.name) {
        return res.status(400).json({
          error: 'external_operator requires at least external_id and name',
        });
      }

      // Enrich with registered operator data if available
      const registeredOp = await ExternalOperator.findOne({
        external_id: external_operator.external_id,
      });

      const email = external_operator.email || registeredOp?.email || null;
      const avatarUrl =
        external_operator.avatar_url || registeredOp?.avatar_url || null;

      await conversation.assignExternalOperator(
        external_operator.external_id,
        external_operator.name,
        email,
        avatarUrl
      );
      operatorInfo = {
        type: 'external',
        id: external_operator.external_id,
        name: external_operator.name,
        email,
        avatar_url: avatarUrl,
      };
    } else {
      // Internal user path (backwards compatible)
      const humanOperator = req.user;
      await conversation.assignHuman(
        humanOperator._id,
        humanOperator.name || humanOperator.email,
        humanOperator.email
      );
      operatorInfo = {
        type: 'internal',
        id: humanOperator._id,
        name: humanOperator.name || humanOperator.email,
        email: humanOperator.email,
      };
    }

    // Send initial message if provided
    if (message) {
      const handlerInfo = operatorInfo.type === 'external'
        ? {
            external_operator: {
              external_id: operatorInfo.id,
              name: operatorInfo.name,
              email: operatorInfo.email,
              avatar_url: operatorInfo.avatar_url,
              timestamp: new Date(),
            },
          }
        : {
            human_operator: {
              user_id: operatorInfo.id,
              name: operatorInfo.name,
              email: operatorInfo.email,
              timestamp: new Date(),
            },
          };

      conversation.messages.push({
        role: 'human_operator',
        content: message,
        timestamp: new Date(),
        handler_info: handlerInfo,
      });
      await conversation.save();

      // Send message through the appropriate channel
      if (conversation.channel && conversation.channel !== 'website') {
        try {
          await channelOrchestrator.sendChannelMessage(
            conversation.agent,
            conversation.channel,
            conversation.user_identifier,
            message,
            conversation.channel_metadata
          );
          console.log(
            `[Handoff] Takeover message sent via ${conversation.channel}`
          );
        } catch (error) {
          console.error(
            '[Handoff] Error sending message through channel:',
            error
          );
        }
      }
    }

    res.json({
      success: true,
      conversation,
      operator: operatorInfo,
      message: 'Conversation taken over successfully',
    });
  } catch (error) {
    console.error('Error taking over conversation:', error);
    res.status(500).json({ error: 'Failed to takeover conversation' });
  }
};

/**
 * Send message as human operator.
 * Supports both internal users and external operators.
 * If `external_operator_id` is provided, the message is attributed to that
 * operator. Otherwise it defaults to the operator who took over the
 * conversation (internal or external).
 */
const sendHumanMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, external_operator_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.current_handler !== 'human') {
      return res.status(403).json({
        error: 'Conversation is not under human control',
      });
    }

    // Determine who is sending: explicit override → takeover operator → auth user
    let handlerInfo;

    if (external_operator_id) {
      // Explicit external operator override
      // Try to look up registered operator for name/email enrichment
      const registeredOp = await ExternalOperator.findOne({
        external_id: external_operator_id,
      });
      handlerInfo = {
        external_operator: {
          external_id: external_operator_id,
          name: registeredOp?.name || external_operator_id,
          email: registeredOp?.email || null,
          avatar_url: registeredOp?.avatar_url || null,
          timestamp: new Date(),
        },
      };
    } else if (
      conversation.handoff_info?.assigned_external_operator?.external_id
    ) {
      // Default to the external operator who took over
      const extOp = conversation.handoff_info.assigned_external_operator;
      handlerInfo = {
        external_operator: {
          external_id: extOp.external_id,
          name: extOp.name,
          email: extOp.email || null,
          avatar_url: extOp.avatar_url || null,
          timestamp: new Date(),
        },
      };
    } else {
      // Default to internal user (backwards compatible)
      const humanOperator = req.user;

      // Authorization check for internal operators
      if (
        conversation.handoff_info?.assigned_human &&
        conversation.handoff_info.assigned_human !==
          humanOperator._id.toString()
      ) {
        return res.status(403).json({
          error: 'Not authorized to send messages in this conversation',
        });
      }

      handlerInfo = {
        human_operator: {
          user_id: humanOperator._id,
          name: humanOperator.name || humanOperator.email,
          email: humanOperator.email,
          timestamp: new Date(),
        },
      };
    }

    // Add message
    conversation.messages.push({
      role: 'human_operator',
      content: message,
      timestamp: new Date(),
      handler_info: handlerInfo,
    });

    await conversation.save();

    // Send message through the appropriate channel
    if (conversation.channel && conversation.channel !== 'website') {
      try {
        await channelOrchestrator.sendChannelMessage(
          conversation.agent,
          conversation.channel,
          conversation.user_identifier,
          message,
          conversation.channel_metadata
        );
        console.log(
          `[Handoff] Human message sent via ${conversation.channel} to ${conversation.user_identifier}`
        );
      } catch (error) {
        console.error(
          '[Handoff] Error sending message through channel:',
          error
        );
        return res.status(500).json({
          error: 'Message saved but failed to send through channel',
          details: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: 'Message sent successfully',
      conversation,
    });
  } catch (error) {
    console.error('Error sending human message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * Hand conversation back to agent.
 * Supports both internal users and external operators.
 * When `external_operator_id` is provided, authorization is checked
 * against the assigned external operator instead of the internal user.
 */
const handBackToAgent = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { external_operator_id } = req.body || {};

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Authorization: check either external operator or internal user
    if (external_operator_id) {
      const assignedExt =
        conversation.handoff_info?.assigned_external_operator?.external_id;
      if (assignedExt && assignedExt !== external_operator_id) {
        return res
          .status(403)
          .json({ error: 'Not authorized to hand back this conversation' });
      }
    } else {
      const humanOperator = req.user;
      if (
        conversation.handoff_info?.assigned_human &&
        conversation.handoff_info.assigned_human !==
          humanOperator._id.toString()
      ) {
        // Also allow if the conversation was taken by an external operator
        // (the internal API user acts on behalf of the external operator)
        if (!conversation.handoff_info?.assigned_external_operator?.external_id) {
          return res
            .status(403)
            .json({ error: 'Not authorized to hand back this conversation' });
        }
      }
    }

    await conversation.handBackToAgent();

    res.json({
      success: true,
      message: 'Conversation handed back to agent',
      conversation,
    });
  } catch (error) {
    console.error('Error handing back conversation:', error);
    res.status(500).json({ error: 'Failed to hand back conversation' });
  }
};

/**
 * Get conversations handled by current human operator.
 * Supports filtering by external_operator_id query param.
 */
const getMyConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20, external_operator_id } = req.query;
    const skip = (page - 1) * limit;

    let filter;
    if (external_operator_id) {
      // External operator path
      filter = {
        'handoff_info.assigned_external_operator.external_id':
          external_operator_id,
        status: 'human_controlled',
      };
    } else {
      // Internal user path (backwards compatible)
      filter = {
        'handoff_info.assigned_human': req.user._id.toString(),
        status: 'human_controlled',
      };
    }

    const conversations = await Conversation.find(filter)
      .populate('agent', 'name type')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Conversation.countDocuments(filter);

    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching my conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

/**
 * Get all conversations for an organization
 */
const getOrganizationConversations = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { page = 1, limit = 20, status, channel, archived, conversationIds } = req.query;
    const skip = (page - 1) * limit;

    // Get Agent model to query agents by organization
    const Agent = require('../models/Agent');

    // Find all agents belonging to this organization
    const agents = await Agent.find({ organization: orgId }).select('_id');
    const agentIds = agents.map(agent => agent._id);

    // Build filter for conversations
    const filter = { agent: { $in: agentIds } };

    // Filter by specific conversation IDs if provided
    if (conversationIds) {
      const ids = Array.isArray(conversationIds) ? conversationIds : conversationIds.split(',');
      filter._id = { $in: ids };
    }

    // Add optional filters
    if (status) {
      filter.status = status;
    }
    if (channel) {
      filter.channel = channel;
    }
    // archived filter: 'true' = only archived, 'false' = only not archived (incl. null/missing), omitted = all
    if (archived === 'true') {
      filter.archived = true;
    } else if (archived === 'false') {
      filter.archived = { $ne: true };
    }

    const conversations = await Conversation.find(filter)
      .populate('agent', 'name type')
      .sort({ 'metadata.last_activity': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Conversation.countDocuments(filter);

    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching organization conversations:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch organization conversations' });
  }
};

/**
 * Archive (or unarchive) a conversation
 */
const archiveConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { archived = true } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify the requesting user is a member of the organization that owns this conversation
    const Agent = require('../models/Agent');
    const Organization = require('../models/Organization');

    const agent = await Agent.findById(conversation.agent).select('organization');
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found for this conversation' });
    }

    const org = await Organization.findOne({
      _id: agent.organization,
      'members.user': req.user._id,
    }).select('_id');

    if (!org) {
      return res.status(403).json({ error: 'Access denied to this organization' });
    }

    conversation.archived = Boolean(archived);
    await conversation.save();

    res.json({
      success: true,
      archived: conversation.archived,
      message: conversation.archived
        ? 'Conversation archived'
        : 'Conversation unarchived',
      conversation,
    });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({ error: 'Failed to archive conversation' });
  }
};

/**
 * Stream conversation updates for human operators
 */
const streamConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    // Send connection confirmation
    res.write('data: {"type": "connected"}\n\n');

    let lastMessageCount = 0;

    // Set up polling for conversation updates
    const interval = setInterval(async () => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          // Check if there are new messages
          if (conversation.messages.length > lastMessageCount) {
            const newMessages = conversation.messages.slice(lastMessageCount);
            lastMessageCount = conversation.messages.length;

            res.write(
              `data: ${JSON.stringify({
                type: 'new_messages',
                messages: newMessages,
                conversation_status: conversation.status,
                current_handler: conversation.current_handler,
              })}\n\n`
            );
          }

          // Send periodic status updates
          res.write(
            `data: ${JSON.stringify({
              type: 'status_update',
              conversation_status: conversation.status,
              current_handler: conversation.current_handler,
              message_count: conversation.messages.length,
            })}\n\n`
          );
        }
      } catch (error) {
        console.error('Streaming error:', error);
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            message: 'Error fetching conversation updates',
          })}\n\n`
        );
      }
    }, 1000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
    });

    req.on('end', () => {
      clearInterval(interval);
    });
  } catch (error) {
    console.error('Error setting up conversation stream:', error);
    res.status(500).json({ error: 'Failed to setup conversation stream' });
  }
};

/**
 * Get conversation details by ID
 */
const getConversationDetails = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId).populate(
      'agent',
      'name type description'
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error('Error fetching conversation details:', error);
    res.status(500).json({ error: 'Failed to fetch conversation details' });
  }
};

/**
 * Get latest messages for polling
 */
const getLatestMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { since, include_system = 'true' } = req.query;

    const conversation = await Conversation.findById(conversationId).populate(
      'agent',
      'name type'
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // TODO: Add access control - check if user has permission to view this conversation
    // This could be based on:
    // - User is the original conversation user
    // - User is a human operator assigned to this conversation
    // - User has appropriate role/permissions

    // Get messages since timestamp
    let sinceDate;
    if (since) {
      sinceDate = new Date(since);
    } else {
      // Default to last 30 seconds if no timestamp provided
      sinceDate = new Date(Date.now() - 30000);
    }

    // Filter messages (use decrypted view for GDPR-encrypted conversations)
    const allMessages = conversation.getDecryptedMessages();
    let newMessages = allMessages.filter(msg => {
      const msgDate = new Date(msg.timestamp);
      const matchesTime = msgDate > sinceDate;

      // Include/exclude system messages based on query parameter
      if (include_system !== 'true' && msg.role === 'system') {
        return false;
      }

      return matchesTime;
    });

    // Sort by timestamp (oldest first)
    newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Get current conversation state
    const handoffInfo = conversation.handoff_info || {};
    const currentHandler = conversation.current_handler || 'agent';
    const conversationStatus = conversation.status || 'agent_controlled';

    res.json({
      conversation_id: conversationId,
      new_messages: newMessages,
      current_handler: currentHandler,
      conversation_status: conversationStatus,
      handoff_active:
        conversationStatus === 'human_controlled' ||
        conversationStatus === 'handoff_requested',
      handler_info: {
        assigned_human: handoffInfo.assigned_human || null,
        assigned_external_operator:
          handoffInfo.assigned_external_operator || null,
        handed_off_at: handoffInfo.handed_off_at || null,
        reason: handoffInfo.reason || null,
        urgency: handoffInfo.urgency || null,
      },
      last_poll: new Date().toISOString(),
      message_count: newMessages.length,
    });
  } catch (error) {
    console.error('Error fetching latest messages:', error);
    res.status(500).json({
      error: 'Failed to fetch latest messages',
      details: error.message,
    });
  }
};

module.exports = {
  getPendingHandoffs,
  getOrganizationPendingHandoffs,
  takeoverConversation,
  sendHumanMessage,
  handBackToAgent,
  getMyConversations,
  getOrganizationConversations,
  archiveConversation,
  streamConversation,
  getConversationDetails,
  getLatestMessages,
};
