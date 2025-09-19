const SessionToken = require('../models/SessionToken');
const Agent = require('../models/Agent');
const crypto = require('crypto');

/**
 * Generate a session token for agent execution
 */
const generateSessionToken = async (req, res) => {
  try {
    const { agentId, maxInteractions = 100, expiresIn = 3600 } = req.body;

    // Validate required scope
    if (!req.apiKey.hasScope('agents:execute')) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required_scope: 'agents:execute',
      });
    }

    // Verify agent exists and user can access it
    const agent = await Agent.findOne({
      _id: agentId,
      organization: req.apiKey.organization._id,
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if API key can access this agent's project
    if (!req.apiKey.canAccessProject(agent.project)) {
      return res.status(403).json({
        error: 'Access denied to this agent',
        code: 'PROJECT_ACCESS_DENIED',
      });
    }

    // Validate parameters
    if (maxInteractions < 1 || maxInteractions > 1000) {
      return res.status(400).json({
        error: 'Max interactions must be between 1 and 1000',
      });
    }

    if (expiresIn < 60 || expiresIn > 86400) {
      // 1 minute to 24 hours
      return res.status(400).json({
        error:
          'Expires in must be between 60 and 86400 seconds (1 minute to 24 hours)',
      });
    }

    // Check for existing active sessions (optional limit)
    const existingActiveSessions = await SessionToken.countDocuments({
      user_api_key: req.apiKey._id,
      agent: agentId,
      expires_at: { $gt: new Date() },
      is_revoked: false,
    });

    const maxSessionsPerAgent = process.env.MAX_SESSIONS_PER_AGENT || 50;
    if (existingActiveSessions >= maxSessionsPerAgent) {
      return res.status(400).json({
        error: `Maximum number of active sessions reached for this agent (${maxSessionsPerAgent})`,
        code: 'MAX_SESSIONS_EXCEEDED',
      });
    }

    // Generate session token
    const sessionToken = SessionToken.generateSessionToken();
    const tokenHash = SessionToken.hashSessionToken(sessionToken);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Create session record
    const session = new SessionToken({
      token_hash: tokenHash,
      user_api_key: req.apiKey._id,
      agent: agentId,
      expires_at: expiresAt,
      max_interactions: maxInteractions,
      client_ip: req.ip || req.connection.remoteAddress,
      client_domain: req.get('Origin') || req.get('Referer'),
    });

    await session.save();

    res.status(201).json({
      success: true,
      data: {
        session_token: sessionToken, // Only shown once!
        session_id: session._id,
        agent_id: agentId,
        expires_at: expiresAt,
        max_interactions: maxInteractions,
        expires_in: expiresIn,
      },
      message:
        "Session token generated successfully. Save this token securely - it won't be shown again.",
    });
  } catch (error) {
    console.error('Generate session token error:', error);
    res.status(500).json({ error: 'Failed to generate session token' });
  }
};

/**
 * Get all active sessions for the API key
 */
const getSessions = async (req, res) => {
  try {
    const sessions = await SessionToken.find({
      user_api_key: req.apiKey._id,
      expires_at: { $gt: new Date() },
      is_revoked: false,
    })
      .populate('agent', 'name type')
      .select('-token_hash') // Never return the hash
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: sessions.map(session => ({
        ...session.toJSON(),
        remaining_interactions:
          session.max_interactions - session.interactions_used,
        is_expired: session.isExpired(),
        masked_token: `st_${'*'.repeat(32)}${session._id.slice(-8)}`,
      })),
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

/**
 * Get a specific session
 */
const getSession = async (req, res) => {
  try {
    const session = await SessionToken.findOne({
      _id: req.params.sessionId,
      user_api_key: req.apiKey._id,
    }).populate('agent', 'name type');

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: {
        ...session.toJSON(),
        remaining_interactions:
          session.max_interactions - session.interactions_used,
        is_expired: session.isExpired(),
        is_valid: session.isValid(),
        masked_token: `st_${'*'.repeat(32)}${session._id.slice(-8)}`,
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
};

/**
 * Revoke a session token
 */
const revokeSession = async (req, res) => {
  try {
    const session = await SessionToken.findOne({
      _id: req.params.sessionId,
      user_api_key: req.apiKey._id,
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await session.revoke();

    res.json({
      success: true,
      message: 'Session revoked successfully',
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

/**
 * Revoke all sessions for the API key
 */
const revokeAllSessions = async (req, res) => {
  try {
    const result = await SessionToken.updateMany(
      {
        user_api_key: req.apiKey._id,
        is_revoked: false,
      },
      {
        is_revoked: true,
      }
    );

    res.json({
      success: true,
      data: {
        revoked_count: result.modifiedCount,
      },
      message: `${result.modifiedCount} sessions revoked successfully`,
    });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
};

/**
 * Cleanup expired sessions (admin/maintenance endpoint)
 */
const cleanupExpiredSessions = async (req, res) => {
  try {
    const deletedCount = await SessionToken.cleanupExpired();

    res.json({
      success: true,
      data: {
        deleted_count: deletedCount,
      },
      message: `${deletedCount} expired sessions cleaned up`,
    });
  } catch (error) {
    console.error('Cleanup expired sessions error:', error);
    res.status(500).json({ error: 'Failed to cleanup expired sessions' });
  }
};

module.exports = {
  generateSessionToken,
  getSessions,
  getSession,
  revokeSession,
  revokeAllSessions,
  cleanupExpiredSessions,
};
