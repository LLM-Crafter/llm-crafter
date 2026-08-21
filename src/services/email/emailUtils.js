'use strict';

/**
 * Utility helpers for working with email content and threading headers.
 *
 * Kept side-effect-free and dependency-light so it can be unit-tested without
 * spinning up mongoose / nodemailer.
 */

const crypto = require('crypto');

/**
 * Pull the root thread identifier out of an inbound email. Used as the
 * stable conversation key.
 *
 * Logic (mirrors most MUAs):
 *   1. If References header is present, use its first entry — that is the
 *      original message in the thread.
 *   2. Else if In-Reply-To is present, use it.
 *   3. Otherwise this IS the start of the thread → use its own Message-Id.
 */
function getThreadRoot(email) {
  if (Array.isArray(email.references) && email.references.length > 0) {
    return email.references[0];
  }
  if (email.in_reply_to) return email.in_reply_to;
  return email.message_id || null;
}

/**
 * Build a clean `Re:` subject. Idempotent — does not stack "Re: Re: Re:".
 */
function buildReplySubject(originalSubject = '') {
  const trimmed = String(originalSubject || '').trim();
  if (!trimmed) return 'Re:';
  if (/^re:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

/**
 * Strip quoted history from a plain-text email body so the agent sees the
 * latest message only. Cheap heuristics — not perfect, good enough.
 */
function stripQuotedHistory(text) {
  if (!text) return '';
  const lines = String(text).split(/\r?\n/);
  const out = [];
  const cutPatterns = [
    /^>+ /,
    /^On .* wrote:\s*$/i,
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^From:\s.+<.+@.+>/i,
    /^-{2,}\s*Forwarded message\s*-{2,}/i,
    /^Sent from my /i,
  ];
  for (const line of lines) {
    if (cutPatterns.some(rx => rx.test(line))) break;
    out.push(line);
  }
  return out.join('\n').trim() || text.trim();
}

/**
 * Generate a self-stamped RFC822 Message-Id. We control this so retries
 * cannot result in two distinct messages from the recipient's MTA view.
 *
 * Format: <random@domain> where domain is taken from `fromEmail`.
 */
function generateMessageId(fromEmail) {
  const domain = (fromEmail && fromEmail.split('@')[1]) || 'llm-crafter.local';
  const random = crypto.randomBytes(16).toString('hex');
  return `<${Date.now()}.${random}@${domain}>`;
}

/**
 * Compose an HTML body by appending the signature when present.
 * Falls back to plain text wrapped in a <pre> when no HTML signature.
 */
function renderHtml(bodyText, signatureHtml) {
  const escaped = String(bodyText || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n?|\n/g, '<br>');
  const bodyHtml = `<div style="font-family: sans-serif;">${escaped}</div>`;
  if (signatureHtml) {
    return `${bodyHtml}<br/><br/>${signatureHtml}`;
  }
  return bodyHtml;
}

/** Compose a plain-text body with the signature appended. */
function renderText(bodyText, signatureText) {
  const body = String(bodyText || '').trim();
  if (!signatureText) return body;
  return `${body}\n\n${String(signatureText).trim()}`;
}

module.exports = {
  getThreadRoot,
  buildReplySubject,
  stripQuotedHistory,
  generateMessageId,
  renderHtml,
  renderText,
};
