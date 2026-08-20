'use strict';

const MailAccount = require('../../../models/MailAccount');
const jobQueue = require('../../jobQueueService');
const lockService = require('../../distributedLockService');
const gmailPoller = require('../pollers/gmailPoller');

const QUEUE_NAME = 'email.gmail-sync';
const LOCK_TTL_MS = 2 * 60_000;

async function handleSyncJob(payload) {
  console.log(
    `[GmailSyncWorker] processing account=${payload.mail_account_id}` +
    ` notification_history_id=${payload.notification_history_id || '(none)'}` +
    ' source=pubsub'
  );

  const account = await MailAccount.findOne({
    _id: payload.mail_account_id,
    provider: 'gmail',
    is_active: true,
    is_paused: false
  });
  if (!account) {
    return { skipped: true, reason: 'account_not_available' };
  }

  const result = await lockService.withLock(
    `imap_poll:${account._id}`,
    LOCK_TTL_MS,
    () => gmailPoller.pollAccount(account)
  );
  if (result === null) {
    throw new Error(`Gmail account ${account._id} is already synchronizing`);
  }
  console.log(
    `[GmailSyncWorker] done account=${account._id}` +
    ` notification_history_id=${payload.notification_history_id || '(none)'}` +
    ` enqueued=${result.enqueued} captured=${result.captured}` +
    ` reconciled=${result.reconciled} history_id=${result.history_id}`
  );
  return result;
}

function start({ concurrency = 2 } = {}) {
  return jobQueue.runWorker(QUEUE_NAME, handleSyncJob, {
    concurrency,
    pollIntervalMs: 1000
  });
}

module.exports = { start, QUEUE_NAME, handleSyncJob };