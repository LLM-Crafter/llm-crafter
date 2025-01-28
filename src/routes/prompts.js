const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true }); // Important for nested routes
const promptController = require('../controllers/promptController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

// Validation middleware
const createPromptValidation = [
    body('name')
      .trim()
      .notEmpty()
      .matches(/^[a-z0-9_]+$/)
      .withMessage('Name can only contain lowercase letters, numbers, and underscores')
  ];
  
  const updatePromptValidation = [
    body('api_key').optional().isString(),
    body('description').optional().isString(),
    body('content').optional().isString(),
    body('llm_settings.model').optional().isString(),
    body('llm_settings.parameters').optional().isObject(),
    body('llm_settings.parameters.temperature').optional().isFloat({ min: 0, max: 1 }),
    body('llm_settings.parameters.max_tokens').optional().isInt({ min: 1 })
  ];

// Routes
router.post('/',
  auth,
  createPromptValidation,
  validate,
  promptController.createPrompt
);

router.put('/:promptId',
  auth,
  updatePromptValidation,
  validate,
  promptController.updatePrompt
);

router.delete('/:promptId',
  auth,
  promptController.deletePrompt
);

router.get('/:promptId',
  auth,
  promptController.getPrompt
);

module.exports = router;
