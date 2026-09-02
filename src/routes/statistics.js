const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const orgAuth = require('../middleware/organizationAuth');
const statisticsController = require('../controllers/statisticsController');
const { generalLimiter } = require('../middleware/rateLimiting');

/**
 * @route GET /api/v1/organizations/statistics/overview
 * @desc Get conversation count + cost per organization the user belongs to,
 *       bucketed per day or per week (for cross-organization graphs)
 * @access Private (authenticated user)
 * @query {string} granularity - 'day' or 'week' (default: 'day')
 * @query {number} days - Number of days to look back, 1-365 (default: 30)
 */
router.get(
  '/statistics/overview',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  statisticsController.getOrganizationsOverview
);

/**
 * @route GET /api/v1/organizations/:orgId/statistics/dashboard
 * @desc Get dashboard statistics for an organization
 * @access Private (Organization member)
 * @query {string} period - Time period: '1d', '1w', '1m' (default: '1d')
 */
router.get(
  '/:orgId/statistics/dashboard',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
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
  '/:orgId/statistics/agents/:agentId',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  orgAuth.isMember,
  statisticsController.getAgentStats
);

module.exports = router;
