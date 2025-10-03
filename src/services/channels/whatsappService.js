/**
 * WhatsApp Channel Service
 * Supports Twilio and Meta Cloud API
 */

const BaseChannelService = require('./baseChannelService');
const axios = require('axios');
const crypto = require('crypto');
const encryption = require('../../utils/encryption');

class WhatsAppService extends BaseChannelService {
  constructor(channelConfig) {
    super(channelConfig, 'whatsapp');
    this.whatsappConfig = this.config;
  }

  /**
   * Helper method to safely decrypt credentials
   * Only decrypts if the data is actually encrypted
   */
  safeDecrypt(data) {
    if (!data) return data;
    return encryption.isEncrypted(data) ? encryption.decrypt(data) : data;
  }

  /**
   * Send a text message via WhatsApp
   */
  async sendMessage(recipient, message, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('WhatsApp channel is not enabled');
      }

      const formattedMessage = this.formatMessage(message, options);

      if (this.whatsappConfig.provider === 'twilio') {
        return await this.sendViaTwilio(recipient, formattedMessage, options);
      } else if (this.whatsappConfig.provider === 'meta') {
        return await this.sendViaMetaAPI(recipient, formattedMessage, options);
      } else if (this.whatsappConfig.provider === '360dialog') {
        return await this.sendVia360Dialog(
          recipient,
          formattedMessage,
          options
        );
      } else {
        throw new Error(
          `Unsupported WhatsApp provider: ${this.whatsappConfig.provider}`
        );
      }
    } catch (error) {
      this.handleError(error, 'sendMessage');
    }
  }

  /**
   * Send message via Twilio
   */
  async sendViaTwilio(to, message, options) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.whatsappConfig.credentials.account_sid}/Messages.json`;

    // Decrypt auth token if needed
    const authToken = this.safeDecrypt(
      this.whatsappConfig.credentials?.auth_token
    );

    if (!authToken) {
      throw new Error('Twilio auth token is missing or could not be decrypted');
    }

    const response = await axios.post(
      url,
      new URLSearchParams({
        From: `whatsapp:${this.whatsappConfig.phone_number}`,
        To: `whatsapp:${to}`,
        Body: message,
      }),
      {
        auth: {
          username: this.whatsappConfig.credentials.account_sid,
          password: authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    this.log('Message sent via Twilio', { to, messageId: response.data.sid });
    return {
      success: true,
      message_id: response.data.sid,
      provider: 'twilio',
    };
  }

  /**
   * Send message via Meta Cloud API
   */
  async sendViaMetaAPI(to, message, options) {
    const phoneNumberId = this.whatsappConfig.credentials.phone_number_id;
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    // Decrypt access token if needed
    const accessToken = this.safeDecrypt(
      this.whatsappConfig.credentials.access_token
    );

    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: true,
          body: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    this.log('Message sent via Meta API', {
      to,
      messageId: response.data.messages[0].id,
    });
    return {
      success: true,
      message_id: response.data.messages[0].id,
      provider: 'meta',
    };
  }

  /**
   * Send message via 360Dialog
   */
  async sendVia360Dialog(to, message, options) {
    const url = 'https://waba.360dialog.io/v1/messages';

    // Decrypt API key if needed
    const apiKey = this.safeDecrypt(this.whatsappConfig.credentials.api_key);

    const response = await axios.post(
      url,
      {
        to: to,
        type: 'text',
        text: {
          body: message,
        },
      },
      {
        headers: {
          'D360-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    this.log('Message sent via 360Dialog', {
      to,
      messageId: response.data.messages[0].id,
    });
    return {
      success: true,
      message_id: response.data.messages[0].id,
      provider: '360dialog',
    };
  }

  /**
   * Send media message
   */
  async sendMediaMessage(recipient, media, options = {}) {
    try {
      if (this.whatsappConfig.provider === 'meta') {
        return await this.sendMediaViaMetaAPI(recipient, media, options);
      } else if (this.whatsappConfig.provider === 'twilio') {
        return await this.sendMediaViaTwilio(recipient, media, options);
      } else {
        throw new Error('Media not supported for this provider yet');
      }
    } catch (error) {
      this.handleError(error, 'sendMediaMessage');
    }
  }

  /**
   * Send media via Meta API
   */
  async sendMediaViaMetaAPI(to, media, options) {
    const phoneNumberId = this.whatsappConfig.credentials.phone_number_id;
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    const accessToken = this.safeDecrypt(
      this.whatsappConfig.credentials.access_token
    );

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: media.type, // 'image', 'video', 'document', 'audio'
      [media.type]: {
        link: media.url,
      },
    };

    // Add caption if provided
    if (media.caption && ['image', 'video', 'document'].includes(media.type)) {
      payload[media.type].caption = media.caption;
    }

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    this.log('Media sent via Meta API', {
      to,
      type: media.type,
      messageId: response.data.messages[0].id,
    });
    return {
      success: true,
      message_id: response.data.messages[0].id,
      provider: 'meta',
    };
  }

  /**
   * Send media via Twilio
   */
  async sendMediaViaTwilio(to, media, options) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.whatsappConfig.credentials.account_sid}/Messages.json`;

    const authToken = this.safeDecrypt(
      this.whatsappConfig.credentials.auth_token
    );

    const params = {
      From: `whatsapp:${this.whatsappConfig.phone_number}`,
      To: `whatsapp:${to}`,
      MediaUrl: media.url,
    };

    if (media.caption) {
      params.Body = media.caption;
    }

    const response = await axios.post(url, new URLSearchParams(params), {
      auth: {
        username: this.whatsappConfig.credentials.account_sid,
        password: authToken,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.log('Media sent via Twilio', { to, messageId: response.data.sid });
    return {
      success: true,
      message_id: response.data.sid,
      provider: 'twilio',
    };
  }

  /**
   * Handle incoming WhatsApp webhook
   */
  async handleIncomingMessage(rawMessage) {
    try {
      if (this.whatsappConfig.provider === 'twilio') {
        return this.handleTwilioWebhook(rawMessage);
      } else if (this.whatsappConfig.provider === 'meta') {
        return this.handleMetaWebhook(rawMessage);
      } else if (this.whatsappConfig.provider === '360dialog') {
        return this.handle360DialogWebhook(rawMessage);
      }
    } catch (error) {
      this.handleError(error, 'handleIncomingMessage');
    }
  }

  /**
   * Handle Twilio webhook format
   */
  handleTwilioWebhook(rawMessage) {
    this.log('Processing Twilio webhook', {
      from: rawMessage.From,
      messageId: rawMessage.MessageSid,
    });

    const normalized = this.normalizeMessage(rawMessage);
    return normalized;
  }

  /**
   * Handle Meta webhook format
   */
  handleMetaWebhook(rawMessage) {
    // Meta sends nested structure
    const entry = rawMessage.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) {
      throw new Error('Invalid Meta webhook format');
    }

    this.log('Processing Meta webhook', {
      from: message.from,
      messageId: message.id,
    });

    const normalized = this.normalizeMessage(message);
    normalized.metaContact = change?.value?.contacts?.[0];
    return normalized;
  }

  /**
   * Handle 360Dialog webhook format
   */
  handle360DialogWebhook(rawMessage) {
    this.log('Processing 360Dialog webhook', {
      from: rawMessage.from,
      messageId: rawMessage.id,
    });

    const normalized = this.normalizeMessage(rawMessage);
    return normalized;
  }

  /**
   * Extract user identifier from message
   */
  extractUserIdentifier(rawMessage) {
    // Twilio format
    if (rawMessage.From) {
      return rawMessage.From.replace('whatsapp:', '').replace('+', '');
    }
    // Meta/360Dialog format
    if (rawMessage.from) {
      return rawMessage.from;
    }
    throw new Error('Unable to extract user identifier from WhatsApp message');
  }

  /**
   * Extract message content
   */
  extractContent(rawMessage) {
    // Twilio format
    if (rawMessage.Body) {
      return rawMessage.Body;
    }
    // Meta/360Dialog format
    if (rawMessage.text?.body) {
      return rawMessage.text.body;
    }
    // Handle button replies, interactive messages, etc.
    if (rawMessage.button?.text) {
      return rawMessage.button.text;
    }
    if (rawMessage.interactive?.button_reply?.title) {
      return rawMessage.interactive.button_reply.title;
    }

    return '';
  }

  /**
   * Extract channel metadata
   */
  extractChannelMetadata(rawMessage) {
    const metadata = {
      whatsapp: {
        phone_number: this.extractUserIdentifier(rawMessage),
      },
    };

    // Twilio format
    if (rawMessage.ProfileName) {
      metadata.whatsapp.profile_name = rawMessage.ProfileName;
    }
    if (rawMessage.WaId) {
      metadata.whatsapp.wa_id = rawMessage.WaId;
    }

    // Meta format
    if (rawMessage.from) {
      metadata.whatsapp.wa_id = rawMessage.from;
    }

    // If we have contact info from Meta webhook
    if (this.metaContact) {
      metadata.whatsapp.profile_name =
        this.metaContact.profile?.name || this.metaContact.wa_id;
    }

    return metadata;
  }

  /**
   * Extract timestamp
   */
  extractTimestamp(rawMessage) {
    // Meta format
    if (rawMessage.timestamp) {
      return new Date(parseInt(rawMessage.timestamp) * 1000);
    }
    return new Date();
  }

  /**
   * Extract message ID
   */
  extractMessageId(rawMessage) {
    // Twilio
    if (rawMessage.MessageSid) {
      return rawMessage.MessageSid;
    }
    // Meta/360Dialog
    if (rawMessage.id) {
      return rawMessage.id;
    }
    return null;
  }

  /**
   * Extract media attachments
   */
  extractMedia(rawMessage) {
    const media = [];

    // Twilio format
    const numMedia = parseInt(rawMessage.NumMedia || 0);
    for (let i = 0; i < numMedia; i++) {
      media.push({
        type: this.getMediaType(rawMessage[`MediaContentType${i}`]),
        url: rawMessage[`MediaUrl${i}`],
        mime_type: rawMessage[`MediaContentType${i}`],
        file_size: null,
      });
    }

    // Meta format
    if (rawMessage.image) {
      media.push({
        type: 'image',
        url: rawMessage.image.id, // Need to fetch URL separately
        mime_type: rawMessage.image.mime_type,
        file_size: null,
      });
    }
    if (rawMessage.video) {
      media.push({
        type: 'video',
        url: rawMessage.video.id,
        mime_type: rawMessage.video.mime_type,
        file_size: null,
      });
    }
    if (rawMessage.document) {
      media.push({
        type: 'document',
        url: rawMessage.document.id,
        mime_type: rawMessage.document.mime_type,
        file_size: null,
        filename: rawMessage.document.filename,
      });
    }
    if (rawMessage.audio) {
      media.push({
        type: 'audio',
        url: rawMessage.audio.id,
        mime_type: rawMessage.audio.mime_type,
        file_size: null,
      });
    }

    return media.length > 0 ? media : null;
  }

  /**
   * Get media type from MIME type
   */
  getMediaType(mimeType) {
    if (!mimeType) return 'document';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /**
   * Validate webhook signature
   */
  validateWebhook(req) {
    if (this.whatsappConfig.provider === 'twilio') {
      return this.validateTwilioSignature(req);
    } else if (this.whatsappConfig.provider === 'meta') {
      return this.validateMetaSignature(req);
    }
    return true; // 360Dialog uses API key auth
  }

  /**
   * Validate Twilio webhook signature
   */
  validateTwilioSignature(req) {
    const signature = req.headers['x-twilio-signature'];
    if (!signature) return false;

    const authToken = this.safeDecrypt(
      this.whatsappConfig.credentials.auth_token
    );

    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Create expected signature
    const data = Object.keys(req.body)
      .sort()
      .reduce((acc, key) => acc + key + req.body[key], url);

    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Validate Meta webhook signature
   */
  validateMetaSignature(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const appSecret = this.safeDecrypt(
      this.whatsappConfig.credentials.access_token
    );

    const expectedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', appSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Format message with WhatsApp markdown
   */
  formatMessage(message, options = {}) {
    // WhatsApp supports basic markdown
    // *bold* _italic_ ~strikethrough~ ```code```
    return message;
  }
}

module.exports = WhatsAppService;
