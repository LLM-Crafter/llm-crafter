# Authentication

LLM Crafter implements a comprehensive authentication and authorization system to secure access to agents, projects, and resources. The platform supports multiple authentication methods, OAuth integration, and fine-grained role-based access controls.

## Authentication Methods

LLM Crafter supports flexible authentication configuration via the `AUTH_METHODS` environment variable:

```bash
# Enable both email/password and OAuth (default)
AUTH_METHODS=emailpassword,oauth

# Only email/password
AUTH_METHODS=emailpassword

# Only OAuth
AUTH_METHODS=oauth
```

### JWT Token Authentication

The primary authentication method uses JSON Web Tokens (JWT) for secure, stateless authentication.

**How it works:**

1. User authenticates via email/password or OAuth provider
2. Server validates credentials and generates a JWT token
3. Token is included in subsequent requests via Authorization header
4. Server validates token on each request using the `auth` middleware

**Token Format:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Configuration:**

```bash
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h  # Default token expiration
```

### OAuth Authentication

LLM Crafter supports OAuth 2.0 authentication with multiple providers:

- **Google OAuth**: Sign in with Google account
- **GitHub OAuth**: Sign in with GitHub account

**OAuth Configuration:**

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback

# Frontend URL for OAuth redirects
FRONTEND_URL=http://localhost:3000
```

### API Key Authentication

For programmatic access and agent execution from external systems.

**Features:**

- Project-scoped API keys for LLM providers
- Used for agent execution with specific models
- Encrypted storage using AES-256-GCM
- Management via API endpoints

See [API Keys documentation](/api/api-keys) for details.

## User Management

### Get Password Policy

Get the current password requirements before registration:

```http
GET /api/v1/auth/password-policy
```

**Response:**

```json
{
  "success": true,
  "data": {
    "minLength": 8,
    "requireUppercase": true,
    "requireLowercase": true,
    "requireNumbers": true,
    "requireSpecialChars": true,
    "commonPasswordCheck": true
  }
}
```

### User Registration

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "MyS3cur3K3y!"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": false,
    "isOAuthUser": false,
    "avatar": null
  },
  "passwordStrength": "strong",
  "warnings": []
}
```

**Validation:**

- Email must be valid format
- Name: 2-100 characters
- Password must meet policy requirements (see password policy endpoint)
- Domain restrictions apply if `ALLOWED_EMAIL_DOMAINS` is set

**Error Response:**

```json
{
  "error": "Password does not meet security requirements",
  "details": [
    "Password must contain at least one uppercase letter",
    "Password must contain at least one special character"
  ],
  "policy": {
    "minLength": 8,
    "requireUppercase": true,
    "requireLowercase": true,
    "requireNumbers": true,
    "requireSpecialChars": true
  }
}
```

### User Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "MyS3cur3K3y!"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": false,
    "isOAuthUser": false,
    "avatar": null
  }
}
```

**Error Cases:**

- `401 Unauthorized`: Invalid credentials
- `400 Bad Request`: OAuth-only user attempting email/password login
- `400 Bad Request`: Email/password authentication disabled

### Get User Profile

```http
GET /api/v1/auth/profile
Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
  "id": "user_123",
  "email": "john@example.com",
  "name": "John Doe",
  "emailVerified": true,
  "isOAuthUser": false,
  "avatar": "https://...",
  "primaryOAuthProvider": null,
  "connectedProviders": [],
  "security": {
    "shouldUpdatePassword": false,
    "passwordStrength": "strong"
  }
}
```

### Update User Profile

```http
PUT /api/v1/auth/profile
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "name": "John Smith",
  "password": "NewS3cur3P@ss!"  // Optional
}
```

**Response:**

```json
{
  "id": "user_123",
  "email": "john@example.com",
  "name": "John Smith",
  "security": {
    "shouldUpdatePassword": false,
    "passwordStrength": "strong"
  }
}
```

## OAuth Integration

### Get Available OAuth Providers

```http
GET /api/v1/auth/oauth/providers
```

**Response:**

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "name": "google",
        "displayName": "Google",
        "authUrl": "/api/v1/auth/google"
      },
      {
        "name": "github",
        "displayName": "GitHub",
        "authUrl": "/api/v1/auth/github"
      }
    ],
    "authMethods": {
      "enabledMethods": ["emailpassword", "oauth"],
      "emailPasswordEnabled": true,
      "oauthEnabled": true
    },
    "domainRestricted": true,
    "allowedDomains": ["example.com", "company.com"]
  }
}
```

### Google OAuth Flow

**1. Initiate OAuth:**

```http
GET /api/v1/auth/google
```

Redirects to Google OAuth consent screen.

**2. OAuth Callback:**

```http
GET /api/v1/auth/google/callback?code={auth_code}
```

On success, redirects to: `{FRONTEND_URL}/auth/success?token={jwt_token}`

On failure, redirects to: `{FRONTEND_URL}/auth/error?message={error_message}`

### GitHub OAuth Flow

**1. Initiate OAuth:**

```http
GET /api/v1/auth/github
```

Redirects to GitHub OAuth authorization page.

**2. OAuth Callback:**

```http
GET /api/v1/auth/github/callback?code={auth_code}
```

On success, redirects to: `{FRONTEND_URL}/auth/success?token={jwt_token}`

On failure, redirects to: `{FRONTEND_URL}/auth/error?message={error_message}`

### Unlink OAuth Provider

Users can disconnect OAuth providers if they have alternative authentication methods:

```http
DELETE /api/v1/auth/oauth/{provider}
Authorization: Bearer {jwt_token}
```

**Example:**

```http
DELETE /api/v1/auth/oauth/google
Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
  "success": true,
  "message": "google account unlinked successfully"
}
```

**Error Cases:**

- `400 Bad Request`: Cannot unlink the only authentication method
- `404 Not Found`: Provider not found or not connected

## Authorization Levels

### Organization Roles

LLM Crafter uses role-based access control (RBAC) within organizations. Users have one of three roles:

| Role       | Permissions                                                        | Access Level |
| ---------- | ------------------------------------------------------------------ | ------------ |
| **admin**  | Full control over organization, projects, and members              | Level 3      |
| **member** | Create and manage agents, execute agents, manage project resources | Level 2      |
| **viewer** | Read-only access to agents, conversations, and project data        | Level 1      |

**Role Hierarchy:**

The system uses a hierarchical role system where higher roles inherit permissions from lower roles:

- `admin` (3) ≥ `member` (2) ≥ `viewer` (1)

### Organization Authorization Middleware

The `organizationAuth` middleware provides three authorization methods:

#### 1. `isMember` - Check Organization Membership

```javascript
router.get('/resource', auth, orgAuth.isMember, handler);
```

Verifies user is a member of the organization (any role). Sets `req.userRole` to the user's role.

#### 2. `isAdmin` - Require Admin Role

```javascript
router.delete('/resource', auth, orgAuth.isAdmin, handler);
```

Requires user to have admin role in the organization.

#### 3. `hasRole(minimumRole)` - Role-Based Access

```javascript
// Requires at least viewer role
router.get('/agents', auth, orgAuth.hasRole('viewer'), handler);

// Requires at least member role
router.post('/agents', auth, orgAuth.hasRole('member'), handler);

// Requires admin role
router.delete('/org', auth, orgAuth.hasRole('admin'), handler);
```

Checks if user's role meets or exceeds the minimum required role based on hierarchy.

## Security Features

### Domain Restrictions

Restrict user registration to specific email domains:

```bash
# Only allow users from these domains
ALLOWED_EMAIL_DOMAINS=company.com,partner.org
```

When configured:

- Registration validates email domain
- OAuth users must have email from allowed domains
- Returns error: `DOMAIN_NOT_ALLOWED` if domain is not permitted

### Password Security

**Password Policy Requirements:**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Cannot contain common words (password, admin, user, etc.)

**Implementation:**

- Hashing: bcrypt with automatic salting
- Strength scoring: weak, medium, strong, very strong
- Common password detection
- Detailed validation feedback on registration

### Token Security

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Expiration**: Configurable via `JWT_EXPIRES_IN` (default: 24h)
- **Secret**: Must be set via `JWT_SECRET` environment variable
- **Validation**: Every request validates token signature and expiration
- **User Lookup**: Token contains `userId`, user fetched from database on each request

### Session Management

- **Stateless**: JWT-based authentication, no server-side sessions
- **OAuth Sessions**: Managed by Passport.js for OAuth flows
- **Security Headers**: CORS, rate limiting applied per route

## Rate Limiting

LLM Crafter implements comprehensive rate limiting to protect against abuse:

### Authentication Endpoints

**Auth Limiter** (5 requests per 15 minutes):

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/github`
- `PUT /api/v1/auth/profile`

**Login Limiter** (3 failed attempts per 15 minutes):

- `POST /api/v1/auth/login`

**General Limiter** (100 requests per 15 minutes):

- `GET /api/v1/auth/profile`
- `GET /api/v1/auth/password-policy`
- `GET /api/v1/auth/oauth/providers`
- `DELETE /api/v1/auth/oauth/:provider`

**Slow Down Middleware**:

- Progressive delays after 2 requests
- Applied to login and registration

## Middleware Integration

### Authentication Middleware

The `auth` middleware validates JWT tokens on protected routes:

```javascript
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

**Usage:**

```javascript
router.get('/protected-route', auth, handler);
```

### Organization Authorization Middleware

The `organizationAuth` middleware provides role-based access control:

```javascript
const organizationAuth = {
  // Check if user is a member (any role)
  isMember: async (req, res, next) => {
    const organization = await Organization.findOne({
      _id: req.params.orgId,
      'members.user': req.user._id,
    });

    if (!organization) {
      return res.status(403).json({
        error: 'Access denied: Not a member of this organization',
      });
    }

    req.userRole = organization.members.find(m => m.user === req.user._id).role;
    next();
  },

  // Check if user is an admin
  isAdmin: async (req, res, next) => {
    const organization = await Organization.findOne({
      _id: req.params.orgId,
      'members.user': req.user._id,
      'members.role': 'admin',
    });

    if (!organization) {
      return res.status(403).json({
        error: 'Access denied: Admin rights required',
      });
    }

    req.userRole = 'admin';
    next();
  },

  // Check if user has minimum role
  hasRole: minimumRole => {
    const roleHierarchy = {
      admin: 3,
      member: 2,
      viewer: 1,
    };

    return async (req, res, next) => {
      const organization = await Organization.findOne({
        _id: req.params.orgId,
        'members.user': req.user._id,
      });

      if (!organization) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const userRole = organization.members.find(
        m => m.user === req.user._id
      ).role;

      if (roleHierarchy[userRole] >= roleHierarchy[minimumRole]) {
        req.userRole = userRole;
        next();
      } else {
        res.status(403).json({
          error: `Access denied: ${minimumRole} role required`,
        });
      }
    };
  },
};
```

**Usage:**

```javascript
// Any organization member
router.get('/resource', auth, orgAuth.isMember, handler);

// Admin only
router.delete('/resource', auth, orgAuth.isAdmin, handler);

// Role-based access
router.get('/agents', auth, orgAuth.hasRole('viewer'), handler);
router.post('/agents', auth, orgAuth.hasRole('member'), handler);
router.delete('/org', auth, orgAuth.hasRole('admin'), handler);
```

## Environment Configuration

### Required Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-min-32-chars
JWT_EXPIRES_IN=24h

# Session Secret (for OAuth)
SESSION_SECRET=your-session-secret-here

# Authentication Methods (comma-separated)
AUTH_METHODS=emailpassword,oauth  # Default: both enabled

# Domain Restrictions (optional)
ALLOWED_EMAIL_DOMAINS=company.com,partner.org

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:3000

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback

# Encryption (for API key storage)
ENCRYPTION_KEY=your-32-character-encryption-key
```

### Authentication Method Configuration

Control which authentication methods are enabled:

```bash
# Both methods (default)
AUTH_METHODS=emailpassword,oauth

# Email/password only
AUTH_METHODS=emailpassword

# OAuth only
AUTH_METHODS=oauth
```

**Behavior:**

- If `emailpassword` is disabled, registration and login endpoints return `AUTH_METHOD_DISABLED` error
- If `oauth` is disabled, OAuth routes return `AUTH_METHOD_DISABLED` error
- The `/api/v1/auth/oauth/providers` endpoint shows which methods are currently enabled

## Error Handling

### Authentication Error Codes

| Status Code | Error                               | Description                              |
| ----------- | ----------------------------------- | ---------------------------------------- |
| `401`       | `Authentication required`           | No token provided                        |
| `401`       | `Invalid token`                     | Token is malformed or expired            |
| `401`       | `User not found`                    | Token valid but user doesn't exist       |
| `403`       | `Access denied`                     | User lacks required permissions          |
| `403`       | `Not a member of this organization` | User not in organization                 |
| `403`       | `Admin rights required`             | User needs admin role                    |
| `403`       | `{role} role required`              | User needs minimum role                  |
| `400`       | `AUTH_METHOD_DISABLED`              | Authentication method is disabled        |
| `400`       | `DOMAIN_NOT_ALLOWED`                | Email domain not in allowed list         |
| `400`       | `OAUTH_ONLY_USER`                   | User must sign in via OAuth provider     |
| `400`       | `LAST_AUTH_METHOD`                  | Cannot unlink only authentication method |
| `429`       | `Too Many Requests`                 | Rate limit exceeded                      |

### Error Response Format

```json
{
  "error": "Error message description",
  "code": "ERROR_CODE",
  "details": ["Additional", "context", "information"]
}
```

### OAuth Error Handling

OAuth errors redirect to frontend with error message:

```
{FRONTEND_URL}/auth/error?message=authentication_failed
{FRONTEND_URL}/auth/error?message=domain_not_allowed
{FRONTEND_URL}/auth/error?message=token_generation_failed
```

## Integration Examples

### Client-Side JavaScript (React Example)

```javascript
// Login with email/password
const login = async (email, password) => {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (response.ok) {
    const { token, user } = await response.json();
    localStorage.setItem('authToken', token);
    return { token, user };
  }

  throw new Error(await response.text());
};

// Make authenticated request
const fetchAgents = async () => {
  const token = localStorage.getItem('authToken');

  const response = await fetch(
    '/api/v1/organizations/org_123/projects/proj_456/agents',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (response.status === 401) {
    // Token expired, redirect to login
    window.location.href = '/login';
    return;
  }

  return response.json();
};

// OAuth login with popup
const loginWithGoogle = () => {
  const width = 600;
  const height = 700;
  const left = (window.innerWidth - width) / 2;
  const top = (window.innerHeight - height) / 2;

  const popup = window.open(
    '/api/v1/auth/google',
    'oauth-login',
    `width=${width},height=${height},left=${left},top=${top}`
  );

  // Listen for OAuth callback
  window.addEventListener('message', event => {
    if (event.data.type === 'oauth-success') {
      localStorage.setItem('authToken', event.data.token);
      popup?.close();
      window.location.href = '/dashboard';
    }
  });
};
```

### Server-to-Server (Node.js Example)

```javascript
// Using JWT token
const axios = require('axios');

const client = axios.create({
  baseURL: 'https://api.llmcrafter.com',
  headers: {
    Authorization: `Bearer ${process.env.LLM_CRAFTER_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

// Execute agent
const response = await client.post(
  '/api/v1/organizations/org_123/projects/proj_456/agents/agent_789/chat',
  {
    message: 'Hello, how can you help me?',
    user_identifier: 'system_user',
  }
);
```

### cURL Examples

```bash
# Register new user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "MyS3cur3K3y!"
  }'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "MyS3cur3K3y!"
  }'

# Get profile
curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get OAuth providers
curl -X GET http://localhost:3000/api/v1/auth/oauth/providers
```
