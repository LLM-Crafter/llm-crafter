'use strict';

const MailAccount = require('../../../models/MailAccount');
const jobQueue = require('../../jobQueueService');
const lockService = require('../../distributedLockService');
const graphPoller = require('../pollers/graphPoller');

const QUEUE_NAME = 'email.graph-sync';

async function handleSyncJob(payload) {
  const account = await MailAccount.findOne({
    _id: payload.mail_account_id,
    provider: 'graph',
    is_active: true,
    is_paused: false
  });
  if (!account) {return { skipped: true, reason: 'account_not_available' };}

  console.log(
    `[GraphSyncWorker] processing account=${account._id} source=webhook`
  );
  const result = await lockService.withLock(
    `graph_sync:${account._id}`,
    2 * 60_000,
    () => graphPoller.pollAccount(account)
  );
  if (result === null) {
    throw new Error(`Graph account ${account._id} is already synchronizing`);
  }
  console.log(
    `[GraphSyncWorker] done account=${account._id}` +
    ` enqueued=${result.enqueued} captured=${result.captured}` +
    ` reconciled=${result.reconciled}`
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