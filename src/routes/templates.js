const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true });
const templateController = require('../controllers/templateController');
const auth = require('../middleware/auth');
const organizationAuth = require('../middleware/organizationAuth');
const validate = require('../middleware/validate');

const BASE = '/organizations/:orgId/projects/:projectId/agents/:agentId/templates';

const createTemplateValidation = [
  body('name').trim().notEmpty().withMessage('Template name is required')
    .matches(/^[a-z0-9_]+$/).withMessage('Template name must be lowercase alphanumeric with underscores'),
  body('language').trim().notEmpty().withMessage('Language code is required'),
  body('category').optional().isIn(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
  body('components').isArray({ min: 1 }).withMessage('At least one component is required'),
  body('label').optional().trim(),
];

const sendTemplateValidation = [
  body('conversationId').trim().notEmpty().withMessage('conversationId is required'),
  body('parameters').optional().isArray(),
];

// List templates for an agent
router.get(
  BASE,
  auth,
  organizationAuth.hasRole('viewer'),
  templateController.listTemplates
);

// Get a single template
router.get(
  `${BASE}/:templateId`,
  auth,
  organizationAuth.hasRole('viewer'),
  templateController.getTemplate
);

// Create a template (registers with Meta)
router.post(
  BASE,
  auth,
  organizationAuth.hasRole('member'),
  createTemplateValidation,
  validate,
  templateController.createTemplate
);

// Delete a template (also deletes from Meta)
router.delete(
  `${BASE}/:templateId`,
  auth,
  organizationAuth.hasRole('admin'),
  templateController.deleteTemplate
);

// Sync template statuses from Meta
router.post(
  `${BASE}/sync`,
  auth,
  organizationAuth.hasRole('member'),
  templateController.syncTemplates
);

// Send a template message to a conversation
router.post(
  `${BASE}/:templateId/send`,
  auth,
  organizationAuth.hasRole('member'),
  sendTemplateValidation,
  validate,
  templateController.sendTemplate
);

module.exports = router;
