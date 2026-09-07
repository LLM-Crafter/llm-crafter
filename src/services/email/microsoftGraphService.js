'use strict';

const axios = require('axios');

const microsoftOAuthService = require('./microsoftOAuthService');
const outboundAttachmentService = require('./outboundAttachmentService');

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const DIRECT_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 10 * 320 * 1024;

function recipient(address) {
  return { emailAddress: { address } };
}

class MicrosoftGraphService {
  async request(account, config) {
    const accessToken = await microsoftOAuthService.getFreshAccessToken(account);
    try {
      return await axios({
        ...config,
        url: config.url.startsWith('http') ? config.url : `${GRAPH_ROOT}${config.url}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'IdType="ImmutableId"',
          ...(config.headers || {})
        }
      });
    } catch (err) {
      const graphError = err.response?.data?.error;
      if (graphError?.message) {
        err.message = `${graphError.code || 'MicrosoftGraphError'}: ${graphError.message}`;
      }
      throw err;
    }
  }

  async getProfile(account) {
    const { data } = await this.request(account, {
      method: 'get',
      url: '/me',
      params: { $select: 'id,displayName,mail,userPrincipalName' }
    });
    return data;
  }

  async getMimeMessage(account, messageId) {
    const { data } = await this.request(account, {
      method: 'get',
      url: `/me/messages/${encodeURIComponent(messageId)}/$value`,
      responseType: 'arraybuffer'
    });
    return Buffer.from(data);
  }

  async runDelta(account, folder, deltaLink = null) {
    const initialQuery = new URLSearchParams({
      changeType: 'created',
      $select: 'id,conversationId,internetMessageId',
      $filter: `receivedDateTime ge ${new Date().toISOString()}`
    });
    const url = deltaLink ||
      `/me/mailFolders/${folder}/messages/delta?${initialQuery}`;
    const items = [];
    let next = url;
    let finalDeltaLink = null;
    while (next) {
      const { data } = await this.request(account, { method: 'get', url: next });
      items.push(...(data.value || []));
      next = data['@odata.nextLink'] || null;
      finalDeltaLink = data['@odata.deltaLink'] || finalDeltaLink;
    }
    return { items, deltaLink: finalDeltaLink };
  }

  async createDraft(account, outbound) {
    let draft;
    if (outbound.provider_parent_message_id) {
      const { data } = await this.request(account, {
        method: 'post',
        url: `/me/messages/${encodeURIComponent(outbound.provider_parent_message_id)}/createReply`
      });
      draft = data;
    } else {
      const { data } = await this.request(account, {
        method: 'post',
        url: '/me/messages',
        data: this._draftPatch(outbound, true)
      });
      draft = data;
    }

    await this.request(account, {
      method: 'patch',
      url: `/me/messages/${encodeURIComponent(draft.id)}`,
      data: this._draftPatch(outbound, !outbound.provider_parent_message_id)
    });
    await this._syncAttachments(account, draft.id, outbound);
    return {
      draftId: draft.id,
      messageId: draft.id,
      threadId: draft.conversationId || outbound.provider_thread_id || null
    };
  }

  async updateDraft(account, outbound) {
    if (!outbound.provider_draft_id) {
      return this.createDraft(account, outbound);
    }
    const { data } = await this.request(account, {
      method: 'patch',
      url: `/me/messages/${encodeURIComponent(outbound.provider_draft_id)}`,
      data: this._draftPatch(outbound, false)
    });
    await this._syncAttachments(account, outbound.provider_draft_id, outbound);
    return {
      draftId: outbound.provider_draft_id,
      messageId: data?.id || outbound.provider_message_id,
      threadId: data?.conversationId || outbound.provider_thread_id || null
    };
  }

  async deleteDraft(account, draftId) {
    if (!draftId) {return false;}
    await this.request(account, {
      method: 'delete',
      url: `/me/messages/${encodeURIComponent(draftId)}`
    });
    return true;
  }

  async sendOutbound(account, outbound) {
    let draftId = outbound.provider_draft_id;
    let threadId = outbound.provider_thread_id;
    if (!draftId) {
      const draft = await this.createDraft(account, outbound);
      draftId = draft.draftId;
      threadId = draft.threadId;
    }
    await this.request(account, {
      method: 'post',
      url: `/me/messages/${encodeURIComponent(draftId)}/send`
    });
    return { providerMessageId: draftId, providerThreadId: threadId };
  }

  async createSubscription(account, folder) {
    const apiBaseUrl = String(process.env.API_BASE_URL || '').replace(/\/$/, '');
    if (!apiBaseUrl) {
      throw new Error('API_BASE_URL is required for Microsoft subscriptions');
    }
    if (!process.env.MICROSOFT_WEBHOOK_CLIENT_STATE) {
      throw new Error(
        'MICROSOFT_WEBHOOK_CLIENT_STATE is required for Microsoft subscriptions'
      );
    }
    const notificationUrl = `${apiBaseUrl}/api/v1/email/webhooks/microsoft`;
    const expirationDateTime = new Date(
      Date.now() + 70 * 60 * 60_000
    ).toISOString();
    const resource = `me/mailFolders('${folder}')/messages`;
    try {
      const { data } = await this.request(account, {
        method: 'post',
        url: '/subscriptions',
        data: {
          changeType: 'created',
          notificationUrl,
          resource,
          expirationDateTime,
          clientState: process.env.MICROSOFT_WEBHOOK_CLIENT_STATE
        }
      });
      return data;
    } catch (err) {
      if (err.response?.status !== 409) {
        throw err;
      }
      const { data } = await this.request(account, {
        method: 'get',
        url: '/subscriptions'
      });
      const existing = (data.value || []).find(subscription =>
        subscription.resource?.toLowerCase() === resource.toLowerCase() &&
        subscription.notificationUrl === notificationUrl
      );
      if (!existing) {
        throw err;
      }
      return existing;
    }
  }

  async renewSubscription(account, subscriptionId) {
    const expirationDateTime = new Date(
      Date.now() + 70 * 60 * 60_000
    ).toISOString();
    const { data } = await this.request(account, {
      method: 'patch',
      url: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      data: { expirationDateTime }
    });
    return data;
  }

  async deleteSubscription(account, subscriptionId) {
    if (!subscriptionId) {
      return false;
    }
    await this.request(account, {
      method: 'delete',
      url: `/subscriptions/${encodeURIComponent(subscriptionId)}`
    });
    return true;
  }

  async _syncAttachments(account, draftId, outbound) {
    const { data } = await this.request(account, {
      method: 'get',
      url: `/me/messages/${encodeURIComponent(draftId)}/attachments`,
      params: { $select: 'id' }
    });
    for (const attachment of data.value || []) {
      await this.request(account, {
        method: 'delete',
        url: `/me/messages/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(attachment.id)}`
      });
    }

    const materialized = await outboundAttachmentService.materialize(
      account.organization,
      outbound.attachments
    );
    for (const attachment of materialized) {
      if (attachment.content.length <= DIRECT_ATTACHMENT_LIMIT) {
        await this.request(account, {
          method: 'post',
          url: `/me/messages/${encodeURIComponent(draftId)}/attachments`,
          data: {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: attachment.filename,
            contentType: attachment.contentType,
            contentBytes: attachment.content.toString('base64')
          }
        });
      } else {
        await this._uploadLargeAttachment(account, draftId, attachment);
      }
    }
  }

  async _uploadLargeAttachment(account, draftId, attachment) {
    const { data } = await this.request(account, {
      method: 'post',
      url: `/me/messages/${encodeURIComponent(draftId)}/attachments/createUploadSession`,
      data: {
        AttachmentItem: {
          attachmentType: 'file',
          name: attachment.filename,
          size: attachment.content.length,
          contentType: attachment.contentType
        }
      }
    });

    for (let start = 0; start < attachment.content.length; start += UPLOAD_CHUNK_SIZE) {
      const end = Math.min(start + UPLOAD_CHUNK_SIZE, attachment.content.length);
      const chunk = attachment.content.subarray(start, end);
      await axios.put(data.uploadUrl, chunk, {
        headers: {
          'Content-Length': chunk.length,
          'Content-Range': `bytes ${start}-${end - 1}/${attachment.content.length}`,
          'Content-Type': 'application/octet-stream'
        },
        maxBodyLength: Infinity
      });
    }
  }

  _draftPatch(outbound, includeSubject) {
    return {
      ...(includeSubject ? { subject: outbound.subject } : {}),
      body: {
        contentType: outbound.html ? 'HTML' : 'Text',
        content: outbound.html || outbound.text || ''
      },
      toRecipients: (outbound.to || []).map(recipient),
      ccRecipients: (outbound.cc || []).map(recipient),
      bccRecipients: (outbound.bcc || []).map(recipient)
    };
  }
}

module.exports = new MicrosoftGraphService();