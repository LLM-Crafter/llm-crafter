/**
 * Instagram Channel Service
 * Uses the Instagram API with Instagram Login (graph.instagram.com)
 */

const BaseChannelService = require('./baseChannelService');
const axios = require('axios');
const crypto = require('crypto');
const encryption = require('../../utils/encryption');

const IG_API_BASE = 'https://graph.instagram.com/v25.0';

class InstagramService extends BaseChannelService {
  constructor(channelConfig) {
    super(channelConfig, 'instagram');
    this.instagramConfig = this.config;
  }

  /**
   * Helper method to safely decrypt credentials
   */
  safeDecrypt(data) {
    if (!data) return data;
    return encryption.isEncrypted(data) ? encryption.decrypt(data) : data;
  }

  /**
   * Send a text message via Instagram Messaging API
   */
  async sendMessage(recipient, message, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Instagram channel is not enabled');
      }

      const igId = this.instagramConfig.credentials.page_id;
      const url = `${IG_API_BASE}/${igId}/messages`;

      const accessToken = this.safeDecrypt(
        this.instagramConfig.credentials.access_token
      );

      const payload = {
        recipient: { id: recipient },
        message: { text: message },
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
        provider: 'instagram',
      };
    } catch (error) {
      this.handleError(error, 'sendMessage');
    }
  }

  /**
   * Send a media message via Instagram Messaging API
   * Supports: image, video, audio, file (pdf)
   */
  async sendMediaMessage(recipient, media, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Instagram channel is not enabled');
      }

      const igId = this.instagramConfig.credentials.page_id;
      const url = `${IG_API_BASE}/${igId}/messages`;

      const accessToken = this.safeDecrypt(
        this.instagramConfig.credentials.access_token
      );

      // Map document type to file (Instagram supports: image, video, audio, file)
      const attachmentType = media.type === 'document' ? 'file' : media.type;

      const payload = {
        recipient: { id: recipient },
        message: {
          attachment: {
            type: attachmentType,
            payload: {
              url: media.url,
            },
          },
        },
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
        provider: 'instagram',
      };
    } catch (error) {
      this.handleError(error, 'sendMediaMessage');
    }
  }

  /**
   * Handle incoming message from Instagram webhook
   */
  async handleIncomingMessage(rawMessage) {
    try {
      const entry = rawMessage.entry?.[0];
      if (!entry) return null;

      let messaging;

      // Instagram can use two payload formats:
      // 1. changes[] array (field: "messages") — most common for Instagram
      // 2. messaging[] array — older/alternative format
      if (entry.changes) {
        const messageChange = entry.changes.find(c => c.field === 'messages');
        if (!messageChange) return null;
        messaging = messageChange.value;
      } else if (entry.messaging) {
        messaging = entry.messaging[0];
      } else {
        return null;
      }

      if (!messaging) return null;

      // Ignore echo messages (messages sent by the page itself)
      if (messaging.message?.is_echo) return null;

      // Ignore delivery/read receipts
      if (messaging.delivery || messaging.read) return null;

      return this.normalizeMessage(messaging);
    } catch (error) {
      this.handleError(error, 'handleIncomingMessage');
    }
  }

  /**
   * Extract user identifier (Instagram-scoped user ID)
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
      instagram: {
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

    return attachments.map(att => ({
      type: att.type, // image, video, audio, file
      url: att.payload?.url,
      mime_type: null, // Instagram doesn't provide MIME type in webhook
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
      this.instagramConfig.credentials.app_secret
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
      const igId = this.instagramConfig.credentials.page_id;
      const url = `${IG_API_BASE}/${igId}/messages`;

      const accessToken = this.safeDecrypt(
        this.instagramConfig.credentials.access_token
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
      // Non-fatal: don't throw for typing indicators
      console.warn('[Instagram] Failed to send typing indicator:', error.message);
    }
  }

  /**
   * Get user profile info
   */
  async getUserProfile(userId) {
    try {
      const accessToken = this.safeDecrypt(
        this.instagramConfig.credentials.access_token
      );

      const response = await axios.get(
        `${IG_API_BASE}/${userId}`,
        {
          params: {
            fields: 'name,username',
            access_token: accessToken,
          },
        }
      );

      return response.data;
    } catch (error) {
      const errData = error.response?.data;
      console.warn('[Instagram] Failed to get user profile:', error.message, errData ? JSON.stringify(errData) : '');
      return null;
    }
  }
}

module.exports = InstagramService;
