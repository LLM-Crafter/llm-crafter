/**
 * Mail Account Routes
 * REST surface for managing email mailboxes attached to an Agent.
 *
 * Mount point (set in app.js):
 *   /api/v1
 *
 * Resource path:
 *   /organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts
 *
 * Sub-resources:
 *   /mail-accounts/:accountId/outbound          — drafts & sent log
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const mailAccountController = require('../controllers/mailAccountController');
const outboundController = require('../controllers/outboundEmailController');
const gmailWebhookController = require('../controllers/gmailWebhookController');
const auth = require('../middleware/auth');
const organizationAuth = require('../middleware/organizationAuth');
const validate = require('../middleware/validate');

// ─── Validators ─────────────────────────────────────────────────────────

const baseScope = [
  param('orgId').isString().notEmpty(),
  param('projectId').isString().notEmpty(),
  param('agentId').isString().notEmpty(),
];

const createValidators = [
  ...baseScope,
  body('display_name').isString().trim().notEmpty(),
  body('provider')
    .optional()
    .isIn(['imap', 'gmail', 'graph', 'sendgrid_inbound', 'mailgun', 'ses']),
  body('ingest_mode')
    .optional()
    .isIn(['imap_poll', 'oauth_push', 'webhook']),
  body('send_profile').isObject(),
  body('send_profile.from_email').isEmail(),
  body('send_profile.from_name').optional().isString(),
  body('send_profile.signature_html').optional().isString(),
  body('send_profile.signature_text').optional().isString(),
  body('send_profile.default_cc').optional().isArray(),
  body('send_profile.default_bcc').optional().isArray(),
  body('credentials').optional().isObject(),
  body('reply_policy').optional().isObject(),
  body('reply_policy.mode')
    .optional()
    .isIn(['draft_only', 'auto_send', 'confidence_based', 'human_review']),
  body('reply_policy.auto_send_min_confidence')
    .optional()
    .isFloat({ min: 0, max: 1 }),
  body('triage').optional().isObject(),
  body('poll_config').optional().isObject(),
  body('poll_config.interval_seconds').optional().isInt({ min: 15 }),
];

const updateValidators = [
  ...baseScope,
  param('accountId').isString().notEmpty(),
  body('display_name').optional().isString().trim().notEmpty(),
  body('send_profile').optional().isObject(),
  body('reply_policy').optional().isObject(),
  body('reply_policy.mode')
    .optional()
    .isIn(['draft_only', 'auto_send', 'confidence_based', 'human_review']),
  body('reply_policy.auto_send_min_confidence')
    .optional()
    .isFloat({ min: 0, max: 1 }),
  body('triage').optional().isObject(),
  body('poll_config').optional().isObject(),
  body('credentials').optional().isObject(),
  body('is_active').optional().isBoolean(),
  body('is_paused').optional().isBoolean(),
];

const accountIdParam = [...baseScope, param('accountId').isString().notEmpty()];
const outboundIdParam = [
  ...accountIdParam,
  param('outboundId').isString().notEmpty(),
];

// ─── MailAccount CRUD ───────────────────────────────────────────────────

router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts',
  auth,
  organizationAuth.hasRole('viewer'),
  baseScope,
  validate,
  mailAccountController.listMailAccounts
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts',
  auth,
  organizationAuth.hasRole('admin'),
  createValidators,
  validate,
  mailAccountController.createMailAccount
);

router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId',
  auth,
  organizationAuth.hasRole('viewer'),
  accountIdParam,
  validate,
  mailAccountController.getMailAccount
);

router.put(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId',
  auth,
  organizationAuth.hasRole('admin'),
  updateValidators,
  validate,
  mailAccountController.updateMailAccount
);

router.delete(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId',
  auth,
  organizationAuth.hasRole('admin'),
  accountIdParam,
  validate,
  mailAccountController.deleteMailAccount
);

// ─── Lifecycle actions ──────────────────────────────────────────────────

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/pause',
  auth,
  organizationAuth.hasRole('member'),
  accountIdParam,
  validate,
  mailAccountController.pauseMailAccount
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/resume',
  auth,
  organizationAuth.hasRole('member'),
  accountIdParam,
  validate,
  mailAccountController.resumeMailAccount
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/test',
  auth,
  organizationAuth.hasRole('member'),
  accountIdParam,
  validate,
  mailAccountController.testMailAccount
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/poll',
  auth,
  organizationAuth.hasRole('member'),
  accountIdParam,
  validate,
  mailAccountController.pollMailAccount
);

router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/processed',
  auth,
  organizationAuth.hasRole('viewer'),
  accountIdParam,
  query('outcome').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  validate,
  mailAccountController.listProcessedEmails
);

// ─── Outbound / drafts ──────────────────────────────────────────────────

router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/outbound',
  auth,
  organizationAuth.hasRole('viewer'),
  accountIdParam,
  query('state').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('since').optional().isISO8601(),
  validate,
  outboundController.listOutbound
);

router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/outbound/:outboundId',
  auth,
  organizationAuth.hasRole('viewer'),
  outboundIdParam,
  validate,
  outboundController.getOutbound
);

router.put(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/outbound/:outboundId',
  auth,
  organizationAuth.hasRole('member'),
  outboundIdParam,
  body('subject').optional().isString(),
  body('text').optional().isString(),
  body('html').optional().isString(),
  body('cc').optional().isArray(),
  body('bcc').optional().isArray(),
  validate,
  outboundController.updateDraft
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/outbound/:outboundId/send',
  auth,
  organizationAuth.hasRole('member'),
  outboundIdParam,
  body('cc').optional().isArray(),
  body('bcc').optional().isArray(),
  validate,
  outboundController.sendDraft
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/outbound/:outboundId/cancel',
  auth,
  organizationAuth.hasRole('member'),
  outboundIdParam,
  validate,
  outboundController.cancelOutbound
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/outbound/:outboundId/retry',
  auth,
  organizationAuth.hasRole('member'),
  outboundIdParam,
  validate,
  outboundController.retryOutbound
);

// ─── Email threads (Conversation view) ─────────────────────────────────

const threadParam = [...accountIdParam, param('conversationId').isString().notEmpty()];

router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/threads',
  auth,
  organizationAuth.hasRole('viewer'),
  accountIdParam,
  query('status').optional().isString(),
  query('user_identifier').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  mailAccountController.listEmailThreads
);

router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/threads/:conversationId',
  auth,
  organizationAuth.hasRole('viewer'),
  threadParam,
  validate,
  mailAccountController.getEmailThread
);

router.post(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/:accountId/threads/:conversationId/send',
  auth,
  organizationAuth.hasRole('member'),
  threadParam,
  body('text').isString().notEmpty(),
  body('html').optional().isString(),
  body('subject').optional().isString(),
  body('to').optional().isArray(),
  body('cc').optional().isArray(),
  body('bcc').optional().isArray(),
  body('send').optional().isBoolean(),
  body('add_to_conversation').optional().isBoolean(),
  validate,
  mailAccountController.sendToThread
);

// ─── Gmail OAuth ────────────────────────────────────────────────────────

// Step 1 (authenticated): get the Google consent URL.
// ?accountId=  optional — connect to an existing account instead of creating one
// ?redirect_url= optional — where to land after the callback
router.get(
  '/organizations/:orgId/projects/:projectId/agents/:agentId/mail-accounts/oauth/google/authorize',
  auth,
  organizationAuth.hasRole('admin'),
  baseScope,
  validate,
  mailAccountController.getGmailAuthorizeUrl
);

// Step 2 (public): Google redirects here after consent.
// Mounted separately in app.js at /api/v1/email/oauth/google/callback
// (exported so app.js can register it without a second require).
router.get(
  '/email/oauth/google/callback',
  mailAccountController.gmailOAuthCallback
);

// Google Pub/Sub push endpoint. Authentication is performed by validating
// the Google-issued OIDC bearer token in the controller.
router.post(
  '/email/webhooks/google',
  gmailWebhookController.handleGooglePush
);

module.exports = router;
