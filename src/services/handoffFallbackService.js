'use strict';

/**
 * Handoff Fallback Service
 *
 * Detects conversations that are in `handoff_requested` state where no human
 * operator has joined within the configured timeout, and instructs the AI to
 * send a holding message to the user.
 *
 * Multi-instance safety
 * ─────────────────────
 * Multiple llm-crafter instances all share the same MongoDB.  To prevent two
 * instances from sending a duplicate fallback for the same conversation we use
 * an optimistic lock stored on the conversation document itself
 * (`handoff_info.fallback_locked_until`).  Each claim is a single atomic
 * `findOneAndUpdate` call that both reads and writes in one round trip.
 *
 * The lock TTL is 90 seconds — long enough to cover the LLM call + DB write,
 * but short enough that a crashed instance will not block the queue for long.
 */

const Conversation = require('../models/Conversation');
const Agent = require('../models/Agent');
const OpenAIService = require('./openaiService');

const LOCK_TTL_MS = 90_000; // 90 s
const BATCH_SIZE = 10; // max conversations to process per invocation

class HandoffFallbackService {
  /**
   * Entry point called by the background cron.
   * Processes up to BATCH_SIZE eligible conversations.
   */
  async processHandoffFallbacks() {
    const now = new Date();

    // Fetch all handoff_requested conversations whose locks have expired
    // (or were never set).  We do NOT filter by timeout here because each
    // conversation's timeout is stored on the agent, not the conversation.
    // The volume of handoff_requested conversations is typically very small,
    // so loading them all and filtering in JS is safe and avoids a $lookup.
    const candidates = await Conversation.find({
      status: 'handoff_requested',
      current_handler: 'agent',
      $or: [
        { 'handoff_info.fallback_locked_until': { $exists: false } },
        { 'handoff_info.fallback_locked_until': null },
        { 'handoff_info.fallback_locked_until': { $lt: now } },
      ],
    })
      .select(
        '_id agent handoff_info messages conversation_summary gdpr current_turn_language'
      )
      .limit(BATCH_SIZE)
      .lean();

    if (candidates.length === 0) return;

    // Load agents for the unique set of agent IDs
    const agentIds = [...new Set(candidates.map(c => c.agent))];
    const agents = await Agent.find({ _id: { $in: agentIds } }).populate({
      path: 'api_key',
      populate: { path: 'provider' },
    });
    const agentMap = new Map(agents.map(a => [String(a._id), a]));

    for (const candidate of candidates) {
      const agent = agentMap.get(String(candidate.agent));
      if (!agent) continue;

      const fallbackCfg = agent.config?.handoff_config || {};
      const timeoutSeconds = fallbackCfg.fallback_timeout_seconds;

      // Feature disabled for this agent
      if (!timeoutSeconds) continue;

      const maxAttempts = fallbackCfg.max_fallback_attempts ?? 1;
      const attemptsUsed = candidate.handoff_info?.fallback_attempts ?? 0;

      // Already exhausted all allowed fallback messages
      if (attemptsUsed >= maxAttempts) continue;

      // Determine the reference time for the timeout window
      // (last_fallback_at for repeat attempts, requested_at for the first one)
      const referenceTime =
        attemptsUsed > 0
          ? candidate.handoff_info.last_fallback_at
          : candidate.handoff_info?.requested_at;

      if (!referenceTime) continue;

      const elapsedMs = now.getTime() - new Date(referenceTime).getTime();
      if (elapsedMs < timeoutSeconds * 1000) continue;

      // ── Atomically claim this conversation ─────────────────────────────────
      const lockExpiry = new Date(now.getTime() + LOCK_TTL_MS);
      const claimed = await Conversation.findOneAndUpdate(
        {
          _id: candidate._id,
          status: 'handoff_requested',
          current_handler: 'agent',
          // Re-check lock so two racing instances don't both claim it
          $or: [
            { 'handoff_info.fallback_locked_until': { $exists: false } },
            { 'handoff_info.fallback_locked_until': null },
            { 'handoff_info.fallback_locked_until': { $lt: now } },
          ],
        },
        {
          $set: { 'handoff_info.fallback_locked_until': lockExpiry },
        },
        { new: true }
      );

      // Another instance claimed it first — skip
      if (!claimed) continue;

      try {
        await this._sendFallbackMessage(claimed, agent, fallbackCfg);
      } catch (err) {
        console.error(
          `[HandoffFallback] Failed for conversation ${candidate._id}:`,
          err.message
        );
        // Release the lock so it can be retried
        await Conversation.updateOne(
          { _id: candidate._id },
          { $set: { 'handoff_info.fallback_locked_until': null } }
        );
      }
    }
  }

  /**
   * Generate and persist the AI fallback message for a single conversation.
   *
   * @param {Document} conversation – full Mongoose Conversation document
   * @param {Document} agent        – populated Agent document
   * @param {Object}   fallbackCfg  – agent.config.handoff_config
   */
  async _sendFallbackMessage(conversation, agent, fallbackCfg) {
    const fallbackPrompt =
      fallbackCfg.fallback_prompt ||
      'The human operator has not joined yet. Politely let the user know you are still waiting for an operator to connect, apologise for the delay, and offer to help with anything you can in the meantime.';

    // Build a minimal chat history for the LLM (last 10 non-system messages)
    const recentMessages = (conversation.messages || [])
      .filter(m => m.role !== 'system')
      .slice(-10)
      .map(m => {
        const content =
          typeof m.content === 'string'
            ? m.content
            : '[encrypted message]';
        return `${m.role}: ${content}`;
      })
      .join('\n');

    const userPrompt =
      `## Conversation so far\n${recentMessages || '(no messages yet)'}\n\n` +
      `## Instruction\n${fallbackPrompt}`;

    const systemPrompt =
      (agent.system_prompt || '') +
      '\n\nIMPORTANT: You are sending a holding message because no human operator has joined yet. ' +
      'Do NOT pretend a human will join immediately if you are not sure. ' +
      'Be honest, warm, and concise.';

    const decryptedKey = agent.api_key.getDecryptedKey();
    const openai = new OpenAIService(
      decryptedKey,
      agent.api_key.provider.name
    );

    const llmResponse = await openai.generateCompletion(
      agent.llm_settings.model,
      userPrompt,
      { ...agent.llm_settings.parameters, max_tokens: 300 },
      systemPrompt
    );

    const fallbackContent = (llmResponse.content || '').trim();
    if (!fallbackContent) {
      throw new Error('LLM returned empty fallback message');
    }

    // Persist the message and update fallback tracking atomically
    const now = new Date();
    await Conversation.findOneAndUpdate(
      { _id: conversation._id },
      {
        $push: {
          messages: {
            role: 'assistant',
            content: fallbackContent,
            timestamp: now,
            token_usage: {
              prompt_tokens: llmResponse.usage?.prompt_tokens ?? 0,
              completion_tokens: llmResponse.usage?.completion_tokens ?? 0,
              total_tokens: llmResponse.usage?.total_tokens ?? 0,
              cost: llmResponse.usage?.cost ?? 0,
            },
          },
        },
        $set: {
          'handoff_info.last_fallback_at': now,
          'handoff_info.fallback_locked_until': null, // release lock
        },
        $inc: { 'handoff_info.fallback_attempts': 1 },
      }
    );

    console.log(
      `[HandoffFallback] Sent fallback #${(conversation.handoff_info?.fallback_attempts ?? 0) + 1} ` +
        `for conversation ${conversation._id}`
    );
  }
}

module.exports = new HandoffFallbackService();
