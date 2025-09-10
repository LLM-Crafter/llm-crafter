const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');

// Helper function to check domain restrictions
const isDomainAllowed = email => {
  const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;
  if (!allowedDomains) return true; // No restrictions if not configured

  const domains = allowedDomains.split(',').map(d => d.trim().toLowerCase());
  const emailDomain = email.split('@')[1]?.toLowerCase();

  return domains.includes(emailDomain);
};

// Helper function to create or update user from OAuth profile
const findOrCreateOAuthUser = async (provider, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      return done(new Error('No email found in OAuth profile'), null);
    }

    // Check domain restrictions
    if (!isDomainAllowed(email)) {
      return done(null, false, {
        message: 'domain_not_allowed',
        details: `Email domain not allowed. Contact administrator.`,
      });
    }

    // First, try to find existing user by email
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // Update existing user with OAuth info
      if (!user.oauth) user.oauth = {};

      if (provider === 'google') {
        user.oauth.google = {
          id: profile.id,
          email: email,
          verified: profile.emails?.[0]?.verified || false,
        };
      } else if (provider === 'github') {
        user.oauth.github = {
          id: profile.id,
          username: profile.username,
          email: email,
        };
      }

      // Update email verification status if verified by OAuth provider
      if (profile.emails?.[0]?.verified) {
        user.emailVerified = true;
      }

      // Update avatar if not set
      if (!user.avatar && profile.photos?.[0]?.value) {
        user.avatar = profile.photos[0].value;
      }

      await user.save();
      return done(null, user);
    }

    // Create new user
    const oauthData = {};
    if (provider === 'google') {
      oauthData.google = {
        id: profile.id,
        email: email,
        verified: profile.emails?.[0]?.verified || false,
      };
    } else if (provider === 'github') {
      oauthData.github = {
        id: profile.id,
        username: profile.username,
        email: email,
      };
    }

    user = new User({
      email: email.toLowerCase(),
      name:
        profile.displayName ||
        profile.name?.givenName ||
        profile.username ||
        'OAuth User',
      oauth: oauthData,
      emailVerified: profile.emails?.[0]?.verified || false,
      avatar: profile.photos?.[0]?.value,
      // No password for OAuth users
    });

    await user.save();
    return done(null, user);
  } catch (error) {
    console.error(`${provider} OAuth error:`, error);
    return done(error, null);
  }
};

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Local Strategy (existing email/password authentication)
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        // Check if user is OAuth-only
        if (user.isOAuthUser()) {
          return done(null, false, {
            message: 'Please sign in using your OAuth provider',
          });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        return findOrCreateOAuthUser('google', profile, done);
      }
    )
  );
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || '/auth/github/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        return findOrCreateOAuthUser('github', profile, done);
      }
    )
  );
}

module.exports = passport;
