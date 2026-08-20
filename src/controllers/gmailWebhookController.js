'use strict';

const { google } = require('googleapis');

const MailAccount = require('../models/MailAccount');
const jobQueue = require('../services/jobQueueService');
const { QUEUE_NAME } = require('../services/email/workers/gmailSyncWorker');

async function verifyPushIdentity(req) {
  const audience = process.env.GMAIL_PUBSUB_AUDIENCE;
  if (!audience) {
    throw new Error('GMAIL_PUBSUB_AUDIENCE is not configured');
  }

  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Missing Pub/Sub identity token');
    error.status = 401;
    throw error;
  }

  const verifier = new google.auth.OAuth2();
  const ticket = await verifier.verifyIdToken({
    idToken: match[1],
    audience
  });
  const payload = ticket.getPayload();
  const expectedEmail = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT;
  if (
    expectedEmail &&
    String(payload.email || '').toLowerCase() !== expectedEmail.toLowerCase()
  ) {
    const error = new Error('Unexpected Pub/Sub service account');
    error.status = 403;
    throw error;
  }
  return payload;
}

const handleGooglePush = async (req, res) => {
  try {
    await verifyPushIdentity(req);

    const encoded = req.body?.message?.data;
    if (!encoded) {
      return res.status(400).json({ error: 'Missing Pub/Sub message data' });
    }

    let notification;
    try {
      notification = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8')
      );
    } catch {
      return res.status(400).json({ error: 'Invalid Pub/Sub message data' });
    }

    const emailAddress = String(notification.emailAddress || '').toLowerCase();
    const historyId = String(notification.historyId || '');
    if (!emailAddress || !historyId) {
      return res.status(400).json({ error: 'Incomplete Gmail notification' });
    }

    const accounts = await MailAccount.find({
      provider: 'gmail',
      ingest_mode: 'oauth_push',
      is_active: true,
      is_paused: false,
      'send_profile.from_email': emailAddress
    }).select('_id');

    for (const account of accounts) {
      await jobQueue.enqueue(
        QUEUE_NAME,
        {
          mail_account_id: account._id,
          notification_history_id: historyId
        },
        {
          dedupKey: `${account._id}:${historyId}`,
          context: {
            mail_account_id: account._id,
            email_address: emailAddress,
            notification_history_id: historyId
          }
        }
      );
    }

    return res.status(204).send();
  } catch (err) {
    const status = err.status || (err.message?.includes('configured') ? 503 : 401);
    console.error('[GmailWebhook] push rejected:', err.message);
    return res.status(status).json({ error: 'Invalid Gmail push notification' });
  }
};

module.exports = { handleGooglePush };