const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const orgAuth = require('../middleware/organizationAuth');
const {
  authLimiter,
  loginLimiter,
  authSlowDown,
  generalLimiter
} = require('../middleware/rateLimiting');
const { expressValidatorPassword } = require('../utils/passwordPolicy');

// Validation middleware with strong password policy
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').custom(expressValidatorPassword),
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

const updateValidation = [
  body('name').optional().trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('password').optional().custom(expressValidatorPassword)
];

// Routes with rate limiting
router.get(
  '/password-policy',
  generalLimiter, // Rate limit: 10 requests per second
  authController.getPasswordPolicy
);

router.post(
  '/register',
  authLimiter, // Rate limit: 5 requests per 15 minutes
  authSlowDown, // Progressive delays after 2 requests
  registerValidation,
  validate,
  authController.register
);

router.post(
  '/login',
  loginLimiter, // Rate limit: 3 failed attempts per 15 minutes
  authSlowDown, // Progressive delays after 2 requests
  loginValidation,
  validate,
  authController.login
);

router.get(
  '/profile',
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  authController.getProfile
);

router.put(
  '/profile',
  authLimiter, // Rate limit: 5 requests per 15 minutes (sensitive operation)
  authSlowDown, // Progressive delays
  auth,
  updateValidation,
  validate,
  authController.updateProfile
);

module.exports = router;
