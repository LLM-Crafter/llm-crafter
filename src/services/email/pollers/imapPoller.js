'use strict';

/**
 * ImapPoller — periodically connects to an IMAP mailbox, finds messages
 * newer than the stored `last_uid`, and enqueues an `email.ingest` job for
 * each one. Stateless beyond what is persisted on the MailAccount document.
 *
 * Multi-instance safety
 * ─────────────────────
 * `pollAccount` MUST be called inside a `distributedLockService.withLock`
 * scoped to the account id — see imapPollerScheduler.js. The lock guarantees
 * exactly one instance is talking to any given mailbox at a time, so
 * UID-state corruption is impossible.
 *
 * The ingest job itself is dedup-protected by `ProcessedEmail`'s unique
 * index, so even if two pollers ever did race they could not cause double
 * processing.
 */

const { ImapFlow } = require('imapflow');

const MailAccount = require('../../../models/MailAccount');
const jobQueue = require('../../jobQueueService');

const QUEUE_NAME = 'email.ingest';

/**
 * Build an ImapFlow client from decrypted account credentials.
 */
function buildClient(account) {
  const creds = account.getDecryptedCredentials();
  const imap = creds.imap || {};

  if (!imap.host || !imap.username || !imap.password) {
    throw new Error(
      `MailAccount ${account._id} has no usable IMAP credentials configured`
    );
  }

  return new ImapFlow({
    host: imap.host,
    port: imap.port || 993,
    secure: imap.secure !== false, // default true (implicit TLS on 993)
    auth: { user: imap.username, pass: imap.password },
    logger: false,
    // ImapFlow's STARTTLS option — only relevant when secure=false.
    disableAutoIdle: true,
  });
}

/**
 * Poll a single account for new messages. Caller is responsible for holding
 * the per-account lock for the duration of this call.
 *
 * Returns: { enqueued, skipped, uid_range, reset }
 */
async function pollAccount(account) {
  const client = buildClient(account);
  const result = {
    enqueued: 0,
    skipped: 0,
    uid_range: null,
    uid_validity: null,
    reset: false,
  };

  try {
    await client.connect();

    const mailbox = account.credentials?.imap?.mailbox || 'INBOX';
    const lock = await client.getMailboxLock(mailbox);

    try {
      const status = client.mailbox; // populated after getMailboxLock
      const currentUidValidity = Number(status.uidValidity);
      result.uid_validity = currentUidValidity;

      // Detect mailbox reset (UIDVALIDITY changed) — drop cached last_uid.
      let lastUid = account.state?.last_uid || 0;
      let storedValidity = account.state?.uid_validity || null;

      if (storedValidity && storedValidity !== currentUidValidity) {
        console.warn(
          `[ImapPoller] UIDVALIDITY changed for ${account._id} (${storedValidity} → ${currentUidValidity}). Resetting last_uid.`
        );
        lastUid = 0;
        storedValidity = currentUidValidity;
        result.reset = true;
      }
      if (!storedValidity) {
        storedValidity = currentUidValidity;
      }

      // First-time onboarding anchor: on the very first poll (lastUid===0)
      // save the current uidNext-1 as the starting point so only messages
      // arriving *after* this moment are ever processed. If the operator
      // explicitly sets initial_lookback_hours > 0 we honour that instead.
      let searchCriteria;
      if (lastUid > 0) {
        searchCriteria = { uid: `${lastUid + 1}:*` };
      } else {
        const lookbackHours =
          account.poll_config?.initial_lookback_hours ?? 0;
        if (lookbackHours > 0) {
          const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
          searchCriteria = { since };
        } else {
          // Anchor to the highest existing UID so the next poll only sees
          // messages that arrive from this moment forward. uidNext is the
          // next UID to be assigned, so uidNext-1 is the current watermark.
          const anchorUid = Math.max(0, Number(status.uidNext) - 1);
          console.log(
            `[ImapPoller] First poll for ${account._id} — anchoring at UID ${anchorUid}, skipping existing messages.`
          );
          await MailAccount.updateOne(
            { _id: account._id },
            {
              $set: {
                'state.last_uid': anchorUid,
                'state.uid_validity': currentUidValidity,
                'state.last_polled_at': new Date(),
                'state.last_error': null,
                'state.last_error_at': null,
                'state.consecutive_failures': 0,
              },
            }
          );
          result.uid_range = `anchored:${anchorUid}`;
          return result; // nothing to process on this cycle
        }
      }

      const uids = await client.search(searchCriteria, { uid: true });
      const sorted = (uids || []).sort((a, b) => a - b);
      const max = account.poll_config?.max_messages_per_cycle ?? 50;
      const slice = sorted.slice(0, max);

      let highestUid = lastUid;

      for (const uid of slice) {
        // Fetch raw RFC822 so we can parse with mailparser downstream.
        const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
        if (!msg) continue;

        const rawBuffer = msg.source; // Buffer
        const externalId = `${currentUidValidity}:${uid}`;

        // Enqueue the ingest job with dedup. If a previous poll already
        // queued this UID (e.g. crash between enqueue and last_uid update)
        // the dedup index drops the duplicate silently.
        const job = await jobQueue.enqueue(
          QUEUE_NAME,
          {
            mail_account_id: account._id,
            external_id: externalId,
            // We embed the raw bytes inline so the worker doesn't have to
            // re-open IMAP. For very large attachments this could be moved
            // to object storage later — base64 inline is fine for typical mail.
            raw_base64: rawBuffer.toString('base64'),
            envelope_message_id: msg.envelope?.messageId || null,
            envelope_from:
              msg.envelope?.from?.[0]?.address?.toLowerCase() || null,
            envelope_subject: msg.envelope?.subject || null,
          },
          {
            dedupKey: `${account._id}:${externalId}`,
            context: {
              mail_account_id: account._id,
              uid,
              uid_validity: currentUidValidity,
            },
          }
        );

        // Only count genuinely new jobs (null = dedup hit, already queued).
        if (job !== null) result.enqueued++;
        if (uid > highestUid) highestUid = uid;
      }

      // Persist the new last_uid + uidvalidity + poll timestamp.
      await MailAccount.updateOne(
        { _id: account._id },
        {
          $set: {
            'state.last_uid': highestUid,
            'state.uid_validity': currentUidValidity,
            'state.last_polled_at': new Date(),
            'state.last_event_at': new Date(),
            'state.last_error': null,
            'state.last_error_at': null,
            'state.consecutive_failures': 0,
          },
        }
      );

      result.uid_range = `${lastUid + 1}..${highestUid}`;
    } finally {
      lock.release();
    }
  } catch (err) {
    // Record the failure on the account so the UI can surface it.
    await MailAccount.updateOne(
      { _id: account._id },
      {
        $set: {
          'state.last_error': err.message,
          'state.last_error_at': new Date(),
        },
        $inc: { 'state.consecutive_failures': 1 },
      }
    ).catch(() => {});
    throw err;
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }

  return result;
}

module.exports = { pollAccount, QUEUE_NAME };
