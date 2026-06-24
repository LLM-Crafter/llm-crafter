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

/**
 * Append a draft to the IMAP Drafts folder.
 *
 * @param {Object} account  - MailAccount document (with getDecryptedCredentials())
 * @param {Object} outbound - OutboundEmail document
 * @returns {Promise<number|null>} UID of the appended message, or null on failure
 */
async function appendDraft(account, outbound) {
  if (account.ingest_mode !== 'imap_poll') {
    // Non-IMAP accounts need provider-specific draft APIs — not yet implemented.
    return null;
  }

  const creds = account.getDecryptedCredentials();
  const imap = creds.imap || {};

  if (!imap.host || !imap.username || !imap.password) {
    throw new Error(`MailAccount ${account._id} has no IMAP credentials for draft save`);
  }

  const draftsFolder = imap.drafts_folder || 'Drafts';
  const raw = await buildRaw(outbound, account);

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port || 993,
    secure: imap.secure !== false,
    auth: { user: imap.username, pass: imap.password },
    logger: false,
    disableAutoIdle: true,
  });

  try {
    await client.connect();

    // Ensure the Drafts folder exists — some servers auto-create, some don't.
    const mailboxes = await client.list();
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

module.exports = { appendDraft };
