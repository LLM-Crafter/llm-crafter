'use strict';

/**
 * ChannelTurnBufferService — Mongo-backed debounce buffer so multiple app
 * instances can share the "wait for the burst to settle" state for chat-style
 * channels instead of each instance keeping its own in-memory timer.
 *
 * Multi-instance safe:
 *  - `bufferTurn` merges under a short-lived DistributedLock (per conversation)
 *    so two near-simultaneous messages on different instances don't race.
 *  - `claimDueTurn` uses an atomic `findOneAndDelete` — only one instance can
 *    ever claim a given due turn, no matter how many instances are polling.
 *  - `hasNewerTurn` lets the instance currently generating a reply detect that
 *    a new message was buffered (on any instance) while it was working, so it
 *    can cancel and let the next turn take over.
 */

const PendingChannelTurn = require('../models/PendingChannelTurn');
const lockService = require('./distributedLockService');

const LOCK_TTL_MS = 5000;
// Lock contention here only ever means "another op for the SAME conversation is mid-flight"
// (merge or claim) — hold times are a couple of Mongo round-trips, so a few short retries are
// enough to avoid ever silently dropping a buffered message.
const LOCK_RETRY_ATTEMPTS = 10;
const LOCK_RETRY_DELAY_MS = 150;
const CLAIM_BATCH_SIZE = 20;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class ChannelTurnBufferService {
  /**
   * Merge an incoming message into the conversation's pending turn (creating
   * it if absent) and push `run_at` to `debounceMs` from now.
   * @param {string} conversationId
   * @param {Object} turn - { agentId, channel, userIdentifier, content, channelMetadata, storedMedia, options }
   * @param {number} debounceMs
   */
  async bufferTurn(conversationId, turn, debounceMs) {
    const merge = () => PendingChannelTurn.findById(conversationId).then(existing => {
      const mergedContent = existing
        ? [existing.content, turn.content].filter(Boolean).join('\n')
        : turn.content || '';
      const mergedMedia = existing
        ? existing.stored_media.concat(turn.storedMedia || [])
        : (turn.storedMedia || []);

      return PendingChannelTurn.findByIdAndUpdate(
        conversationId,
        {
          _id: conversationId,
          agent: turn.agentId,
          channel: turn.channel,
          user_identifier: turn.userIdentifier,
          content: mergedContent,
          channel_metadata: turn.channelMetadata,
          stored_media: mergedMedia,
          options: turn.options || {},
          run_at: new Date(Date.now() + debounceMs),
        },
        { upsert: true }
      );
    });

    for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt++) {
      const result = await lockService.withLock(`channel_turn:${conversationId}`, LOCK_TTL_MS, merge);
      if (result !== null) return;
      await sleep(LOCK_RETRY_DELAY_MS);
    }
    // Only reachable if another op holds the lock for the entire retry window — surface it
    // rather than silently dropping the message.
    throw new Error(`Could not buffer turn for conversation ${conversationId} — lock contention timed out`);
  }

  /**
   * Atomically claim (and remove) one due turn, if any. Claiming goes through the same
   * per-conversation lock as `bufferTurn` so a merge and a claim for the same conversation
   * can never interleave (which would otherwise let a message be buffered onto a turn that's
   * simultaneously being claimed/deleted, losing it).
   * @returns {Promise<Object|null>} the claimed document, or null if none could be claimed
   */
  async claimDueTurn() {
    const candidates = await PendingChannelTurn.find(
      { run_at: { $lte: new Date() } },
      { _id: 1 }
    )
      .sort({ run_at: 1 })
      .limit(CLAIM_BATCH_SIZE)
      .lean();

    for (const { _id } of candidates) {
      const claimed = await lockService.withLock(`channel_turn:${_id}`, LOCK_TTL_MS, () =>
        PendingChannelTurn.findOneAndDelete({ _id, run_at: { $lte: new Date() } })
      );
      if (claimed) return claimed;
    }
    return null;
  }

  /**
   * Whether a newer message has been buffered for this conversation — used to
   * detect, from within an in-progress generation, that it should be cancelled.
   */
  async hasNewerTurn(conversationId) {
    const doc = await PendingChannelTurn.exists({ _id: conversationId });
    return !!doc;
  }
}

module.exports = new ChannelTurnBufferService();
