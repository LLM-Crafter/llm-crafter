/**
 * Base Channel Service
 * Abstract class that all channel implementations must extend
 */

class BaseChannelService {
  constructor(channelConfig, channel) {
    this.channelConfig = channelConfig;
    this.channel = channel;
    this.config = channelConfig[channel] || {};
  }

  /**
   * Send a text message through the channel
   * Must be implemented by each channel
   * @param {string} recipient - Channel-specific recipient identifier
   * @param {string} message - Message text to send
   * @param {Object} options - Channel-specific options
   * @returns {Promise<Object>} - Send result with message ID
   */
  async sendMessage(recipient, message, options = {}) {
    throw new Error(
      `sendMessage must be implemented by ${this.constructor.name}`
    );
  }

  /**
   * Send a media message (image, video, document, etc.)
   * @param {string} recipient - Channel-specific recipient identifier
   * @param {Object} media - Media object {type, url, caption}
   * @param {Object} options - Channel-specific options
   * @returns {Promise<Object>} - Send result
   */
  async sendMediaMessage(recipient, media, options = {}) {
    throw new Error(
      `sendMediaMessage must be implemented by ${this.constructor.name}`
    );
  }

  /**
   * Handle incoming message from the channel
   * Must be implemented by each channel
   * @param {Object} rawMessage - Raw message from webhook/API
   * @returns {Promise<Object>} - Normalized message object
   */
  async handleIncomingMessage(rawMessage) {
    throw new Error(
      `handleIncomingMessage must be implemented by ${this.constructor.name}`
    );
  }

  /**
   * Normalize a message to unified format
   * @param {Object} rawMessage - Raw message from channel
   * @returns {Object} - Normalized message
   */
  normalizeMessage(rawMessage) {
    return {
      channel: this.channel,
      user_identifier: this.extractUserIdentifier(rawMessage),
      content: this.extractContent(rawMessage),
      timestamp: this.extractTimestamp(rawMessage) || new Date(),
      channel_metadata: this.extractChannelMetadata(rawMessage),
      media: this.extractMedia(rawMessage),
      message_id: this.extractMessageId(rawMessage),
    };
  }

  /**
   * Extract user identifier from raw message
   * Must be implemented by each channel
   * @param {Object} rawMessage
   * @returns {string}
   */
  extractUserIdentifier(rawMessage) {
    throw new Error(
      `extractUserIdentifier must be implemented by ${this.constructor.name}`
    );
  }

  /**
   * Extract message content/text from raw message
   * Must be implemented by each channel
   * @param {Object} rawMessage
   * @returns {string}
   */
  extractContent(rawMessage) {
    throw new Error(
      `extractContent must be implemented by ${this.constructor.name}`
    );
  }

  /**
   * Extract channel-specific metadata from raw message
   * Must be implemented by each channel
   * @param {Object} rawMessage
   * @returns {Object}
   */
  extractChannelMetadata(rawMessage) {
    throw new Error(
      `extractChannelMetadata must be implemented by ${this.constructor.name}`
    );
  }

  /**
   * Extract message timestamp
   * @param {Object} rawMessage
   * @returns {Date|null}
   */
  extractTimestamp(rawMessage) {
    return null; // Override if channel provides timestamps
  }

  /**
   * Extract media attachments from message
   * @param {Object} rawMessage
   * @returns {Array<Object>|null}
   */
  extractMedia(rawMessage) {
    return null; // Override if channel supports media
  }

  /**
   * Extract platform-specific message ID
   * @param {Object} rawMessage
   * @returns {string|null}
   */
  extractMessageId(rawMessage) {
    return null; // Override if channel provides message IDs
  }

  /**
   * Validate webhook signature/authenticity
   * @param {Object} req - Express request object
   * @returns {boolean}
   */
  validateWebhook(req) {
    // Override in channel implementations that need webhook validation
    return true;
  }

  /**
   * Format agent response for the channel
   * Some channels support markdown, buttons, etc.
   * @param {string} message - Plain text message
   * @param {Object} options - Formatting options
   * @returns {string}
   */
  formatMessage(message, options = {}) {
    return message; // Override to add channel-specific formatting
  }

  /**
   * Check if channel is properly configured and enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.config.enabled === true;
  }

  /**
   * Get channel display name
   * @returns {string}
   */
  getDisplayName() {
    return this.channel.charAt(0).toUpperCase() + this.channel.slice(1);
  }

  /**
   * Log channel activity
   * @param {string} action
   * @param {Object} data
   */
  log(action, data = {}) {
    console.log(`[${this.getDisplayName()}] ${action}:`, data);
  }

  /**
   * Handle errors in channel operations
   * @param {Error} error
   * @param {string} operation
   */
  handleError(error, operation) {
    console.error(
      `[${this.getDisplayName()}] Error in ${operation}:`,
      error.message
    );
    throw error;
  }
}

module.exports = BaseChannelService;
