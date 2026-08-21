'use strict';

/**
 * OutboundWorker — sends OutboundEmail rows in the `queued` state.
 *
 * Unlike the ingest pipeline this worker does NOT pull from a JobQueue.
 * The OutboundEmail document IS the job — it carries its own state machine
 * and gets claimed via atomic `findOneAndUpdate`. Doing it this way means:
 *   - Drafts and sent rows live in the same table the UI already reads from
 *   - Retry / status is visible directly on the message row
 *   - No extra plumbing required to map job → message
 *
 * The worker:
 *   1. Periodically claims one `queued` row (`findOneAndUpdate` sets it to
 *      `sending` atomically — only one replica can win per row).
 *   2. Sends via the appropriate transport (currently SMTP only).
 *   3. Flips state to `sent` (on success) or `failed` (after max_attempts).
 *
 * Crashed worker recovery: a `reaper` cron promotes `sending` rows whose
 * `claimed_at` is older than CLAIM_TTL_MS back to `queued`.
 */

const MailAccount = require('../../../models/MailAccount');
const OutboundEmail = require('../../../models/OutboundEmail');
const Conversation = require('../../../models/Conversation');
const lockService = require('../../distributedLockService');
const smtpTransport = require('../transports/smtpTransport');
const imapDraftTransport = require('../transports/imapDraftTransport');
const gmailApiService = require('../gmailApiService');
const microsoftGraphService = require('../microsoftGraphService');
// (require paths are relative to src/services/email/workers/)

const POLL_INTERVAL_MS = parseInt(process.env.EMAIL_OUTBOUND_POLL_MS, 10) || 2000;
const CLAIM_TTL_MS = parseInt(process.env.EMAIL_OUTBOUND_CLAIM_TTL_MS, 10) || 5 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const REAPER_INTERVAL_MS = 60_000;

class OutboundWorker {
  constructor() {
    this.loopHandle = null;
    this.reaperHandle = null;
    this.stopped = false;
  }

  start({ concurrency = 1 } = {}) {
    if (this.loopHandle) {
      console.warn('[OutboundWorker] already started');
      return;
    }
    this.stopped = false;
    console.log(
      `[OutboundWorker] starting (concurrency=${concurrency} instance=${lockService.instanceId})`
    );

    // Spawn N parallel claim-and-send loops.
    for (let i = 0; i < concurrency; i++) {
      this._loop().catch(err =>
        console.error('[OutboundWorker] loop crashed:', err)
      );
    }

    // Reaper for crashed sends.
    this.reaperHandle = setInterval(() => {
      this._reapStaleClaims().catch(err =>
        console.error('[OutboundWorker] reaper error:', err.message)
      );
    }, REAPER_INTERVAL_MS);

    this.loopHandle = true;
  }

  stop() {
    this.stopped = true;
    if (this.reaperHandle) {
      clearInterval(this.reaperHandle);
      this.reaperHandle = null;
    }
    this.loopHandle = null;
  }

  async _loop() {
    while (!this.stopped) {
      const claimed = await this._claimNext().catch(err => {
        console.error('[OutboundWorker] claim error:', err.message);
        return null;
      });

      if (!claimed) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      try {
        await this._sendOne(claimed);
      } catch (err) {
        console.error(
          `[OutboundWorker] send failed for ${claimed._id}:`,
          err.message
        );
        await this._handleSendFailure(claimed, err).catch(() => {});
      }
    }
  }

  /**
   * Atomically pick the oldest `queued` outbound row and flip to `sending`.
   * Multi-instance safe — only one replica wins each row.
   */
  async _claimNext() {
    const now = new Date();
    return OutboundEmail.findOneAndUpdate(
      { state: 'queued' },
      {
        $set: {
          state: 'sending',
          claimed_by: lockService.instanceId,
          claimed_at: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true }
    );
  }

  async _sendOne(outbound) {
    const account = await MailAccount.findById(outbound.mail_account);
    if (!account) {
      throw new Error(`MailAccount ${outbound.mail_account} not found`);
    }
    if (account.is_paused) {
      // Push back to queued — try again when the account is resumed.
      await OutboundEmail.updateOne(
        { _id: outbound._id },
        {
          $set: {
            state: 'queued',
            claimed_by: null,
            claimed_at: null,
            last_error: 'account_paused',
          },
        }
      );
      return;
    }

    let sendResult;
    if (account.provider === 'gmail') {
      sendResult = await gmailApiService.sendOutbound(account, outbound);
    } else if (account.provider === 'graph') {
      sendResult = await microsoftGraphService.sendOutbound(account, outbound);
    } else {
      sendResult = await smtpTransport.sendOutbound(account, outbound);
    }

    await OutboundEmail.updateOne(
      { _id: outbound._id },
      {
        $set: {
          state: 'sent',
          provider_message_id: sendResult.providerMessageId,
          provider_thread_id:
            sendResult.providerThreadId || outbound.provider_thread_id,
          provider_draft_id: null,
          sent_at: new Date(),
          last_error: null,
          claimed_by: null,
          claimed_at: null,
        },
      }
    );

    // SMTP delivery has succeeded, so the server-side draft is no longer
    // needed. Cleanup is deliberately non-fatal: an IMAP failure must not
    // cause the worker to retry SMTP and send a duplicate email.
    if (
      !['gmail', 'graph'].includes(account.provider) &&
      account.ingest_mode === 'imap_poll'
    ) {
      try {
        const removed = await imapDraftTransport.removeDraft(account, outbound);
        if (removed) {
          await OutboundEmail.updateOne(
            { _id: outbound._id },
            { $set: { imap_draft_uid: null } }
          );
        }
      } catch (err) {
        console.error(
          `[OutboundWorker] sent email but failed to remove IMAP draft ${outbound._id}:`,
          err.message
        );
      }
    }

    // Sync state onto the linked conversation message so the thread view
    // reflects sent/draft without a separate OutboundEmail query.
    if (outbound.conversation) {
      await Conversation.updateOne(
        {
          _id: outbound.conversation,
          'messages.metadata.outbound_id': outbound._id,
        },
        {
          $set: { 'messages.$.metadata.outbound_state': 'sent' },
        }
      ).catch(() => {}); // non-fatal
    }
  }

  async _handleSendFailure(outbound, err) {
    const shouldRetry = outbound.attempts < outbound.max_attempts;
    if (shouldRetry) {
      const delayMs = Math.min(
        2000 * Math.pow(2, outbound.attempts),
        MAX_BACKOFF_MS
      );
      // Re-queue with a backoff. We simulate the delay by leaving state=queued
      // and stamping claimed_at; the reaper will not touch a row that was just
      // unclaimed, so a short wait is fine — but we want a proper delay too,
      // so we use a setTimeout-style approach: bump `claimed_at` and set state
      // back to queued only when the delay elapses. Simpler is to do it now.
      // For an MVP we just push back with no inline delay; the next claim
      // attempt will pick it up immediately. Acceptable because SMTP errors
      // are usually transient.
      await OutboundEmail.updateOne(
        { _id: outbound._id },
        {
          $set: {
            state: 'queued',
            claimed_by: null,
            claimed_at: null,
            last_error: err.message,
          },
        }
      );
      // Best-effort delay before the next claim by this instance.
      await sleep(Math.min(delayMs, 30_000));
    } else {
      await OutboundEmail.updateOne(
        { _id: outbound._id },
        {
          $set: {
            state: 'failed',
            last_error: err.message,
            claimed_by: null,
            claimed_at: null,
          },
        }
      );
    }
  }

  /**
   * Revive rows that have been `sending` for longer than CLAIM_TTL_MS —
   * the worker that owned them is presumed dead.
   */
  async _reapStaleClaims() {
    const cutoff = new Date(Date.now() - CLAIM_TTL_MS);
    const res = await OutboundEmail.updateMany(
      { state: 'sending', claimed_at: { $lt: cutoff } },
      {
        $set: {
          state: 'queued',
          claimed_by: null,
          claimed_at: null,
          last_error: 'reclaimed: stale_send_claim',
        },
      }
    );
    if (res.modifiedCount > 0) {
      console.log(
        `[OutboundWorker] reaped ${res.modifiedCount} stale send claims`
      );
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = new OutboundWorker();
