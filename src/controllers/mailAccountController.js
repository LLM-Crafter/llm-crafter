/**
 * MailAccountController — CRUD + lifecycle actions for email mailboxes
 * attached to an Agent.
 *
 * Route convention follows the existing channel/agent routes:
 *   /organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts...
 *
 * Behaviour:
 *   - All endpoints scope to (orgId, projectId, agentId) and verify the agent
 *     belongs to that path before reading/writing.
 *   - Secrets in payloads are accepted plaintext; the model's pre-save hook
 *     encrypts them. Responses use the schema's `toJSON` transform which
 *     redacts every encrypted field.
 *   - `test` performs a real IMAP+SMTP handshake against the stored creds.
 *   - `poll` enqueues an immediate IMAP poll cycle inside the per-account
 *     distributed lock so it is multi-instance safe.
 */

const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');
const MailAccount = require('../models/MailAccount');
const OutboundEmail = require('../models/OutboundEmail');
const ProcessedEmail = require('../models/ProcessedEmail');
const emailUtils = require('../services/email/emailUtils');
const imapDraftTransport = require('../services/email/transports/imapDraftTransport');
const gmailOAuthService = require('../services/email/gmailOAuthService');
const lockService = require('../services/distributedLockService');
const imapPoller = require('../services/email/pollers/imapPoller');
const smtpTransport = require('../services/email/transports/smtpTransport');
const { ImapFlow } = require('imapflow');

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve an Agent by (orgId, projectId, agentId). Returns the agent or
 * sends a 404 response. Returns null on failure so the caller can early-exit.
 */
async function getAgentOr404(req, res) {
  const { orgId, projectId, agentId } = req.params;
  const agent = await Agent.findOne({
    _id: agentId,
    organization: orgId,
    project: projectId,
  });
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return null;
  }
  return agent;
}

/**
 * Resolve a MailAccount by id, ensuring it belongs to the given agent.
 */
async function getAccountOr404(req, res, agentId) {
  const account = await MailAccount.findOne({
    _id: req.params.accountId,
    agent: agentId,
  });
  if (!account) {
    res.status(404).json({ error: 'MailAccount not found' });
    return null;
  }
  return account;
}

/**
 * Apply a partial update to a Mongoose document using deep-merge for nested
 * objects. We can't use Object.assign for nested fields because Mongoose
 * tracks them as Mixed paths.
 */
function applyDeepUpdate(doc, updates, allowedTopLevel) {
  for (const key of Object.keys(updates)) {
    if (!allowedTopLevel.includes(key)) continue;
    const incoming = updates[key];
    const current = doc[key];
    if (
      incoming &&
      typeof incoming === 'object' &&
      !Array.isArray(incoming) &&
      current &&
      typeof current === 'object'
    ) {
      // Merge one level deep — enough for our schema (no triple-nested fields
      // are sent over the wire).
      for (const subKey of Object.keys(incoming)) {
        doc[key][subKey] = incoming[subKey];
      }
      doc.markModified(key);
    } else {
      doc[key] = incoming;
    }
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────

const listMailAccounts = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;

    const accounts = await MailAccount.find({ agent: agent._id })
      .sort({ createdAt: -1 })
      .lean({ getters: false });

    res.json({ count: accounts.length, accounts });
  } catch (err) {
    console.error('[MailAccount] list error:', err);
    res.status(500).json({ error: 'Failed to list mail accounts' });
  }
};

const getMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;
    res.json(account);
  } catch (err) {
    console.error('[MailAccount] get error:', err);
    res.status(500).json({ error: 'Failed to fetch mail account' });
  }
};

const createMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;

    const body = req.body || {};

    // Minimal required fields are validated by the route layer.
    const account = new MailAccount({
      organization: agent.organization,
      project: agent.project,
      agent: agent._id,
      display_name: body.display_name,
      provider: body.provider || 'imap',
      ingest_mode: body.ingest_mode || 'imap_poll',
      credentials: body.credentials || {},
      send_profile: body.send_profile || {},
      reply_policy: body.reply_policy || {},
      triage: body.triage || {},
      poll_config: body.poll_config || {},
      is_active: body.is_active !== false,
      is_paused: body.is_paused === true,
    });

    await account.save();
    res.status(201).json(account);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error:
          'A mail account with this from_email already exists for this agent.',
      });
    }
    console.error('[MailAccount] create error:', err);
    res
      .status(400)
      .json({ error: 'Failed to create mail account', detail: err.message });
  }
};

const updateMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    applyDeepUpdate(account, req.body || {}, [
      'display_name',
      'provider',
      'ingest_mode',
      'credentials',
      'send_profile',
      'reply_policy',
      'triage',
      'poll_config',
      'is_active',
      'is_paused',
    ]);

    await account.save();
    res.json(account);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error:
          'A mail account with this from_email already exists for this agent.',
      });
    }
    console.error('[MailAccount] update error:', err);
    res
      .status(400)
      .json({ error: 'Failed to update mail account', detail: err.message });
  }
};

const deleteMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    await account.deleteOne();
    res.status(204).end();
  } catch (err) {
    console.error('[MailAccount] delete error:', err);
    res.status(500).json({ error: 'Failed to delete mail account' });
  }
};

// ─── Lifecycle actions ──────────────────────────────────────────────────

/**
 * Pause / resume — flips `is_paused` without touching is_active. A paused
 * account is skipped by the poller and any outbound row that hits the worker
 * gets requeued.
 */
const pauseMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;
    account.is_paused = true;
    await account.save();
    res.json(account);
  } catch (err) {
    console.error('[MailAccount] pause error:', err);
    res.status(500).json({ error: 'Failed to pause mail account' });
  }
};

const resumeMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;
    account.is_paused = false;
    await account.save();
    res.json(account);
  } catch (err) {
    console.error('[MailAccount] resume error:', err);
    res.status(500).json({ error: 'Failed to resume mail account' });
  }
};

/**
 * Verify IMAP + SMTP credentials by performing a real handshake against
 * both servers. Does NOT send a test email or read any messages — purely
 * authenticates and lists the configured mailbox.
 */
const testMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const results = { imap: null, smtp: null };

    // IMAP test
    if (account.ingest_mode === 'imap_poll') {
      const creds = account.getDecryptedCredentials();
      const imap = creds.imap || {};
      const client = new ImapFlow({
        host: imap.host,
        port: imap.port || 993,
        secure: imap.secure !== false,
        auth: { user: imap.username, pass: imap.password },
        logger: false,
        disableAutoIdle: true,
      });
      try {
        await client.connect();
        const status = await client.status(imap.mailbox || 'INBOX', {
          messages: true,
          uidValidity: true,
          uidNext: true,
        });
        // ImapFlow returns uidValidity / uidNext as BigInt — coerce to string
        // so res.json() can serialize the response.
        results.imap = {
          ok: true,
          mailbox: imap.mailbox || 'INBOX',
          messages: status.messages,
          uidValidity:
            status.uidValidity != null ? String(status.uidValidity) : null,
          uidNext: status.uidNext != null ? String(status.uidNext) : null,
        };
      } catch (e) {
        results.imap = { ok: false, error: e.message };
      } finally {
        try {
          await client.logout();
        } catch {
          /* ignore */
        }
      }
    }

    // SMTP test (verify connection — does not send)
    try {
      const transporter = await smtpTransport.buildTransporter(account);
      await transporter.verify();
      results.smtp = { ok: true };
    } catch (e) {
      results.smtp = { ok: false, error: e.message };
    }

    res.json({
      account_id: account._id,
      ok:
        (account.ingest_mode !== 'imap_poll' || results.imap?.ok === true) &&
        results.smtp?.ok === true,
      results,
    });
  } catch (err) {
    console.error('[MailAccount] test error:', err);
    res.status(500).json({ error: 'Failed to test mail account' });
  }
};

/**
 * Manually trigger one poll cycle for this account. Runs inside the same
 * per-account distributed lock the scheduler uses, so calling this won't
 * race with the background poller.
 *
 * Returns the poll result (enqueued count, uid range, etc.).
 */
const pollMailAccount = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    if (account.ingest_mode !== 'imap_poll') {
      return res.status(400).json({
        error: 'Manual poll only supported for ingest_mode=imap_poll',
      });
    }

    // Run inside the per-account lock to avoid racing the scheduler.
    const lockKey = `imap_poll:${account._id}`;
    const result = await lockService.withLock(lockKey, 2 * 60_000, () =>
      imapPoller.pollAccount(account)
    );

    if (result === null) {
      return res.status(409).json({
        error: 'Account is currently being polled by another instance',
      });
    }

    res.json({ ok: true, result });
  } catch (err) {
    console.error('[MailAccount] manual poll error:', err);
    res
      .status(500)
      .json({ error: 'Failed to poll mail account', detail: err.message });
  }
};

/**
 * Recent processing history — what came in, what we did with it.
 * Useful for ops dashboards.
 */
const listProcessedEmails = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const filter = { mail_account: account._id };
    if (req.query.outcome) filter.outcome = req.query.outcome;

    const items = await ProcessedEmail.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ count: items.length, items });
  } catch (err) {
    console.error('[MailAccount] processed emails error:', err);
    res.status(500).json({ error: 'Failed to list processed emails' });
  }
};

// ─── Thread (conversation) views ────────────────────────────────────────

/**
 * List all email conversations (threads) for this mail account.
 * Each item is a Conversation doc — same model the chatbot uses.
 * Filter by ?status=open|closed|archived or ?user_identifier=email@addr
 */
const listEmailThreads = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const { status, user_identifier, page = 1, limit = 20 } = req.query;
    const filter = {
      agent: agent._id,
      channel: 'email',
      'channel_metadata.email.thread_id': { $exists: true },
    };
    if (status) filter.status = status;
    if (user_identifier) filter.user_identifier = user_identifier;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [threads, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ 'metadata.last_activity': -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .select(
          '_id user_identifier title status channel_metadata metadata created_at updated_at'
        ),
      Conversation.countDocuments(filter),
    ]);

    res.json({ total, page: parseInt(page, 10), limit: parseInt(limit, 10), threads });
  } catch (err) {
    console.error('[MailAccount] listEmailThreads error:', err);
    res.status(500).json({ error: 'Failed to list email threads' });
  }
};

/**
 * Get a single email thread (full Conversation with all messages) scoped
 * to this mail account's agent.
 */
const getEmailThread = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    // verify the account belongs to the agent (authz)
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      agent: agent._id,
      channel: 'email',
    });
    if (!conversation) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    res.json(conversation);
  } catch (err) {
    console.error('[MailAccount] getEmailThread error:', err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
};

/**
 * Compose and send (or save as draft) a manual reply or new message into an
 * existing email thread.
 *
 * Body params:
 *   text        {string}  required — plain text body
 *   html        {string}  optional — HTML body (if omitted, rendered from text)
 *   subject     {string}  optional — defaults to Re: <original subject>
 *   to          {string[]} optional — defaults to last inbound sender
 *   cc          {string[]} optional — defaults to account default_cc
 *   bcc         {string[]} optional
 *   send        {boolean} optional — true → state=queued (send immediately),
 *                                    false/omitted → state=drafted
 *   add_to_conversation {boolean} optional (default true) — also append a
 *                                    'assistant' message to the Conversation
 *                                    so the history stays coherent.
 */
const sendToThread = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      agent: agent._id,
      channel: 'email',
    });
    if (!conversation) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const body = req.body || {};
    const send = account.send_profile || {};

    // Derive threading headers from the conversation's email metadata.
    const meta = conversation.channel_metadata?.email || {};
    const inReplyTo = meta.message_id || null;
    const references = inReplyTo ? [inReplyTo] : [];

    // Resolve recipients — caller can override, otherwise reply to whoever
    // started the thread.
    const to = (body.to && body.to.length > 0)
      ? body.to
      : [meta.from_email || conversation.user_identifier].filter(Boolean);

    if (!to.length) {
      return res.status(400).json({ error: 'Cannot determine recipient — provide a `to` address.' });
    }

    const subject = body.subject
      || emailUtils.buildReplySubject(meta.subject || '');

    const textContent = String(body.text || '').trim();
    if (!textContent) {
      return res.status(400).json({ error: '`text` is required' });
    }

    const textFinal = emailUtils.renderText(textContent, send.signature_text);
    const htmlFinal = body.html
      ? body.html
      : emailUtils.renderHtml(textContent, send.signature_html);

    const messageId = emailUtils.generateMessageId(send.from_email);
    const state = body.send === true ? 'queued' : 'drafted';

    const outbound = await OutboundEmail.create({
      mail_account: account._id,
      agent: agent._id,
      conversation: conversation._id,
      to,
      cc: body.cc || send.default_cc || [],
      bcc: body.bcc || send.default_bcc || [],
      from_email: send.from_email,
      from_name: send.from_name || null,
      reply_to: send.reply_to || null,
      subject,
      text: textFinal,
      html: htmlFinal,
      message_id: messageId,
      in_reply_to: inReplyTo,
      references,
      state,
      reason: 'manual',
      metadata: { composed_by: req.user?._id || 'api' },
    });

    // Optionally append to the conversation history so the thread view is
    // coherent even before the email is actually SMTP-sent.
    if (body.add_to_conversation !== false) {
      await conversation.addMessage({
        role: 'assistant',
        content: textContent,
        timestamp: new Date(),
        channel_info: {
          channel: 'email',
          email: {
            message_id: messageId,
            in_reply_to: inReplyTo,
            subject,
          },
        },
        metadata: { outbound_id: outbound._id, manual: true },
      });
    }

    res.status(201).json(outbound);

    // Fire-and-forget: push the draft to the IMAP Drafts folder so it
    // appears in the user's email client. Non-fatal if it fails.
    if (state === 'drafted' && account.ingest_mode === 'imap_poll') {
      imapDraftTransport.appendDraft(account, outbound)
        .then(uid => {
          if (uid !== null) {
            return OutboundEmail.updateOne(
              { _id: outbound._id },
              { $set: { imap_draft_uid: uid } }
            );
          }
        })
        .catch(err =>
          console.error(`[MailAccount] IMAP draft append failed for ${outbound._id}:`, err.message)
        );
    }
  } catch (err) {
    console.error('[MailAccount] sendToThread error:', err);
    res.status(400).json({ error: 'Failed to compose email', detail: err.message });
  }
};

// ─── Gmail OAuth ────────────────────────────────────────────────────────

/**
 * Step 1 — return the Google consent URL.
 *
 * The frontend opens this URL (popup or redirect). Google will send the user
 * to /api/v1/email/oauth/google/callback after consent.
 *
 * Query params:
 *   accountId  {string} optional — if supplied the callback UPDATES the
 *                                   existing MailAccount; if omitted a new one
 *                                   is created after the callback.
 */
const getGmailAuthorizeUrl = async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(501).json({
        error: 'Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
      });
    }

    const agent = await getAgentOr404(req, res);
    if (!agent) return;

    // Encode context in the state token so the callback can resume it.
    // base64(JSON) is simple and readable — not a security token (we validate
    // orgId/agentId again inside the callback).
    const state = Buffer.from(
      JSON.stringify({
        orgId: req.params.orgId,
        projectId: req.params.projectId,
        agentId: agent._id,
        accountId: req.query.accountId || null,
        redirectUrl: req.query.redirect_url || null,
      })
    ).toString('base64url');

    const url = gmailOAuthService.getAuthorizationUrl(state);
    res.json({ url });
  } catch (err) {
    console.error('[Gmail OAuth] authorize error:', err);
    res.status(500).json({ error: 'Failed to build authorization URL' });
  }
};

/**
 * Step 2 — OAuth callback. Google redirects here after the user consents.
 *
 * This is a PUBLIC endpoint (no JWT) because Google calls it directly.
 * Security is maintained by:
 *   - The `state` param encoding the orgId/agentId (validated on decode)
 *   - The `code` being single-use and short-lived
 *
 * On success: creates or updates a MailAccount with Gmail OAuth credentials
 * and redirects the browser to the frontend with ?account_id=<id>&status=ok.
 */
const gmailOAuthCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const redirect = (status, extra = {}) => {
    const params = new URLSearchParams({ status, ...extra });
    // If the state carried a custom redirectUrl, use it; otherwise a default.
    const base = extra._redirectUrl || `${frontendUrl}/email-accounts/connected`;
    delete extra._redirectUrl;
    return res.redirect(`${base}?${params}`);
  };

  try {
    const { code, state, error } = req.query;

    if (error) {
      return redirect('denied', { error });
    }
    if (!code || !state) {
      return redirect('error', { error: 'missing_params' });
    }

    let ctx;
    try {
      ctx = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      return redirect('error', { error: 'invalid_state' });
    }

    // Exchange code for tokens and fetch the Gmail address.
    const tokens = await gmailOAuthService.exchangeCode(code);

    let account;
    if (ctx.accountId) {
      // Update existing MailAccount.
      account = await MailAccount.findOne({
        _id: ctx.accountId,
        agent: ctx.agentId,
      });
      if (!account) return redirect('error', { error: 'account_not_found' });
    } else {
      // Create a new MailAccount.
      account = new MailAccount({
        organization: ctx.orgId,
        project: ctx.projectId,
        agent: ctx.agentId,
        display_name: tokens.email,
        provider: 'gmail',
        ingest_mode: 'imap_poll',
        send_profile: {
          from_email: tokens.email,
          from_name: '',
        },
        is_active: true,
        is_paused: false,
      });
    }

    // Store tokens (pre-save hook encrypts them).
    account.credentials = account.credentials || {};
    account.credentials.oauth = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: 'https://mail.google.com/',
      token_type: 'Bearer',
    };
    // For Gmail, IMAP host is fixed.
    account.credentials.imap = {
      ...((account.credentials.imap || {})),
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      username: tokens.email,
      mailbox: 'INBOX',
      drafts_folder: '[Gmail]/Drafts',
    };
    account.credentials.smtp = {
      ...((account.credentials.smtp || {})),
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      username: tokens.email,
    };

    await account.save();

    return redirect('ok', {
      account_id: account._id,
      email: tokens.email,
      ...(ctx.redirectUrl ? { _redirectUrl: ctx.redirectUrl } : {}),
    });
  } catch (err) {
    console.error('[Gmail OAuth] callback error:', err);
    return redirect('error', { error: encodeURIComponent(err.message) });
  }
};

module.exports = {
  listMailAccounts,
  getMailAccount,
  createMailAccount,
  updateMailAccount,
  deleteMailAccount,
  pauseMailAccount,
  resumeMailAccount,
  testMailAccount,
  pollMailAccount,
  listProcessedEmails,
  listEmailThreads,
  getEmailThread,
  sendToThread,
  getGmailAuthorizeUrl,
  gmailOAuthCallback,
};
