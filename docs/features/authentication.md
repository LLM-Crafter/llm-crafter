# Authentication

LLM Crafter implements a comprehensive authentication and authorization system to secure access to agents, projects, and resources. The platform supports multiple authentication methods and fine-grained access controls.

## Authentication Methods

### JWT Token Authentication

The primary authentication method uses JSON Web Tokens (JWT) for secure, stateless authentication.

**How it works:**

1. User provides credentials (email/password)
2. Server validates credentials and generates a JWT token
3. Token is included in subsequent requests
4. Server validates token on each request

**Token Format:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key Authentication

For programmatic access and integration with external systems.

**Features:**

- Long-lived tokens for automated systems
- Scoped permissions for specific resources
- Easy revocation and rotation
- Usage tracking and monitoring

## User Management

### User Registration

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

### User Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### Token Refresh

```http
POST /api/auth/refresh
Authorization: Bearer {current_token}
```

## Authorization Levels

### Organization-Level Access

Users can be members of multiple organizations with different roles:

- **Owner**: Full control over organization and all projects
- **Admin**: Manage projects and users within organization
- **Member**: Access to assigned projects
- **Viewer**: Read-only access to shared resources

### Project-Level Access

Within each organization, users have specific project permissions:

- **Project Owner**: Full control over the project
- **Contributor**: Can create and modify agents and tools
- **Viewer**: Read-only access to project resources

### Resource-Level Access

Fine-grained permissions for specific resources:

- **Agent Access**: Create, read, update, delete agents
- **Tool Access**: Manage tools and configurations
- **Execution Access**: Run agents and view results
- **API Access**: Use API endpoints and keys

## Security Features

### Password Security

- **Minimum Requirements**: 8 characters, mixed case, numbers
- **Hashing**: bcrypt with salt for secure password storage
- **Password Reset**: Secure reset flow with time-limited tokens
- **Account Lockout**: Protection against brute force attacks

### Token Security

- **Expiration**: Configurable token lifetime (default: 24 hours)
- **Secure Generation**: Cryptographically secure random tokens
- **Blacklisting**: Revoked tokens are maintained in blacklist
- **Refresh Mechanism**: Seamless token renewal

### Session Management

- **Single Sign-On**: Optional SSO integration
- **Session Timeout**: Automatic logout after inactivity
- **Concurrent Sessions**: Control over multiple active sessions
- **Device Tracking**: Monitor and manage device access

## API Key Management

### Creating API Keys

```http
POST /api/auth/api-keys
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "name": "Production Integration",
  "permissions": ["agents:read", "agents:execute"],
  "expires_at": "2024-12-31T23:59:59Z"
}
```

### Using API Keys

```http
GET /api/organizations/org_123/agents
X-API-Key: ak_1234567890abcdef...
```

### Key Rotation

```http
PUT /api/auth/api-keys/{key_id}/rotate
Authorization: Bearer {jwt_token}
```

## Middleware Integration

### Authentication Middleware

The `auth` middleware validates JWT tokens:

```javascript
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};
```

### Organization Authorization

The `organizationAuth` middleware checks organization membership:

```javascript
const orgAuth = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const user = req.user;

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const membership = organization.members.find(
      (member) => member.user.toString() === user._id.toString()
    );

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    req.organization = organization;
    req.userRole = membership.role;
    next();
  } catch (error) {
    res.status(500).json({ error: "Authorization check failed" });
  }
};
```

## Environment Configuration

### JWT Configuration

```bash
# .env
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

### Security Headers

```bash
# Additional security configuration
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Error Handling

### Authentication Errors

- **401 Unauthorized**: Missing or invalid token
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: User or resource not found
- **429 Too Many Requests**: Rate limit exceeded

### Error Response Format

```json
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED",
  "details": {
    "message": "No authentication token provided",
    "expected_header": "Authorization: Bearer <token>"
  }
}
```

## Best Practices

### For Developers

1. **Always Use HTTPS**: Encrypt all authentication traffic
2. **Validate Tokens**: Check token validity on every request
3. **Handle Expiration**: Implement automatic token refresh
4. **Secure Storage**: Never store tokens in localStorage for sensitive apps

### For Users

1. **Strong Passwords**: Use unique, complex passwords
2. **Regular Rotation**: Update API keys regularly
3. **Principle of Least Privilege**: Grant minimal necessary permissions
4. **Monitor Access**: Review access logs regularly

### For Administrators

1. **Regular Audits**: Review user access and permissions
2. **Monitor Failed Attempts**: Track authentication failures
3. **Update Dependencies**: Keep security libraries current
4. **Backup Recovery**: Maintain secure account recovery processes

## Integration Examples

### Client-Side JavaScript

```javascript
// Store token securely
const token = localStorage.getItem("auth_token");

// Make authenticated requests
const response = await fetch("/api/agents", {
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
});

if (response.status === 401) {
  // Handle token expiration
  await refreshToken();
}
```

### Server-to-Server

```javascript
// Using API key for service integration
const response = await fetch("/api/agents", {
  headers: {
    "X-API-Key": process.env.LLM_CRAFTER_API_KEY,
    "Content-Type": "application/json",
  },
});
```

The authentication system provides secure, scalable access control while maintaining ease of use for both developers and end users.
