/**
 * OutboundEmailController — manage the outbound queue and drafts.
 *
 * Drafts (`state='drafted'`) are surfaced here so a human reviewer can edit
 * and approve them. Editing a draft only mutates content fields (subject,
 * text, html, cc, bcc) — addressing/threading fields stay locked to keep
 * the reply consistent with the original thread.
 *
 * Multi-instance safety:
 *   - "Send a draft" flips state via atomic `findOneAndUpdate({_id, state:'drafted'}, {state:'queued'})`,
 *     so two simultaneous send clicks cannot both succeed.
 *   - "Cancel" / "Retry" use the same pattern.
 *
 * Routes are scoped under a MailAccount so we can authorise by agent ownership.
 */

const Agent = require('../models/Agent');
const MailAccount = require('../models/MailAccount');
const OutboundEmail = require('../models/OutboundEmail');
const Conversation = require('../models/Conversation');

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

async function getOutboundOr404(req, res, accountId) {
  const outbound = await OutboundEmail.findOne({
    _id: req.params.outboundId,
    mail_account: accountId,
  });
  if (!outbound) {
    res.status(404).json({ error: 'OutboundEmail not found' });
    return null;
  }
  return outbound;
}

/**
 * List outbound rows for the account.
 *
 * Query params:
 *   - state  : filter by state (drafted | queued | sending | sent | failed | cancelled)
 *              Comma-separated values supported.
 *   - limit  : default 50, max 200
 *   - since  : ISO timestamp — only include rows newer than this
 */
const listOutbound = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const filter = { mail_account: account._id };
    if (req.query.state) {
      const states = String(req.query.state).split(',').map(s => s.trim());
      filter.state = states.length === 1 ? states[0] : { $in: states };
    }
    if (req.query.since) {
      const d = new Date(req.query.since);
      if (!Number.isNaN(d.getTime())) filter.createdAt = { $gte: d };
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const items = await OutboundEmail.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ count: items.length, items });
  } catch (err) {
    console.error('[Outbound] list error:', err);
    res.status(500).json({ error: 'Failed to list outbound emails' });
  }
};

const getOutbound = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;
    const outbound = await getOutboundOr404(req, res, account._id);
    if (!outbound) return;
    res.json(outbound);
  } catch (err) {
    console.error('[Outbound] get error:', err);
    res.status(500).json({ error: 'Failed to fetch outbound email' });
  }
};

/**
 * Edit a draft. Only mutates content fields — never the threading or
 * addressing identity. Returns 409 if the row is no longer in `drafted`
 * state (e.g. it was already sent in another tab).
 */
const updateDraft = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;
    const outbound = await getOutboundOr404(req, res, account._id);
    if (!outbound) return;

    if (outbound.state !== 'drafted') {
      return res.status(409).json({
        error: `Only drafts can be edited (current state: ${outbound.state})`,
      });
    }

    const body = req.body || {};
    const editable = ['subject', 'text', 'html', 'cc', 'bcc'];
    for (const key of editable) {
      if (body[key] !== undefined) outbound[key] = body[key];
    }

    await outbound.save();

    // Keep the conversation message in sync so the thread view shows the
    // edited body instead of the original AI-drafted content.
    if (outbound.conversation && body.text !== undefined) {
      await Conversation.updateOne(
        {
          _id: outbound.conversation,
          'messages.metadata.outbound_id': outbound._id,
        },
        { $set: { 'messages.$.content': outbound.text } }
      ).catch(() => {});
    }

    res.json(outbound);
  } catch (err) {
    console.error('[Outbound] update draft error:', err);
    res.status(400).json({ error: 'Failed to update draft' });
  }
};

/**
 * Approve a draft and put it in the send queue. Atomic state transition —
 * only one approver wins if clicked simultaneously.
 */
const sendDraft = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const claimed = await OutboundEmail.findOneAndUpdate(
      {
        _id: req.params.outboundId,
        mail_account: account._id,
        state: 'drafted',
      },
      {
        $set: {
          state: 'queued',
          reason: 'manual',
          last_error: null,
        },
      },
      { new: true }
    );

    if (!claimed) {
      return res.status(409).json({
        error:
          'Draft not found or no longer in drafted state (may have been sent or cancelled).',
      });
    }

    // Sync state, final content, and timestamp on the conversation message
    // so the thread view reflects what was actually sent.
    if (claimed.conversation) {
      await Conversation.updateOne(
        {
          _id: claimed.conversation,
          'messages.metadata.outbound_id': claimed._id,
        },
        {
          $set: {
            'messages.$.metadata.outbound_state': 'queued',
            'messages.$.content': claimed.text,
            'messages.$.timestamp': new Date(),
          },
        }
      ).catch(() => {});
    }

    res.json(claimed);
  } catch (err) {
    console.error('[Outbound] send draft error:', err);
    res.status(500).json({ error: 'Failed to queue draft for sending' });
  }
};

/**
 * Cancel a draft or queued message. Once `sending` or `sent` we cannot recall.
 */
const cancelOutbound = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const claimed = await OutboundEmail.findOneAndUpdate(
      {
        _id: req.params.outboundId,
        mail_account: account._id,
        state: { $in: ['drafted', 'queued'] },
      },
      { $set: { state: 'cancelled' } },
      { new: true }
    );

    if (!claimed) {
      return res.status(409).json({
        error:
          'Cannot cancel — message is not in drafted or queued state (may already be sending/sent).',
      });
    }

    res.json(claimed);
  } catch (err) {
    console.error('[Outbound] cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel outbound email' });
  }
};

/**
 * Retry a failed outbound — resets state to queued and clears attempts.
 * The outbound worker will pick it up on its next claim cycle.
 */
const retryOutbound = async (req, res) => {
  try {
    const agent = await getAgentOr404(req, res);
    if (!agent) return;
    const account = await getAccountOr404(req, res, agent._id);
    if (!account) return;

    const claimed = await OutboundEmail.findOneAndUpdate(
      {
        _id: req.params.outboundId,
        mail_account: account._id,
        state: 'failed',
      },
      {
        $set: {
          state: 'queued',
          attempts: 0,
          last_error: null,
          claimed_by: null,
          claimed_at: null,
        },
      },
      { new: true }
    );

    if (!claimed) {
      return res
        .status(409)
        .json({ error: 'Only failed outbound emails can be retried.' });
    }

    res.json(claimed);
  } catch (err) {
    console.error('[Outbound] retry error:', err);
    res.status(500).json({ error: 'Failed to retry outbound email' });
  }
};

module.exports = {
  listOutbound,
  getOutbound,
  updateDraft,
  sendDraft,
  cancelOutbound,
  retryOutbound,
};
