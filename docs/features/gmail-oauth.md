# Gmail OAuth — Connecting a Gmail Mailbox

Instead of supplying an app password or IMAP credentials, third-party apps can
let their users connect a Gmail mailbox through a standard OAuth 2.0 consent
flow. Your backend handles all token exchange and storage; the frontend only
needs to open a URL and read a redirect result.

---

## Overview

```
Third-party frontend          Your API                Google
─────────────────────         ────────────────         ──────────────────
GET /authorize          ─▶    build consent URL  ─▶   (returns URL)
open consent URL        ─▶                       ─▶   user clicks Allow
                                                 ──▶  GET /callback?code=…
                              exchange code
                              create MailAccount
                              redirect to frontend ──▶ ?status=ok&account_id=…
```

The third-party app never sees any OAuth tokens or credentials. Everything is
stored encrypted on the `MailAccount` document in MongoDB.

---

## Prerequisites

### 1. Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Library**  
   Enable the **Gmail API** for your project.

2. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**

   - Application type: **Web application**
   - Add to **Authorized redirect URIs**:
     ```
     https://your-api-domain.com/api/v1/email/oauth/google/callback
     ```
   - Copy the **Client ID** and **Client Secret**.

3. If this is for a Google Workspace domain (internal users only):  
   Set the **User type** to _Internal_ under OAuth consent screen to skip the
   verification process. For public apps, complete the Google verification flow.

### 2. Environment variables

Add to your `.env`:

```dotenv
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>

# Public base URL of your API — used to build the OAuth callback URL
API_BASE_URL=https://your-api-domain.com

# Where the OAuth callback redirects on success/failure (your frontend)
FRONTEND_URL=https://your-frontend-domain.com
```

> **Note:** The same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are also used
> for user login (Passport Google strategy). If you need a separate OAuth
> client for Gmail (e.g. different scopes, different consent screen), create a
> second client and add `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET`
> — then update `gmailOAuthService.js` to read those variables instead.

---

## API Endpoints

### Step 1 — Get the consent URL

```
GET /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/oauth/google/authorize
```

**Authentication:** JWT (`Authorization: Bearer <token>`) + `admin` role on the organization.

**Query parameters:**

| Parameter      | Required | Description                                                                                                          |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `accountId`    | No       | ID of an existing `MailAccount` to re-connect / update tokens for. Omit to create a new account.                     |
| `redirect_url` | No       | Where to send the browser after the callback succeeds or fails. Defaults to `FRONTEND_URL/email-accounts/connected`. |

**Response:**

```json
{ "url": "https://accounts.google.com/o/oauth2/auth?..." }
```

---

### Step 2 — OAuth callback (called by Google, not by your frontend)

```
GET /api/v1/email/oauth/google/callback
```

**Authentication:** None — this is the redirect target registered in Google Cloud Console.

Google appends `?code=…&state=…` to this URL. The handler:

1. Decodes the `state` param to recover `orgId`, `projectId`, `agentId`, and optional `accountId`.
2. Exchanges the `code` for `access_token`, `refresh_token`, and `expiry_date`.
3. Fetches the Gmail address from the Google userinfo API.
4. Creates (or updates) a `MailAccount` with:
   - `provider: 'gmail'`
   - `ingest_mode: 'imap_poll'`
   - `credentials.oauth` — tokens stored encrypted at rest
   - `credentials.imap` — `imap.gmail.com:993`, XOAUTH2 auth
   - `credentials.smtp` — `smtp.gmail.com:465`, OAuth2 auth
   - `send_profile.from_email` — the Gmail address
5. Redirects to `redirect_url?status=ok&account_id=<id>&email=<address>`.

On failure the redirect carries `?status=error&error=<reason>` or
`?status=denied&error=access_denied`.

---

## Frontend Integration

### Full-page redirect (simplest)

```js
async function connectGmail(orgId, projectId, agentId, jwt) {
  const res = await fetch(
    `/api/v1/organizations/${orgId}/projects/${projectId}/agents/${agentId}/mail-accounts/oauth/google/authorize` +
      `?redirect_url=${encodeURIComponent('https://your-app.com/gmail-connected')}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const { url } = await res.json();
  window.location.href = url; // redirect the browser to Google
}
```

On the `/gmail-connected` page:

```js
const params = new URLSearchParams(window.location.search);

if (params.get('status') === 'ok') {
  const accountId = params.get('account_id');
  const email = params.get('email');
  // Store accountId; show "Connected: email@gmail.com" UI
} else {
  const error = params.get('error');
  // "denied" = user cancelled, otherwise something unexpected
}
```

### Popup window (keeps the user on the same page)

```js
async function connectGmailPopup(orgId, projectId, agentId, jwt) {
  const res = await fetch(
    `/api/v1/organizations/${orgId}/projects/${projectId}/agents/${agentId}/mail-accounts/oauth/google/authorize` +
      `?redirect_url=${encodeURIComponent('https://your-app.com/gmail-callback-popup')}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const { url } = await res.json();

  const popup = window.open(url, 'gmail-oauth', 'width=600,height=700');

  // Listen for the popup to post a message back after the callback lands.
  window.addEventListener('message', event => {
    if (event.origin !== 'https://your-app.com') return;
    const { accountId, email, error } = event.data;
    popup.close();
    if (accountId) {
      // success
    } else {
      // error
    }
  });
}
```

On the `/gmail-callback-popup` page (opened inside the popup):

```js
const params = new URLSearchParams(window.location.search);
window.opener.postMessage(
  {
    accountId: params.get('account_id'),
    email: params.get('email'),
    error: params.get('error'),
  },
  'https://your-app.com'
);
window.close();
```

### Re-connecting an existing account (token refresh / re-consent)

```js
// Pass the existing accountId to update tokens instead of creating a new account
const url = `/api/v1/.../mail-accounts/oauth/google/authorize?accountId=${accountId}`;
```

---

## What happens after connection

Once the `MailAccount` is created the normal email pipeline takes over:

- **IMAP poller** runs on the configured `poll_interval`. For Gmail accounts it
  authenticates with XOAUTH2 (the stored access token) instead of a password.
  Tokens are refreshed automatically before each poll if they are within 5
  minutes of expiry.
- **SMTP sends** use nodemailer's OAuth2 transport (`service: 'gmail'`) — no
  password needed.
- **Draft saves** use IMAP APPEND to `[Gmail]/Drafts` with XOAUTH2.
- **Token refresh** is handled transparently by `gmailOAuthService.getFreshAccessToken()`.
  The new token is written back to the `MailAccount` document immediately.

---

## Security notes

- `access_token` and `refresh_token` are **encrypted at rest** using the
  project's AES encryption key (`ENCRYPTION_KEY`). The raw values are never
  written to MongoDB.
- The `state` param in the OAuth URL encodes context (org/project/agent IDs)
  but is **not a secret** — it is base64-encoded JSON. An attacker who
  constructs their own state and drives through the consent flow will create a
  `MailAccount` on whichever agent they choose, but they must already have a
  valid Gmail account willing to grant consent. Privilege escalation is not
  possible because `orgId`/`agentId` are validated against the authenticated
  user's permissions on the `authorize` step that produced the state.
- The callback endpoint is intentionally public (no JWT) because Google calls
  it directly. CSRF is mitigated by the fact that the `code` is single-use and
  short-lived, and Google binds it to the `redirect_uri` registered in the
  Cloud Console.
- Always register the callback URI in Google Cloud Console **exactly** —
  including the scheme and domain. Do not use wildcards.
