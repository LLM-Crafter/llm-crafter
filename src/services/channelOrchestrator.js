/**
 * Channel Orchestrator Service
 * Coordinates all channel services and routes messages to agents
 */

const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');
const ChannelConfig = require('../models/ChannelConfig');
const agentService = require('./agentService');

// Import channel services
const WhatsAppService = require('./channels/whatsappService');
const TelegramService = require('./channels/telegramService');
const EmailService = require('./channels/emailService');

class ChannelOrchestrator {
  constructor() {
    this.channelServices = new Map(); // Map of agentId_channel -> service instance
    this.initialized = new Set(); // Track which agents have been initialized
  }

  /**
   * Initialize channel services for an agent
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} - Enabled channels
   */
  async initializeChannelsForAgent(agentId) {
    try {
      // Check if already initialized
      if (this.initialized.has(agentId)) {
        return { enabled: this.getEnabledChannels(agentId) };
      }

      const channelConfig = await ChannelConfig.findOne({ agent: agentId });

      if (!channelConfig) {
        console.log(
          `[ChannelOrchestrator] No channel config for agent ${agentId}`
        );
        return { enabled: [] };
      }

      const enabledChannels = [];

      // Initialize WhatsApp if enabled
      if (channelConfig.whatsapp?.enabled) {
        const service = new WhatsAppService(channelConfig);
        this.channelServices.set(`${agentId}_whatsapp`, service);
        enabledChannels.push('whatsapp');
        console.log(
          `[ChannelOrchestrator] WhatsApp enabled for agent ${agentId}`
        );
      }

      // Initialize Telegram if enabled
      if (channelConfig.telegram?.enabled) {
        const service = new TelegramService(channelConfig);
        this.channelServices.set(`${agentId}_telegram`, service);
        enabledChannels.push('telegram');
        console.log(
          `[ChannelOrchestrator] Telegram enabled for agent ${agentId}`
        );
      }

      // Initialize Email if enabled
      if (channelConfig.email?.enabled) {
        const service = new EmailService(channelConfig);
        this.channelServices.set(`${agentId}_email`, service);
        enabledChannels.push('email');
        console.log(`[ChannelOrchestrator] Email enabled for agent ${agentId}`);
      }

      // Website is always available (backward compatibility)
      enabledChannels.push('website');

      this.initialized.add(agentId);

      return {
        enabled: enabledChannels,
        config: channelConfig,
      };
    } catch (error) {
      console.error(
        `[ChannelOrchestrator] Error initializing channels for agent ${agentId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get enabled channels for an agent
   * @param {string} agentId - Agent ID
   * @returns {Array<string>}
   */
  getEnabledChannels(agentId) {
    const channels = [];
    if (this.channelServices.has(`${agentId}_whatsapp`))
      channels.push('whatsapp');
    if (this.channelServices.has(`${agentId}_telegram`))
      channels.push('telegram');
    if (this.channelServices.has(`${agentId}_email`)) channels.push('email');
    channels.push('website'); // Always available
    return channels;
  }

  /**
   * Main entry point for incoming messages from any channel
   * @param {string} agentId - Agent ID
   * @param {string} channel - Channel name (whatsapp, telegram, email, website)
   * @param {Object} rawMessage - Raw message from channel
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Result with conversation_id and response
   */
  async handleIncomingMessage(agentId, channel, rawMessage, options = {}) {
    try {
      console.log(
        `[ChannelOrchestrator] Handling ${channel} message for agent ${agentId}`
      );

      // Initialize channels if not already done
      await this.initializeChannelsForAgent(agentId);

      // Get channel service
      const channelService = this.channelServices.get(`${agentId}_${channel}`);

      if (!channelService && channel !== 'website') {
        throw new Error(
          `Channel ${channel} not configured for agent ${agentId}`
        );
      }

      let normalizedMessage;

      // For website, message is already normalized
      if (channel === 'website') {
        normalizedMessage = {
          channel: 'website',
          user_identifier:
            rawMessage.user_identifier || rawMessage.userIdentifier,
          content: rawMessage.message || rawMessage.content,
          timestamp: new Date(),
          channel_metadata: {
            website: {
              session_id: rawMessage.session_id,
              ip_address: options.ip_address,
              user_agent: options.user_agent,
            },
          },
        };
      } else {
        // Normalize the message using channel service
        normalizedMessage =
          await channelService.handleIncomingMessage(rawMessage);
      }

      // Show typing indicator for channels that support it
      if (channel === 'telegram' && channelService) {
        const chatId = normalizedMessage.channel_metadata?.telegram?.chat_id;
        if (chatId) {
          await channelService.sendTypingAction(chatId);
        }
      }

      // Find or create conversation
      const conversation = await this.getOrCreateConversation(
        agentId,
        normalizedMessage.user_identifier,
        channel,
        normalizedMessage.channel_metadata
      );

      console.log(
        `[ChannelOrchestrator] Processing message for conversation: ${conversation._id}, status: ${conversation.status}, handler: ${conversation.current_handler}`
      );

      // Check if conversation is human-controlled
      if (
        conversation.current_handler === 'human' &&
        conversation.status === 'human_controlled'
      ) {
        console.log(
          `[ChannelOrchestrator] Conversation ${conversation._id} is human-controlled, adding message without agent processing`
        );

        // Add user message to conversation
        conversation.messages.push({
          role: 'user',
          content: normalizedMessage.content,
          timestamp: new Date(),
          channel_info: {
            channel: channel,
            message_id: normalizedMessage.channel_metadata?.message_id,
          },
        });
        await conversation.save();

        // Optionally send acknowledgment that message was received
        // Uncomment below if you want auto-acknowledgment for every user message during human handoff
        /*
        const acknowledgment = "Your message has been received. A human operator will respond shortly.";
        await this.sendResponse(
          agentId,
          channel,
          normalizedMessage.user_identifier,
          acknowledgment,
          conversation._id
        );
        */

        return {
          conversation_id: conversation._id,
          status: 'human_controlled',
          message: 'Message received by human operator',
        };
      }

      // Build dynamic context with channel info
      const dynamicContext = {
        channel,
        channel_metadata: normalizedMessage.channel_metadata,
        ...(options.context || {}),
      };

      // Execute agent (your existing logic!)
      const agentResponse = await agentService.executeChatbotAgent(
        agentId,
        conversation._id,
        normalizedMessage.content,
        normalizedMessage.user_identifier,
        dynamicContext
      );

      // Send response back through the correct channel
      await this.sendResponse(
        agentId,
        channelService,
        normalizedMessage.user_identifier,
        agentResponse,
        channel,
        normalizedMessage.channel_metadata,
        options
      );

      // Update channel analytics
      await this.updateChannelAnalytics(agentId, channel);

      return {
        success: true,
        conversation_id: conversation._id,
        response: agentResponse.response,
        channel,
        handoff_requested: agentResponse.handoff_requested,
        handoff_info: agentResponse.handoff_info,
      };
    } catch (error) {
      console.error(
        `[ChannelOrchestrator] Error handling ${channel} message:`,
        error
      );
      throw error;
    }
  }

  /**
   * Handle streaming response (for channels that support it)
   * @param {string} agentId - Agent ID
   * @param {string} channel - Channel name
   * @param {Object} rawMessage - Raw message
   * @param {Function} streamCallback - Callback for streaming chunks
   * @param {Object} options - Additional options
   * @returns {Promise<Object>}
   */
  async handleStreamingMessage(
    agentId,
    channel,
    rawMessage,
    streamCallback,
    options = {}
  ) {
    try {
      console.log(
        `[ChannelOrchestrator] Handling streaming ${channel} message for agent ${agentId}`
      );

      // Initialize channels if not already done
      await this.initializeChannelsForAgent(agentId);

      // Get channel service
      const channelService = this.channelServices.get(`${agentId}_${channel}`);

      let normalizedMessage;

      // For website, message is already normalized
      if (channel === 'website') {
        normalizedMessage = {
          channel: 'website',
          user_identifier:
            rawMessage.user_identifier || rawMessage.userIdentifier,
          content: rawMessage.message || rawMessage.content,
          timestamp: new Date(),
          channel_metadata: {
            website: {
              session_id: rawMessage.session_id,
              ip_address: options.ip_address,
              user_agent: options.user_agent,
            },
          },
        };
      } else if (channelService) {
        normalizedMessage =
          await channelService.handleIncomingMessage(rawMessage);
      } else {
        throw new Error(
          `Channel ${channel} not configured for agent ${agentId}`
        );
      }

      // Find or create conversation
      const conversation = await this.getOrCreateConversation(
        agentId,
        normalizedMessage.user_identifier,
        channel,
        normalizedMessage.channel_metadata
      );

      // Build dynamic context
      const dynamicContext = {
        channel,
        channel_metadata: normalizedMessage.channel_metadata,
        ...(options.context || {}),
      };

      // Execute agent with streaming
      const agentResponse = await agentService.executeChatbotAgentStream(
        agentId,
        conversation._id,
        normalizedMessage.content,
        normalizedMessage.user_identifier,
        dynamicContext,
        streamCallback
      );

      // Update analytics
      await this.updateChannelAnalytics(agentId, channel);

      return {
        success: true,
        conversation_id: conversation._id,
        channel,
        ...agentResponse,
      };
    } catch (error) {
      console.error(
        `[ChannelOrchestrator] Error handling streaming ${channel} message:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get or create conversation for a user on a channel
   * @param {string} agentId - Agent ID
   * @param {string} userIdentifier - User identifier
   * @param {string} channel - Channel name
   * @param {Object} channelMetadata - Channel-specific metadata
   * @returns {Promise<Object>} - Conversation document
   */
  async getOrCreateConversation(
    agentId,
    userIdentifier,
    channel,
    channelMetadata
  ) {
    try {
      // Try to find existing active conversation
      // Include all active statuses except 'closed' to avoid creating duplicates
      let conversation = await Conversation.findOne({
        agent: agentId,
        user_identifier: userIdentifier,
        channel: channel,
        status: {
          $in: [
            'active',
            'agent_controlled',
            'human_controlled',
            'handoff_requested',
          ],
        },
      }).sort({ 'metadata.last_activity': -1 });

      if (!conversation) {
        // Create new conversation
        const title = this.generateConversationTitle(
          channel,
          userIdentifier,
          channelMetadata
        );

        conversation = new Conversation({
          agent: agentId,
          user_identifier: userIdentifier,
          channel: channel,
          channel_metadata: channelMetadata,
          title: title,
          status: 'agent_controlled',
        });

        await conversation.save();

        console.log(
          `[ChannelOrchestrator] Created new ${channel} conversation: ${conversation._id}`
        );
      } else {
        // Update channel metadata if it has changed
        if (channelMetadata && channelMetadata[channel]) {
          // Only update the specific channel's metadata, not all channels
          conversation.channel_metadata = conversation.channel_metadata || {};
          conversation.channel_metadata[channel] = channelMetadata[channel];
          conversation.markModified('channel_metadata');
          await conversation.save();
        }
      }

      return conversation;
    } catch (error) {
      console.error(
        '[ChannelOrchestrator] Error getting/creating conversation:',
        error
      );
      throw error;
    }
  }

  /**
   * Generate conversation title based on channel and metadata
   * @param {string} channel - Channel name
   * @param {string} userIdentifier - User identifier
   * @param {Object} channelMetadata - Channel metadata
   * @returns {string}
   */
  generateConversationTitle(channel, userIdentifier, channelMetadata) {
    switch (channel) {
      case 'whatsapp':
        const name = channelMetadata?.whatsapp?.profile_name;
        return name
          ? `WhatsApp: ${name}`
          : `WhatsApp: ${channelMetadata?.whatsapp?.phone_number || userIdentifier}`;

      case 'telegram':
        const tgName = channelMetadata?.telegram?.first_name;
        return tgName
          ? `Telegram: ${tgName}`
          : `Telegram: ${channelMetadata?.telegram?.username || userIdentifier}`;

      case 'email':
        const emailName = channelMetadata?.email?.from_name;
        return emailName
          ? `Email: ${emailName}`
          : `Email: ${channelMetadata?.email?.from_email || userIdentifier}`;

      case 'website':
        return `Website Chat: ${userIdentifier}`;

      default:
        return `${channel}: ${userIdentifier}`;
    }
  }

  /**
   * Send response through appropriate channel
   * @param {string} agentId - Agent ID
   * @param {Object} channelService - Channel service instance
   * @param {string} userIdentifier - User identifier
   * @param {Object} agentResponse - Agent response
   * @param {string} channel - Channel name
   * @param {Object} channelMetadata - Channel metadata
   * @param {Object} options - Additional options
   */
  async sendResponse(
    agentId,
    channelService,
    userIdentifier,
    agentResponse,
    channel,
    channelMetadata,
    options = {}
  ) {
    try {
      // Website uses SSE/WebSocket, handled by the controller
      if (channel === 'website' || options.skipSend) {
        return;
      }

      if (!channelService) {
        console.warn(
          `[ChannelOrchestrator] No channel service for ${channel}, skipping send`
        );
        return;
      }

      // Extract recipient identifier based on channel
      let recipient;
      let sendOptions = {};

      switch (channel) {
        case 'whatsapp':
          recipient = channelMetadata?.whatsapp?.phone_number;
          break;

        case 'telegram':
          recipient = channelMetadata?.telegram?.chat_id;
          break;

        case 'email':
          recipient = channelMetadata?.email?.from_email;
          sendOptions = {
            subject: `Re: ${channelMetadata?.email?.subject || 'Your inquiry'}`,
            inReplyTo: channelMetadata?.email?.message_id,
            references: channelMetadata?.email?.thread_id,
          };
          break;

        default:
          console.warn(`[ChannelOrchestrator] Unknown channel: ${channel}`);
          return;
      }

      if (!recipient) {
        throw new Error(`Unable to determine recipient for ${channel}`);
      }

      // Send the message
      await channelService.sendMessage(
        recipient,
        agentResponse.response,
        sendOptions
      );

      console.log(
        `[ChannelOrchestrator] Response sent via ${channel} to ${recipient}`
      );
    } catch (error) {
      console.error(
        `[ChannelOrchestrator] Error sending response via ${channel}:`,
        error
      );
      // Don't throw - we don't want to fail the whole operation if sending fails
    }
  }

  /**
   * Update channel analytics
   * @param {string} agentId - Agent ID
   * @param {string} channel - Channel name
   */
  async updateChannelAnalytics(agentId, channel) {
    try {
      const channelConfig = await ChannelConfig.findOne({ agent: agentId });
      if (channelConfig) {
        await channelConfig.updateAnalytics(channel);
      }
    } catch (error) {
      console.error('[ChannelOrchestrator] Error updating analytics:', error);
      // Don't throw - analytics failure shouldn't break message handling
    }
  }

  /**
   * Get channel service for an agent and channel
   * @param {string} agentId - Agent ID
   * @param {string} channel - Channel name
   * @returns {Object|null} - Channel service instance
   */
  getChannelService(agentId, channel) {
    return this.channelServices.get(`${agentId}_${channel}`) || null;
  }

  /**
   * Test channel connection
   * @param {string} agentId - Agent ID
   * @param {string} channel - Channel name
   * @returns {Promise<Object>} - Test result
   */
  async testChannelConnection(agentId, channel) {
    try {
      await this.initializeChannelsForAgent(agentId);

      const channelService = this.getChannelService(agentId, channel);

      if (!channelService) {
        throw new Error(`Channel ${channel} not configured or not enabled`);
      }

      // Perform channel-specific tests
      switch (channel) {
        case 'email':
          return await channelService.verifyConnection();

        case 'telegram':
          const botInfo = await channelService.getBotInfo();
          return {
            success: true,
            bot_info: botInfo,
          };

        case 'whatsapp':
          // WhatsApp doesn't have a simple test endpoint
          return {
            success: true,
            message: 'WhatsApp configuration loaded',
          };

        default:
          return {
            success: true,
            message: `${channel} service initialized`,
          };
      }
    } catch (error) {
      console.error(
        `[ChannelOrchestrator] Error testing ${channel} connection:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Clear cached services for an agent (useful after config changes)
   * @param {string} agentId - Agent ID
   */
  clearAgentCache(agentId) {
    this.channelServices.delete(`${agentId}_whatsapp`);
    this.channelServices.delete(`${agentId}_telegram`);
    this.channelServices.delete(`${agentId}_email`);
    this.initialized.delete(agentId);
    console.log(`[ChannelOrchestrator] Cleared cache for agent ${agentId}`);
  }

  /**
   * Send a message through a channel (simplified for external use like handoff)
   * @param {string} agentId - Agent ID
   * @param {string} channel - Channel name
   * @param {string} userIdentifier - User identifier
   * @param {string} message - Message to send
   * @param {Object} channelMetadata - Optional channel metadata
   * @returns {Promise<void>}
   */
  async sendChannelMessage(
    agentId,
    channel,
    userIdentifier,
    message,
    channelMetadata = null
  ) {
    try {
      // Initialize channels if not already done
      await this.initializeChannelsForAgent(agentId);

      // Get channel service
      const channelService = this.getChannelService(agentId, channel);

      if (!channelService) {
        throw new Error(
          `Channel ${channel} not initialized for agent ${agentId}`
        );
      }

      // If metadata not provided, try to extract from user_identifier
      if (!channelMetadata) {
        channelMetadata = {};

        // Parse user identifier to get channel-specific metadata
        if (channel === 'telegram' && userIdentifier.startsWith('telegram_')) {
          const chatId = parseInt(userIdentifier.replace('telegram_', ''));
          channelMetadata.telegram = { chat_id: chatId };
        } else if (
          channel === 'whatsapp' &&
          userIdentifier.startsWith('whatsapp_')
        ) {
          const phone = userIdentifier.replace('whatsapp_', '');
          channelMetadata.whatsapp = { phone_number: phone };
        } else if (channel === 'email' && userIdentifier.startsWith('email_')) {
          const email = userIdentifier.replace('email_', '');
          channelMetadata.email = { email_address: email };
        }
      }

      // Send the message
      // Wrap plain string message in object format expected by sendResponse
      const messageObject =
        typeof message === 'string' ? { response: message } : message;

      await this.sendResponse(
        agentId,
        channelService,
        userIdentifier,
        messageObject,
        channel,
        channelMetadata
      );

      console.log(
        `[ChannelOrchestrator] Message sent via ${channel} to ${userIdentifier}`
      );
    } catch (error) {
      console.error(
        `[ChannelOrchestrator] Error sending message via ${channel}:`,
        error
      );
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new ChannelOrchestrator();
