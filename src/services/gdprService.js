/**
 * GDPR Service
 *
 * Provides GDPR infrastructure primitives that deployers can use to build
 * compliant products. No legal decisions are enforced here — all features
 * are opt-in and configurable per-agent.
 *
 * Features:
 *  - Retention: auto-delete conversations/executions older than retention_days
 *  - Erasure:   hard-delete all data for a user_identifier within an org
 *  - Export:    return all stored data for a user_identifier within an org
 */

const Agent = require('../models/Agent');
const Conversation = require('../models/Conversation');
const AgentExecution = require('../models/AgentExecution');
const SessionToken = require('../models/SessionToken');

class GdprService {
  // ─── Retention ────────────────────────────────────────────────────────────

  /**
   * Run retention for a single agent.
   * Deletes Conversations and AgentExecutions older than agent.gdpr.retention_days.
   *
   * @param {Object} agent - Mongoose Agent document (must have gdpr.retention_days set)
   * @returns {{ conversations: number, executions: number }}
   */
  async runRetentionForAgent(agent) {
    const days = agent.gdpr && agent.gdpr.retention_days;
    if (!days || days < 1) return { conversations: 0, executions: 0 };

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [convResult, execResult] = await Promise.all([
      Conversation.deleteMany({
        agent: agent._id,
        // Handle both field names: 'created_at' (current schema) and 'createdAt' (legacy documents)
        $or: [
          { created_at: { $lt: cutoff } },
          { createdAt: { $lt: cutoff } },
        ],
      }),
      AgentExecution.deleteMany({
        agent: agent._id,
        createdAt: { $lt: cutoff },
      }),
    ]);
    console.log(`[GDPR] Retention for agent ${agent._id}: deleted ${convResult.deletedCount} conversation(s), ${execResult.deletedCount} execution(s).`);

    return {
      conversations: convResult.deletedCount,
      executions: execResult.deletedCount,
    };
  }

  /**
   * Run retention across ALL agents that have retention_days configured.
   * Intended to be called by the daily cron job.
   *
   * @returns {Array<{ agentId, deleted: { conversations, executions } }>}
   */
  async runRetention() {
    const agents = await Agent.find({
      'gdpr.retention_days': { $ne: null, $exists: true, $gt: 0 },
    }).select('_id gdpr');

    if (agents.length === 0) {
      console.log('[GDPR] Retention run: no agents with retention policy configured.');
      return [];
    }

    console.log(`[GDPR] Retention run: processing ${agents.length} agent(s)...`);

    const results = [];

    for (const agent of agents) {
      try {
        const deleted = await this.runRetentionForAgent(agent);
        results.push({ agentId: agent._id, deleted });
        if (deleted.conversations > 0 || deleted.executions > 0) {
          console.log(
            `[GDPR] Agent ${agent._id}: deleted ${deleted.conversations} conversation(s), ${deleted.executions} execution(s).`
          );
        }
      } catch (err) {
        console.error(`[GDPR] Retention error for agent ${agent._id}:`, err.message);
        results.push({ agentId: agent._id, error: err.message });
      }
    }

    console.log('[GDPR] Retention run complete.');
    return results;
  }

  // ─── Erasure ──────────────────────────────────────────────────────────────

  /**
   * Hard-erase all personal data associated with a user_identifier within an org.
   *
   * - Deletes all Conversation documents (including their messages)
   * - Anonymises AgentExecution records (removes user identity, keeps stats)
   * - Deletes SessionToken records linked to the identifier
   *
   * @param {string} orgId
   * @param {string} userIdentifier
   * @returns {{ deleted: { conversations, sessionTokens }, anonymised: { agentExecutions } }}
   */
  async eraseUser(orgId, userIdentifier) {
    // Collect agent IDs within this org
    const agents = await Agent.find({ organization: orgId }).select('_id');
    const agentIds = agents.map(a => a._id);

    // 1. Delete conversations
    const convResult = await Conversation.deleteMany({
      agent: { $in: agentIds },
      user_identifier: userIdentifier,
    });

    // 2. Anonymise executions — preserve stats, remove identity
    const execResult = await AgentExecution.updateMany(
      {
        agent: { $in: agentIds },
        'metadata.user_identifier': userIdentifier,
      },
      {
        $unset: { 'metadata.user_identifier': '' },
        $set: { 'metadata.erased': true },
      }
    );

    // 3. Delete session tokens (best-effort — SessionToken stores hashed tokens,
    //    not raw user identifiers, but we can match via user_identifier if stored)
    //    Only applies to records where user identifier was recorded.
    let sessionTokensDeleted = 0;
    try {
      const stResult = await SessionToken.deleteMany({
        user_identifier: userIdentifier,
      });
      sessionTokensDeleted = stResult.deletedCount;
    } catch (_e) {
      // SessionToken schema may not have user_identifier — safe to skip
    }

    return {
      deleted: {
        conversations: convResult.deletedCount,
        session_tokens: sessionTokensDeleted,
      },
      anonymised: {
        agent_executions: execResult.modifiedCount,
      },
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  /**
   * Export all data stored for a user_identifier within an org.
   * Message content is transparently decrypted if the agent has encrypt_messages enabled.
   *
   * @param {string} orgId
   * @param {string} userIdentifier
   * @returns {{ user_identifier, exported_at, conversations: [], executions: [] }}
   */
  async exportUser(orgId, userIdentifier) {
    const agents = await Agent.find({ organization: orgId }).select('_id gdpr');
    const agentIds = agents.map(a => a._id);

    // Build a lookup for encryption status per agent
    const agentEncryptionMap = {};
    agents.forEach(a => {
      agentEncryptionMap[a._id] = a.gdpr && a.gdpr.encrypt_messages === true;
    });

    // Fetch conversations (with full messages)
    const conversations = await Conversation.find({
      agent: { $in: agentIds },
      user_identifier: userIdentifier,
    });

    // Decrypt message content where applicable and convert to plain objects
    const exportedConversations = conversations.map(conv => {
      const obj = conv.toJSON(); // toJSON() auto-decrypts via the schema transform
      return obj;
    });

    // Fetch executions
    const executions = await AgentExecution.find({
      agent: { $in: agentIds },
      'metadata.user_identifier': userIdentifier,
    }).select('-error.stack'); // Omit internal stack traces from export

    return {
      user_identifier: userIdentifier,
      exported_at: new Date().toISOString(),
      conversations: exportedConversations,
      executions: executions.map(e => e.toObject()),
    };
  }
}

module.exports = new GdprService();
