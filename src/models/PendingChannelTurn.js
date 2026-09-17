const mongoose = require('mongoose');

/**
 * PendingChannelTurn — Mongo-backed debounce buffer for chat-style channels
 * (WhatsApp/Telegram/Instagram/Messenger), so debouncing works across multiple
 * app instances instead of relying on in-process timers.
 *
 * One document per conversation. Each incoming message upserts this doc
 * (merging content/media and pushing `run_at` further out). A poller on every
 * instance claims due documents via an atomic `findOneAndDelete` (only one
 * instance can win), so exactly one instance ends up running the turn.
 * Its continued existence after a turn has been claimed also doubles as the
 * cross-instance "a newer message arrived" cancellation signal (see
 * `channelTurnBufferService.hasNewerTurn`).
 */
const pendingChannelTurnSchema = new mongoose.Schema(
  {
    // Conversation id — one buffered turn per conversation.
    _id: { type: String },
    agent: { type: String, required: true },
    channel: { type: String, required: true },
    user_identifier: { type: String, required: true },
    content: { type: String, default: '' },
    channel_metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    stored_media: { type: [mongoose.Schema.Types.Mixed], default: [] },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    run_at: { type: Date, required: true },
  },
  { timestamps: true }
);

pendingChannelTurnSchema.index({ run_at: 1 });

module.exports = mongoose.model('PendingChannelTurn', pendingChannelTurnSchema);
