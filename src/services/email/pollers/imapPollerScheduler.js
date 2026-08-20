'use strict';

/**
 * ImapPollerScheduler
 *
 * Runs in every application instance. Every `SCHEDULER_TICK_MS` it loads
 * the list of active IMAP-poll mail accounts whose next-poll time has
 * arrived and tries to acquire a per-account distributed lock. Whichever
 * instance wins the lock for an account performs the poll; the others
 * move on.
 *
 * Why this design (and not a single "leader" instance polling everything)?
 *   - No leader-election dance — locks ARE the election, per account.
 *   - Work load is naturally distributed across replicas.
 *   - A replica going down only delays the next poll cycle of the accounts
 *     it happened to be polling; the lock TTL expires and another replica
 *     picks them up automatically.
 */

const MailAccount = require('../../../models/MailAccount');
const lockService = require('../../distributedLockService');
const imapPoller = require('./imapPoller');
const sentPoller = require('./sentPoller');
const gmailPoller = require('./gmailPoller');

// How often the scheduler wakes up to look for accounts due for polling.
// Shorter than the per-account `poll_config.interval_seconds` so timing
// resolution is reasonable.
const SCHEDULER_TICK_MS = parseInt(
  process.env.EMAIL_IMAP_SCHEDULER_TICK_MS,
  10
) || 15_000;

// How many accounts a single tick will inspect. Caps mongo round-trips and
// prevents one tick from doing too much work.
const TICK_BATCH = parseInt(process.env.EMAIL_IMAP_SCHEDULER_BATCH, 10) || 25;

// Lock TTL — should comfortably exceed the longest expected poll duration
// (IMAP connect + search + fetch). 2 minutes is plenty for the default
// max_messages_per_cycle of 50.
const POLL_LOCK_TTL_MS = parseInt(
  process.env.EMAIL_IMAP_POLL_LOCK_TTL_MS,
  10
) || 2 * 60_000;

class ImapPollerScheduler {
  constructor() {
    this.interval = null;
    this.running = false;
  }

  start() {
    if (this.interval) {
      console.warn('[ImapPollerScheduler] already started');
      return;
    }
    console.log(
      `[ImapPollerScheduler] starting (tick=${SCHEDULER_TICK_MS}ms batch=${TICK_BATCH} instance=${lockService.instanceId})`
    );
    this.interval = setInterval(() => {
      this.tick().catch(err =>
        console.error('[ImapPollerScheduler] tick error:', err.message)
      );
    }, SCHEDULER_TICK_MS);
    // Defer the first tick so the DB connection is ready.
    setTimeout(() => {
      this.tick().catch(err =>
        console.error('[ImapPollerScheduler] initial tick error:', err.message)
      );
    }, SCHEDULER_TICK_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Look at up to TICK_BATCH active IMAP accounts. For each one whose
   * configured poll interval has elapsed since `state.last_polled_at`,
   * try to acquire its lock and (if won) run the poll.
   *
   * We deliberately fetch a wider candidate set than we need and let the
   * lock decide the work distribution — picking the "N oldest" would race
   * across instances and could starve some accounts.
   */
  async tick() {
    if (this.running) return; // overlap protection within a single instance
    this.running = true;
    try {
      const now = new Date();
      const accounts = await MailAccount.find({
        provider: { $in: ['imap', 'gmail'] },
        ingest_mode: { $in: ['imap_poll', 'oauth_push'] },
        is_active: true,
        is_paused: false,
      })
        .sort({ 'state.last_polled_at': 1 }) // oldest first
        .limit(TICK_BATCH)
        .lean(false); // we want full mongoose documents (methods)

      for (const account of accounts) {
        const intervalSec =
          account.poll_config?.interval_seconds ?? 60;
        const lastPolledMs = account.state?.last_polled_at
          ? new Date(account.state.last_polled_at).getTime()
          : 0;
        if (now.getTime() - lastPolledMs < intervalSec * 1000) continue;

        // Per-account lock — only one replica polls this mailbox at a time.
        const lockKey = `imap_poll:${account._id}`;
        await lockService
          .withLock(lockKey, POLL_LOCK_TTL_MS, async () => {
            try {
              if (account.provider === 'gmail') {
                const gmailRes = await gmailPoller.pollAccount(account);
                if (gmailRes.enqueued > 0 || gmailRes.anchored || gmailRes.reset) {
                  console.log(
                    `[ImapPollerScheduler] gmail account=${account._id}` +
                    ` enqueued=${gmailRes.enqueued}` +
                    ` history_id=${gmailRes.history_id}` +
                    ` anchored=${gmailRes.anchored} reset=${gmailRes.reset}`
                  );
                }
                return;
              }

              const res = await imapPoller.pollAccount(account);
              if (res.enqueued > 0) {
                console.log(
                  `[ImapPollerScheduler] account=${account._id} enqueued=${res.enqueued} uid_range=${res.uid_range}`
                );
              }

              // Also scan the SENT folder for manual replies the operator
              // sent directly from their email client.
              const sentRes = await sentPoller.pollSent(account);
              if (sentRes.captured > 0) {
                console.log(
                  `[ImapPollerScheduler] account=${account._id} sent_captured=${sentRes.captured}`
                );
              }
              if (sentRes.reconciled > 0) {
                console.log(
                  `[ImapPollerScheduler] account=${account._id} sent_reconciled=${sentRes.reconciled}`
                );
              }
            } catch (e) {
              console.error(
                `[ImapPollerScheduler] poll failed for ${account._id}:`,
                e.message
              );
            }
          })
          .catch(err => {
            console.error(
              `[ImapPollerScheduler] lock error for ${account._id}:`,
              err.message
            );
          });
      }
    } finally {
      this.running = false;
    }
  }
}

module.exports = new ImapPollerScheduler();
