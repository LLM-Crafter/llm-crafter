const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const orgAuth = require("../middleware/organizationAuth");
const statisticsController = require("../controllers/statisticsController");

/**
 * @route GET /api/v1/organizations/:orgId/statistics/dashboard
 * @desc Get dashboard statistics for an organization
 * @access Private (Organization member)
 * @query {string} period - Time period: '1d', '1w', '1m' (default: '1d')
 */
router.get(
  "/:orgId/statistics/dashboard",
  auth,
  orgAuth.isMember,
  statisticsController.getDashboardStats
);

/**
 * @route GET /api/v1/organizations/:orgId/statistics/agents/:agentId
 * @desc Get detailed statistics for a specific agent
 * @access Private (Organization member)
 * @query {string} period - Time period: '1d', '1w', '1m' (default: '1d')
 */
router.get(
  "/:orgId/statistics/agents/:agentId",
  auth,
  orgAuth.isMember,
  statisticsController.getAgentStats
);

module.exports = router;
