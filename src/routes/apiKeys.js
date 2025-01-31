const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true });
const apiKeyController = require('../controllers/apiKeyController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const orgAuth = require('../middleware/organizationAuth');


const apiKeyValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('key').trim().notEmpty().withMessage('API key is required'),
  body('provider').notEmpty().withMessage('Provider is required')
];

router.post('/',
  auth,
  orgAuth.hasRole('member'),
  apiKeyValidation,
  validate,
  apiKeyController.createApiKey
);

router.delete('/:apiKeyId',
    auth,
    orgAuth.hasRole('admin'),
    apiKeyController.deleteApiKey
  );

module.exports = router;
