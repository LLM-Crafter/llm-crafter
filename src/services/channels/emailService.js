/**
 * Email Channel Service
 * Supports SMTP, SendGrid, Mailgun, AWS SES
 */

const BaseChannelService = require('./baseChannelService');
const nodemailer = require('nodemailer');
const encryption = require('../../utils/encryption');

class EmailService extends BaseChannelService {
  constructor(channelConfig) {
    super(channelConfig, 'email');
    this.emailConfig = this.config;
    this.transporter = null;

    if (this.isEnabled()) {
      this.transporter = this.createTransporter();
    }
  }

  /**
   * Helper method to safely decrypt credentials
   */
  safeDecrypt(data) {
    if (!data) return data;
    return encryption.isEncrypted(data) ? encryption.decrypt(data) : data;
  }

  /**
   * Create email transporter based on provider
   */
  createTransporter() {
    switch (this.emailConfig.provider) {
      case 'sendgrid':
        return nodemailer.createTransport({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: this.safeDecrypt(this.emailConfig.api_keys.sendgrid),
          },
        });

      case 'mailgun':
        return nodemailer.createTransport({
          host: 'smtp.mailgun.org',
          port: 587,
          secure: false,
          auth: {
            user: this.safeDecrypt(this.emailConfig.smtp_config.username),
            pass: this.safeDecrypt(this.emailConfig.api_keys.mailgun),
          },
        });

      case 'ses':
        // AWS SES via SMTP
        return nodemailer.createTransporter({
          host: `email-smtp.${this.emailConfig.api_keys.ses_region}.amazonaws.com`,
          port: 587,
          secure: false,
          auth: {
            user: this.safeDecrypt(this.emailConfig.api_keys.ses_access_key),
            pass: this.safeDecrypt(this.emailConfig.api_keys.ses_secret_key),
          },
        });

      case 'smtp':
      default:
        // Generic SMTP
        return nodemailer.createTransport({
          host: this.emailConfig.smtp_config.host,
          port: this.emailConfig.smtp_config.port,
          secure: this.emailConfig.smtp_config.secure || false,
          auth: {
            user: this.emailConfig.smtp_config.username,
            pass: this.safeDecrypt(this.emailConfig.smtp_config.password),
          },
        });
    }
  }

  /**
   * Send email message
   */
  async sendMessage(recipient, message, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Email channel is not enabled');
      }

      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const mailOptions = {
        from: `${this.emailConfig.from_name} <${this.emailConfig.from_email}>`,
        to: recipient,
        subject: options.subject || 'Response from Support',
        text: this.formatPlainText(message, options),
        html: options.html || this.convertToHtml(message, options),
      };

      // Add threading headers if this is a reply
      if (options.inReplyTo) {
        mailOptions.inReplyTo = options.inReplyTo;
        mailOptions.references = options.references || options.inReplyTo;
      }

      // Add custom headers
      if (options.headers) {
        mailOptions.headers = options.headers;
      }

      const info = await this.transporter.sendMail(mailOptions);

      this.log('Email sent', {
        to: recipient,
        messageId: info.messageId,
        subject: mailOptions.subject,
      });

      return {
        success: true,
        message_id: info.messageId,
        provider: this.emailConfig.provider,
      };
    } catch (error) {
      this.handleError(error, 'sendMessage');
    }
  }

  /**
   * Send email with attachments
   */
  async sendMediaMessage(recipient, media, options = {}) {
    try {
      if (!this.isEnabled()) {
        throw new Error('Email channel is not enabled');
      }

      const mailOptions = {
        from: `${this.emailConfig.from_name} <${this.emailConfig.from_email}>`,
        to: recipient,
        subject: options.subject || 'Response with Attachment',
        text: media.caption || 'Please find the attachment below.',
        html:
          options.html ||
          this.convertToHtml(
            media.caption || 'Please find the attachment below.'
          ),
        attachments: [
          {
            filename:
              media.filename ||
              `attachment.${this.getExtension(media.mime_type)}`,
            path: media.url,
          },
        ],
      };

      // Add threading headers
      if (options.inReplyTo) {
        mailOptions.inReplyTo = options.inReplyTo;
        mailOptions.references = options.references || options.inReplyTo;
      }

      const info = await this.transporter.sendMail(mailOptions);

      this.log('Email with attachment sent', {
        to: recipient,
        messageId: info.messageId,
      });

      return {
        success: true,
        message_id: info.messageId,
        provider: this.emailConfig.provider,
      };
    } catch (error) {
      this.handleError(error, 'sendMediaMessage');
    }
  }

  /**
   * Handle incoming email
   * Note: This would typically be called from an IMAP poller or webhook
   */
  async handleIncomingMessage(rawMessage) {
    try {
      // rawMessage should be a parsed email object (from mailparser or similar)
      this.log('Processing email', {
        from: rawMessage.from?.text,
        subject: rawMessage.subject,
      });

      const normalized = this.normalizeMessage(rawMessage);
      return normalized;
    } catch (error) {
      this.handleError(error, 'handleIncomingMessage');
    }
  }

  /**
   * Extract user identifier (email address)
   */
  extractUserIdentifier(rawMessage) {
    if (rawMessage.from?.value?.[0]?.address) {
      return rawMessage.from.value[0].address;
    }
    if (rawMessage.from?.address) {
      return rawMessage.from.address;
    }
    if (typeof rawMessage.from === 'string') {
      // Extract email from "Name <email@example.com>" format
      const match = rawMessage.from.match(/<([^>]+)>/);
      return match ? match[1] : rawMessage.from;
    }
    throw new Error('Unable to extract email address from message');
  }

  /**
   * Extract message content
   */
  extractContent(rawMessage) {
    // Prefer plain text, fallback to HTML
    if (rawMessage.text) {
      return this.cleanEmailContent(rawMessage.text);
    }
    if (rawMessage.html) {
      return this.htmlToText(rawMessage.html);
    }
    if (rawMessage.textAsHtml) {
      return this.htmlToText(rawMessage.textAsHtml);
    }
    return '';
  }

  /**
   * Extract channel metadata
   */
  extractChannelMetadata(rawMessage) {
    const fromAddress = this.extractUserIdentifier(rawMessage);
    const fromName =
      rawMessage.from?.value?.[0]?.name || rawMessage.from?.name || '';

    return {
      email: {
        from_email: fromAddress,
        from_name: fromName,
        subject: rawMessage.subject || '',
        message_id: rawMessage.messageId || '',
        thread_id: rawMessage.inReplyTo || rawMessage.messageId || '',
        references: rawMessage.references || [],
      },
    };
  }

  /**
   * Extract timestamp
   */
  extractTimestamp(rawMessage) {
    if (rawMessage.date) {
      return new Date(rawMessage.date);
    }
    return new Date();
  }

  /**
   * Extract message ID
   */
  extractMessageId(rawMessage) {
    return rawMessage.messageId || null;
  }

  /**
   * Extract media/attachments
   */
  extractMedia(rawMessage) {
    if (!rawMessage.attachments || rawMessage.attachments.length === 0) {
      return null;
    }

    return rawMessage.attachments.map(attachment => ({
      type: this.getMediaType(attachment.contentType),
      filename: attachment.filename,
      mime_type: attachment.contentType,
      file_size: attachment.size,
      url: null, // Would need to be uploaded/stored somewhere
      content: attachment.content, // Buffer
    }));
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
   * Get file extension from MIME type
   */
  getExtension(mimeType) {
    const mimeMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
    };
    return mimeMap[mimeType] || 'bin';
  }

  /**
   * Convert message to HTML
   */
  convertToHtml(text, options = {}) {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .message-content {
            padding: 20px;
            background-color: #f9f9f9;
            border-left: 4px solid #0084ff;
            margin: 20px 0;
          }
          .signature {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <div class="message-content">
          ${text.replace(/\n/g, '<br>')}
        </div>
    `;

    // Add signature if configured
    if (this.emailConfig.settings?.signature) {
      html += `
        <div class="signature">
          ${this.emailConfig.settings.signature.replace(/\n/g, '<br>')}
        </div>
      `;
    }

    // Add conversation history if enabled and provided
    if (
      this.emailConfig.settings?.include_conversation_history &&
      options.conversationHistory
    ) {
      html += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #ddd;">
          <h3 style="color: #666;">Previous Messages:</h3>
          ${options.conversationHistory}
        </div>
      `;
    }

    html += `
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Format plain text with signature
   */
  formatPlainText(text, options = {}) {
    let plainText = text;

    // Add signature
    if (this.emailConfig.settings?.signature) {
      plainText += `\n\n---\n${this.emailConfig.settings.signature}`;
    }

    return plainText;
  }

  /**
   * Clean email content (remove quoted replies, signatures, etc.)
   */
  cleanEmailContent(text) {
    // Remove common email reply patterns
    const lines = text.split('\n');
    const cleanedLines = [];

    for (const line of lines) {
      // Stop at common reply indicators
      if (
        line.startsWith('>') ||
        line.match(/^On .* wrote:/) ||
        line.match(/^From:.*Sent:.*/) ||
        line.includes('Original Message') ||
        line.includes('________________________________')
      ) {
        break;
      }
      cleanedLines.push(line);
    }

    return cleanedLines.join('\n').trim();
  }

  /**
   * Convert HTML to plain text (basic implementation)
   */
  htmlToText(html) {
    return html
      .replace(/<style[^>]*>.*<\/style>/gm, '')
      .replace(/<script[^>]*>.*<\/script>/gm, '')
      .replace(/<[^>]+>/gm, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if subject matches auto-reply patterns
   */
  shouldAutoReply(subject) {
    if (!this.emailConfig.settings?.auto_reply_subjects) {
      return true; // Reply to all if not configured
    }

    const patterns = this.emailConfig.settings.auto_reply_subjects;
    const lowerSubject = subject.toLowerCase();

    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();
      return (
        lowerSubject.includes(lowerPattern) ||
        new RegExp(lowerPattern).test(lowerSubject)
      );
    });
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection() {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      await this.transporter.verify();
      this.log('Email connection verified');
      return { success: true, message: 'Connection verified' };
    } catch (error) {
      this.handleError(error, 'verifyConnection');
    }
  }
}

module.exports = EmailService;
