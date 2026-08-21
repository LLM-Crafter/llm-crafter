# Outlook OAuth - Operator Setup Guide

This guide is for operators of an LLM Crafter deployment. It configures the
Microsoft Entra application used by the **Connect Outlook** flow for Outlook.com
and Microsoft 365 mailboxes.

> Third-party application developers should use
> [outlook-oauth-third-party.md](outlook-oauth-third-party.md).

## Architecture

LLM Crafter uses delegated Microsoft Graph access on behalf of the mailbox
owner. It does not use IMAP or SMTP for accounts connected through this flow.

- OAuth authorization and refresh tokens provide delegated access.
- Graph delta queries provide durable Inbox and Sent Items synchronization.
- Graph change notifications wake the sync worker immediately.
- A periodic delta poll remains enabled as a fallback.
- Graph `createReply` creates native drafts in the original Outlook thread.
- Graph sends, updates, and deletes native drafts.

## Step 1 - Create the Entra app registration

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Select **Identity -> Applications -> App registrations**.
3. Select **New registration**.
4. Enter a name such as `LLM Crafter Outlook Mailboxes`.
5. Choose the supported account type:

   | Intended users                                  | Entra selection                                                          | `MICROSOFT_TENANT_ID` |
   | ----------------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
   | One Microsoft 365 tenant                        | Accounts in this organizational directory only                           | Tenant GUID           |
   | Any Microsoft 365 organization                  | Accounts in any organizational directory                                 | `organizations`       |
   | Microsoft 365 and personal Outlook.com accounts | Accounts in any organizational directory and personal Microsoft accounts | `common`              |

6. Under **Redirect URI**, choose **Web** and enter exactly:

   ```text
   https://<your-api-domain>/api/v1/email/oauth/microsoft/callback
   ```

7. Select **Register**.
8. On **Overview**, record:
   - **Application (client) ID**
   - **Directory (tenant) ID**, if this is a single-tenant deployment

The redirect URI belongs to LLM Crafter, not to the third-party frontend. LLM
Crafter redirects the browser to the third-party URL after processing OAuth.

## Step 2 - Create the client secret

1. In the app registration, open **Certificates & secrets**.
2. Select **Client secrets -> New client secret**.
3. Enter a description and select an expiration suitable for your secret
   rotation policy.
4. Select **Add**.
5. Copy the secret's **Value** immediately. Do not copy the Secret ID.

Microsoft displays the secret value only once. Store it in your deployment's
secret manager and schedule rotation before it expires.

## Step 3 - Configure Microsoft Graph permissions

1. Open **API permissions** in the app registration.
2. Select **Add a permission -> Microsoft Graph -> Delegated permissions**.
3. Add these permissions:

   | Permission       | Purpose                                                  |
   | ---------------- | -------------------------------------------------------- |
   | `User.Read`      | Read the connected user's name and mailbox address       |
   | `Mail.ReadWrite` | Read messages and create, edit, and delete native drafts |
   | `Mail.Send`      | Send mail and native drafts                              |
   | `offline_access` | Receive a refresh token for background processing        |
   | `openid`         | Authenticate the Microsoft identity                      |
   | `profile`        | Read basic identity claims                               |
   | `email`          | Read the email identity claim when available             |

4. Select **Add permissions**.
5. For an organization-managed deployment, select **Grant admin consent for
   `<tenant>`** and confirm.

These must be **Delegated permissions**, not Application permissions. LLM
Crafter acts as the connected user and does not require tenant-wide unattended
mailbox access.

If you do not grant tenant-wide admin consent, users may consent individually
unless their organization's consent policy blocks these permissions. External
Microsoft 365 tenants can require their own administrator to approve the app.

## Step 4 - Confirm authentication settings

Open **Authentication** and verify:

- The Web redirect URI is exact, including scheme, host, path, and trailing
  slash behavior.
- **Allow public client flows** is **No**. LLM Crafter is a confidential web
  application and uses a client secret.
- The supported account types match the choice from Step 1.

For a multi-tenant production app, complete publisher verification and provide
the requested branding, privacy-policy, and terms-of-service URLs. This makes
the consent screen recognizable and may be required by customer tenants.

## Step 5 - Configure LLM Crafter

Set these variables on every API and worker instance:

```dotenv
MICROSOFT_CLIENT_ID=<application-client-id>
MICROSOFT_CLIENT_SECRET=<client-secret-value-not-secret-id>

# common: Microsoft 365 organizations plus personal Outlook.com accounts
# organizations: Microsoft 365 organizational accounts only
# tenant GUID: one Microsoft 365 tenant only
MICROSOFT_TENANT_ID=common

# Generate a long random value. Graph echoes this value in every notification.
MICROSOFT_WEBHOOK_CLIENT_STATE=<at-least-32-random-bytes>

# Public HTTPS origin of LLM Crafter, with no path
API_BASE_URL=https://api.example.com

EMAIL_PIPELINE_ENABLED=true
EMAIL_GRAPH_SYNC_WORKER_ENABLED=true
EMAIL_GRAPH_SYNC_CONCURRENCY=2
EMAIL_GRAPH_SUBSCRIPTION_SCHEDULER_ENABLED=true
EMAIL_GRAPH_SUBSCRIPTION_TICK_MS=3600000

# Periodic delta fallback is hosted by the shared email scheduler
EMAIL_IMAP_SCHEDULER_ENABLED=true
```

Generate the client-state secret with a password manager or, for example:

```bash
openssl rand -hex 32
```

`MICROSOFT_WEBHOOK_CLIENT_STATE` is not an Entra client secret. It is an
independent random value used to reject notifications that do not belong to
this deployment.

Restart all API and worker instances after changing the environment.

## Step 6 - Expose the webhook

Microsoft Graph validates this endpoint when LLM Crafter creates a
subscription:

```text
POST https://<your-api-domain>/api/v1/email/webhooks/microsoft
```

Requirements:

- Publicly reachable HTTPS with a publicly trusted certificate.
- No JWT, login redirect, basic authentication, or IP allowlist in front of
  this specific path.
- Reverse proxies and web application firewalls must allow Microsoft POSTs.
- Query strings must be preserved. Microsoft sends `validationToken` as a
  query parameter and expects its plain-text value in the response.
- JSON request bodies must reach the Node application unchanged.

The endpoint validates normal notifications with
`MICROSOFT_WEBHOOK_CLIENT_STATE`. No static webhook URL or subscription ID is
entered in Entra. LLM Crafter creates two Graph subscriptions automatically:

- Inbox messages
- Sent Items messages

Outlook message subscriptions have a maximum lifetime of 4,230 minutes. LLM
Crafter requests a 70-hour lifetime, renews subscriptions when less than 24
hours remain, and recreates a subscription if Microsoft has already removed
it.

## Step 7 - Connect and verify a mailbox

Request an authorization URL using an organization-admin JWT:

```http
GET /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/oauth/microsoft/authorize?redirect_url=https://app.example.com/outlook-connected
Authorization: Bearer <jwt>
```

Open the returned URL and complete Microsoft consent. A successful callback
creates a mail account with:

```json
{
  "provider": "graph",
  "ingest_mode": "oauth_push"
}
```

Confirm the account state contains:

- `graph_inbox_delta_link`
- `graph_sent_delta_link`
- `graph_inbox_subscription_id` and expiration
- `graph_sent_subscription_id` and expiration
- no `graph_last_subscription_error`

Send a message to the mailbox. A webhook-driven run should log:

```text
[MicrosoftWebhook] accepted notifications=... accounts=1
[GraphSyncWorker] processing account=... source=webhook
[GraphSyncWorker] done account=... enqueued=1 ...
[IngestWorker] done ... external_id=graph:... outbound_state=drafted
```

Open Outlook and verify the AI draft appears in the original conversation.
Send it from Outlook and verify a later sync reports `reconciled=1`.

## Reconnecting and secret rotation

To reconnect an existing account, pass its ID to the authorize endpoint:

```http
GET /.../mail-accounts/oauth/microsoft/authorize?accountId=<mail-account-id>&redirect_url=<url>
```

Reconnect when the user revokes consent, their refresh token is invalidated,
or tenant policy changes require fresh consent.

When rotating the Entra client secret, deploy the new secret value before
deleting the old credential. Existing refresh tokens continue to use the app
registration and require a valid current client credential when refreshed.

## Troubleshooting

| Symptom                              | Likely cause                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `AADSTS50011`                        | Callback URI does not exactly match the Web redirect URI in Entra                                          |
| `invalid_client`                     | Client secret **Value** is wrong, expired, or the Secret ID was used                                       |
| User cannot consent                  | Tenant consent policy requires administrator approval                                                      |
| Personal Outlook account is rejected | App registration account type or tenant setting does not support personal accounts                         |
| Subscription creation times out      | Public webhook is unreachable or does not return the validation token as plain text                        |
| Notifications return `401`           | `MICROSOFT_WEBHOOK_CLIENT_STATE` differs between API instances or changed after subscriptions were created |
| Delta synchronization returns `401`  | Refresh token was revoked or OAuth app credentials are invalid                                             |
| Draft is outside the thread          | Parent provider message ID was not retained; reconnect and test with a newly ingested message              |
| No immediate webhook activity        | Inspect `graph_last_subscription_error`; periodic delta polling should still process mail                  |

## Checklist

- [ ] Entra app registration created with the correct supported account type
- [ ] Exact Web callback URI registered
- [ ] Client secret **Value** stored securely
- [ ] Delegated Graph permissions configured
- [ ] Required admin consent granted where applicable
- [ ] Public Microsoft webhook path reaches LLM Crafter
- [ ] Environment variables set on API and worker instances
- [ ] Graph sync worker and subscription scheduler enabled
- [ ] Connect Outlook completes successfully
- [ ] Inbox message creates a native threaded Outlook draft
- [ ] Manual Outlook send is reconciled into the conversation
