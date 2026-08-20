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
4. The client ID and secret stored in LLM Crafter's environment.

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

   This is the full Gmail access scope. It covers IMAP read, SMTP send, and
   IMAP append (for saving drafts). Click **Update** then **Save and Continue**.

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
# Gmail OAuth credentials from Google Cloud Console
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Public base URL of this API instance — used to build the callback URL
# Must match what you registered in Google Cloud Console
API_BASE_URL=https://api.yourcompany.com

# Default post-OAuth redirect if the caller does not supply redirect_url
FRONTEND_URL=https://app.yourcompany.com
```

Restart the API after changing environment variables.

---

## Step 6 — Publish the app (External apps going to production)

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

## Step 7 — Verify the setup

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

---

## Checklist

- [ ] Google Cloud project created and Gmail API enabled
- [ ] OAuth consent screen configured (app name, support email, `https://mail.google.com/` scope)
- [ ] OAuth 2.0 Web Application client created
- [ ] `https://<api-domain>/api/v1/email/oauth/google/callback` added as authorized redirect URI
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `API_BASE_URL` set in environment
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
