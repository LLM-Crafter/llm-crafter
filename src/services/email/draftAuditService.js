'use strict';

/**
 * draftAuditService — pairs the agent's first generated draft with the body
 * that was actually sent, so the two can be compared elsewhere.
 *
 * Only replies that started life as an OutboundEmail draft are tracked.
 * Fully manual replies (no draft, back-filled by the sent poller) are ignored
 * by design — there is nothing to compare them against.
 *
 * Both snapshots are also mirrored onto the linked conversation message under
 * `metadata.draft_audit`. Message metadata is never read by the reasoning
 * loops (only `role` and `content` reach the LLM), so this cannot leak into
 * agent context.
 */

const OutboundEmail = require('../../models/OutboundEmail');
const Conversation = require('../../models/Conversation');

/**
 * Whitespace and entity noise introduced by mail clients must not register as
 * a human edit.
 */
function normalize(value) {
  if (!value) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/&nbsp;|\u00a0/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Record the sent body against the frozen original draft.
 *
 * Idempotent — first writer wins, so a provider sent-folder notification
 * arriving after our own worker already recorded the send is a no-op.
 *
 * `was_edited` is derived from plain text only: mail clients rewrite HTML
 * markup on every send, which would otherwise read as an edit every time.
 *
 * @param {Object} outbound - OutboundEmail document (pre-update)
 * @param {Object} sent - { text, html, subject, source }
 * @returns {Promise<boolean>} whether this call recorded the snapshot
 */
async function recordSend(outbound, { text, html, subject, source }) {
  const original = outbound.original_draft || {};
  if (!original.generated_at) return false; // predates audit tracking

  const wasEdited = normalize(original.text) !== normalize(text);
  const recordedAt = new Date();

  const res = await OutboundEmail.updateOne(
    { _id: outbound._id, 'final_sent.recorded_at': null },
    {
      $set: {
        was_edited: wasEdited,
        final_sent: {
          subject: subject ?? null,
          text: text ?? null,
          html: html ?? null,
          source,
          recorded_at: recordedAt,
        },
      },
    }
  );
  if (res.modifiedCount === 0) return false;

  if (outbound.conversation) {
    await Conversation.updateOne(
      {
        _id: outbound.conversation,
        'messages.metadata.outbound_id': outbound._id,
      },
      {
        $set: {
          'messages.$.metadata.draft_audit.was_edited': wasEdited,
          'messages.$.metadata.draft_audit.final_text': text ?? null,
          'messages.$.metadata.draft_audit.final_html': html ?? null,
          'messages.$.metadata.draft_audit.source': source,
          'messages.$.metadata.draft_audit.recorded_at': recordedAt,
        },
      }
    ).catch(() => {});
  }

  return true;
}

module.exports = { recordSend };
