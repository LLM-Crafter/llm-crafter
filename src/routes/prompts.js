const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true }); // Important for nested routes
const promptController = require('../controllers/promptController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

// Validation middleware
const promptValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('description').optional().trim(),
  body('default_llm').optional().isObject()
];

// Routes
router.post('/',
  auth,
  promptValidation,
  validate,
  promptController.createPrompt
);

router.put('/:promptId',
  auth,
  promptValidation,
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
