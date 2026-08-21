'use strict';

const axios = require('axios');

const encryption = require('../../utils/encryption');
const MailAccount = require('../../models/MailAccount');

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send'
];
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

class MicrosoftOAuthService {
  get tenant() {
    return process.env.MICROSOFT_TENANT_ID || 'common';
  }

  get callbackUrl() {
    const base = process.env.API_BASE_URL ||
      `http://localhost:${process.env.PORT || 3000}`;
    return `${base}/api/v1/email/oauth/microsoft/callback`;
  }

  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: this.callbackUrl,
      response_mode: 'query',
      scope: SCOPES.join(' '),
      state,
      prompt: 'select_account'
    });
    return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code) {
    const token = await this._requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.callbackUrl
    });
    const profile = await this._getProfile(token.access_token);
    return { ...token, profile };
  }

  async getFreshAccessToken(account) {
    const credentials = account.getDecryptedCredentials();
    const oauth = credentials.oauth || {};
    if (!oauth.refresh_token) {
      throw new Error(`MailAccount ${account._id} has no OAuth refresh_token`);
    }

    const expiresAt = account.credentials?.oauth?.expires_at
      ? new Date(account.credentials.oauth.expires_at).getTime()
      : 0;
    if (oauth.access_token && expiresAt > Date.now() + REFRESH_BUFFER_MS) {
      return oauth.access_token;
    }

    const token = await this._requestToken({
      grant_type: 'refresh_token',
      refresh_token: oauth.refresh_token
    });
    const refreshToken = token.refresh_token || oauth.refresh_token;
    await MailAccount.updateOne(
      { _id: account._id },
      {
        $set: {
          'credentials.oauth.access_token': encryption.encrypt(token.access_token),
          'credentials.oauth.refresh_token': encryption.encrypt(refreshToken),
          'credentials.oauth.expires_at': new Date(
            Date.now() + Number(token.expires_in || 3600) * 1000
          ),
          'credentials.oauth.scope': token.scope || oauth.scope
        }
      }
    );
    return token.access_token;
  }

  async _requestToken(values) {
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      scope: SCOPES.join(' '),
      ...values
    });
    const { data } = await axios.post(
      `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return data;
  }

  async _getProfile(accessToken) {
    const { data } = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { $select: 'id,displayName,mail,userPrincipalName' }
    });
    return data;
  }
}

module.exports = new MicrosoftOAuthService();