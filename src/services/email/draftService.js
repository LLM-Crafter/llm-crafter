'use strict';

const OutboundEmail = require('../../models/OutboundEmail');
const gmailApiService = require('./gmailApiService');
const microsoftGraphService = require('./microsoftGraphService');
const imapDraftTransport = require('./transports/imapDraftTransport');

class DraftService {
  async create(account, outbound) {
    if (['gmail', 'graph'].includes(account.provider)) {
      const providerService = account.provider === 'gmail'
        ? gmailApiService
        : microsoftGraphService;
      const ids = await providerService.createDraft(account, outbound);
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
    if (!['gmail', 'graph'].includes(account.provider)) {
      return null;
    }
    const providerService = account.provider === 'gmail'
      ? gmailApiService
      : microsoftGraphService;
    const ids = await providerService.updateDraft(account, outbound);
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
    if (account.provider === 'graph') {
      return microsoftGraphService.deleteDraft(
        account,
        outbound.provider_draft_id
      );
    }
    if (account.ingest_mode === 'imap_poll') {
      return imapDraftTransport.removeDraft(account, outbound);
    }
    return false;
  }
}

module.exports = new DraftService();