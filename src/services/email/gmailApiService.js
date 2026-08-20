'use strict';

const { google } = require('googleapis');

const gmailOAuthService = require('./gmailOAuthService');
const { buildRaw } = require('./transports/imapDraftTransport');

function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

class GmailApiService {
  async buildClient(account) {
    const accessToken = await gmailOAuthService.getFreshAccessToken(account);
    const credentials = account.getDecryptedCredentials();
    const auth = gmailOAuthService.buildClient();
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: credentials.oauth?.refresh_token
    });
    return google.gmail({ version: 'v1', auth });
  }

  async getProfile(account) {
    const gmail = await this.buildClient(account);
    const { data } = await gmail.users.getProfile({ userId: 'me' });
    return data;
  }

  async createDraft(account, outbound) {
    const gmail = await this.buildClient(account);
    const raw = toBase64Url(await buildRaw(outbound, account));
    const { data } = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw,
          ...(outbound.provider_thread_id
            ? { threadId: outbound.provider_thread_id }
            : {})
        }
      }
    });
    return {
      draftId: data.id,
      messageId: data.message?.id || null,
      threadId: data.message?.threadId || null
    };
  }

  async updateDraft(account, outbound) {
    if (!outbound.provider_draft_id) {
      return this.createDraft(account, outbound);
    }
    const gmail = await this.buildClient(account);
    const raw = toBase64Url(await buildRaw(outbound, account));
    const { data } = await gmail.users.drafts.update({
      userId: 'me',
      id: outbound.provider_draft_id,
      requestBody: {
        message: {
          raw,
          ...(outbound.provider_thread_id
            ? { threadId: outbound.provider_thread_id }
            : {})
        }
      }
    });
    return {
      draftId: data.id,
      messageId: data.message?.id || null,
      threadId: data.message?.threadId || null
    };
  }

  async deleteDraft(account, draftId) {
    if (!draftId) {return false;}
    const gmail = await this.buildClient(account);
    await gmail.users.drafts.delete({ userId: 'me', id: draftId });
    return true;
  }

  async sendOutbound(account, outbound) {
    const gmail = await this.buildClient(account);
    let data;
    if (outbound.provider_draft_id) {
      ({ data } = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: outbound.provider_draft_id }
      }));
    } else {
      const raw = toBase64Url(await buildRaw(outbound, account));
      ({ data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          ...(outbound.provider_thread_id
            ? { threadId: outbound.provider_thread_id }
            : {})
        }
      }));
    }
    return {
      providerMessageId: data.id,
      providerThreadId: data.threadId || null
    };
  }

  async getRawMessage(account, messageId) {
    const gmail = await this.buildClient(account);
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'raw'
    });
    return {
      raw: fromBase64Url(data.raw),
      messageId: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds || [],
      historyId: data.historyId || null
    };
  }

  async listHistory(account, startHistoryId, pageToken) {
    const gmail = await this.buildClient(account);
    const { data } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      pageToken: pageToken || undefined,
      historyTypes: ['messageAdded'],
      maxResults: 100
    });
    return data;
  }

  async watch(account) {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) {
      throw new Error('GMAIL_PUBSUB_TOPIC is not configured');
    }
    const gmail = await this.buildClient(account);
    const { data } = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName
      }
    });
    return data;
  }
}

module.exports = new GmailApiService();