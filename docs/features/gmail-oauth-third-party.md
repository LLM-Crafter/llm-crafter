# Gmail OAuth — Third-Party App Integration Guide

This document is for developers building an app that uses the LLM Crafter API.
It explains how to add a **"Connect Gmail"** button so your users can link their
Gmail mailbox to an agent — without ever handling credentials or OAuth tokens
yourself.

> **Backend operators:** see [gmail-oauth.md](gmail-oauth.md) for server-side
> setup (Google Cloud Console, env vars, how tokens are stored).

---

## How it works

Your app never touches Google directly. You call one API endpoint, open a URL,
and read a redirect result. The API handles all OAuth token exchange and
storage.

```
Your frontend                 LLM Crafter API           Google
──────────────────────        ─────────────────         ──────────────
1. GET /authorize      ──▶    build consent URL
                         ◀──  { url: "https://accounts.google.com/…" }
2. open url            ──▶                        ──▶  user clicks Allow
                                                  ──▶  GET /callback?code=…
                              exchange code
                              create MailAccount
                              redirect             ──▶  your ?status=ok&account_id=…
3. read redirect result
```

---

## What you need before starting

Ask the operator of the LLM Crafter instance you are integrating with to
confirm:

- Gmail OAuth is enabled (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
  configured on the server).
- Your redirect URL (e.g. `https://your-app.com/gmail-connected`) is either
  already allowed or does not need to be pre-registered — it is passed as a
  query parameter at runtime, not registered in Google Cloud Console.

You also need:

- A valid **JWT** for a user that has the `admin` role on the organization.
- The `orgId`, `projectId`, and `agentId` you want to attach the mailbox to.

---

## Step-by-step

### 1. Get the consent URL

Call the API with the user's JWT:

```http
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts/oauth/google/authorize?redirect_url=https://your-app.com/gmail-connected
Authorization: Bearer <jwt>
```

Response:

```json
{
  "url": "https://accounts.google.com/o/oauth2/auth?client_id=…&scope=https://mail.google.com/…"
}
```

### 2. Send the user to Google

Open the `url` from the response. Two common patterns:

**Full-page redirect** (simplest — user leaves your page and comes back):

```js
window.location.href = url;
```

**Popup** (user stays on your page):

```js
window.open(url, 'gmail-oauth', 'width=600,height=700');
```

The user will see Google's consent screen asking for access to their Gmail.

### 3. Handle the result

After the user approves (or cancels), Google redirects to the LLM Crafter
backend which immediately redirects to your `redirect_url` with query params:

| Scenario       | Parameters                                        |
| -------------- | ------------------------------------------------- |
| Success        | `?status=ok&account_id=<id>&email=user@gmail.com` |
| User cancelled | `?status=denied&error=access_denied`              |
| Server error   | `?status=error&error=<message>`                   |

On your `/gmail-connected` page:

```js
const params = new URLSearchParams(window.location.search);

if (params.get('status') === 'ok') {
  const accountId = params.get('account_id'); // persist this
  const email = params.get('email');
  showSuccess(`Connected: ${email}`);
} else {
  const reason = params.get('error');
  showError(reason === 'access_denied' ? 'Cancelled' : `Error: ${reason}`);
}
```

The `account_id` is the `MailAccount` ID. Store it — you will use it for the
thread list, sending, and any future reconnection.

---

## Putting it together — copy-paste example

```js
const API = 'https://api.your-llmcrafter-instance.com';
const APP = 'https://your-app.com';

// ─── Step 1: trigger the flow ────────────────────────────────────────────────
async function connectGmail({ orgId, projectId, agentId, jwt, accountId }) {
  const query = new URLSearchParams({
    redirect_url: `${APP}/gmail-connected`,
    ...(accountId ? { accountId } : {}), // omit to create a new account
  });

  const res = await fetch(
    `${API}/api/v1/organizations/${orgId}/projects/${projectId}/agents/${agentId}/mail-accounts/oauth/google/authorize?${query}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  if (!res.ok) throw new Error('Failed to get authorization URL');
  const { url } = await res.json();

  // Full-page redirect — change to window.open() for a popup
  window.location.href = url;
}

// ─── Step 2: handle the redirect back ────────────────────────────────────────
// Put this on the page at /gmail-connected
function handleGmailCallback() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');

  if (status === 'ok') {
    return {
      ok: true,
      accountId: params.get('account_id'),
      email: params.get('email'),
    };
  }

  return {
    ok: false,
    cancelled: status === 'denied',
    error: params.get('error'),
  };
}
```

---

## Re-connecting / refreshing tokens

If a user's Gmail connection breaks (e.g. they revoked access), call
`connectGmail` again with the existing `accountId`. The same flow runs but
instead of creating a new `MailAccount` the existing one's tokens are updated.

```js
connectGmail({ orgId, projectId, agentId, jwt, accountId: existingAccountId });
```

---

## After connection — what you can do

Once `account_id` is in hand, use the standard mail account API endpoints:

| Action                 | Endpoint                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| List email threads     | `GET /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/threads` |
| Get a thread           | `GET /…/threads/:conversationId`                                                                        |
| Send/queue a reply     | `POST /…/threads/:conversationId/send`                                                                  |
| Pause / resume polling | `PATCH /…/mail-accounts/:accountId` with `{ "is_paused": true }`                                        |
| Disconnect (delete)    | `DELETE /…/mail-accounts/:accountId`                                                                    |

The agent will start polling the connected Gmail inbox automatically on the
next scheduler tick (within the configured `poll_interval`, default 5 minutes).

---

## Popup pattern (full example)

Use this if you want the user to stay on the same page while they connect.

```js
// 1. Open the popup
async function connectGmailPopup({ orgId, projectId, agentId, jwt }) {
  const query = new URLSearchParams({
    redirect_url: `${APP}/gmail-popup-callback`,
  });

  const res = await fetch(
    `${API}/api/v1/organizations/${orgId}/projects/${projectId}/agents/${agentId}/mail-accounts/oauth/google/authorize?${query}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const { url } = await res.json();

  const popup = window.open(url, 'gmail-oauth', 'width=600,height=700');

  return new Promise((resolve, reject) => {
    window.addEventListener('message', function handler(event) {
      if (event.origin !== APP) return;
      window.removeEventListener('message', handler);
      popup.close();
      event.data.ok ? resolve(event.data) : reject(new Error(event.data.error));
    });
  });
}

// 2. The /gmail-popup-callback page posts the result back and closes itself
function gmailPopupCallbackPage() {
  const params = new URLSearchParams(window.location.search);
  window.opener?.postMessage(
    {
      ok: params.get('status') === 'ok',
      accountId: params.get('account_id'),
      email: params.get('email'),
      error: params.get('error'),
    },
    APP
  );
  window.close();
}
```
