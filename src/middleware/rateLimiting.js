const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * Rate limiting configuration for different endpoint types
 * Protects against brute force attacks, DDoS, and API abuse
 */

// Create rate limiter store based on environment
const createStore = () => {
  if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
    // In production with Redis, use Redis store for distributed rate limiting
    try {
      const RedisStore = require('rate-limit-redis');
      const Redis = require('ioredis');
      const redis = new Redis(process.env.REDIS_URL);

      return new RedisStore({
        sendCommand: (...args) => redis.call(...args),
      });
    } catch (error) {
      console.warn(
        'Redis rate limit store not available, falling back to memory store'
      );
    }
  }

  // Default to memory store (built-in)
  return undefined; // Uses default MemoryStore
};

// Common rate limiter configuration
const createRateLimiter = options => {
  return rateLimit({
    store: createStore(),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: options.windowMs / 1000,
    },
    ...options,
  });
};

// Authentication endpoints - Very strict limits
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: false, // Count failed requests
  message: {
    error: 'Too many authentication attempts',
    message:
      'Too many login/register attempts. Please try again in 15 minutes.',
    retryAfter: 15 * 60,
  },
});

// Login specifically - Even stricter
const loginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 login attempts per 10 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
  skipFailedRequests: false, // Count failed attempts
  message: {
    error: 'Too many login attempts',
    message: 'Too many failed login attempts. Please try again in 10 minutes.',
    retryAfter: 10 * 60,
  },
});

// Password reset/sensitive operations - Very strict
const sensitiveOpLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 attempts per hour
  message: {
    error: 'Too many sensitive operation attempts',
    message:
      'Too many password reset or sensitive operation attempts. Please try again in 1 hour.',
    retryAfter: 60 * 60,
  },
});

// API key operations - 1 request per second
const apiKeyLimiter = createRateLimiter({
  windowMs: 1 * 1000, // 1 second
  max: 10, // 10 requests per second
  message: {
    error: 'Too many API key operations',
    message:
      'API key operations are limited to 10 requests per second. Please slow down.',
    retryAfter: 1,
  },
});

// LLM proxy endpoints - 20 requests per second
const proxyLimiter = createRateLimiter({
  windowMs: 1 * 1000, // 1 second
  max: 20, // 20 requests per second
  message: {
    error: 'Too many LLM requests',
    message: 'LLM requests are limited to 20 per second. Please slow down.',
    retryAfter: 1,
  },
});

// General API endpoints - 10 requests per second
const generalLimiter = createRateLimiter({
  windowMs: 1 * 1000, // 1 second
  max: 10, // 10 requests per second
  message: {
    error: 'Too many requests',
    message: 'API requests are limited to 10 per second. Please slow down.',
    retryAfter: 1,
  },
});

// Health check and public endpoints - Very generous
const publicLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: {
    error: 'Rate limit exceeded',
    message: 'Too many requests to public endpoints.',
    retryAfter: 60,
  },
});

// Slow down middleware for gradual response delays
const createSlowDown = options => {
  return slowDown({
    store: createStore(),
    ...options,
  });
};

// Progressive delays for authentication endpoints
const authSlowDown = createSlowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 2, // Allow 2 requests per 15 minutes without delay
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit || 2;
    return (used - delayAfter) * 500; // Add 500ms delay per request after delayAfter
  },
  maxDelayMs: 20000, // Maximum delay of 20 seconds
});

// Progressive delays for general API
const generalSlowDown = createSlowDown({
  windowMs: 1 * 60 * 1000, // 1 minute
  delayAfter: 50, // Allow 50 requests per minute without delay
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit || 50;
    return (used - delayAfter) * 100; // Add 100ms delay per request after delayAfter
  },
  maxDelayMs: 5000, // Maximum delay of 5 seconds
});

// IP whitelist for testing/admin (optional)
const createWhitelistSkip = (whitelist = []) => {
  return req => {
    const clientIp = req.ip || req.connection.remoteAddress;
    return whitelist.includes(clientIp);
  };
};

// Development mode bypass
const createDevSkip = () => {
  return req => {
    return (
      process.env.NODE_ENV === 'development' &&
      process.env.SKIP_RATE_LIMIT === 'true'
    );
  };
};

// Custom rate limit handler with logging
const customHandler = (req, res, next, options) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const endpoint = req.originalUrl;

  console.warn('🚨 Rate limit exceeded:', {
    ip: clientIp,
    userAgent: userAgent.substring(0, 100),
    endpoint,
    timestamp: new Date().toISOString(),
    limit: options.max,
    windowMs: options.windowMs,
  });

  // Could integrate with monitoring/alerting system here

  res.status(429).json(options.message);
};

// Apply custom handler to all limiters
const limitersWithCustomHandler = {
  authLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    handler: customHandler,
    message: {
      error: 'Too many authentication attempts',
      message:
        'Too many login/register attempts. Please try again in 15 minutes.',
      retryAfter: 15 * 60,
    },
  }),

  loginLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 3,
    skipSuccessfulRequests: true,
    handler: customHandler,
    message: {
      error: 'Too many login attempts',
      message:
        'Too many failed login attempts. Please try again in 15 minutes.',
      retryAfter: 15 * 60,
    },
  }),

  // Add custom handlers to other limiters as needed
};

module.exports = {
  // Rate limiters
  authLimiter,
  loginLimiter,
  sensitiveOpLimiter,
  apiKeyLimiter,
  proxyLimiter,
  generalLimiter,
  publicLimiter,

  // Slow down middleware
  authSlowDown,
  generalSlowDown,

  // Utility functions
  createRateLimiter,
  createSlowDown,
  createWhitelistSkip,
  createDevSkip,
  customHandler,

  // Enhanced limiters with custom handlers
  limitersWithCustomHandler,
};
