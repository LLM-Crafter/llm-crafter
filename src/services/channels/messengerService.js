/**
 * Facebook Messenger Channel Service
 * Uses the Meta Send API (Graph API)
 */

const BaseChannelService = require('./baseChannelService');
const axios = require('axios');
const crypto = require('crypto');
const encryption = require('../../utils/encryption');

class MessengerService extends BaseChannelService {
  constructor(channelConfig) {
    super(channelConfig, 'messenger');
    this.messengerConfig = this.config;
  }

  /**
   * Helper method to safely decrypt credentials
   */
  safeDecrypt(data) {
    if (!data) return data;
    return encryption.isEncrypted(data) ? encryption.decrypt(data) : data;
  }

  /**
   * Send a text message via Messenger Send API
   */
  async sendMessage(recipient, message, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Messenger channel is not enabled');
      }

      const pageId = this.messengerConfig.credentials.page_id;
      const url = `https://graph.facebook.com/v25.0/${pageId}/messages`;

      const accessToken = this.safeDecrypt(
        this.messengerConfig.credentials.access_token
      );

      const payload = {
        recipient: { id: recipient },
        message: { text: message },
        messaging_type: 'RESPONSE',
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      this.log('Message sent', {
        to: recipient,
        messageId: response.data.message_id,
      });

      return {
        success: true,
        message_id: response.data.message_id,
        provider: 'messenger',
      };
    } catch (error) {
      this.handleError(error, 'sendMessage');
    }
  }

  /**
   * Send a media message via Messenger Send API
   */
  async sendMediaMessage(recipient, media, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Messenger channel is not enabled');
      }

      const pageId = this.messengerConfig.credentials.page_id;
      const url = `https://graph.facebook.com/v25.0/${pageId}/messages`;

      const accessToken = this.safeDecrypt(
        this.messengerConfig.credentials.access_token
      );

      // Messenger supports image, video, audio, file
      const attachmentType = media.type === 'document' ? 'file' : media.type;

      const payload = {
        recipient: { id: recipient },
        message: {
          attachment: {
            type: attachmentType,
            payload: {
              url: media.url,
              is_reusable: true,
            },
          },
        },
        messaging_type: 'RESPONSE',
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      this.log('Media sent', {
        to: recipient,
        type: media.type,
        messageId: response.data.message_id,
      });

      return {
        success: true,
        message_id: response.data.message_id,
        provider: 'messenger',
      };
    } catch (error) {
      this.handleError(error, 'sendMediaMessage');
    }
  }

  /**
   * Send a rich message with buttons or templates
   */
  async sendRichCard(recipient, card, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Messenger channel is not enabled');
      }

      const pageId = this.messengerConfig.credentials.page_id;
      const url = `https://graph.facebook.com/v25.0/${pageId}/messages`;

      const accessToken = this.safeDecrypt(
        this.messengerConfig.credentials.access_token
      );

      let payload;

      if (card.type === 'card') {
        // Generic template (card with image, title, buttons)
        const buttons = (card.actions || []).slice(0, 3).map(action => {
          if (action.type === 'url') {
            return {
              type: 'web_url',
              url: action.url,
              title: (action.label || 'View').substring(0, 20),
            };
          }
          return {
            type: 'postback',
            title: (action.label || 'Select').substring(0, 20),
            payload: action.payload || action.label,
          };
        });

        payload = {
          recipient: { id: recipient },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [
                  {
                    title: (card.title || '').substring(0, 80),
                    subtitle: (card.body || card.subtitle || '').substring(0, 80),
                    image_url: card.image_url || undefined,
                    buttons: buttons.length > 0 ? buttons : undefined,
                  },
                ],
              },
            },
          },
          messaging_type: 'RESPONSE',
        };
      } else {
        // Quick replies or plain text fallback
        payload = {
          recipient: { id: recipient },
          message: {
            text: card.body || card.title || 'Choose an option:',
            quick_replies: (card.actions || []).slice(0, 13).map(action => ({
              content_type: 'text',
              title: (action.label || 'Option').substring(0, 20),
              payload: action.payload || action.label,
            })),
          },
          messaging_type: 'RESPONSE',
        };
      }

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        success: true,
        message_id: response.data.message_id,
        provider: 'messenger',
      };
    } catch (error) {
      this.handleError(error, 'sendRichCard');
    }
  }

  /**
   * Handle incoming message from Messenger webhook
   */
  async handleIncomingMessage(rawMessage) {
    try {
      // Messenger webhook payload structure
      const entry = rawMessage.entry?.[0];
      if (!entry) return null;

      const messaging = entry.messaging?.[0];
      if (!messaging) return null;

      // Ignore echo messages (sent by the page itself)
      if (messaging.message?.is_echo) return null;

      // Ignore delivery/read receipts
      if (messaging.delivery || messaging.read) return null;

      // Handle postback (button clicks)
      if (messaging.postback) {
        // Treat postback as a text message with the payload as content
        const postbackMessage = {
          ...messaging,
          message: {
            mid: `postback_${messaging.timestamp}`,
            text: messaging.postback.payload || messaging.postback.title,
          },
        };
        return this.normalizeMessage(postbackMessage);
      }

      return this.normalizeMessage(messaging);
    } catch (error) {
      this.handleError(error, 'handleIncomingMessage');
    }
  }

  /**
   * Extract user identifier (page-scoped user ID)
   */
  extractUserIdentifier(rawMessage) {
    return rawMessage.sender?.id;
  }

  /**
   * Extract message text content
   */
  extractContent(rawMessage) {
    return rawMessage.message?.text || '';
  }

  /**
   * Extract channel-specific metadata
   */
  extractChannelMetadata(rawMessage) {
    return {
      messenger: {
        sender_id: rawMessage.sender?.id,
        recipient_id: rawMessage.recipient?.id,
        message_id: rawMessage.message?.mid,
        timestamp: rawMessage.timestamp,
      },
    };
  }

  /**
   * Extract timestamp
   */
  extractTimestamp(rawMessage) {
    return rawMessage.timestamp ? new Date(rawMessage.timestamp) : null;
  }

  /**
   * Extract media attachments
   */
  extractMedia(rawMessage) {
    const attachments = rawMessage.message?.attachments;
    if (!attachments || attachments.length === 0) return null;

    return attachments
      .filter(att => ['image', 'video', 'audio', 'file'].includes(att.type))
      .map(att => ({
        type: att.type === 'file' ? 'document' : att.type,
        url: att.payload?.url,
        mime_type: null, // Messenger doesn't provide MIME in webhook
      }));
  }

  /**
   * Extract platform message ID
   */
  extractMessageId(rawMessage) {
    return rawMessage.message?.mid;
  }

  /**
   * Validate webhook signature from Meta
   */
  validateWebhook(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const appSecret = this.safeDecrypt(
      this.messengerConfig.credentials.app_secret
    );
    if (!appSecret) return true; // Skip validation if no app secret configured

    const expectedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', appSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Send typing indicator (sender action)
   */
  async sendTypingAction(recipientId) {
    try {
      const pageId = this.messengerConfig.credentials.page_id;
      const url = `https://graph.facebook.com/v25.0/${pageId}/messages`;

      const accessToken = this.safeDecrypt(
        this.messengerConfig.credentials.access_token
      );

      await axios.post(
        url,
        {
          recipient: { id: recipientId },
          sender_action: 'typing_on',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      // Non-fatal
      console.warn('[Messenger] Failed to send typing indicator:', error.message);
    }
  }

  /**
   * Get user profile info
   */
  async getUserProfile(userId) {
    try {
      const accessToken = this.safeDecrypt(
        this.messengerConfig.credentials.access_token
      );

      const response = await axios.get(
        `https://graph.facebook.com/v25.0/${userId}`,
        {
          params: {
            fields: 'first_name,last_name,profile_pic',
            access_token: accessToken,
          },
        }
      );

      return response.data;
    } catch (error) {
      const errData = error.response?.data;
      console.warn('[Messenger] Failed to get user profile:', error.message, errData ? JSON.stringify(errData) : '');
      return null;
    }
  }
}

module.exports = MessengerService;
