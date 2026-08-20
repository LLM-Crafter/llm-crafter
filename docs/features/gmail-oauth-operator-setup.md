# Gmail OAuth — Operator Setup Guide

This guide is for the team running the LLM Crafter instance. It explains every
step required to enable the **"Connect Gmail"** flow so third-party apps built
on top of your API can let their users link a Gmail mailbox to an agent.

> **For third-party app developers:** see
> [gmail-oauth-third-party.md](gmail-oauth-third-party.md).  
> **API reference:** see [gmail-oauth.md](gmail-oauth.md).

---

## What you are setting up

When a third-party app calls the authorize endpoint, LLM Crafter redirects the
user to Google's consent screen. For this to work you need:

1. A **Google Cloud project** with the Gmail API enabled.
2. An **OAuth 2.0 client** (client ID + secret) configured with LLM Crafter's
   callback URL as an authorized redirect URI.
3. An **OAuth consent screen** that users see when they click "Allow".
4. A **Pub/Sub topic and authenticated push subscription** for Gmail changes.
5. The client ID, secret, and Pub/Sub settings stored in LLM Crafter's environment.

If your app will only be used by users inside a single Google Workspace domain
(internal tool), the process is much simpler — skip the verification steps.

---

## Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click the project picker at the top → **New Project**.
3. Give it a name (e.g. `LLM Crafter Production`) and click **Create**.
4. Make sure the new project is selected in the picker before continuing.

> If you already have a Google Cloud project for this deployment you can use
> it — just make sure you are working inside the right project.

---

## Step 2 — Enable the Gmail API

1. In the left sidebar go to **APIs & Services → Library**.
2. Search for **Gmail API** and click it.
3. Click **Enable**.

---

## Step 3 — Configure the OAuth consent screen

This is the screen users see when they click "Allow". It must be configured
before you can create credentials.

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose the **User type**:

   | Scenario                                       | User type to choose                     |
   | ---------------------------------------------- | --------------------------------------- |
   | Only users in your own Google Workspace org    | **Internal** — no verification required |
   | Any Google account (customers, external users) | **External**                            |

3. Fill in the required fields:

   - **App name** — shown to users on the consent screen (e.g. `Your Company Name`)
   - **User support email** — a contact address for users
   - **Developer contact information** — your team's email

4. Click **Save and Continue**.

5. On the **Scopes** screen click **Add or Remove Scopes** and add:

   ```
   https://mail.google.com/
   ```

   This is the full Gmail access scope. It covers Gmail API message, draft,
   send, history, and watch operations. Click **Update** then **Save and Continue**.

   > **Note on scope sensitivity:** `https://mail.google.com/` is a
   > _restricted_ scope. For **Internal** apps this is fine. For **External**
   > apps, Google requires either completing the verification process (see
   > Step 6) or keeping the app in _Testing_ status (max 100 test users).

6. On the **Test users** screen (External apps only): add the Google accounts
   you want to be able to connect during development/testing. Production users
   cannot connect until the app passes verification.

7. Click **Save and Continue** → **Back to Dashboard**.

---

## Step 4 — Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → OAuth 2.0 Client ID**.
3. Set **Application type** to **Web application**.
4. Give it a name (e.g. `LLM Crafter API`).
5. Under **Authorized redirect URIs** click **+ Add URI** and enter:

   ```
   https://<your-api-domain>/api/v1/email/oauth/google/callback
   ```

   Replace `<your-api-domain>` with the public hostname of your LLM Crafter
   API (e.g. `api.yourcompany.com`). The path must match **exactly** —
   Google will reject any redirect that does not match.

   If you run a staging environment, add a second URI for it:

   ```
   https://staging-api.yourcompany.com/api/v1/email/oauth/google/callback
   ```

6. Click **Create**.
7. Copy the **Client ID** and **Client Secret** from the confirmation dialog.
   Store them securely — you will need them in the next step.

---

## Step 5 — Configure LLM Crafter environment variables

Add these to your `.env` file (or secrets manager / deployment environment):

```dotenv
# Gmail mailbox OAuth credentials from Google Cloud Console. These fall back
# to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET when not set.
GMAIL_OAUTH_CLIENT_ID=<your-client-id>
GMAIL_OAUTH_CLIENT_SECRET=<your-client-secret>

# Public base URL of this API instance — used to build the callback URL
# Must match what you registered in Google Cloud Console
API_BASE_URL=https://api.yourcompany.com

# Default post-OAuth redirect if the caller does not supply redirect_url
FRONTEND_URL=https://app.yourcompany.com

# Gmail API push synchronization
GMAIL_PUBSUB_TOPIC=projects/<google-cloud-project>/topics/gmail-mailbox-events
GMAIL_PUBSUB_AUDIENCE=https://api.yourcompany.com/api/v1/email/webhooks/google
GMAIL_PUBSUB_SERVICE_ACCOUNT=gmail-push@<google-cloud-project>.iam.gserviceaccount.com

# Optional worker and renewal controls
EMAIL_GMAIL_SYNC_WORKER_ENABLED=true
EMAIL_GMAIL_SYNC_CONCURRENCY=2
EMAIL_GMAIL_WATCH_SCHEDULER_ENABLED=true
EMAIL_GMAIL_WATCH_TICK_MS=3600000
```

Restart the API after changing environment variables.

---

## Step 6 — Configure Gmail Pub/Sub delivery

Use the same Google Cloud project that owns the OAuth client and has the Gmail
API enabled. Gmail requires the topic project to match the developer project
that makes the `users.watch` request.

The setup uses two different Google identities. Do not interchange them:

| Identity                                          | Purpose                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `gmail-api-push@system.gserviceaccount.com`       | Google-managed Gmail identity that publishes mailbox events to the topic     |
| `gmail-push@<project-id>.iam.gserviceaccount.com` | Your service account whose identity Pub/Sub puts in the webhook's OIDC token |

The instructions below use these example names:

| Setting                 | Example                     |
| ----------------------- | --------------------------- |
| Project ID              | `my-production-project`     |
| Topic ID                | `gmail-mailbox-events`      |
| Subscription ID         | `gmail-mailbox-events-push` |
| Push service account ID | `gmail-push`                |
| API domain              | `api.example.com`           |

### Option A — Configure with `gcloud` (recommended)

Run the following in [Google Cloud Shell](https://shell.cloud.google.com),
replacing the first two values. Keep `PUSH_ENDPOINT` and `OIDC_AUDIENCE`
identical unless your deployment explicitly uses a different token audience.

```bash
PROJECT_ID="my-production-project"
API_DOMAIN="api.example.com"
TOPIC_ID="gmail-mailbox-events"
SUBSCRIPTION_ID="gmail-mailbox-events-push"
PUSH_SERVICE_ACCOUNT_ID="gmail-push"
PUSH_ENDPOINT="https://${API_DOMAIN}/api/v1/email/webhooks/google"
OIDC_AUDIENCE="${PUSH_ENDPOINT}"

gcloud config set project "${PROJECT_ID}"

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
PUSH_SERVICE_ACCOUNT="${PUSH_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
PUBSUB_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
```

1. Enable Gmail, Pub/Sub, and IAM service-account APIs:

   ```bash
   gcloud services enable \
     gmail.googleapis.com \
     pubsub.googleapis.com \
     iam.googleapis.com \
     iamcredentials.googleapis.com
   ```

2. Create the topic:

   ```bash
   gcloud pubsub topics create "${TOPIC_ID}"
   ```

3. Allow Gmail to publish mailbox notifications to this topic:

   ```bash
   gcloud pubsub topics add-iam-policy-binding "${TOPIC_ID}" \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```

   If this command is rejected by a domain-restricted-sharing organization
   policy, add an exception for
   `gmail-api-push@system.gserviceaccount.com`. The watch cannot work without
   this external Google-managed principal.

4. Create the user-managed identity for authenticated webhook calls:

   ```bash
   gcloud iam service-accounts create "${PUSH_SERVICE_ACCOUNT_ID}" \
     --display-name="Gmail Pub/Sub push caller"
   ```

5. Ensure the Pub/Sub service agent exists, then allow it to mint OIDC tokens
   for the push service account:

   ```bash
   gcloud beta services identity create \
     --service="pubsub.googleapis.com" \
     --project="${PROJECT_ID}"

   gcloud iam service-accounts add-iam-policy-binding \
     "${PUSH_SERVICE_ACCOUNT}" \
     --member="serviceAccount:${PUBSUB_SERVICE_AGENT}" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

   The Pub/Sub service agent is Google-managed and has the form
   `service-<project-number>@gcp-sa-pubsub.iam.gserviceaccount.com`. It is not
   the same account as `gmail-push@...`.

6. Allow the administrator running the next command to attach the push service
   account to the subscription. Replace `ADMIN_EMAIL` with that administrator's
   Google account:

   ```bash
   ADMIN_EMAIL="operator@example.com"

   gcloud iam service-accounts add-iam-policy-binding \
     "${PUSH_SERVICE_ACCOUNT}" \
     --member="user:${ADMIN_EMAIL}" \
     --role="roles/iam.serviceAccountUser"
   ```

   Skip this binding only when the current principal already has
   `iam.serviceAccounts.actAs` on the push service account.

7. If LLM Crafter runs as an authenticated Cloud Run service, allow the push
   identity to invoke it:

   ```bash
   CLOUD_RUN_SERVICE="llm-crafter"
   CLOUD_RUN_REGION="us-central1"

   gcloud run services add-iam-policy-binding "${CLOUD_RUN_SERVICE}" \
     --region="${CLOUD_RUN_REGION}" \
     --member="serviceAccount:${PUSH_SERVICE_ACCOUNT}" \
     --role="roles/run.invoker"
   ```

   Omit this command when the endpoint is hosted elsewhere or the hosting
   platform does not use Cloud Run IAM. The endpoint must still be publicly
   reachable over HTTPS with a certificate trusted by a public certificate
   authority.

8. Create the authenticated push subscription:

   ```bash
   gcloud pubsub subscriptions create "${SUBSCRIPTION_ID}" \
     --topic="${TOPIC_ID}" \
     --push-endpoint="${PUSH_ENDPOINT}" \
     --push-auth-service-account="${PUSH_SERVICE_ACCOUNT}" \
     --push-auth-token-audience="${OIDC_AUDIENCE}" \
     --ack-deadline=30
   ```

   Do **not** enable payload unwrapping. The webhook expects the standard
   Pub/Sub JSON envelope and reads the Gmail payload from `message.data`.

9. Put the exact resulting values in the LLM Crafter environment:

   ```dotenv
   GMAIL_PUBSUB_TOPIC=projects/my-production-project/topics/gmail-mailbox-events
   GMAIL_PUBSUB_AUDIENCE=https://api.example.com/api/v1/email/webhooks/google
   GMAIL_PUBSUB_SERVICE_ACCOUNT=gmail-push@my-production-project.iam.gserviceaccount.com
   ```

   `GMAIL_PUBSUB_AUDIENCE` must exactly equal the subscription's OIDC audience,
   including scheme, host, path, case, and trailing slash. The examples do not
   use a trailing slash. Restart every API/worker instance after changing the
   environment.

### Option B — Configure in Google Cloud Console

1. Open **APIs & Services → Enabled APIs & services → Enable APIs and
   services**. Enable **Gmail API**, **Cloud Pub/Sub API**, **IAM API**, and
   **IAM Service Account Credentials API**.
2. Open **Pub/Sub → Topics**, click **Create topic**, enter
   `gmail-mailbox-events`, and create it. Do not select a schema.
3. Open the topic, select **Permissions**, and click **Grant access**. Enter
   `gmail-api-push@system.gserviceaccount.com` as the principal, select
   **Pub/Sub Publisher**, and save.
4. Open **IAM & Admin → Service Accounts**, click **Create service account**,
   enter `gmail-push`, and finish without granting project-wide roles.
5. Make sure the Pub/Sub service agent can mint an OIDC token for the
   `gmail-push@...` service account. In newer Google Cloud projects this is
   normally already allowed by the automatically assigned **Pub/Sub Service
   Agent** role, so no additional Console action is required.

   Do not use **Manage access** on the screen titled **Manage service account
   permissions**. That screen assigns project roles _to_ `gmail-push@...`; it
   does not grant another principal permission _on_ that service account.

   If creating the authenticated push subscription reports a token-creation
   or `iam.serviceAccounts.getOpenIdToken` permission error, use Cloud Shell
   to create the Pub/Sub service identity and add the resource-level binding:

   ```bash
   PROJECT_ID="my-production-project"
   PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" \
      --format='value(projectNumber)')"
   PUSH_SERVICE_ACCOUNT="gmail-push@${PROJECT_ID}.iam.gserviceaccount.com"
   PUBSUB_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

   gcloud beta services identity create \
      --service="pubsub.googleapis.com" \
      --project="${PROJECT_ID}"

   gcloud iam service-accounts add-iam-policy-binding \
      "${PUSH_SERVICE_ACCOUNT}" \
      --member="serviceAccount:${PUBSUB_SERVICE_AGENT}" \
      --role="roles/iam.serviceAccountTokenCreator"
   ```

   This command grants the Pub/Sub service agent access _to_ the
   `gmail-push@...` service account. It does not assign Token Creator to
   `gmail-push@...` itself.

6. On the same service account, grant **Service Account User** to the person or
   deployment identity that will create the subscription. This permits
   `iam.serviceAccounts.actAs`; it does not make that person the push caller.
7. Open **Pub/Sub → Subscriptions** and click **Create subscription**:

   | Console field             | Value                                                  |
   | ------------------------- | ------------------------------------------------------ |
   | Subscription ID           | `gmail-mailbox-events-push`                            |
   | Topic                     | `gmail-mailbox-events`                                 |
   | Delivery type             | **Push**                                               |
   | Endpoint URL              | `https://api.example.com/api/v1/email/webhooks/google` |
   | Enable authentication     | **Checked**                                            |
   | Service account           | `gmail-push@<project-id>.iam.gserviceaccount.com`      |
   | Audience                  | The exact endpoint URL above                           |
   | Enable payload unwrapping | **Unchecked**                                          |
   | Acknowledgment deadline   | `30` seconds                                           |

8. If the API is an authenticated Cloud Run service, open that service's
   **Permissions** tab and grant **Cloud Run Invoker** to the `gmail-push@...`
   service account.
9. Set the three LLM Crafter environment variables shown in Option A and
   restart the API and workers.

### Verify the Pub/Sub resources

Use these commands to catch naming, IAM, audience, or endpoint mistakes before
connecting a mailbox:

```bash
gcloud pubsub topics describe "${TOPIC_ID}"

gcloud pubsub topics get-iam-policy "${TOPIC_ID}" \
  --flatten="bindings[].members" \
  --filter="bindings.members:gmail-api-push@system.gserviceaccount.com"

gcloud pubsub subscriptions describe "${SUBSCRIPTION_ID}" \
  --format="yaml(topic,pushConfig,ackDeadlineSeconds)"
```

Confirm that the subscription output contains:

- The full expected topic resource name.
- The exact HTTPS webhook URL under `pushConfig.pushEndpoint`.
- `gmail-push@...` under `pushConfig.oidcToken.serviceAccountEmail`.
- The exact `GMAIL_PUBSUB_AUDIENCE` under
  `pushConfig.oidcToken.audience`.

Do not test the webhook with an unsigned `curl` request: it should return
`401` because the endpoint requires a Google-signed OIDC bearer token. Instead,
connect or reconnect one Gmail mailbox after the API restarts. A successful
`users.watch` call immediately publishes an initial notification. Verify:

1. The account has `state.gmail_watch_expiration` and no
   `state.gmail_last_watch_error`.
2. The webhook responds with HTTP `204` in the API logs.
3. An `email.gmail-sync` job is created and completed.
4. Sending a new message to the connected mailbox advances
   `state.gmail_history_id` and creates or updates the expected conversation.

LLM Crafter calls `users.watch` separately for each connected mailbox. All
watches can publish to this shared topic because each notification includes
the changed mailbox address and history ID. Watches expire, so the built-in
scheduler renews them before expiration. Periodic History polling remains a
fallback for delayed or missed push delivery.

## Step 7 — Publish the app (External apps going to production)

> **Skip this step** if you chose **Internal** user type in Step 3.

While the consent screen is in **Testing** status, only accounts you added
as test users can connect. To allow any Google account:

1. Go to **APIs & Services → OAuth consent screen**.
2. Click **Publish App** → **Confirm**.

Because you are requesting the restricted `https://mail.google.com/` scope,
Google will require a **security review** before the app is published. This
process involves:

- Completing the OAuth verification form at the link Google presents.
- Providing a privacy policy URL.
- Providing a homepage URL.
- Demonstrating how the scope is used (Google may request a video walkthrough).
- Waiting for Google's review (typically 1–4 weeks for restricted scopes).

While the review is pending, test users you added can still connect. Production
rollout should be timed after verification completes.

> **Tip:** If your product is an internal tool or a B2B platform where you can
> control which Google Workspace organizations use it, switching to **Internal**
> user type and requiring customers to add your app to their Workspace avoids
> the verification process entirely.

---

## Step 8 — Verify the setup

Use the test endpoint to confirm everything is wired up:

```http
GET /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/oauth/google/authorize
Authorization: Bearer <admin-jwt>
```

Expected response:

```json
{
  "url": "https://accounts.google.com/o/oauth2/auth?client_id=..."
}
```

Open the URL in a browser, complete the consent flow, and verify you land back
on your frontend with `?status=ok&account_id=...&email=...` in the query string.

Then send a new message to the connected mailbox and verify the Pub/Sub push
returns HTTP 204 and an `email.gmail-sync` job is processed. The watch scheduler
automatically upgrades existing Gmail OAuth records from `imap_poll` to
`oauth_push` after watch registration succeeds. Reconnect only if the stored
refresh token is missing or has been revoked.

---

## Checklist

- [ ] Google Cloud project created and Gmail API enabled
- [ ] OAuth consent screen configured (app name, support email, `https://mail.google.com/` scope)
- [ ] OAuth 2.0 Web Application client created
- [ ] `https://<api-domain>/api/v1/email/oauth/google/callback` added as authorized redirect URI
- [ ] Gmail OAuth credentials and `API_BASE_URL` set in environment
- [ ] Pub/Sub topic grants Gmail's publisher identity `roles/pubsub.publisher`
- [ ] Authenticated push subscription targets `/api/v1/email/webhooks/google`
- [ ] Push OIDC audience and service account match the environment
- [ ] API restarted after env change
- [ ] Authorize endpoint returns a valid Google URL
- [ ] End-to-end flow tested with a real Google account
- [ ] (External apps) App published and verification submitted, or test users added for pre-launch

---

## Troubleshooting

| Symptom                                                | Likely cause                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch` error on Google's screen       | The `API_BASE_URL` env var doesn't match the URI registered in Cloud Console. They must be identical including scheme and trailing path. |
| `access_denied` immediately                            | The app is in Testing mode and the user is not on the test users list.                                                                   |
| `invalid_client` error                                 | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is wrong or the env var wasn't picked up after restart.                                     |
| Consent screen shows "This app isn't verified" warning | Normal for External apps before verification. Users can click "Advanced → Go to app" to proceed during testing.                          |
| Token refresh fails after user revokes access          | The user needs to go through the consent flow again. Call the authorize endpoint with their existing `accountId` to reconnect.           |
| Scope not shown on consent screen                      | The `https://mail.google.com/` scope wasn't added in the consent screen configuration. Revisit Step 3.                                   |
| Push endpoint returns `401` or `403`                   | The subscription's OIDC audience or service account does not match `GMAIL_PUBSUB_AUDIENCE` / `GMAIL_PUBSUB_SERVICE_ACCOUNT`.             |
| No push arrives after connection                       | Check the Gmail publisher IAM grant on the topic and inspect `state.gmail_last_watch_error` on the mail account.                         |
