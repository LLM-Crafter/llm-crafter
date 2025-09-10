const express = require('express');
const { body } = require('express-validator');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const orgAuth = require('../middleware/organizationAuth');
const {
  authLimiter,
  loginLimiter,
  authSlowDown,
  generalLimiter,
} = require('../middleware/rateLimiting');
const { expressValidatorPassword } = require('../utils/passwordPolicy');
const {
  requireEmailPasswordAuth,
  requireOAuthAuth,
} = require('../utils/authMethods');

// Validation middleware with strong password policy
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').custom(expressValidatorPassword),
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

const updateValidation = [
  body('name').optional().trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('password').optional().custom(expressValidatorPassword),
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
  requireEmailPasswordAuth, // Check if email/password auth is enabled
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

// ===== OAUTH ROUTES =====

// Get available OAuth providers
router.get(
  '/oauth/providers',
  generalLimiter,
  authController.getOAuthProviders
);

// Google OAuth routes
router.get(
  '/google',
  authLimiter,
  requireOAuthAuth, // Check if OAuth is enabled
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  authLimiter,
  requireOAuthAuth, // Check if OAuth is enabled
  (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) {
        console.error('Google OAuth error:', err);
        return res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=authentication_failed`
        );
      }

      if (!user) {
        // Handle authentication failure with specific error message
        const errorMessage = info?.message || 'authentication_failed';
        return res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=${errorMessage}`
        );
      }

      // Login the user and proceed to success
      req.logIn(user, loginErr => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect(
            `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=login_failed`
          );
        }

        // Proceed to success handler
        return authController.oauthSuccess(req, res);
      });
    })(req, res, next);
  }
);

// GitHub OAuth routes
router.get(
  '/github',
  authLimiter,
  requireOAuthAuth, // Check if OAuth is enabled
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get(
  '/github/callback',
  authLimiter,
  requireOAuthAuth, // Check if OAuth is enabled
  (req, res, next) => {
    passport.authenticate('github', (err, user, info) => {
      if (err) {
        console.error('GitHub OAuth error:', err);
        return res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=authentication_failed`
        );
      }

      if (!user) {
        // Handle authentication failure with specific error message
        const errorMessage = info?.message || 'authentication_failed';
        return res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=${errorMessage}`
        );
      }

      // Login the user and proceed to success
      req.logIn(user, loginErr => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect(
            `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=login_failed`
          );
        }

        // Proceed to success handler
        return authController.oauthSuccess(req, res);
      });
    })(req, res, next);
  }
);

// OAuth failure route
router.get('/failure', authController.oauthFailure);

// Temporary OAuth success page (for testing)
router.get('/success', (req, res) => {
  const token = req.query.token;
  res.send(`
    <html>
      <body>
        <h1>OAuth Success!</h1>
        <p>Token: ${token}</p>
        <script>
          // Store token and redirect
          if (window.opener) {
            window.opener.postMessage({type: 'oauth-success', token: '${token}'}, '*');
            window.close();
          } else {
            localStorage.setItem('authToken', '${token}');
            setTimeout(() => window.location.href = '/dashboard', 2000);
          }
        </script>
      </body>
    </html>
  `);
});

// Unlink OAuth provider (authenticated users only)
router.delete(
  '/oauth/:provider',
  generalLimiter,
  auth,
  authController.unlinkOAuthProvider
);

module.exports = router;
