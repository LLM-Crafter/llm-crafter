'use strict';

const OutboundEmail = require('../../models/OutboundEmail');
const gmailApiService = require('./gmailApiService');
const imapDraftTransport = require('./transports/imapDraftTransport');

class DraftService {
  async create(account, outbound) {
    if (account.provider === 'gmail') {
      const ids = await gmailApiService.createDraft(account, outbound);
      await OutboundEmail.updateOne(
        { _id: outbound._id },
        {
          $set: {
            provider_draft_id: ids.draftId,
            provider_message_id: ids.messageId,
            provider_thread_id: ids.threadId
          }
        }
      );
      outbound.provider_draft_id = ids.draftId;
      outbound.provider_message_id = ids.messageId;
      outbound.provider_thread_id = ids.threadId;
      return ids;
    }

    if (account.ingest_mode !== 'imap_poll') {
      return null;
    }
    const uid = await imapDraftTransport.appendDraft(account, outbound);
    if (uid !== null) {
      await OutboundEmail.updateOne(
        { _id: outbound._id },
        { $set: { imap_draft_uid: uid } }
      );
      outbound.imap_draft_uid = uid;
    }
    return { imapDraftUid: uid };
  }

  async update(account, outbound) {
    if (account.provider !== 'gmail') {
      return null;
    }
    const ids = await gmailApiService.updateDraft(account, outbound);
    await OutboundEmail.updateOne(
      { _id: outbound._id },
      {
        $set: {
          provider_draft_id: ids.draftId,
          provider_message_id: ids.messageId,
          provider_thread_id: ids.threadId
        }
      }
    );
    outbound.provider_draft_id = ids.draftId;
    outbound.provider_message_id = ids.messageId;
    outbound.provider_thread_id = ids.threadId;
    return ids;
  }

  async remove(account, outbound) {
    if (account.provider === 'gmail') {
      return gmailApiService.deleteDraft(account, outbound.provider_draft_id);
    }
    if (account.ingest_mode === 'imap_poll') {
      return imapDraftTransport.removeDraft(account, outbound);
    }
    return false;
  }
}

module.exports = new DraftService();