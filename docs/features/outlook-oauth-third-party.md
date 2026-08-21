# Connect Outlook - Third-Party Integration Guide

This guide is for applications integrating with the LLM Crafter API. It adds a
**Connect Outlook** button without exposing Microsoft access tokens or client
credentials to the third-party application.

> LLM Crafter operators must first complete
> [outlook-oauth-operator-setup.md](outlook-oauth-operator-setup.md).

## Integration flow

Your frontend asks LLM Crafter for a Microsoft authorization URL. LLM Crafter
handles Microsoft OAuth, token storage, Graph subscriptions, and mailbox sync.

```text
Third-party app          LLM Crafter API              Microsoft
     | GET /authorize          |                          |
     |------------------------>|                          |
     |<------------------------| authorization URL        |
     | redirect user ------------------------------------>|
     |                            callback + code <--------|
     |                            exchange and connect     |
     |<---------------- redirect status=ok ----------------|
```

## Prerequisites

- Microsoft OAuth and Graph subscriptions are configured by the LLM Crafter
  operator.
- A valid LLM Crafter JWT for an organization administrator.
- The target `orgId`, `projectId`, and `agentId`.
- An HTTPS result page in your application for production use.

Your result-page URL is passed to LLM Crafter as `redirect_url`. It is not the
OAuth callback registered in Entra; the registered callback always belongs to
the LLM Crafter API.

## Step 1 - Request the Microsoft authorization URL

```http
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts/oauth/microsoft/authorize?redirect_url=https%3A%2F%2Fapp.example.com%2Foutlook-connected
Authorization: Bearer <jwt>
```

Response:

```json
{
  "url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?..."
}
```

Do not construct the Microsoft URL yourself and never place the Entra client
secret in frontend code.

## Step 2 - Send the user to Microsoft

Full-page redirect:

```js
async function connectOutlook({ apiBase, orgId, projectId, agentId, jwt }) {
  const resultUrl = `${window.location.origin}/outlook-connected`;
  const endpoint = new URL(
    `/api/v1/organizations/${orgId}/projects/${projectId}` +
      `/agents/${agentId}/mail-accounts/oauth/microsoft/authorize`,
    apiBase
  );
  endpoint.searchParams.set('redirect_url', resultUrl);

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error('Unable to start Outlook connection');

  const { url } = await response.json();
  window.location.assign(url);
}
```

A button can call this function directly:

```html
<button type="button" id="connect-outlook">Connect Outlook</button>
```

```js
document.querySelector('#connect-outlook').addEventListener('click', () => {
  connectOutlook({ apiBase, orgId, projectId, agentId, jwt });
});
```

## Step 3 - Handle the redirect result

LLM Crafter redirects back to `redirect_url` with query parameters:

| Result              | Query parameters                            |
| ------------------- | ------------------------------------------- |
| Connected           | `status=ok&account_id=<id>&email=<address>` |
| User denied consent | `status=denied&error=<reason>`              |
| Connection failed   | `status=error&error=<reason>`               |

Example result-page handler:

```js
function readOutlookConnectionResult() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'ok') {
    return {
      ok: true,
      accountId: params.get('account_id'),
      email: params.get('email'),
    };
  }
  return {
    ok: false,
    denied: params.get('status') === 'denied',
    error: params.get('error') || 'Microsoft connection failed',
  };
}
```

Persist `accountId`. It identifies the connected mailbox for thread, draft,
send, test, pause, resume, and reconnect operations.

## Popup variant

Open the returned Microsoft URL in a popup, then have your result page post the
query result to its opener:

```js
const params = new URLSearchParams(window.location.search);
window.opener?.postMessage(
  {
    type: 'outlook-connected',
    ok: params.get('status') === 'ok',
    accountId: params.get('account_id'),
    email: params.get('email'),
    error: params.get('error'),
  },
  window.location.origin
);
window.close();
```

The opener must validate `event.origin` before accepting this message.

## Reconnect an existing mailbox

Pass the existing mail-account ID when requesting the authorization URL:

```text
/mail-accounts/oauth/microsoft/authorize
  ?accountId=<existing-account-id>
  &redirect_url=https://app.example.com/outlook-connected
```

Use reconnect when the API reports an invalid or revoked refresh token. Keeping
the same account ID preserves the mailbox configuration and conversation
associations.

## After connection

The standard mail-account API is provider-independent:

| Action                | Endpoint                                                          |
| --------------------- | ----------------------------------------------------------------- |
| Test connection       | `POST /.../mail-accounts/:accountId/test`                         |
| Trigger delta sync    | `POST /.../mail-accounts/:accountId/poll`                         |
| List conversations    | `GET /.../mail-accounts/:accountId/threads`                       |
| Read a conversation   | `GET /.../mail-accounts/:accountId/threads/:conversationId`       |
| Compose a reply/draft | `POST /.../mail-accounts/:accountId/threads/:conversationId/send` |
| Pause or resume       | Existing mail-account lifecycle endpoints                         |
| Disconnect            | `DELETE /.../mail-accounts/:accountId`                            |

LLM Crafter creates drafts with Microsoft Graph `createReply`, so they appear
as native Outlook drafts in the original conversation. Sending a draft in
Outlook is detected through Sent Items delta synchronization and reconciled
without running the agent again.

## UX recommendations

- Label the action **Connect Outlook** or **Connect Microsoft 365**.
- Explain that the Microsoft consent page opens in a separate context.
- Show the returned mailbox address after connection.
- Surface `denied` as cancellation, not as a server failure.
- Provide a reconnect action while retaining the existing account ID.
- Never expose OAuth access tokens, refresh tokens, Entra client secrets, or
  webhook client-state values to the browser.
