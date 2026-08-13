'use strict';

/**
 * SentPoller
 *
 * Scans the SENT folder of a connected mailbox for messages that were sent
 * directly by the operator (not via our API) and adds them as `role:assistant`
 * messages to the matching Conversation so the AI has full context the next
 * time a customer replies.
 *
 * What it does NOT do:
 *   - Trigger the agent reasoning loop (no reply is generated)
 *   - Process messages already tracked via our API (detected by the
 *     X-LLMCrafter-Outbound-Id header)
 *   - Create OutboundEmail records (these are informal context messages)
 *
 * Matching strategy:
 *   The sent message's In-Reply-To / References headers contain the
 *   message-ids of earlier messages in the thread. We use the same
 *   getThreadRoot() logic as the inbound poller to derive the thread root
 *   and look up the Conversation by channel_metadata.email.thread_id.
 *
 * Multi-instance safety:
 *   Caller (imapPollerScheduler) holds the per-account lock during this call.
 */

const { ImapFlow } = require('imapflow');

const Conversation = require('../../../models/Conversation');
const MailAccount = require('../../../models/MailAccount');
const emailParser = require('../emailParser');
const emailUtils = require('../emailUtils');
const gmailOAuthService = require('../gmailOAuthService');

/**
 * Build an ImapFlow client — same logic as imapPoller, centralised here to
 * avoid a circular require.
 */
async function buildClient(account) {
  const creds = account.getDecryptedCredentials();
  const imap = creds.imap || {};

  if (account.provider === 'gmail') {
    const accessToken = await gmailOAuthService.getFreshAccessToken(account);
    return new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: imap.username || account.send_profile?.from_email, accessToken },
      logger: false,
      disableAutoIdle: true,
    });
  }

  return new ImapFlow({
    host: imap.host,
    port: imap.port || 993,
    secure: imap.secure !== false,
    auth: { user: imap.username, pass: imap.password },
    logger: false,
    disableAutoIdle: true,
  });
}

/**
 * Scan the SENT folder for new manually-sent messages and back-fill them
 * into matching Conversations as assistant messages.
 *
 * @param {Object} account - MailAccount Mongoose document
 * @returns {Promise<{ captured, skipped }>}
 */
async function pollSent(account) {
  const creds = account.getDecryptedCredentials();
  const imap = creds.imap || {};
  const sentFolder = imap.sent_folder || _defaultSentFolder(account);

  const result = { captured: 0, skipped: 0 };

  const client = await buildClient(account);
  try {
    await client.connect();

    // Check the folder exists before trying to open it.
    const mailboxes = await client.list();
    const folderExists = mailboxes.some(
      m => m.path.toLowerCase() === sentFolder.toLowerCase()
    );
    if (!folderExists) {
      console.log(
        `[SentPoller] account=${account._id} sent folder "${sentFolder}" not found — skipping`
      );
      return result;
    }

    const lock = await client.getMailboxLock(sentFolder);
    try {
      const status = client.mailbox;
      const currentUidValidity = Number(status.uidValidity);
      const lastSentUid = account.state?.sent_last_uid || 0;

      // First-time: anchor to current uidNext-1, capture nothing yet.
      if (lastSentUid === 0) {
        const anchor = Math.max(0, Number(status.uidNext) - 1);
        console.log(
          `[SentPoller] account=${account._id} first scan — anchoring sent_last_uid=${anchor}`
        );
        await MailAccount.updateOne(
          { _id: account._id },
          { $set: { 'state.sent_last_uid': anchor } }
        );
        return result;
      }

      const uids = await client.search(
        { uid: `${lastSentUid + 1}:*` },
        { uid: true }
      );
      const sorted = (uids || []).sort((a, b) => a - b);

      // Cap to avoid flooding on first real run after anchor.
      const slice = sorted.slice(0, 50);
      let highestUid = lastSentUid;
      const fromEmail = (account.send_profile?.from_email || '').toLowerCase();

      for (const uid of slice) {
        try {
          const msg = await client.fetchOne(
            uid,
            { source: true, envelope: true },
            { uid: true }
          );
          if (!msg) continue;

          const senderAddress =
            msg.envelope?.from?.[0]?.address?.toLowerCase() || '';

          // Only care about messages sent FROM the connected mailbox address.
          if (fromEmail && senderAddress !== fromEmail) {
            result.skipped++;
            if (uid > highestUid) highestUid = uid;
            continue;
          }

          const email = await emailParser.parseRaw(msg.source);

          // Skip messages already tracked via our API (we added the header).
          const headers = email.headers || {};
          if (headers['x-llmcrafter-outbound-id']) {
            result.skipped++;
            if (uid > highestUid) highestUid = uid;
            continue;
          }

          // Also skip if there's no thread context at all (standalone sends
          // with no In-Reply-To are new conversations, not replies).
          if (!email.in_reply_to && (!email.references || email.references.length === 0)) {
            result.skipped++;
            if (uid > highestUid) highestUid = uid;
            continue;
          }

          // Find the matching Conversation via thread root.
          const threadRoot = emailUtils.getThreadRoot(email);
          if (!threadRoot) {
            result.skipped++;
            if (uid > highestUid) highestUid = uid;
            continue;
          }

          const conversation = await Conversation.findOne({
            channel: 'email',
            'channel_metadata.email.thread_id': threadRoot,
          });

          if (!conversation) {
            // No conversation for this thread yet — it might be a thread that
            // started before we connected. Skip silently.
            result.skipped++;
            if (uid > highestUid) highestUid = uid;
            continue;
          }

          // Avoid duplicate back-fills: check if a message with this
          // message-id is already in the conversation.
          const messageId = email.message_id;
          if (messageId) {
            const alreadyPresent = conversation.messages.some(
              m => m.channel_info?.email?.message_id === messageId
            );
            if (alreadyPresent) {
              result.skipped++;
              if (uid > highestUid) highestUid = uid;
              continue;
            }
          }

          // Strip quoted history so we only store the new reply text.
          const bodyText = emailUtils.stripQuotedHistory(email.body_text) || '';

          await conversation.addMessage({
            role: 'assistant',
            content: bodyText,
            timestamp: email.received_at || new Date(),
            channel_info: {
              channel: 'email',
              email: {
                message_id: email.message_id,
                in_reply_to: email.in_reply_to,
                subject: email.subject,
                from_email: email.from_address,
                from_name: email.from_name,
                manual_send: true, // flag so the frontend can distinguish
              },
            },
          });

          result.captured++;
          console.log(
            `[SentPoller] captured manual reply account=${account._id}` +
            ` conv=${conversation._id} subject="${email.subject}" uid=${uid}`
          );
        } catch (msgErr) {
          console.error(`[SentPoller] error processing sent UID ${uid}:`, msgErr.message);
        }

        if (uid > highestUid) highestUid = uid;
      }

      await MailAccount.updateOne(
        { _id: account._id },
        { $set: { 'state.sent_last_uid': highestUid } }
      );
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return result;
}

/**
 * Derive a sensible default SENT folder name for the account's provider.
 */
function _defaultSentFolder(account) {
  if (account.provider === 'gmail') return '[Gmail]/Sent Mail';
  // Outlook/Exchange commonly uses "Sent Items"
  // Fall back to generic "Sent" for everything else.
  return 'Sent';
}

module.exports = { pollSent };
