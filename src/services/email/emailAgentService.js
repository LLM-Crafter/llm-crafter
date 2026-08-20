'use strict';

/**
 * EmailAgentService
 *
 * Per-email orchestrator. Called by the ingest worker once a message has
 * been parsed and recorded in `ProcessedEmail`.
 *
 * Responsibilities (in order):
 *   1. Resolve / create the Conversation keyed by the email thread.
 *   2. Run EmailTriageService — short-circuit when out of scope.
 *   3. Append the inbound message to the Conversation.
 *   4. Delegate reasoning to the existing `agentService.executeAgentReasoning`
 *      (chatbot brain). This is **reused unchanged** — the email flow is just
 *      another caller of that engine.
 *   5. Decide what to do with the draft reply based on the account's
 *      `reply_policy`:
 *         - draft_only         → store as `drafted`, never send
 *         - auto_send          → enqueue outbound job
 *         - confidence_based   → auto-send if confidence >= threshold, else draft
 *         - human_review       → store as `drafted` and notify (TODO)
 *   6. Persist an OutboundEmail row in the chosen state.
 *
 * What this service does NOT do:
 *   - Actually open SMTP / IMAP sockets (the transports do that)
 *   - Send the email (the outbound worker does that)
 *   - Render HTML/signatures beyond delegating to emailUtils
 *
 * Multi-instance: every conversation upsert and every OutboundEmail insert
 * is atomic. The inbound idempotency is enforced upstream by `ProcessedEmail`.
 */

const Agent = require('../../models/Agent');
const Conversation = require('../../models/Conversation');
const MailAccount = require('../../models/MailAccount');
const OutboundEmail = require('../../models/OutboundEmail');

const agentService = require('../agentService');
const emailTriageService = require('./emailTriageService');
const emailUtils = require('./emailUtils');
const draftService = require('./draftService');
// (require paths are relative to src/services/email/)

class EmailAgentService {
  /**
   * Process a single inbound email end-to-end.
   *
   * @param {Object} params
   * @param {string} params.mailAccountId
   * @param {Object} params.email - normalized email (see emailParser)
   * @param {Object} [params.processedEmail] - the ProcessedEmail row (for logging)
   * @returns {Promise<Object>} summary of what happened (for logging / dashboards)
   */
  async processIncomingEmail({ mailAccountId, email, processedEmail = null }) {
    const account = await MailAccount.findById(mailAccountId);
    if (!account) {
      throw new Error(`MailAccount ${mailAccountId} not found`);
    }
    if (!account.is_active || account.is_paused) {
      const reason = account.is_paused ? 'account_paused' : 'account_inactive';
      console.log(`[EmailAgent] skipping account=${mailAccountId} reason=${reason}`);
      return { status: 'skipped', reason };
    }

    const agent = await Agent.findById(account.agent).populate({
      path: 'api_key',
      populate: { path: 'provider' },
    });
    if (!agent) {
      throw new Error(`Agent ${account.agent} not found for mail account ${account._id}`);
    }

    // ── 1. Triage ────────────────────────────────────────────────────────
    let triage = { in_scope: true, decision: 'triage_disabled' };
    if (account.triage?.enabled !== false) {
      triage = await emailTriageService.classify(email, account, agent);
    }

    console.log(
      `[EmailAgent] triage account=${mailAccountId} in_scope=${triage.in_scope} topic=${triage.topic ?? 'n/a'} intent=${triage.intent ?? 'n/a'} confidence=${triage.confidence ?? 'n/a'} decision=${triage.decision ?? 'n/a'}`
    );

    if (!triage.in_scope) {
      await this._markProcessed(processedEmail, 'skipped_triage', {
        triage_decision: triage.decision,
        triage_reasons: triage.reasons,
      });
      return { status: 'skipped_triage', triage };
    }

    // ── 2. Conversation upsert keyed by thread root ──────────────────────
    const threadRoot = emailUtils.getThreadRoot(email);
    const conversation = await this._resolveConversation({
      agent,
      account,
      email,
      threadRoot,
    });

    // ── 3. Append inbound message ────────────────────────────────────────
    // Cap body length before storage so a single large email cannot exceed
    // the model's context window. The rough token estimator used by
    // getContextForAgent (1 token ≈ 3 chars) means 120 000 chars ≈ 40 000 tokens —
    // a safe upper bound that still comfortably fits within modern model limits.
    const MAX_BODY_CHARS = 120_000;
    let bodyText = emailUtils.stripQuotedHistory(email.body_text) || '';
    if (bodyText.length > MAX_BODY_CHARS) {
      bodyText = bodyText.slice(0, MAX_BODY_CHARS) +
        '\n\n[Message truncated — original was too long to process in full]';
      console.warn(
        `[EmailAgent] body truncated account=${mailAccountId} original_len=${email.body_text?.length}`
      );
    }

    console.log(
      `[EmailAgent] context account=${mailAccountId} body_len=${bodyText.length} conv_messages=${conversation.messages.length} system_prompt_len=${agent.system_prompt?.length ?? 0} tools=${agent.tools?.length ?? 0}`
    );

    await conversation.addMessage({
      role: 'user',
      content: bodyText,
      timestamp: email.received_at || new Date(),
      channel_info: {
        channel: 'email',
        email: {
          message_id: email.message_id,
          in_reply_to: email.in_reply_to,
          subject: email.subject,
          from_email: email.from_address,
          from_name: email.from_name,
          reply_to: email.reply_to || null,
          to_addresses: email.to_addresses || [],
          cc_addresses: email.cc_addresses || [],
          body_html: email.body_html || null,
        },
      },
    });

    // ── 4. Run the reasoning engine ──────────────────────────────────────
    // We deliberately call the chatbot brain directly — same code paths,
    // same hooks, same summarization, same handoff support.
    const dynamicContext = {
      channel: 'email',
      email_context: {
        subject: email.subject,
        from: email.from_address,
        triage_topic: triage.topic,
        triage_intent: triage.intent,
        triage_confidence: triage.confidence,
      },
    };

    let reasoning;
    try {
      reasoning = await agentService.executeAgentReasoning(
        agent,
        conversation,
        dynamicContext
      );
    } catch (err) {
      await this._markProcessed(processedEmail, 'failed', { error: err.message });
      throw err;
    }

    // Persist assistant message in the Conversation (same shape as chatbot flow).
    if (reasoning.content) {
      await conversation.addMessage({
        role: 'assistant',
        content: reasoning.content,
        thinking_process: reasoning.thinking_process,
        tools_used: reasoning.tools_used,
        token_usage: reasoning.token_usage,
        timestamp: new Date(),
        channel_info: {
          channel: 'email',
          email: {
            // Effective reply recipient: honour Reply-To if the inbound
            // message set one, otherwise fall back to From.
            reply_to: email.reply_to || email.from_address,
            // CC addresses from the inbound message so the frontend can
            // offer a "Reply All" option that re-includes them.
            cc_addresses: email.cc_addresses || [],
          },
        },
        metadata: {
          outbound_id: null,      // back-filled below once the OutboundEmail row exists
          outbound_state: null,
        },
      });
    }

    // ── 5. Decide what to do with the reply ──────────────────────────────
    const decision = this._decideReplyAction({
      account,
      triage,
      reasoning,
    });

    // Hard guard: rate limit per thread per 24h.
    const rateLimitHit = await this._isThreadRateLimited({
      account,
      threadRoot,
      maxPerDay: account.reply_policy?.max_replies_per_thread_per_day ?? 3,
    });
    if (rateLimitHit && decision.action === 'auto_send') {
      decision.action = 'draft_only';
      decision.reason = 'low_confidence';
      decision.notes = 'thread_rate_limited — converted to draft';
    }

    // ── 6. Persist outbound row in the right state ───────────────────────
    const outbound = await this._createOutbound({
      account,
      agent,
      conversation,
      email,
      replyBody: reasoning.content || '',
      decision,
      triage,
    });

    // Back-fill the outbound reference onto the assistant message so the
    // conversation endpoint surfaces draft/sent state without a separate query.
    if (reasoning.content) {
      const lastMsgIdx = conversation.messages.length - 1;
      if (lastMsgIdx >= 0) {
        await Conversation.updateOne(
          { _id: conversation._id },
          {
            $set: {
              [`messages.${lastMsgIdx}.metadata.outbound_id`]: outbound._id,
              [`messages.${lastMsgIdx}.metadata.outbound_state`]: outbound.state,
            },
          }
        );
      }
    }

    // Mirror drafts to the provider: native Gmail Drafts API for Gmail,
    // IMAP APPEND for generic IMAP accounts.
    if (outbound.state === 'drafted') {
      draftService.create(account, outbound)
        .catch(err =>
          console.error(`[EmailAgent] remote draft create failed for ${outbound._id}:`, err.message)
        );
    }

    await this._markProcessed(processedEmail, 'processed', {
      conversation_id: conversation._id,
      outbound_id: outbound._id,
      outbound_state: outbound.state,
      triage_decision: triage.decision,
    });

    return {
      status: 'processed',
      conversation_id: conversation._id,
      outbound_id: outbound._id,
      outbound_state: outbound.state,
      decision,
      triage,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Find an existing Conversation by thread root, or create one atomically.
   * Multi-instance safe via `findOneAndUpdate(upsert: true)`.
   *
   * The thread root is stored on `channel_metadata.email.thread_id` so it
   * matches the existing schema (see Conversation.js).
   */
  async _resolveConversation({ agent, account, email, threadRoot }) {
    if (threadRoot) {
      // Try to find an existing conversation in this thread.
      const existing = await Conversation.findOne({
        agent: agent._id,
        channel: 'email',
        'channel_metadata.email.thread_id': threadRoot,
      });
      if (existing) return existing;
    }

    // Atomic upsert keyed on (agent, thread_root). Two simultaneous emails
    // on a new thread cannot create two conversations.
    const filter = threadRoot
      ? {
          agent: agent._id,
          channel: 'email',
          'channel_metadata.email.thread_id': threadRoot,
        }
      : {
          agent: agent._id,
          channel: 'email',
          user_identifier: email.from_address,
          'channel_metadata.email.message_id': email.message_id,
        };

    const conversation = await Conversation.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          agent: agent._id,
          user_identifier: email.from_address,
          channel: 'email',
          channel_metadata: {
            email: {
              from_email: email.from_address,
              from_name: email.from_name || '',
              subject: email.subject || '',
              thread_id: threadRoot || email.message_id || '',
              message_id: email.message_id || '',
              mail_account: account._id,
            },
          },
          title: email.subject || 'Email conversation',
          gdpr: {
            encrypt_messages: !!(agent.gdpr && agent.gdpr.encrypt_messages),
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return conversation;
  }

  /**
   * Translate (policy, triage, responder_confidence) into a concrete action.
   * Returns: { action: 'auto_send' | 'draft_only' | 'human_review', reason, confidence }
   */
  _decideReplyAction({ account, triage, reasoning }) {
    const policy = account.reply_policy || {};
    const mode = policy.mode || 'draft_only';

    // Confidence for now is the triage confidence — the responder schema
    // could later return its own self-reported confidence which would take
    // precedence. We keep this conservative.
    const confidence = triage.confidence || 0;

    // Forced escalation by intent — wins regardless of mode.
    if ((policy.escalate_intents || []).includes(triage.intent)) {
      return {
        action: 'human_review',
        reason: 'escalated',
        confidence,
        notes: `intent=${triage.intent} forces human review`,
      };
    }

    switch (mode) {
      case 'auto_send':
        return { action: 'auto_send', reason: 'auto_send', confidence };

      case 'draft_only':
        return { action: 'draft_only', reason: 'draft_only', confidence };

      case 'human_review':
        return { action: 'human_review', reason: 'human_review', confidence };

      case 'confidence_based':
      default: {
        const threshold = policy.auto_send_min_confidence ?? 0.85;
        if (confidence >= threshold) {
          return { action: 'auto_send', reason: 'auto_send', confidence };
        }
        if (policy.draft_below_confidence !== false) {
          return { action: 'draft_only', reason: 'low_confidence', confidence };
        }
        return { action: 'human_review', reason: 'low_confidence', confidence };
      }
    }
  }

  /**
   * Check whether the agent has already sent N replies on this thread in
   * the last 24h. Cheap indexed count, no scan.
   */
  async _isThreadRateLimited({ account, threadRoot, maxPerDay }) {
    if (!threadRoot) return false;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await OutboundEmail.countDocuments({
      mail_account: account._id,
      state: { $in: ['sent', 'sending', 'queued'] },
      $or: [{ in_reply_to: threadRoot }, { references: threadRoot }],
      createdAt: { $gte: since },
    });
    return count >= maxPerDay;
  }

  /**
   * Build and persist the OutboundEmail row in the correct initial state.
   * Does NOT send — the outbound worker picks up `queued` rows and sends.
   */
  async _createOutbound({ account, agent, conversation, email, replyBody, decision, triage }) {
    const send = account.send_profile || {};
    const messageId = emailUtils.generateMessageId(send.from_email);
    const references = [
      ...(email.references || []),
      ...(email.message_id ? [email.message_id] : []),
    ];

    const stateByAction = {
      auto_send: 'queued',
      draft_only: 'drafted',
      human_review: 'drafted',
    };

    const outbound = await OutboundEmail.create({
      mail_account: account._id,
      agent: agent._id,
      conversation: conversation._id,
      to: [email.reply_to || email.from_address],
      cc: send.default_cc || [],
      bcc: send.default_bcc || [],
      from_email: send.from_email,
      from_name: send.from_name || null,
      reply_to: send.reply_to || null,
      subject: emailUtils.buildReplySubject(email.subject),
      text: emailUtils.renderText(replyBody, send.signature_text),
      html: emailUtils.renderHtml(replyBody, send.signature_html),
      message_id: messageId,
      in_reply_to: email.message_id || null,
      references,
      state: stateByAction[decision.action] || 'drafted',
      reason: decision.reason,
      confidence: decision.confidence ?? null,
      metadata: {
        triage,
        decision,
      },
    });

    return outbound;
  }

  async _markProcessed(processedEmail, outcome, extra = {}) {
    if (!processedEmail) return;
    try {
      const ProcessedEmail = require('../../models/ProcessedEmail');
      await ProcessedEmail.updateOne(
        { _id: processedEmail._id },
        {
          $set: {
            outcome,
            processed_at: new Date(),
            conversation_id: extra.conversation_id || null,
            error: extra.error || null,
          },
        }
      );
    } catch (e) {
      // Non-fatal — the dedup row already exists, processing has happened.
      console.error('[EmailAgent] markProcessed failed:', e.message);
    }
  }
}

module.exports = new EmailAgentService();
