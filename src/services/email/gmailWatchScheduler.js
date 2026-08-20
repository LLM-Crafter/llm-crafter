'use strict';

const MailAccount = require('../../models/MailAccount');
const lockService = require('../distributedLockService');
const gmailApiService = require('./gmailApiService');

const TICK_MS =
  parseInt(process.env.EMAIL_GMAIL_WATCH_TICK_MS, 10) || 60 * 60_000;
const RENEW_BEFORE_MS = 48 * 60 * 60_000;
const LOCK_TTL_MS = 2 * 60_000;

class GmailWatchScheduler {
  constructor() {
    this.interval = null;
    this.running = false;
  }

  start() {
    if (this.interval || !process.env.GMAIL_PUBSUB_TOPIC) {
      if (!process.env.GMAIL_PUBSUB_TOPIC) {
        console.log('[GmailWatchScheduler] disabled (GMAIL_PUBSUB_TOPIC not set)');
      }
      return;
    }

    console.log(`[GmailWatchScheduler] starting (tick=${TICK_MS}ms)`);
    this.interval = setInterval(() => {
      this.tick().catch(err =>
        console.error('[GmailWatchScheduler] tick error:', err.message)
      );
    }, TICK_MS);
    setImmediate(() => {
      this.tick().catch(err =>
        console.error('[GmailWatchScheduler] initial tick error:', err.message)
      );
    });
  }

  stop() {
    if (this.interval) {clearInterval(this.interval);}
    this.interval = null;
  }

  async tick() {
    if (this.running) {return;}
    this.running = true;
    try {
      const renewBefore = new Date(Date.now() + RENEW_BEFORE_MS);
      const accounts = await MailAccount.find({
        provider: 'gmail',
        ingest_mode: { $in: ['imap_poll', 'oauth_push'] },
        'credentials.oauth.refresh_token': { $ne: null },
        is_active: true,
        is_paused: false,
        $or: [
          { 'state.gmail_watch_expiration': null },
          { 'state.gmail_watch_expiration': { $lte: renewBefore } }
        ]
      }).limit(100);

      for (const account of accounts) {
        await lockService.withLock(
          `gmail_watch:${account._id}`,
          LOCK_TTL_MS,
          async () => {
            try {
              const watch = await gmailApiService.watch(account);
              const stateUpdate = {
                ingest_mode: 'oauth_push',
                'state.gmail_watch_expiration': watch.expiration
                  ? new Date(Number(watch.expiration))
                  : null,
                'state.gmail_last_watch_error': null
              };
              if (!account.state?.gmail_history_id) {
                stateUpdate['state.gmail_history_id'] = String(watch.historyId);
              }
              await MailAccount.updateOne(
                { _id: account._id },
                { $set: stateUpdate }
              );
              console.log(
                `[GmailWatchScheduler] renewed account=${account._id}` +
                ` expiration=${watch.expiration}`
              );
            } catch (err) {
              await MailAccount.updateOne(
                { _id: account._id },
                {
                  $set: {
                    'state.gmail_last_watch_error': err.message
                  }
                }
              );
              console.error(
                `[GmailWatchScheduler] renewal failed account=${account._id}:`,
                err.message
              );
            }
          }
        );
      }
    } finally {
      this.running = false;
    }
  }
}

module.exports = new GmailWatchScheduler();