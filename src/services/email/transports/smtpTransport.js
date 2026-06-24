'use strict';

/**
 * SmtpTransport — sends a single OutboundEmail through nodemailer using the
 * SMTP credentials stored on the MailAccount.
 *
 * Each call builds a fresh transporter so we do not have to maintain
 * long-lived connections across worker restarts. nodemailer pools internally
 * if you pass `pool: true`, but for the expected throughput (a handful of
 * replies per minute per account) the overhead of a new TCP+TLS handshake
 * per send is fine and avoids stale-connection bugs.
 */

const nodemailer = require('nodemailer');

/**
 * Build a nodemailer transporter for the given account.
 * @param {Object} account - MailAccount document
 */
function buildTransporter(account) {
  const creds = account.getDecryptedCredentials();
  const smtp = creds.smtp || {};

  if (!smtp.host || !smtp.username || !smtp.password) {
    throw new Error(
      `MailAccount ${account._id} has no usable SMTP credentials configured`
    );
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 587,
    secure: smtp.secure === true, // true → implicit TLS (465). false → STARTTLS upgrade.
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });
}

/**
 * Send a single outbound message.
 *
 * @param {Object} account  - MailAccount document
 * @param {Object} outbound - OutboundEmail document
 * @returns {Promise<{ providerMessageId: string }>}
 */
async function sendOutbound(account, outbound) {
  const transporter = buildTransporter(account);

  const fromHeader = outbound.from_name
    ? `${outbound.from_name} <${outbound.from_email}>`
    : outbound.from_email;

  const info = await transporter.sendMail({
    // Self-stamped Message-Id so retries collapse downstream.
    messageId: outbound.message_id,
    from: fromHeader,
    to: outbound.to,
    cc: outbound.cc?.length ? outbound.cc : undefined,
    bcc: outbound.bcc?.length ? outbound.bcc : undefined,
    replyTo: outbound.reply_to || undefined,
    subject: outbound.subject || '(no subject)',
    text: outbound.text || '',
    html: outbound.html || undefined,
    inReplyTo: outbound.in_reply_to || undefined,
    references: outbound.references?.length ? outbound.references : undefined,
    headers: {
      // Loop-protection header — our own inbound triage will reject mail
      // bearing this header so we never reply to ourselves.
      'X-LLMCrafter-Agent': String(outbound.agent),
      'X-LLMCrafter-Outbound-Id': String(outbound._id),
    },
  });

  return { providerMessageId: info.messageId };
}

module.exports = {
  buildTransporter,
  sendOutbound,
};
