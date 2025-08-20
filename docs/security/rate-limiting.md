# Rate Limiting Security Guide

## Overview

LLM Crafter implements comprehensive rate limiting to protect against brute force attacks, DDoS attempts, and API abuse. Different endpoints have different rate limits based on their sensitivity and resource usage.

## Rate Limiting Strategy

### 🎯 **Tiered Protection**

1. **Authentication Endpoints** - Strictest limits
2. **API Key Operations** - Moderate limits
3. **LLM Proxy Endpoints** - Usage-based limits
4. **General API Endpoints** - Standard limits
5. **Public Endpoints** - Generous limits

### 🛡️ **Protection Mechanisms**

- **Hard Limits**: Request blocking after threshold
- **Progressive Delays**: Increasing response times (slow-down)
- **IP-based Tracking**: Per-IP address rate limiting
- **Window-based Reset**: Time-based limit resets
- **Standardized Headers**: Client-friendly rate limit info

## Rate Limit Configuration

### 🔐 **Authentication Endpoints**

```javascript
// /api/v1/auth/register
// /api/v1/auth/profile (updates)
Rate Limit: 5 requests per 15 minutes
Progressive Delays: After 2 requests (500ms+ per request)
Max Delay: 20 seconds
```

### 🗝️ **Login Endpoint**

```javascript
// /api/v1/auth/login
Rate Limit: 5 failed attempts per 10 minutes
Note: Successful logins don't count against limit
Progressive Delays: After 2 requests
```

### 🔑 **API Key Operations**

```javascript
// API key creation, deletion, member management
Rate Limit: 1 request per second
Endpoints: /api-keys/*, /members/*
```

### 🤖 **LLM Proxy Endpoints**

```javascript
// /api/v1/proxy/execute/*
// /api/v1/proxy/test-prompt
Rate Limit: 20 requests per second
Progressive Delays: After 50 requests (100ms+ per request)
Max Delay: 5 seconds
```

### 🌐 **General API Endpoints**

```javascript
// Organizations, projects, tools, statistics
Rate Limit: 10 requests per second
Progressive Delays: After 50 requests per minute
```

### 🏥 **Public Endpoints**

```javascript
// /health, /tools (read-only)
Rate Limit: 120 requests per minute
Very generous for monitoring and public access
```

## Implementation Details

### 📦 **Libraries Used**

- **express-rate-limit**: Core rate limiting functionality
- **express-slow-down**: Progressive delay implementation
- **Memory Store**: Default storage (suitable for single-instance)
- **Redis Store**: Available for distributed deployments

### 🔧 **Configuration Options**

#### Environment Variables

```bash
# Optional: Skip rate limiting in development
SKIP_RATE_LIMIT=true

# Optional: Redis URL for distributed rate limiting
REDIS_URL=redis://localhost:6379
```

#### Production Setup

```bash
# Production environment
NODE_ENV=production
REDIS_URL=your_redis_connection_string
```

### 📊 **Rate Limit Headers**

Clients receive helpful headers with every response:

```http
RateLimit-Limit: 100
RateLimit-Remaining: 45
RateLimit-Reset: 1640995200
```

### 🚨 **Rate Limit Response**

When rate limited, clients receive:

```json
{
  "error": "Too many requests",
  "message": "You have exceeded the rate limit. Please try again later.",
  "retryAfter": 900
}
```

## Security Features

### 🛡️ **Attack Protection**

1. **Brute Force**: Login attempts limited to 3 per 15 minutes
2. **Account Enumeration**: Registration attempts limited
3. **API Abuse**: LLM endpoints protected from rapid-fire requests
4. **DDoS**: Overall request volume controlled
5. **Resource Exhaustion**: Progressive delays reduce server load

### 📝 **Logging & Monitoring**

Rate limit violations are automatically logged:

```javascript
{
  ip: "192.168.1.100",
  userAgent: "Mozilla/5.0...",
  endpoint: "/api/v1/auth/login",
  timestamp: "2025-08-19T10:30:00.000Z",
  limit: 3,
  windowMs: 900000
}
```

### 🎛️ **Bypass Options**

#### Development Mode

```bash
# Skip rate limiting in development
SKIP_RATE_LIMIT=true npm run dev
```

#### IP Whitelist (Optional)

```javascript
// Custom whitelist implementation available
const whitelist = ["127.0.0.1", "192.168.1.0/24"];
```

## Testing Rate Limits

### 🧪 **Automated Testing**

```bash
# Test all rate limiting scenarios
npm run test:rate-limiting

# Start server first
npm run dev

# Then in another terminal
npm run test:rate-limiting
```

### 📊 **Test Results**

- Health endpoint protection
- Authentication rate limiting
- General endpoint limits
- Rate limit headers
- Progressive delays

### 🔍 **Manual Testing**

#### Test Login Rate Limiting

```bash
# Make multiple failed login attempts
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fake@test.com","password":"wrong"}'
```

#### Test General Rate Limiting

```bash
# Make many requests quickly
for i in {1..150}; do
  curl -s http://localhost:3000/health > /dev/null &
done
```

## Production Deployment

### 🚀 **Recommended Setup**

1. **Use Redis Store** for distributed rate limiting:

```bash
# Install Redis store
npm install rate-limit-redis ioredis

# Set Redis URL
REDIS_URL=redis://your-redis-server:6379
```

2. **Monitor Rate Limit Events**:

```javascript
// Add to monitoring/alerting system
// Check logs for rate limit violations
// Set up alerts for unusual patterns
```

3. **Configure Load Balancer**:

```nginx
# Nginx configuration
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;
```

### 📈 **Scaling Considerations**

#### Single Instance

- Memory store works well
- Simple setup, no dependencies
- Rate limits per server instance

#### Multiple Instances

- Redis store recommended
- Shared rate limiting across instances
- Consistent user experience

#### Cloud Deployment

- Use managed Redis (AWS ElastiCache, etc.)
- Consider CDN-level rate limiting
- Load balancer integration

## Customization

### 🔧 **Adjusting Limits**

Edit `/src/middleware/rateLimiting.js`:

```javascript
// Custom rate limiter
const customLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 50, // 50 requests per window
  message: {
    error: "Custom rate limit",
    message: "Too many requests to this endpoint",
  },
});

// Apply to specific routes
router.post("/custom-endpoint", customLimiter, handler);
```

### 📊 **Different Limits by User Type**

```javascript
// Example: Higher limits for premium users
const createUserBasedLimiter = (req, res, next) => {
  const isPreminm = req.user?.isPremium;
  const limit = isPremium ? 200 : 100;

  const limiter = createRateLimiter({
    max: limit,
    // ... other options
  });

  return limiter(req, res, next);
};
```

### 🎯 **Custom Skip Logic**

```javascript
// Skip rate limiting for admin users
const skipAdmin = (req) => {
  return req.user?.role === "admin";
};

const limiter = createRateLimiter({
  skip: skipAdmin,
  // ... other options
});
```

## Monitoring & Troubleshooting

### 📊 **Metrics to Track**

1. **Rate Limit Hits**: Number of requests blocked
2. **Top Rate Limited IPs**: Identify attackers
3. **Endpoint Popularity**: Which endpoints hit limits most
4. **User Impact**: Legitimate users affected

### 🔍 **Common Issues**

#### False Positives

```bash
# Legitimate users getting rate limited
# Solution: Increase limits or implement user-based limits
```

#### Performance Impact

```bash
# Rate limiting affecting response times
# Solution: Optimize rate limit storage, use Redis
```

#### Distributed Issues

```bash
# Different limits across server instances
# Solution: Use Redis store for consistency
```

### 🚨 **Alerting Setup**

```javascript
// Monitor high rate limit activity
if (rateLimitViolations > threshold) {
  sendAlert({
    severity: "high",
    message: "Unusual rate limiting activity detected",
    ip: clientIp,
    endpoint: endpoint,
  });
}
```

## Security Best Practices

### ✅ **Production Checklist**

- [ ] Rate limiting enabled on all endpoints
- [ ] Redis store configured for multi-instance deployments
- [ ] Rate limit violations monitored and alerted
- [ ] Progressive delays configured for auth endpoints
- [ ] Rate limit headers exposed to clients
- [ ] Custom rate limits for sensitive operations
- [ ] Load balancer rate limiting configured
- [ ] Regular testing of rate limit effectiveness

### 🔐 **Additional Security Layers**

1. **Web Application Firewall (WAF)**
2. **DDoS Protection Service**
3. **IP Reputation Blocking**
4. **Geolocation-based Filtering**
5. **Behavioral Analysis**

### 📋 **Regular Maintenance**

- Review rate limit logs monthly
- Adjust limits based on usage patterns
- Update rate limiting rules for new endpoints
- Test rate limiting after deployments
- Monitor for bypass attempts

Rate limiting is a critical security control that protects your API from abuse while maintaining good user experience. The implementation provides comprehensive protection with flexibility for customization and scaling.

## Summary Table

| Endpoint Type          | Rate Limit        | Window     | Notes                              |
| ---------------------- | ----------------- | ---------- | ---------------------------------- |
| **Login**              | 5 failed attempts | 10 minutes | Successful logins don't count      |
| **Authentication**     | 5 requests        | 15 minutes | Registration, profile updates      |
| **API Key Operations** | 1 request         | 1 second   | Key creation, deletion, management |
| **LLM Proxy**          | 20 requests       | 1 second   | Chat completions, model calls      |
| **General API**        | 10 requests       | 1 second   | Organizations, tools, statistics   |
| **Public/Health**      | 120 requests      | 1 minute   | Health checks, public endpoints    |

### Progressive Delays

- **Authentication**: 500ms+ delay after 2 requests (max 20s)
- **General API**: 100ms+ delay after 50 requests (max 5s)

### Testing

```bash
npm run test:rate-limiting  # Comprehensive test suite
```
