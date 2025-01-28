const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const projectController = require('../controllers/projectController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

const promptRoutes = require('./prompts');
const apiKeyRoutes = require('./apiKeys');
router.use('/:orgId/projects/:projectId/api-keys', apiKeyRoutes);


// Organization validation
const organizationValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim()
];

// Project validation
const projectValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim(),
  body('llm_configurations').optional().isArray()
];

router.use('/:orgId/projects/:projectId/prompts', promptRoutes);


// Organization routes
router.post('/', 
  auth, 
  organizationValidation, 
  validate, 
  organizationController.createOrganization
);

router.get('/', 
  auth, 
  organizationController.getOrganizations
);

router.get('/:orgId', 
  auth, 
  organizationController.getOrganization
);

// Project routes (nested under organizations)
router.post('/:orgId/projects',
  auth,
  projectValidation,
  validate,
  projectController.createProject
);

router.get('/:orgId/projects',
  auth,
  projectController.getProjects
);

router.get('/:orgId/projects/:projectId',
  auth,
  projectController.getProject
);

module.exports = router;
