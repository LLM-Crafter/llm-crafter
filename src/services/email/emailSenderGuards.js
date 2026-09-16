'use strict';

/**
 * Shared "is this a no-reply/automated sender address" check.
 *
 * Used by emailTriageService (skip LLM classification) and by
 * emailRecipientResolverService (never suggest redirecting a reply to an
 * automated address found in a body — footer links, unsubscribe mailtos,
 * tracking pixels, etc.).
 *
 * Split into two tiers because they behave differently in triage:
 *   - "Hard" bounce/NDR senders never carry actionable content — always
 *     dropped, regardless of config.
 *   - Plain "no-reply"/"do-not-reply" senders are usually one-way
 *     notifications too, but some (lead platforms, CRM alerts, contact-form
 *     relays) forward a genuine enquiry meant for a different recipient.
 *     emailTriageService lets these through when the mailbox has
 *     `recipient_resolution.enabled` — see runDeterministicGuards.
 *
 * Patterns cover common separator variants (-, ., _) so "do-not-reply@",
 * "do.not.reply@" and "do_not_reply@" are all caught, not just the exact
 * literal spelling.
 */
const HARD_BOUNCE_PATTERNS = [
  /mailer-daemon/i,
  /postmaster@/i,
  /^bounce[s]?@/i,
];

const NOREPLY_ONLY_PATTERNS = [
  /no[-._]?reply@/i,
  /do[-._]?not[-._]?reply@/i,
  /no[-._]?response@/i,
];

const NOREPLY_PATTERNS = [...HARD_BOUNCE_PATTERNS, ...NOREPLY_ONLY_PATTERNS];

function isHardBounceAddress(address) {
  const value = (address || '').toLowerCase();
  return HARD_BOUNCE_PATTERNS.some(rx => rx.test(value));
}

function isNoReplyOnlyAddress(address) {
  const value = (address || '').toLowerCase();
  return NOREPLY_ONLY_PATTERNS.some(rx => rx.test(value));
}

function isNoReplyAddress(address) {
  return isHardBounceAddress(address) || isNoReplyOnlyAddress(address);
}

module.exports = {
  isNoReplyAddress,
  isHardBounceAddress,
  isNoReplyOnlyAddress,
  NOREPLY_PATTERNS,
};
