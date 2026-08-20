'use strict';

/**
 * imapDraftTransport — saves a composed OutboundEmail to the IMAP Drafts
 * folder of the mailbox using an IMAP APPEND command.
 *
 * This is separate from SMTP send. SMTP delivers to the recipient. IMAP APPEND
 * copies the raw RFC822 bytes into the server-side Drafts mailbox so the draft
 * appears in the user's email client.
 *
 * Only operates when the account has IMAP credentials (ingest_mode='imap_poll').
 * OAuth/webhook accounts are skipped — they need provider-specific draft APIs
 * (Gmail drafts API, Graph createDraft) added later.
 *
 * Idempotency: the caller should check `outbound.imap_draft_uid !== null` and
 * skip if already set.
 */

const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const gmailOAuthService = require('../gmailOAuthService');

/**
 * Build a minimal RFC822 raw message buffer from an OutboundEmail document.
 * We use nodemailer's `compile` helper because it handles header folding,
 * Content-Transfer-Encoding, boundary generation etc. correctly.
 */
async function buildRaw(outbound, account) {
  const send = account.send_profile || {};
  const fromHeader = outbound.from_name
    ? `${outbound.from_name} <${outbound.from_email}>`
    : outbound.from_email;

  // nodemailer can compile a message to a buffer without sending it.
  const mail = nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
  const info = await mail.sendMail({
    messageId: outbound.message_id,
    from: fromHeader,
    to: outbound.to,
    cc: outbound.cc?.length ? outbound.cc : undefined,
    bcc: outbound.bcc?.length ? outbound.bcc : undefined,
    replyTo: outbound.reply_to || send.reply_to || undefined,
    subject: outbound.subject || '(no subject)',
    text: outbound.text || '',
    html: outbound.html || undefined,
    inReplyTo: outbound.in_reply_to || undefined,
    references: outbound.references?.length ? outbound.references : undefined,
    headers: {
      'X-LLMCrafter-Agent': String(outbound.agent),
      'X-LLMCrafter-Outbound-Id': String(outbound._id),
    },
  });

  // streamTransport delivers the raw stream via info.message.
  return new Promise((resolve, reject) => {
    const chunks = [];
    info.message.on('data', c => chunks.push(c));
    info.message.on('end', () => resolve(Buffer.concat(chunks)));
    info.message.on('error', reject);
  });
}

function resolveDraftsFolder(mailboxes, configuredFolder) {
  const specialUseDrafts = mailboxes.find(
    mailbox => mailbox.specialUse === '\\Drafts'
  );
  if (specialUseDrafts) {
    return specialUseDrafts.path;
  }

  const configured = configuredFolder || 'Drafts';
  const existing = mailboxes.find(
    mailbox => mailbox.path.toLowerCase() === configured.toLowerCase()
  );
  return existing?.path || configured;
}

/**
 * Append a draft to the IMAP Drafts folder.
 *
 * @param {Object} account  - MailAccount document (with getDecryptedCredentials())
 * @param {Object} outbound - OutboundEmail document
 * @returns {Promise<number|null>} UID of the appended message, or null on failure
 */
async function appendDraft(account, outbound) {
  if (account.ingest_mode !== 'imap_poll') {
    // Non-IMAP accounts need provider-specific draft APIs (Graph createDraft etc.).
    return null;
  }

  const creds = account.getDecryptedCredentials();
  const imap = creds.imap || {};

  let imapAuth;
  if (account.provider === 'gmail') {
    const accessToken = await gmailOAuthService.getFreshAccessToken(account);
    imapAuth = { user: imap.username || creds.oauth?.email, accessToken };
  } else {
    if (!imap.host || !imap.username || !imap.password) {
      throw new Error(`MailAccount ${account._id} has no IMAP credentials for draft save`);
    }
    imapAuth = { user: imap.username, pass: imap.password };
  }

  const raw = await buildRaw(outbound, account);

  const client = new ImapFlow({
    host: imap.host || 'imap.gmail.com',
    port: imap.port || 993,
    secure: imap.secure !== false,
    auth: imapAuth,
    logger: false,
    disableAutoIdle: true,
  });

  try {
    await client.connect();

    // Prefer the server's RFC 6154 special-use Drafts mailbox. This matters
    // for Gmail accounts configured as generic IMAP: appending to "Drafts"
    // otherwise creates an [Imap]/Drafts label instead of a real Gmail draft.
    const mailboxes = await client.list();
    const draftsFolder = resolveDraftsFolder(mailboxes, imap.drafts_folder);
    const exists = mailboxes.some(
      m => m.path.toLowerCase() === draftsFolder.toLowerCase()
    );
    if (!exists) {
      try {
        await client.mailboxCreate(draftsFolder);
      } catch {
        // Ignore — may already exist with a different casing, or the server
        // is Gmail which manages [Gmail]/Drafts itself.
      }
    }

    // APPEND: flags \Draft \Seen, date = now
    const appendResult = await client.append(
      draftsFolder,
      raw,
      ['\\Draft', '\\Seen'],
      new Date()
    );

    // ImapFlow returns { uid, uidValidity, seq } when APPENDUID is supported,
    // otherwise just { seq }. Coerce to a plain number or null.
    const uid = appendResult?.uid ? Number(appendResult.uid) : null;
    return uid;
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/**
 * Remove the server-side draft after the same OutboundEmail is sent by SMTP.
 * The custom outbound-id header identifies the exact draft even when the
 * server did not return APPENDUID or mailbox UIDs were reset.
 */
async function removeDraft(account, outbound) {
  if (account.ingest_mode !== 'imap_poll') {
    return false;
  }

  const creds = account.getDecryptedCredentials();
  const imap = creds.imap || {};

  let imapAuth;
  if (account.provider === 'gmail') {
    const accessToken = await gmailOAuthService.getFreshAccessToken(account);
    imapAuth = { user: imap.username || creds.oauth?.email, accessToken };
  } else {
    if (!imap.host || !imap.username || !imap.password) {
      return false;
    }
    imapAuth = { user: imap.username, pass: imap.password };
  }

  const client = new ImapFlow({
    host: imap.host || 'imap.gmail.com',
    port: imap.port || 993,
    secure: imap.secure !== false,
    auth: imapAuth,
    logger: false,
    disableAutoIdle: true
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    const draftsFolder = resolveDraftsFolder(mailboxes, imap.drafts_folder);
    const exists = mailboxes.some(
      mailbox => mailbox.path.toLowerCase() === draftsFolder.toLowerCase()
    );
    if (!exists) {
      return false;
    }

    const lock = await client.getMailboxLock(draftsFolder);
    try {
      const matchingUids = await client.search(
        { header: { 'X-LLMCrafter-Outbound-Id': String(outbound._id) } },
        { uid: true }
      );
      if (!matchingUids.length) {
        return false;
      }

      await client.messageDelete(matchingUids, { uid: true });
      return true;
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

module.exports = { appendDraft, removeDraft, buildRaw };
