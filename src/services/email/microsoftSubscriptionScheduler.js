'use strict';

const MailAccount = require('../../models/MailAccount');
const lockService = require('../distributedLockService');
const microsoftGraphService = require('./microsoftGraphService');

const TICK_MS = parseInt(process.env.EMAIL_GRAPH_SUBSCRIPTION_TICK_MS, 10) ||
  60 * 60_000;
const RENEW_BEFORE_MS = 24 * 60 * 60_000;

class MicrosoftSubscriptionScheduler {
  constructor() {
    this.interval = null;
    this.running = false;
  }

  start() {
    if (this.interval || !process.env.MICROSOFT_WEBHOOK_CLIENT_STATE) {return;}
    console.log(`[MicrosoftSubscriptionScheduler] starting (tick=${TICK_MS}ms)`);
    this.interval = setInterval(() => this.tick().catch(err =>
      console.error('[MicrosoftSubscriptionScheduler] tick error:', err.message)
    ), TICK_MS);
    setImmediate(() => this.tick().catch(err =>
      console.error('[MicrosoftSubscriptionScheduler] initial error:', err.message)
    ));
  }

  async tick() {
    if (this.running) {return;}
    this.running = true;
    try {
      const accounts = await MailAccount.find({
        provider: 'graph',
        ingest_mode: 'oauth_push',
        is_active: true,
        is_paused: false
      }).limit(100);
      for (const account of accounts) {
        await lockService.withLock(
          `graph_subscriptions:${account._id}`,
          2 * 60_000,
          () => this.ensureSubscriptions(account)
        );
      }
    } finally {
      this.running = false;
    }
  }

  async ensureSubscriptions(account) {
    const update = {};
    try {
      for (const folder of ['inbox', 'sent']) {
        const idKey = `graph_${folder}_subscription_id`;
        const expirationKey = `graph_${folder}_subscription_expiration`;
        const id = account.state?.[idKey];
        const expiration = account.state?.[expirationKey]
          ? new Date(account.state[expirationKey]).getTime()
          : 0;
        const resourceFolder = folder === 'sent' ? 'sentitems' : 'inbox';
        let subscription = null;
        if (!id) {
          subscription = await microsoftGraphService.createSubscription(
            account,
            resourceFolder
          );
        } else if (expiration <= Date.now() + RENEW_BEFORE_MS) {
          try {
            subscription = await microsoftGraphService.renewSubscription(
              account,
              id
            );
          } catch (err) {
            if (err.response?.status !== 404) {throw err;}
            subscription = await microsoftGraphService.createSubscription(
              account,
              resourceFolder
            );
          }
        }
        if (subscription) {
          update[`state.${idKey}`] = subscription.id;
          update[`state.${expirationKey}`] = new Date(
            subscription.expirationDateTime
          );
        }
      }
      update['state.graph_last_subscription_error'] = null;
      await MailAccount.updateOne({ _id: account._id }, { $set: update });
    } catch (err) {
      await MailAccount.updateOne(
        { _id: account._id },
        { $set: { 'state.graph_last_subscription_error': err.message } }
      );
      throw err;
    }
  }
}

module.exports = new MicrosoftSubscriptionScheduler();