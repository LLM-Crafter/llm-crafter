const Conversation = require('../models/Conversation');
const User = require('../models/User');
const channelOrchestrator = require('../services/channelOrchestrator');

/**
 * Get conversations awaiting handoff
 */
const getPendingHandoffs = async (req, res) => {
  try {
    const { page = 1, limit = 20, urgency } = req.query;
    const skip = (page - 1) * limit;

    const filter = { status: 'handoff_requested' };
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
 * Take over a conversation
 */
const takeoverConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;

    // Get human operator info from auth middleware (req.user)
    const humanOperator = req.user;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.status === 'human_controlled') {
      return res
        .status(400)
        .json({ error: 'Conversation already under human control' });
    }

    // Assign human operator
    await conversation.assignHuman(
      humanOperator._id,
      humanOperator.name || humanOperator.email,
      humanOperator.email
    );

    // Send initial human message if provided
    if (message) {
      conversation.messages.push({
        role: 'human_operator',
        content: message,
        timestamp: new Date(),
        handler_info: {
          human_operator: {
            user_id: humanOperator._id,
            name: humanOperator.name || humanOperator.email,
            email: humanOperator.email,
            timestamp: new Date(),
          },
        },
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
          // Don't fail the handoff if channel send fails
        }
      }
    }

    res.json({
      success: true,
      conversation,
      message: 'Conversation taken over successfully',
    });
  } catch (error) {
    console.error('Error taking over conversation:', error);
    res.status(500).json({ error: 'Failed to takeover conversation' });
  }
};

/**
 * Send message as human operator
 */
const sendHumanMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;
    const humanOperator = req.user;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (
      conversation.current_handler !== 'human' ||
      conversation.handoff_info.assigned_human !== humanOperator._id.toString()
    ) {
      return res.status(403).json({
        error: 'Not authorized to send messages in this conversation',
      });
    }

    // Add human message
    conversation.messages.push({
      role: 'human_operator',
      content: message,
      timestamp: new Date(),
      handler_info: {
        human_operator: {
          user_id: humanOperator._id,
          name: humanOperator.name || humanOperator.email,
          email: humanOperator.email,
          timestamp: new Date(),
        },
      },
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
 * Hand conversation back to agent
 */
const handBackToAgent = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const humanOperator = req.user;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (
      conversation.handoff_info.assigned_human !== humanOperator._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: 'Not authorized to hand back this conversation' });
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
 * Get conversations handled by current human operator
 */
const getMyConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const conversations = await Conversation.find({
      'handoff_info.assigned_human': req.user._id.toString(),
      status: 'human_controlled',
    })
      .populate('agent', 'name type')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Conversation.countDocuments({
      'handoff_info.assigned_human': req.user._id.toString(),
      status: 'human_controlled',
    });

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

    // Filter messages
    const allMessages = conversation.messages || [];
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
  takeoverConversation,
  sendHumanMessage,
  handBackToAgent,
  getMyConversations,
  streamConversation,
  getConversationDetails,
  getLatestMessages,
};
