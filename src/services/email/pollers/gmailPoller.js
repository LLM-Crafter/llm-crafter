'use strict';

const MailAccount = require('../../../models/MailAccount');
const jobQueue = require('../../jobQueueService');
const gmailApiService = require('../gmailApiService');
const sentPoller = require('./sentPoller');

const QUEUE_NAME = 'email.ingest';

async function pollAccount(account) {
  const result = {
    enqueued: 0,
    captured: 0,
    reconciled: 0,
    skipped: 0,
    anchored: false,
    reset: false,
    history_id: account.state?.gmail_history_id || null
  };

  let startHistoryId = account.state?.gmail_history_id || null;
  if (!startHistoryId) {
    const profile = await gmailApiService.getProfile(account);
    startHistoryId = String(profile.historyId);
    await MailAccount.updateOne(
      { _id: account._id },
      {
        $set: {
          'state.gmail_history_id': startHistoryId,
          'state.gmail_last_synced_at': new Date(),
          'state.last_polled_at': new Date(),
          'state.last_error': null
        }
      }
    );
    result.anchored = true;
    result.history_id = startHistoryId;
    console.log(
      `[GmailPoller] first sync account=${account._id} history_id=${startHistoryId}`
    );
    return result;
  }

  let pageToken = null;
  let latestHistoryId = startHistoryId;
  const seenMessageIds = new Set();

  try {
    do {
      const page = await gmailApiService.listHistory(
        account,
        startHistoryId,
        pageToken
      );
      latestHistoryId = page.historyId
        ? String(page.historyId)
        : latestHistoryId;

      for (const history of page.history || []) {
        for (const added of history.messagesAdded || []) {
          const message = added.message;
          if (!message?.id || seenMessageIds.has(message.id)) {
            continue;
          }
          seenMessageIds.add(message.id);

          const labels = message.labelIds || [];
          if (!labels.includes('INBOX') && !labels.includes('SENT')) {
            result.skipped++;
            continue;
          }

          const fetched = await gmailApiService.getRawMessage(
            account,
            message.id
          );

          if (labels.includes('SENT')) {
            const outcome = await sentPoller.processProviderSentMessage(
              account,
              fetched.raw,
              {
                messageId: fetched.messageId,
                threadId: fetched.threadId
              }
            );
            if (outcome === 'reconciled') {result.reconciled++;}
            else if (outcome === 'captured') {result.captured++;}
            else {result.skipped++;}
            continue;
          }

          const externalId = `gmail:${fetched.messageId}`;
          const job = await jobQueue.enqueue(
            QUEUE_NAME,
            {
              mail_account_id: account._id,
              external_id: externalId,
              raw_base64: fetched.raw.toString('base64')
            },
            {
              dedupKey: `${account._id}:${externalId}`,
              context: {
                mail_account_id: account._id,
                provider: 'gmail',
                provider_message_id: fetched.messageId,
                provider_thread_id: fetched.threadId
              }
            }
          );
          if (job !== null) {
            result.enqueued++;
          } else {
            result.skipped++;
          }
        }
      }
      pageToken = page.nextPageToken || null;
    } while (pageToken);
  } catch (err) {
    if (err.code === 404 || err.response?.status === 404) {
      const profile = await gmailApiService.getProfile(account);
      latestHistoryId = String(profile.historyId);
      result.reset = true;
      console.warn(
        `[GmailPoller] expired history cursor account=${account._id};` +
        ` re-anchored=${latestHistoryId}`
      );
    } else {
      throw err;
    }
  }

  await MailAccount.updateOne(
    { _id: account._id },
    {
      $set: {
        'state.gmail_history_id': latestHistoryId,
        'state.gmail_last_synced_at': new Date(),
        'state.last_polled_at': new Date(),
        'state.last_event_at': result.enqueued > 0 ? new Date() : account.state?.last_event_at,
        'state.last_error': null,
        'state.last_error_at': null,
        'state.consecutive_failures': 0
      }
    }
  );
  result.history_id = latestHistoryId;
  return result;
}

module.exports = { pollAccount };