'use strict';

const MailAccount = require('../../../models/MailAccount');
const jobQueue = require('../../jobQueueService');
const microsoftGraphService = require('../microsoftGraphService');
const sentPoller = require('./sentPoller');

const INGEST_QUEUE = 'email.ingest';

async function syncFolder(account, folder, deltaLink, result) {
  const delta = await microsoftGraphService.runDelta(account, folder, deltaLink);
  if (!deltaLink) {
    result.anchored = true;
    return delta.deltaLink;
  }

  for (const message of delta.items) {
    if (!message.id || message['@removed']) {
      result.skipped++;
      continue;
    }

    const raw = await microsoftGraphService.getMimeMessage(account, message.id);
    if (folder === 'sentitems') {
      const outcome = await sentPoller.processProviderSentMessage(
        account,
        raw,
        { messageId: message.id, threadId: message.conversationId }
      );
      if (outcome === 'reconciled') {result.reconciled++;}
      else if (outcome === 'captured') {result.captured++;}
      else {result.skipped++;}
      continue;
    }

    const externalId = `graph:${message.id}`;
    const job = await jobQueue.enqueue(
      INGEST_QUEUE,
      {
        mail_account_id: account._id,
        external_id: externalId,
        raw_base64: raw.toString('base64'),
        provider_message_id: message.id,
        provider_thread_id: message.conversationId
      },
      {
        dedupKey: `${account._id}:${externalId}`,
        context: {
          mail_account_id: account._id,
          provider: 'graph',
          provider_message_id: message.id,
          provider_thread_id: message.conversationId
        }
      }
    );
    if (job) {result.enqueued++;}
    else {result.skipped++;}
  }
  return delta.deltaLink;
}

async function pollAccount(account) {
  const result = {
    enqueued: 0,
    captured: 0,
    reconciled: 0,
    skipped: 0,
    anchored: false
  };

  let inboxDeltaLink = account.state?.graph_inbox_delta_link || null;
  let sentDeltaLink = account.state?.graph_sent_delta_link || null;
  try {
    inboxDeltaLink = await syncFolder(
      account,
      'inbox',
      inboxDeltaLink,
      result
    );
    sentDeltaLink = await syncFolder(
      account,
      'sentitems',
      sentDeltaLink,
      result
    );
  } catch (err) {
    if (err.response?.status === 410) {
      inboxDeltaLink = (await microsoftGraphService.runDelta(
        account,
        'inbox'
      )).deltaLink;
      sentDeltaLink = (await microsoftGraphService.runDelta(
        account,
        'sentitems'
      )).deltaLink;
      result.anchored = true;
      result.reset = true;
    } else {
      throw err;
    }
  }

  await MailAccount.updateOne(
    { _id: account._id },
    {
      $set: {
        'state.graph_inbox_delta_link': inboxDeltaLink,
        'state.graph_sent_delta_link': sentDeltaLink,
        'state.graph_last_synced_at': new Date(),
        'state.last_polled_at': new Date(),
        'state.last_event_at': result.enqueued > 0
          ? new Date()
          : account.state?.last_event_at,
        'state.last_error': null,
        'state.last_error_at': null,
        'state.consecutive_failures': 0
      }
    }
  );
  return result;
}

module.exports = { pollAccount };