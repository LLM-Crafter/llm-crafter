/**
 * GDPR Controller
 *
 * Exposes GDPR infrastructure endpoints:
 *  POST   /:orgId/gdpr/agents/:agentId/run-retention   — trigger retention for one agent
 *  DELETE /:orgId/gdpr/users/:userIdentifier            — erase all data for a user
 *  GET    /:orgId/gdpr/users/:userIdentifier/export     — export all data for a user
 *
 * All endpoints require admin role on the organisation (enforced in routes).
 */

const gdprService = require('../services/gdprService');
const Agent = require('../models/Agent');

/**
 * POST /:orgId/gdpr/agents/:agentId/run-retention
 * Manually trigger the retention job for a single agent.
 * Useful for testing without waiting for the daily cron.
 */
const runRetentionForAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      organization: req.params.orgId,
    }).select('_id gdpr');

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (!agent.gdpr || !agent.gdpr.retention_days) {
      return res.status(400).json({
        error: 'Agent does not have a retention policy configured (gdpr.retention_days is not set)',
      });
    }

    const result = await gdprService.runRetentionForAgent(agent);

    res.json({
      message: 'Retention job completed',
      agent_id: agent._id,
      retention_days: agent.gdpr.retention_days,
      deleted: result,
    });
  } catch (error) {
    console.error('GDPR run-retention error:', error);
    res.status(500).json({ error: 'Failed to run retention job' });
  }
};

/**
 * DELETE /:orgId/gdpr/users/:userIdentifier
 * Erase all data associated with the given user_identifier within the organisation.
 */
const eraseUser = async (req, res) => {
  try {
    const { orgId, userIdentifier } = req.params;

    if (!userIdentifier || userIdentifier.trim() === '') {
      return res.status(400).json({ error: 'userIdentifier is required' });
    }

    const result = await gdprService.eraseUser(orgId, userIdentifier.trim());

    res.json({
      message: 'Erasure complete',
      user_identifier: userIdentifier.trim(),
      ...result,
    });
  } catch (error) {
    console.error('GDPR erase user error:', error);
    res.status(500).json({ error: 'Failed to erase user data' });
  }
};

/**
 * GET /:orgId/gdpr/users/:userIdentifier/export
 * Export all data stored for the given user_identifier within the organisation.
 * Message content is automatically decrypted when encrypt_messages is enabled.
 */
const exportUser = async (req, res) => {
  try {
    const { orgId, userIdentifier } = req.params;

    if (!userIdentifier || userIdentifier.trim() === '') {
      return res.status(400).json({ error: 'userIdentifier is required' });
    }

    const data = await gdprService.exportUser(orgId, userIdentifier.trim());

    res.json(data);
  } catch (error) {
    console.error('GDPR export user error:', error);
    res.status(500).json({ error: 'Failed to export user data' });
  }
};

module.exports = {
  runRetentionForAgent,
  eraseUser,
  exportUser,
};
