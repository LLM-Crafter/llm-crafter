const mongoose = require('mongoose');

/**
 * ChannelOutboundMessage — platform message IDs of everything Crafter sent through a
 * channel that echoes outgoing messages back via webhook (Instagram, Messenger).
 *
 * Echoes for these IDs are our own messages (already stored on the conversation) and are
 * dropped; an echo whose ID is not here was sent from the platform's own app by someone at
 * the business, and gets recorded. A separate collection (instead of channel_info.message_id)
 * because one agent reply can produce several platform messages (text + rich cards), and the
 * ID has to be findable the moment the send returns — before the conversation is updated.
 * Entries only need to outlive the echo's delivery, so they expire after a day.
 */
const channelOutboundMessageSchema = new mongoose.Schema(
  {
    // "<channel>:<platform message id>"
    _id: { type: String },
    created_at: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
  },
  { timestamps: false }
);

module.exports = mongoose.model('ChannelOutboundMessage', channelOutboundMessageSchema);
