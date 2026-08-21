'use strict';

const MailAccount = require('../models/MailAccount');
const jobQueue = require('../services/jobQueueService');
const { QUEUE_NAME } = require('../services/email/workers/graphSyncWorker');

const handleMicrosoftPush = async (req, res) => {
  if (req.query.validationToken) {
    return res.type('text/plain').status(200).send(req.query.validationToken);
  }

  const notifications = req.body?.value;
  if (!Array.isArray(notifications)) {
    return res.status(400).json({ error: 'Invalid Microsoft notification' });
  }

  const clientState = process.env.MICROSOFT_WEBHOOK_CLIENT_STATE;
  if (!clientState || notifications.some(item => item.clientState !== clientState)) {
    return res.status(401).json({ error: 'Invalid Microsoft clientState' });
  }

  const subscriptionIds = [...new Set(
    notifications.map(item => item.subscriptionId).filter(Boolean)
  )];
  const accounts = await MailAccount.find({
    provider: 'graph',
    ingest_mode: 'oauth_push',
    is_active: true,
    is_paused: false,
    $or: [
      { 'state.graph_inbox_subscription_id': { $in: subscriptionIds } },
      { 'state.graph_sent_subscription_id': { $in: subscriptionIds } }
    ]
  }).select('_id');

  for (const account of accounts) {
    await jobQueue.enqueue(
      QUEUE_NAME,
      { mail_account_id: account._id },
      { context: { mail_account_id: account._id, subscription_ids: subscriptionIds } }
    );
  }

  console.log(
    `[MicrosoftWebhook] accepted notifications=${notifications.length}` +
    ` accounts=${accounts.length}`
  );
  return res.status(202).send();
};

module.exports = { handleMicrosoftPush };