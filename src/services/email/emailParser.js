'use strict';

/**
 * Parses raw RFC822 bytes (Buffer or string) into a normalized email shape
 * used everywhere else in the email pipeline.
 *
 * Normalized shape:
 * {
 *   message_id:     string | null,   // header Message-Id (RFC822, with <>)
 *   in_reply_to:    string | null,
 *   references:     string[],
 *   subject:        string,
 *   from_address:   string,          // lowercased
 *   from_name:      string,
 *   to_addresses:   string[],
 *   cc_addresses:   string[],
 *   received_at:    Date,
 *   body_text:      string,
 *   body_html:      string | null,
 *   attachments:    Array<{ filename, contentType, size, content (Buffer) }>,
 *   headers:        Record<string, string>,  // raw header map for triage guards
 * }
 */

const { simpleParser } = require('mailparser');

function pickEnvelopeAddresses(value) {
  if (!value) return [];
  const arr = Array.isArray(value.value) ? value.value : [];
  return arr
    .map(v => (v.address || '').toLowerCase())
    .filter(Boolean);
}

function normaliseHeaders(headerMap) {
  // mailparser returns a Map; flatten to a plain object keyed by lowercase
  // header name for cheap lookups in triage guards.
  const out = {};
  if (!headerMap) return out;
  for (const [k, v] of headerMap.entries()) {
    out[k.toLowerCase()] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * @param {Buffer|string} raw - raw RFC822 bytes (from IMAP FETCH or webhook)
 */
async function parseRaw(raw) {
  const parsed = await simpleParser(raw, { skipImageLinks: false });

  const fromValue = parsed.from?.value?.[0] || {};
  const fromAddress = (fromValue.address || '').toLowerCase();
  const fromName = fromValue.name || '';

  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];

  return {
    message_id: parsed.messageId || null,
    in_reply_to: parsed.inReplyTo || null,
    references,
    subject: parsed.subject || '',
    from_address: fromAddress,
    from_name: fromName,
    to_addresses: pickEnvelopeAddresses(parsed.to),
    cc_addresses: pickEnvelopeAddresses(parsed.cc),
    received_at: parsed.date || new Date(),
    body_text: parsed.text || '',
    body_html: parsed.html || null,
    attachments: (parsed.attachments || []).map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      content: a.content, // Buffer
    })),
    headers: normaliseHeaders(parsed.headers),
  };
}

module.exports = { parseRaw };
