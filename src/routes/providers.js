const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const providerController = require('../controllers/providerController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

// Validation middleware
const providerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('models')
    .isArray()
    .withMessage('Models must be an array')
    .notEmpty()
    .withMessage('At least one model is required'),
];

// Public route to get all providers
router.get('/', auth, providerController.getProviders);

// Public route to get a specific provider
router.get('/:providerId', auth, providerController.getProvider);

// Public route to get models for a specific provider
router.get('/:providerId/models', auth, providerController.getProviderModels);

// Protected routes for admin operations
router.post(
  '/',
  auth,
  providerValidation,
  validate,
  providerController.createProvider
);

router.post('/refresh', auth, providerController.refreshProviders);

router.put(
  '/:providerId',
  auth,
  providerValidation,
  validate,
  providerController.updateProvider
);

router.delete('/:providerId', auth, providerController.deleteProvider);

module.exports = router;
