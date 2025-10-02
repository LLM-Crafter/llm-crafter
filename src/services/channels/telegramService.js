/**
 * Telegram Channel Service
 * Supports Telegram Bot API
 */

const BaseChannelService = require('./baseChannelService');
const axios = require('axios');
const crypto = require('crypto');

class TelegramService extends BaseChannelService {
  constructor(channelConfig) {
    super(channelConfig, 'telegram');
    this.telegramConfig = this.config;

    // Decrypt bot token if needed
    if (this.telegramConfig.bot_token) {
      const encryption = require('../../utils/encryption');
      this.botToken = encryption.decrypt(this.telegramConfig.bot_token);
      this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    }
  }

  /**
   * Send a text message via Telegram
   */
  async sendMessage(recipient, message, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Telegram channel is not enabled');
      }

      const formattedMessage = this.formatMessage(message, options);

      const payload = {
        chat_id: recipient,
        text: formattedMessage,
        parse_mode:
          options.parse_mode ||
          this.telegramConfig.settings?.parse_mode ||
          'Markdown',
      };

      // Add reply keyboard if provided
      if (options.reply_markup) {
        payload.reply_markup = options.reply_markup;
      }

      // Disable web page preview if needed
      if (options.disable_web_page_preview) {
        payload.disable_web_page_preview = true;
      }

      const response = await axios.post(`${this.apiUrl}/sendMessage`, payload);

      this.log('Message sent', {
        chatId: recipient,
        messageId: response.data.result.message_id,
      });

      return {
        success: true,
        message_id: response.data.result.message_id,
        provider: 'telegram',
      };
    } catch (error) {
      this.handleError(error, 'sendMessage');
    }
  }

  /**
   * Send typing action to show bot is processing
   */
  async sendTypingAction(chatId) {
    try {
      if (
        this.telegramConfig.settings?.show_typing_indicator !== false &&
        this.isEnabled()
      ) {
        await axios.post(`${this.apiUrl}/sendChatAction`, {
          chat_id: chatId,
          action: 'typing',
        });
      }
    } catch (error) {
      // Don't throw error for typing indicator failure
      this.log('Failed to send typing action', error.message);
    }
  }

  /**
   * Send media message
   */
  async sendMediaMessage(recipient, media, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Telegram channel is not enabled');
      }

      let endpoint;
      const payload = {
        chat_id: recipient,
      };

      // Determine endpoint based on media type
      switch (media.type) {
        case 'image':
          endpoint = 'sendPhoto';
          payload.photo = media.url;
          payload.caption = media.caption || '';
          break;
        case 'video':
          endpoint = 'sendVideo';
          payload.video = media.url;
          payload.caption = media.caption || '';
          break;
        case 'document':
          endpoint = 'sendDocument';
          payload.document = media.url;
          payload.caption = media.caption || '';
          break;
        case 'audio':
          endpoint = 'sendAudio';
          payload.audio = media.url;
          payload.caption = media.caption || '';
          break;
        default:
          throw new Error(`Unsupported media type: ${media.type}`);
      }

      // Add parse mode for caption
      if (payload.caption) {
        payload.parse_mode =
          options.parse_mode ||
          this.telegramConfig.settings?.parse_mode ||
          'Markdown';
      }

      const response = await axios.post(`${this.apiUrl}/${endpoint}`, payload);

      this.log('Media sent', {
        chatId: recipient,
        type: media.type,
        messageId: response.data.result.message_id,
      });

      return {
        success: true,
        message_id: response.data.result.message_id,
        provider: 'telegram',
      };
    } catch (error) {
      this.handleError(error, 'sendMediaMessage');
    }
  }

  /**
   * Send message with inline keyboard buttons
   */
  async sendMessageWithButtons(recipient, message, buttons, options = {}) {
    try {
      const inline_keyboard = buttons.map(row => {
        if (Array.isArray(row)) {
          return row.map(btn => ({
            text: btn.text,
            callback_data: btn.data || btn.text,
            url: btn.url,
          }));
        }
        return [
          {
            text: row.text,
            callback_data: row.data || row.text,
            url: row.url,
          },
        ];
      });

      return await this.sendMessage(recipient, message, {
        ...options,
        reply_markup: {
          inline_keyboard,
        },
      });
    } catch (error) {
      this.handleError(error, 'sendMessageWithButtons');
    }
  }

  /**
   * Handle incoming Telegram message
   */
  async handleIncomingMessage(rawMessage) {
    try {
      // Telegram webhook sends updates wrapped in update object
      const update = rawMessage.update_id ? rawMessage : rawMessage;
      const message = update.message || update.edited_message;
      const callbackQuery = update.callback_query;

      if (message) {
        this.log('Processing message', {
          from: message.from.id,
          messageId: message.message_id,
        });

        // Check if chat is allowed (if restrictions are set)
        if (
          this.telegramConfig.allowed_chats &&
          this.telegramConfig.allowed_chats.length > 0
        ) {
          const chatId = message.chat.id.toString();
          if (!this.telegramConfig.allowed_chats.includes(chatId)) {
            this.log('Message from unauthorized chat', { chatId });
            throw new Error('Unauthorized chat');
          }
        }

        const normalized = this.normalizeMessage(message);
        return normalized;
      } else if (callbackQuery) {
        // Handle button callbacks
        this.log('Processing callback query', {
          from: callbackQuery.from.id,
          data: callbackQuery.data,
        });

        // Answer the callback query to remove loading state
        await this.answerCallbackQuery(callbackQuery.id);

        // Treat callback as a message
        const normalized = this.normalizeMessage(callbackQuery.message);
        normalized.content = callbackQuery.data; // Button data becomes the message
        normalized.is_button_response = true;
        return normalized;
      }

      throw new Error('No message or callback query in update');
    } catch (error) {
      this.handleError(error, 'handleIncomingMessage');
    }
  }

  /**
   * Answer callback query (for button presses)
   */
  async answerCallbackQuery(callbackQueryId, text = null) {
    try {
      const payload = {
        callback_query_id: callbackQueryId,
      };
      if (text) {
        payload.text = text;
      }

      await axios.post(`${this.apiUrl}/answerCallbackQuery`, payload);
    } catch (error) {
      this.log('Failed to answer callback query', error.message);
    }
  }

  /**
   * Extract user identifier
   */
  extractUserIdentifier(rawMessage) {
    // Use chat ID as unique identifier
    if (rawMessage.chat?.id) {
      return `telegram_${rawMessage.chat.id}`;
    }
    throw new Error('Unable to extract user identifier from Telegram message');
  }

  /**
   * Extract message content
   */
  extractContent(rawMessage) {
    // Text message
    if (rawMessage.text) {
      return rawMessage.text;
    }

    // Caption for media
    if (rawMessage.caption) {
      return rawMessage.caption;
    }

    // Contact
    if (rawMessage.contact) {
      return `Contact: ${rawMessage.contact.first_name} ${rawMessage.contact.phone_number}`;
    }

    // Location
    if (rawMessage.location) {
      return `Location: ${rawMessage.location.latitude}, ${rawMessage.location.longitude}`;
    }

    return '';
  }

  /**
   * Extract channel metadata
   */
  extractChannelMetadata(rawMessage) {
    const from = rawMessage.from || {};
    const chat = rawMessage.chat || {};

    return {
      telegram: {
        chat_id: chat.id,
        username: from.username,
        first_name: from.first_name,
        last_name: from.last_name,
        chat_type: chat.type, // 'private', 'group', 'supergroup', 'channel'
      },
    };
  }

  /**
   * Extract timestamp
   */
  extractTimestamp(rawMessage) {
    if (rawMessage.date) {
      return new Date(rawMessage.date * 1000);
    }
    return new Date();
  }

  /**
   * Extract message ID
   */
  extractMessageId(rawMessage) {
    return rawMessage.message_id ? rawMessage.message_id.toString() : null;
  }

  /**
   * Extract media attachments
   */
  extractMedia(rawMessage) {
    const media = [];

    // Photo
    if (rawMessage.photo && rawMessage.photo.length > 0) {
      // Get highest resolution photo
      const photo = rawMessage.photo[rawMessage.photo.length - 1];
      media.push({
        type: 'image',
        url: photo.file_id, // Need to get actual URL via getFile
        file_id: photo.file_id,
        file_size: photo.file_size,
        mime_type: 'image/jpeg',
      });
    }

    // Video
    if (rawMessage.video) {
      media.push({
        type: 'video',
        url: rawMessage.video.file_id,
        file_id: rawMessage.video.file_id,
        file_size: rawMessage.video.file_size,
        mime_type: rawMessage.video.mime_type,
      });
    }

    // Document
    if (rawMessage.document) {
      media.push({
        type: 'document',
        url: rawMessage.document.file_id,
        file_id: rawMessage.document.file_id,
        file_size: rawMessage.document.file_size,
        mime_type: rawMessage.document.mime_type,
        filename: rawMessage.document.file_name,
      });
    }

    // Audio
    if (rawMessage.audio) {
      media.push({
        type: 'audio',
        url: rawMessage.audio.file_id,
        file_id: rawMessage.audio.file_id,
        file_size: rawMessage.audio.file_size,
        mime_type: rawMessage.audio.mime_type,
      });
    }

    // Voice
    if (rawMessage.voice) {
      media.push({
        type: 'audio',
        url: rawMessage.voice.file_id,
        file_id: rawMessage.voice.file_id,
        file_size: rawMessage.voice.file_size,
        mime_type: rawMessage.voice.mime_type || 'audio/ogg',
      });
    }

    return media.length > 0 ? media : null;
  }

  /**
   * Get file URL from file_id
   */
  async getFileUrl(fileId) {
    try {
      const response = await axios.post(`${this.apiUrl}/getFile`, {
        file_id: fileId,
      });

      const filePath = response.data.result.file_path;
      return `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    } catch (error) {
      this.log('Failed to get file URL', error.message);
      return null;
    }
  }

  /**
   * Validate webhook
   */
  validateWebhook(req) {
    // If webhook secret is configured, validate it
    if (this.telegramConfig.webhook_secret) {
      const secretToken = req.headers['x-telegram-bot-api-secret-token'];
      return secretToken === this.telegramConfig.webhook_secret;
    }
    return true;
  }

  /**
   * Format message with Telegram markdown
   */
  formatMessage(message, options = {}) {
    // Telegram supports Markdown and HTML
    // For Markdown: *bold* _italic_ `code` ```pre``` [link](url)
    // For MarkdownV2: more strict escaping required
    return message;
  }

  /**
   * Setup webhook
   */
  async setupWebhook(webhookUrl, options = {}) {
    try {
      const payload = {
        url: webhookUrl,
        drop_pending_updates: options.dropPendingUpdates || false,
        max_connections: options.maxConnections || 40,
      };

      // Add secret token if provided
      if (this.telegramConfig.webhook_secret) {
        payload.secret_token = this.telegramConfig.webhook_secret;
      }

      // Specify allowed updates
      if (options.allowedUpdates) {
        payload.allowed_updates = options.allowedUpdates;
      } else {
        payload.allowed_updates = [
          'message',
          'edited_message',
          'callback_query',
        ];
      }

      const response = await axios.post(`${this.apiUrl}/setWebhook`, payload);

      if (response.data.ok) {
        this.log('Webhook setup successful', { url: webhookUrl });
        return {
          success: true,
          url: webhookUrl,
        };
      } else {
        throw new Error(response.data.description || 'Failed to setup webhook');
      }
    } catch (error) {
      this.handleError(error, 'setupWebhook');
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook() {
    try {
      const response = await axios.post(`${this.apiUrl}/deleteWebhook`, {
        drop_pending_updates: true,
      });

      if (response.data.ok) {
        this.log('Webhook deleted successfully');
        return { success: true };
      } else {
        throw new Error(
          response.data.description || 'Failed to delete webhook'
        );
      }
    } catch (error) {
      this.handleError(error, 'deleteWebhook');
    }
  }

  /**
   * Get webhook info
   */
  async getWebhookInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/getWebhookInfo`);

      if (response.data.ok) {
        return response.data.result;
      } else {
        throw new Error(
          response.data.description || 'Failed to get webhook info'
        );
      }
    } catch (error) {
      this.handleError(error, 'getWebhookInfo');
    }
  }

  /**
   * Get bot info
   */
  async getBotInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);

      if (response.data.ok) {
        return response.data.result;
      } else {
        throw new Error(response.data.description || 'Failed to get bot info');
      }
    } catch (error) {
      this.handleError(error, 'getBotInfo');
    }
  }
}

module.exports = TelegramService;
