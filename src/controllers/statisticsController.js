const PromptExecution = require('../models/PromptExecution');
const AgentExecution = require('../models/AgentExecution');
const Conversation = require('../models/Conversation');
const Agent = require('../models/Agent');
const Project = require('../models/Project');
const Organization = require('../models/Organization');

/**
 * Get time range filter based on period
 * @param {string} period - '1d', '1w', '1m', 'current-month', 'last-month'
 * @returns {Date} Start date for filtering
 */
const getTimeFilter = period => {
  const now = new Date();
  let startDate;

  switch (period) {
    case '1d':
      startDate = new Date(now - 24 * 60 * 60 * 1000); // 1 day ago
      break;
    case '1w':
      startDate = new Date(now - 7 * 24 * 60 * 60 * 1000); // 1 week ago
      break;
    case '1m':
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000); // 1 month ago
      break;
    case 'current-month':
      // First day of current month at 00:00:00
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last-month':
      // First day of last month at 00:00:00
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      break;
    default:
      startDate = new Date(now - 24 * 60 * 60 * 1000); // Default to 1 day
  }

  return startDate;
};

/**
 * Truncate a date to the start of its UTC day
 */
const startOfUTCDay = date => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/**
 * Truncate a date to the Monday of its UTC week
 */
const startOfUTCWeek = date => {
  const d = startOfUTCDay(date);
  const dayOfWeek = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
};

const formatBucketDate = date => new Date(date).toISOString().slice(0, 10);

/**
 * Build the ordered list of bucket keys (YYYY-MM-DD) spanning [startDate, now],
 * so response series stay continuous even for buckets without activity.
 */
const buildBucketSeries = (startDate, granularity) => {
  const alignedStart =
    granularity === 'week' ? startOfUTCWeek(startDate) : startOfUTCDay(startDate);
  const end =
    granularity === 'week' ? startOfUTCWeek(new Date()) : startOfUTCDay(new Date());
  const stepDays = granularity === 'week' ? 7 : 1;

  const buckets = [];
  const cursor = new Date(alignedStart);
  while (cursor <= end) {
    buckets.push(formatBucketDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  }
  return buckets;
};

/**
 * Get combined daily usage from all data sources
 * @param {Array} projectIds - Array of project IDs
 * @param {Array} agentIds - Array of agent IDs
 * @param {Date} startDate - Start date for filtering
 * @returns {Array} Combined daily usage data
 */
const getCombinedDailyUsage = async (projectIds, agentIds, startDate) => {
  try {
    const [agentDaily, promptDaily, conversationDaily] = await Promise.all([
      // Daily usage from Agent Executions
      AgentExecution.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'UTC',
              },
            },
            agentExecutions: { $sum: 1 },
            agentTokens: { $sum: { $ifNull: ['$usage.total_tokens', 0] } },
            agentCost: { $sum: { $ifNull: ['$usage.cost', 0] } },
          },
        },
      ]),

      // Daily usage from Prompt Executions
      PromptExecution.aggregate([
        {
          $match: {
            project: { $in: projectIds },
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'UTC',
              },
            },
            promptExecutions: { $sum: 1 },
            promptTokens: { $sum: { $ifNull: ['$usage.total_tokens', 0] } },
            promptCost: { $sum: { $ifNull: ['$usage.cost', 0] } },
          },
        },
      ]),

      // Daily usage from Conversations
      Conversation.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            created_at: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$created_at',
                timezone: 'UTC',
              },
            },
            conversations: { $sum: 1 },
            conversationTokens: {
              $sum: { $ifNull: ['$metadata.total_tokens_used', 0] },
            },
            conversationCost: {
              $sum: { $ifNull: ['$metadata.total_cost', 0] },
            },
          },
        },
      ]),
    ]);

    // Combine all daily data into a single structure
    const dailyMap = new Map();

    // Process agent executions
    agentDaily.forEach(day => {
      const date = day._id;
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          _id: date,
          executionCount: 0,
          tokenCount: 0,
          costSum: 0,
          agentExecutions: 0,
          promptExecutions: 0,
          conversations: 0,
        });
      }
      const dayData = dailyMap.get(date);
      dayData.agentExecutions = day.agentExecutions || 0;
      dayData.executionCount += day.agentExecutions || 0;
      dayData.tokenCount += day.agentTokens || 0;
      dayData.costSum += day.agentCost || 0;
    });

    // Process prompt executions
    promptDaily.forEach(day => {
      const date = day._id;
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          _id: date,
          executionCount: 0,
          tokenCount: 0,
          costSum: 0,
          agentExecutions: 0,
          promptExecutions: 0,
          conversations: 0,
        });
      }
      const dayData = dailyMap.get(date);
      dayData.promptExecutions = day.promptExecutions || 0;
      dayData.executionCount += day.promptExecutions || 0;
      dayData.tokenCount += day.promptTokens || 0;
      dayData.costSum += day.promptCost || 0;
    });

    // Process conversations
    conversationDaily.forEach(day => {
      const date = day._id;
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          _id: date,
          executionCount: 0,
          tokenCount: 0,
          costSum: 0,
          agentExecutions: 0,
          promptExecutions: 0,
          conversations: 0,
        });
      }
      const dayData = dailyMap.get(date);
      dayData.conversations = day.conversations || 0;
      dayData.tokenCount += day.conversationTokens || 0;
      dayData.costSum += day.conversationCost || 0;
    });

    // Convert map to sorted array and ensure we have data for the full period
    const result = Array.from(dailyMap.values()).sort((a, b) =>
      a._id.localeCompare(b._id)
    );

    // If no data exists, return an empty array rather than undefined
    return result.length > 0 ? result : [];
  } catch (error) {
    console.error('Error getting combined daily usage:', error);
    return []; // Return empty array on error
  }
};

/**
 * Get dashboard statistics for an organization
 */
const getDashboardStats = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { period = '1d' } = req.query;

    // Validate period
    if (!['1d', '1w', '1m'].includes(period)) {
      return res
        .status(400)
        .json({ error: "Invalid period. Use '1d', '1w', or '1m'" });
    }

    const startDate = getTimeFilter(period);

    // Get all projects for this organization
    const projects = await Project.find({ organization: orgId }).select('_id');
    const projectIds = projects.map(p => p._id);

    // Get all agents for this organization
    const agents = await Agent.find({ organization: orgId }).select('_id');
    const agentIds = agents.map(a => a._id);

    // Parallel execution of all queries for better performance
    const [
      promptExecutionStats,
      agentExecutionStats,
      conversationStats,
      totalAgents,
      totalProjects,
      recentExecutions,
      topAgents,
      dailyUsage,
    ] = await Promise.all([
      // Prompt execution statistics
      PromptExecution.aggregate([
        {
          $match: {
            project: { $in: projectIds },
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalTokens: { $sum: '$usage.total_tokens' },
            totalCost: { $sum: '$usage.cost' },
            avgTokensPerCall: { $avg: '$usage.total_tokens' },
            successfulCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
            },
            errorCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
            },
            cachedCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'cached'] }, 1, 0] },
            },
          },
        },
      ]),

      // Agent execution statistics
      AgentExecution.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            totalExecutions: { $sum: 1 },
            totalTokens: { $sum: '$usage.total_tokens' },
            totalCost: { $sum: '$usage.cost' },
            totalToolCalls: { $sum: '$usage.tool_calls_count' },
            avgExecutionTime: { $avg: '$execution_time_ms' },
            completedExecutions: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            failedExecutions: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
          },
        },
      ]),

      // Conversation statistics
      Conversation.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            created_at: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: { $size: '$messages' } },
            totalTokens: { $sum: '$metadata.total_tokens_used' },
            totalCost: { $sum: '$metadata.total_cost' },
            totalToolsExecuted: { $sum: '$metadata.tools_executed_count' },
            activeConversations: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
            },
            endedConversations: {
              $sum: { $cond: [{ $eq: ['$status', 'ended'] }, 1, 0] },
            },
          },
        },
      ]),

      // Total counts
      Agent.countDocuments({ organization: orgId }),
      Project.countDocuments({ organization: orgId }),

      // Recent executions (last 10)
      AgentExecution.find({ agent: { $in: agentIds } })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('agent', 'name')
        .select('status createdAt execution_time_ms usage.total_tokens'),

      // Top agents by usage
      AgentExecution.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$agent',
            totalExecutions: { $sum: 1 },
            totalTokens: { $sum: '$usage.total_tokens' },
            totalCost: { $sum: '$usage.cost' },
          },
        },
        {
          $lookup: {
            from: 'agents',
            localField: '_id',
            foreignField: '_id',
            as: 'agentInfo',
          },
        },
        {
          $unwind: '$agentInfo',
        },
        {
          $project: {
            name: '$agentInfo.name',
            totalExecutions: 1,
            totalTokens: 1,
            totalCost: 1,
          },
        },
        {
          $sort: { totalExecutions: -1 },
        },
        {
          $limit: 5,
        },
      ]),

      // Daily usage over the period - Agent Executions only for now
      AgentExecution.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'UTC',
              },
            },
            executionCount: { $sum: 1 },
            tokenCount: { $sum: { $ifNull: ['$usage.total_tokens', 0] } },
            costSum: { $sum: { $ifNull: ['$usage.cost', 0] } },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]),
    ]);

    // Combine all statistics
    const promptStats = promptExecutionStats[0] || {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      avgTokensPerCall: 0,
      successfulCalls: 0,
      errorCalls: 0,
      cachedCalls: 0,
    };

    const agentStats = agentExecutionStats[0] || {
      totalExecutions: 0,
      totalTokens: 0,
      totalCost: 0,
      totalToolCalls: 0,
      avgExecutionTime: 0,
      completedExecutions: 0,
      failedExecutions: 0,
    };

    const convStats = conversationStats[0] || {
      totalConversations: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      totalToolsExecuted: 0,
      activeConversations: 0,
      endedConversations: 0,
    };

    // Calculate combined totals
    const combinedTotalTokens =
      promptStats.totalTokens + agentStats.totalTokens + convStats.totalTokens;
    const combinedTotalCost =
      promptStats.totalCost + agentStats.totalCost + convStats.totalCost;
    const combinedTotalCalls =
      promptStats.totalCalls + agentStats.totalExecutions;

    // Get comprehensive daily usage from all sources
    const comprehensiveDailyUsage = await getCombinedDailyUsage(
      projectIds,
      agentIds,
      startDate
    );

    const response = {
      period,
      timeRange: {
        start: startDate,
        end: new Date(),
      },
      overview: {
        totalTokensUsed: combinedTotalTokens,
        totalCost: combinedTotalCost,
        totalApiCalls: combinedTotalCalls,
        totalConversations: convStats.totalConversations,
        totalAgents,
        totalProjects,
      },
      promptExecutions: {
        totalCalls: promptStats.totalCalls,
        totalTokens: promptStats.totalTokens,
        totalCost: promptStats.totalCost,
        avgTokensPerCall: Math.round(promptStats.avgTokensPerCall || 0),
        successRate:
          promptStats.totalCalls > 0
            ? (
                (promptStats.successfulCalls / promptStats.totalCalls) *
                100
              ).toFixed(2)
            : 0,
        breakdown: {
          successful: promptStats.successfulCalls,
          errors: promptStats.errorCalls,
          cached: promptStats.cachedCalls,
        },
      },
      agentExecutions: {
        totalExecutions: agentStats.totalExecutions,
        totalTokens: agentStats.totalTokens,
        totalCost: agentStats.totalCost,
        totalToolCalls: agentStats.totalToolCalls,
        avgExecutionTime: Math.round(agentStats.avgExecutionTime || 0),
        successRate:
          agentStats.totalExecutions > 0
            ? (
                (agentStats.completedExecutions / agentStats.totalExecutions) *
                100
              ).toFixed(2)
            : 0,
        breakdown: {
          completed: agentStats.completedExecutions,
          failed: agentStats.failedExecutions,
          pending:
            agentStats.totalExecutions -
            agentStats.completedExecutions -
            agentStats.failedExecutions,
        },
      },
      conversations: {
        total: convStats.totalConversations,
        totalMessages: convStats.totalMessages,
        totalTokens: convStats.totalTokens,
        totalCost: convStats.totalCost,
        totalToolsExecuted: convStats.totalToolsExecuted,
        avgMessagesPerConversation:
          convStats.totalConversations > 0
            ? (convStats.totalMessages / convStats.totalConversations).toFixed(
                2
              )
            : 0,
        breakdown: {
          active: convStats.activeConversations,
          ended: convStats.endedConversations,
        },
      },
      recentActivity: recentExecutions,
      topAgents,
      dailyUsage: comprehensiveDailyUsage,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

/**
 * Get detailed statistics for a specific agent
 */
const getAgentStats = async (req, res) => {
  try {
    const { orgId, agentId } = req.params;
    const { period = '1d' } = req.query;

    // Validate period
    if (!['1d', '1w', '1m', 'current-month', 'last-month'].includes(period)) {
      return res
        .status(400)
        .json({
          error:
            "Invalid period. Use '1d', '1w', '1m', 'current-month', or 'last-month'",
        });
    }

    const startDate = getTimeFilter(period);

    // Verify agent belongs to organization
    const agent = await Agent.findOne({ _id: agentId, organization: orgId });
    if (!agent) {
      return res
        .status(404)
        .json({ error: 'Agent not found in this organization' });
    }

    const [executionStats, conversationStats, recentExecutions] =
      await Promise.all([
        // Agent execution statistics
        AgentExecution.aggregate([
          {
            $match: {
              agent: agentId,
              createdAt: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: null,
              totalExecutions: { $sum: 1 },
              totalTokens: { $sum: '$usage.total_tokens' },
              totalCost: { $sum: '$usage.cost' },
              totalToolCalls: { $sum: '$usage.tool_calls_count' },
              avgExecutionTime: { $avg: '$execution_time_ms' },
              completedExecutions: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
              },
              failedExecutions: {
                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
              },
            },
          },
        ]),

        // Conversation statistics for this agent
        Conversation.aggregate([
          {
            $match: {
              agent: agentId,
              created_at: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: null,
              totalConversations: { $sum: 1 },
              totalMessages: { $sum: { $size: '$messages' } },
              totalTokens: { $sum: '$metadata.total_tokens_used' },
              totalCost: { $sum: '$metadata.total_cost' },
              activeConversations: {
                $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
              },
            },
          },
        ]),

        // Recent executions for this agent
        AgentExecution.find({ agent: agentId })
          .sort({ createdAt: -1 })
          .limit(20)
          .select('status createdAt execution_time_ms usage.total_tokens type'),
      ]);

    const execStats = executionStats[0] || {
      totalExecutions: 0,
      totalTokens: 0,
      totalCost: 0,
      totalToolCalls: 0,
      avgExecutionTime: 0,
      completedExecutions: 0,
      failedExecutions: 0,
    };

    const convStats = conversationStats[0] || {
      totalConversations: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      activeConversations: 0,
    };

    const response = {
      agent: {
        id: agent._id,
        name: agent.name,
        type: agent.type,
      },
      period,
      timeRange: {
        start: startDate,
        end: new Date(),
      },
      executions: {
        total: execStats.totalExecutions,
        completed: execStats.completedExecutions,
        failed: execStats.failedExecutions,
        successRate:
          execStats.totalExecutions > 0
            ? (
                (execStats.completedExecutions / execStats.totalExecutions) *
                100
              ).toFixed(2)
            : 0,
        avgExecutionTime: Math.round(execStats.avgExecutionTime || 0),
        totalTokens: execStats.totalTokens,
        totalCost: execStats.totalCost,
        totalToolCalls: execStats.totalToolCalls,
      },
      conversations: {
        total: convStats.totalConversations,
        active: convStats.activeConversations,
        totalMessages: convStats.totalMessages,
        avgMessagesPerConversation:
          convStats.totalConversations > 0
            ? (convStats.totalMessages / convStats.totalConversations).toFixed(
                2
              )
            : 0,
        totalTokens: convStats.totalTokens,
        totalCost: convStats.totalCost,
      },
      recentActivity: recentExecutions,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching agent statistics:', error);
    res.status(500).json({ error: 'Failed to fetch agent statistics' });
  }
};

/**
 * Get conversation count + cost, bucketed per day or per week, for every
 * organization the requesting user belongs to (for cross-org graphs).
 */
const getOrganizationsOverview = async (req, res) => {
  try {
    const { granularity = 'day', days = '30' } = req.query;

    if (!['day', 'week'].includes(granularity)) {
      return res
        .status(400)
        .json({ error: "Invalid granularity. Use 'day' or 'week'" });
    }

    const daysNum = parseInt(days, 10);
    if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) {
      return res
        .status(400)
        .json({ error: 'Invalid days. Use an integer between 1 and 365' });
    }

    const organizations = await Organization.find({
      'members.user': req.user._id,
    }).select('_id name');

    if (organizations.length === 0) {
      return res.json({ granularity, days: daysNum, timeRange: null, organizations: [] });
    }

    const orgIds = organizations.map(org => org._id);
    const rawStartDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);
    const startDate =
      granularity === 'week' ? startOfUTCWeek(rawStartDate) : startOfUTCDay(rawStartDate);

    const agents = await Agent.find({ organization: { $in: orgIds } }).select(
      '_id organization'
    );
    const agentOrgMap = new Map(agents.map(a => [a._id, a.organization]));
    const agentIds = agents.map(a => a._id);

    const bucketSeries = buildBucketSeries(rawStartDate, granularity);

    const orgBuckets = new Map();
    organizations.forEach(org => {
      const buckets = new Map();
      bucketSeries.forEach(key => buckets.set(key, { conversations: 0, cost: 0 }));
      orgBuckets.set(org._id, buckets);
    });

    if (agentIds.length > 0) {
      const dateExpr = {
        $dateTrunc: {
          date: '$created_at',
          unit: granularity,
          timezone: 'UTC',
          ...(granularity === 'week' && { startOfWeek: 'monday' }),
        },
      };

      const results = await Conversation.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            created_at: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { agent: '$agent', bucket: dateExpr },
            conversationCount: { $sum: 1 },
            totalCost: { $sum: { $ifNull: ['$metadata.total_cost', 0] } },
          },
        },
      ]);

      results.forEach(row => {
        const orgId = agentOrgMap.get(row._id.agent);
        const buckets = orgId && orgBuckets.get(orgId);
        if (!buckets) return;

        const bucketKey = formatBucketDate(row._id.bucket);
        const entry = buckets.get(bucketKey) || { conversations: 0, cost: 0 };
        entry.conversations += row.conversationCount;
        entry.cost += row.totalCost;
        buckets.set(bucketKey, entry);
      });
    }

    const organizationsResponse = organizations.map(org => {
      const buckets = orgBuckets.get(org._id);
      const series = Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stats]) => ({
          date,
          conversations: stats.conversations,
          cost: Math.round(stats.cost * 1e6) / 1e6,
        }));

      const totals = series.reduce(
        (acc, point) => ({
          conversations: acc.conversations + point.conversations,
          cost: acc.cost + point.cost,
        }),
        { conversations: 0, cost: 0 }
      );

      return {
        organization: { id: org._id, name: org.name },
        series,
        totals: { ...totals, cost: Math.round(totals.cost * 1e6) / 1e6 },
      };
    });

    res.json({
      granularity,
      days: daysNum,
      timeRange: { start: startDate, end: new Date() },
      organizations: organizationsResponse,
    });
  } catch (error) {
    console.error('Error fetching organizations overview statistics:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch organizations overview statistics' });
  }
};

module.exports = {
  getDashboardStats,
  getAgentStats,
  getOrganizationsOverview,
};
