'use strict';

/**
 * GmailOAuthService
 *
 * Manages the Google OAuth2 flow for connecting Gmail mailboxes to a
 * MailAccount. Uses the same GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET already
 * used by the user-authentication flow.
 *
 * Required Gmail scope: https://mail.google.com/
 * (Full IMAP + SMTP access via XOAUTH2)
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   API_BASE_URL  — e.g. https://api.yourdomain.com  (used to build the
 *                   callback URL; falls back to http://localhost:{PORT})
 */

const { google } = require('googleapis');
const encryption = require('../../utils/encryption');
const MailAccount = require('../../models/MailAccount');

const GMAIL_SCOPES = [
  'https://mail.google.com/',          // Full IMAP + SMTP via XOAUTH2
  'https://www.googleapis.com/auth/userinfo.email', // Read the mailbox address
];

// How many ms before expiry we proactively refresh. 5 minutes is a safe buffer.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

class GmailOAuthService {
  /**
   * Build a Google OAuth2 client configured for mail access.
   */
  buildClient() {
    const callbackUrl = this._callbackUrl();
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl
    );
  }

  /**
   * Generate the Google consent screen URL. The frontend redirects the user
   * here; after consent Google redirects to our callback.
   *
   * @param {string} stateToken  - opaque value encoding orgId/projectId/agentId/accountId
   *                               so the callback can resume the right context.
   */
  getAuthorizationUrl(stateToken) {
    const client = this.buildClient();
    return client.generateAuthUrl({
      access_type: 'offline',   // request a refresh_token
      prompt: 'consent',        // force consent so refresh_token is always returned
      scope: GMAIL_SCOPES,
      state: stateToken,
    });
  }

  /**
   * Exchange an authorization code (from the callback) for tokens.
   *
   * @returns {{ access_token, refresh_token, expiry_date, email }}
   */
  async exchangeCode(code) {
    const client = this.buildClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Fetch the Gmail address so we can populate from_email.
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,   // ms epoch
      email: data.email,
    };
  }

  /**
   * Return a fresh access token for the account, refreshing from Google if
   * the stored token is expired or close to expiry.
   *
   * Writes the new token back to the MailAccount document.
   *
   * @param {Object} account - MailAccount document (must have getDecryptedCredentials)
   * @returns {Promise<string>} valid access_token
   */
  async getFreshAccessToken(account) {
    const creds = account.getDecryptedCredentials();
    const oauth = creds.oauth || {};

    if (!oauth.refresh_token) {
      throw new Error(`MailAccount ${account._id} has no OAuth refresh_token`);
    }

    const expiresAt = account.credentials?.oauth?.expires_at
      ? new Date(account.credentials.oauth.expires_at).getTime()
      : 0;
    const now = Date.now();

    // Return the stored token if still fresh.
    if (oauth.access_token && expiresAt > now + REFRESH_BUFFER_MS) {
      return oauth.access_token;
    }

    // Refresh.
    const client = this.buildClient();
    client.setCredentials({ refresh_token: oauth.refresh_token });
    const { credentials } = await client.refreshAccessToken();

    // Persist the new access token (refresh_token stays the same unless Google
    // rotates it — Google only rotates on re-consent).
    const newExpiry = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await MailAccount.updateOne(
      { _id: account._id },
      {
        $set: {
          'credentials.oauth.access_token': encryption.encrypt(credentials.access_token),
          'credentials.oauth.expires_at': newExpiry,
          ...(credentials.refresh_token
            ? { 'credentials.oauth.refresh_token': encryption.encrypt(credentials.refresh_token) }
            : {}),
        },
      }
    );

    return credentials.access_token;
  }

  /** Callback URL for Google — must match what's registered in Cloud Console. */
  _callbackUrl() {
    const base =
      process.env.API_BASE_URL ||
      `http://localhost:${process.env.PORT || 3000}`;
    return `${base}/api/v1/email/oauth/google/callback`;
  }
}

module.exports = new GmailOAuthService();
