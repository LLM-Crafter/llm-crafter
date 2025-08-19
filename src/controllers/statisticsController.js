const PromptExecution = require("../models/PromptExecution");
const AgentExecution = require("../models/AgentExecution");
const Conversation = require("../models/Conversation");
const Agent = require("../models/Agent");
const Project = require("../models/Project");

/**
 * Get time range filter based on period
 * @param {string} period - '1d', '1w', '1m'
 * @returns {Date} Start date for filtering
 */
const getTimeFilter = (period) => {
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
    default:
      startDate = new Date(now - 24 * 60 * 60 * 1000); // Default to 1 day
  }

  return startDate;
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
      return res.status(400).json({ error: "Invalid period. Use '1d', '1w', or '1m'" });
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
      dailyUsage
    ] = await Promise.all([
      // Prompt execution statistics
      PromptExecution.aggregate([
        {
          $match: {
            project: { $in: projectIds },
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalTokens: { $sum: "$usage.total_tokens" },
            totalCost: { $sum: "$usage.cost" },
            avgTokensPerCall: { $avg: "$usage.total_tokens" },
            successfulCalls: {
              $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] }
            },
            errorCalls: {
              $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] }
            },
            cachedCalls: {
              $sum: { $cond: [{ $eq: ["$status", "cached"] }, 1, 0] }
            }
          }
        }
      ]),

      // Agent execution statistics
      AgentExecution.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalExecutions: { $sum: 1 },
            totalTokens: { $sum: "$usage.total_tokens" },
            totalCost: { $sum: "$usage.cost" },
            totalToolCalls: { $sum: "$usage.tool_calls_count" },
            avgExecutionTime: { $avg: "$execution_time_ms" },
            completedExecutions: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
            },
            failedExecutions: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
            }
          }
        }
      ]),

      // Conversation statistics
      Conversation.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: { $size: "$messages" } },
            totalTokens: { $sum: "$metadata.total_tokens_used" },
            totalCost: { $sum: "$metadata.total_cost" },
            totalToolsExecuted: { $sum: "$metadata.tools_executed_count" },
            activeConversations: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
            },
            endedConversations: {
              $sum: { $cond: [{ $eq: ["$status", "ended"] }, 1, 0] }
            }
          }
        }
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
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: "$agent",
            totalExecutions: { $sum: 1 },
            totalTokens: { $sum: "$usage.total_tokens" },
            totalCost: { $sum: "$usage.cost" }
          }
        },
        {
          $lookup: {
            from: "agents",
            localField: "_id",
            foreignField: "_id",
            as: "agentInfo"
          }
        },
        {
          $unwind: "$agentInfo"
        },
        {
          $project: {
            name: "$agentInfo.name",
            totalExecutions: 1,
            totalTokens: 1,
            totalCost: 1
          }
        },
        {
          $sort: { totalExecutions: -1 }
        },
        {
          $limit: 5
        }
      ]),

      // Daily usage over the period
      AgentExecution.aggregate([
        {
          $match: {
            agent: { $in: agentIds },
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            executionCount: { $sum: 1 },
            tokenCount: { $sum: "$usage.total_tokens" },
            costSum: { $sum: "$usage.cost" }
          }
        },
        {
          $sort: { "_id": 1 }
        }
      ])
    ]);

    // Combine all statistics
    const promptStats = promptExecutionStats[0] || {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      avgTokensPerCall: 0,
      successfulCalls: 0,
      errorCalls: 0,
      cachedCalls: 0
    };

    const agentStats = agentExecutionStats[0] || {
      totalExecutions: 0,
      totalTokens: 0,
      totalCost: 0,
      totalToolCalls: 0,
      avgExecutionTime: 0,
      completedExecutions: 0,
      failedExecutions: 0
    };

    const convStats = conversationStats[0] || {
      totalConversations: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      totalToolsExecuted: 0,
      activeConversations: 0,
      endedConversations: 0
    };

    // Calculate combined totals
    const combinedTotalTokens = promptStats.totalTokens + agentStats.totalTokens + convStats.totalTokens;
    const combinedTotalCost = promptStats.totalCost + agentStats.totalCost + convStats.totalCost;
    const combinedTotalCalls = promptStats.totalCalls + agentStats.totalExecutions;

    const response = {
      period,
      timeRange: {
        start: startDate,
        end: new Date()
      },
      overview: {
        totalTokensUsed: combinedTotalTokens,
        totalCost: combinedTotalCost,
        totalApiCalls: combinedTotalCalls,
        totalConversations: convStats.totalConversations,
        totalAgents,
        totalProjects
      },
      promptExecutions: {
        totalCalls: promptStats.totalCalls,
        totalTokens: promptStats.totalTokens,
        totalCost: promptStats.totalCost,
        avgTokensPerCall: Math.round(promptStats.avgTokensPerCall || 0),
        successRate: promptStats.totalCalls > 0 ? 
          ((promptStats.successfulCalls / promptStats.totalCalls) * 100).toFixed(2) : 0,
        breakdown: {
          successful: promptStats.successfulCalls,
          errors: promptStats.errorCalls,
          cached: promptStats.cachedCalls
        }
      },
      agentExecutions: {
        totalExecutions: agentStats.totalExecutions,
        totalTokens: agentStats.totalTokens,
        totalCost: agentStats.totalCost,
        totalToolCalls: agentStats.totalToolCalls,
        avgExecutionTime: Math.round(agentStats.avgExecutionTime || 0),
        successRate: agentStats.totalExecutions > 0 ? 
          ((agentStats.completedExecutions / agentStats.totalExecutions) * 100).toFixed(2) : 0,
        breakdown: {
          completed: agentStats.completedExecutions,
          failed: agentStats.failedExecutions,
          pending: agentStats.totalExecutions - agentStats.completedExecutions - agentStats.failedExecutions
        }
      },
      conversations: {
        total: convStats.totalConversations,
        totalMessages: convStats.totalMessages,
        totalTokens: convStats.totalTokens,
        totalCost: convStats.totalCost,
        totalToolsExecuted: convStats.totalToolsExecuted,
        avgMessagesPerConversation: convStats.totalConversations > 0 ? 
          (convStats.totalMessages / convStats.totalConversations).toFixed(2) : 0,
        breakdown: {
          active: convStats.activeConversations,
          ended: convStats.endedConversations
        }
      },
      recentActivity: recentExecutions,
      topAgents: topAgents,
      dailyUsage: dailyUsage
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ error: "Failed to fetch dashboard statistics" });
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
    if (!['1d', '1w', '1m'].includes(period)) {
      return res.status(400).json({ error: "Invalid period. Use '1d', '1w', or '1m'" });
    }

    const startDate = getTimeFilter(period);

    // Verify agent belongs to organization
    const agent = await Agent.findOne({ _id: agentId, organization: orgId });
    if (!agent) {
      return res.status(404).json({ error: "Agent not found in this organization" });
    }

    const [executionStats, conversationStats, recentExecutions] = await Promise.all([
      // Agent execution statistics
      AgentExecution.aggregate([
        {
          $match: {
            agent: agentId,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalExecutions: { $sum: 1 },
            totalTokens: { $sum: "$usage.total_tokens" },
            totalCost: { $sum: "$usage.cost" },
            totalToolCalls: { $sum: "$usage.tool_calls_count" },
            avgExecutionTime: { $avg: "$execution_time_ms" },
            completedExecutions: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
            },
            failedExecutions: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
            }
          }
        }
      ]),

      // Conversation statistics for this agent
      Conversation.aggregate([
        {
          $match: {
            agent: agentId,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: { $size: "$messages" } },
            totalTokens: { $sum: "$metadata.total_tokens_used" },
            totalCost: { $sum: "$metadata.total_cost" },
            activeConversations: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
            }
          }
        }
      ]),

      // Recent executions for this agent
      AgentExecution.find({ agent: agentId })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('status createdAt execution_time_ms usage.total_tokens type')
    ]);

    const execStats = executionStats[0] || {
      totalExecutions: 0,
      totalTokens: 0,
      totalCost: 0,
      totalToolCalls: 0,
      avgExecutionTime: 0,
      completedExecutions: 0,
      failedExecutions: 0
    };

    const convStats = conversationStats[0] || {
      totalConversations: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      activeConversations: 0
    };

    const response = {
      agent: {
        id: agent._id,
        name: agent.name,
        type: agent.type
      },
      period,
      timeRange: {
        start: startDate,
        end: new Date()
      },
      executions: {
        total: execStats.totalExecutions,
        completed: execStats.completedExecutions,
        failed: execStats.failedExecutions,
        successRate: execStats.totalExecutions > 0 ? 
          ((execStats.completedExecutions / execStats.totalExecutions) * 100).toFixed(2) : 0,
        avgExecutionTime: Math.round(execStats.avgExecutionTime || 0),
        totalTokens: execStats.totalTokens,
        totalCost: execStats.totalCost,
        totalToolCalls: execStats.totalToolCalls
      },
      conversations: {
        total: convStats.totalConversations,
        active: convStats.activeConversations,
        totalMessages: convStats.totalMessages,
        avgMessagesPerConversation: convStats.totalConversations > 0 ? 
          (convStats.totalMessages / convStats.totalConversations).toFixed(2) : 0,
        totalTokens: convStats.totalTokens,
        totalCost: convStats.totalCost
      },
      recentActivity: recentExecutions
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching agent statistics:', error);
    res.status(500).json({ error: "Failed to fetch agent statistics" });
  }
};

module.exports = {
  getDashboardStats,
  getAgentStats
};
