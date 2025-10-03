# OAuth Authentication

Complete guide for implementing OAuth authentication with Google and GitHub in LLM Crafter.

## Overview

LLM Crafter supports multiple authentication methods that can be enabled individually or in combination:

- **Email/Password** - Traditional authentication
- **Google OAuth** - Sign in with Google
- **GitHub OAuth** - Sign in with GitHub
- **Domain Restrictions** - Optionally limit registration to specific email domains

### Key Features

- **Mixed Authentication** - Users can have both password and OAuth
- **OAuth-Only Users** - Users created via OAuth don't need passwords
- **Account Linking** - Link multiple OAuth providers to one account
- **Domain Restrictions** - Control who can register via email domains
- **Extensible** - Easy to add more OAuth providers

## Quick Start

### Step 1: Get OAuth Credentials

**Google OAuth:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API
4. Go to "Credentials" and create "OAuth 2.0 Client ID"
5. Configure authorized redirect URIs:
   - Development: `http://localhost:8000/api/v1/auth/google/callback`
   - Production: `https://your-domain.com/api/v1/auth/google/callback`
6. Copy the Client ID and Client Secret

**GitHub OAuth:**

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - Application name: "LLM Crafter"
   - Homepage URL: `http://localhost:3000` (development)
   - Authorization callback URL: `http://localhost:8000/api/v1/auth/github/callback`
4. Copy the Client ID and Client Secret

### Step 2: Configure Environment Variables

Add these to your `.env` file:

```bash
# Frontend URL for OAuth redirects
FRONTEND_URL=http://localhost:3000

# Session secret for OAuth (different from JWT secret)
SESSION_SECRET=your-session-secret-for-oauth-here

# Authentication methods (optional, defaults to both)
AUTH_METHODS=emailpassword,oauth

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8000/api/v1/auth/google/callback

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:8000/api/v1/auth/github/callback

# Domain restrictions (optional)
ALLOWED_EMAIL_DOMAINS=company.com,trusted-partner.com
```

### Step 3: Restart Application

```bash
npm run dev
```

### Step 4: Verify Configuration

```bash
curl http://localhost:8000/api/v1/auth/oauth/providers
```

## API Reference

### Get Available OAuth Providers

Retrieve configured OAuth providers and authentication methods.

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
    "allowedDomains": ["company.com", "trusted.org"]
  }
}
```

### Initiate OAuth Flow

Redirect users to these URLs to start OAuth authentication:

```http
GET /api/v1/auth/google    # Initiate Google OAuth
GET /api/v1/auth/github    # Initiate GitHub OAuth
```

**Implementation:**

```javascript
// Redirect user to OAuth provider
window.location.href = '/api/v1/auth/google';
```

### OAuth Callback URLs

After authentication, users are redirected to your frontend:

**Success:**

```
${FRONTEND_URL}/auth/success?token=<jwt_token>
```

**Failure:**

```
${FRONTEND_URL}/auth/error?message=<error_message>
```

### Get User Profile

Enhanced profile endpoint includes OAuth information:

```http
GET /api/v1/auth/profile
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "id": "user-uuid",
  "email": "user@company.com",
  "name": "User Name",
  "emailVerified": true,
  "isOAuthUser": false,
  "avatar": "https://avatars.githubusercontent.com/u/123456",
  "primaryOAuthProvider": "google",
  "connectedProviders": ["google", "github"],
  "security": {
    "shouldUpdatePassword": false,
    "passwordStrength": "very-strong"
  }
}
```

### Unlink OAuth Provider

Remove an OAuth provider from user account:

```http
DELETE /api/v1/auth/oauth/{provider}
Authorization: Bearer <jwt_token>
```

**Example:**

```bash
curl -X DELETE "http://localhost:8000/api/v1/auth/oauth/google" \
  -H "Authorization: Bearer your_jwt_token"
```

**Response:**

```json
{
  "success": true,
  "message": "google account unlinked successfully"
}
```

**Error (if last auth method):**

```json
{
  "error": "Cannot unlink the only authentication method. Set a password first.",
  "code": "LAST_AUTH_METHOD"
}
```

## Configuration Options

### Authentication Methods

Control which authentication methods are available:

```bash
# Both email/password and OAuth enabled (default)
AUTH_METHODS=emailpassword,oauth

# OAuth only (no email/password)
AUTH_METHODS=oauth

# Email/password only (no OAuth)
AUTH_METHODS=emailpassword
```

### Domain Restrictions

Restrict registration to specific email domains:

```bash
ALLOWED_EMAIL_DOMAINS=company.com,partner.org,trusted-domain.net
```

**Behavior:**

- Only users with emails from these domains can register
- Applies to both email/password and OAuth registration
- Existing users with non-allowed domains can still log in
- Optional - omit to allow all domains

### Production Configuration

For production deployments:

```bash
# Use HTTPS callback URLs
GOOGLE_CALLBACK_URL=https://your-domain.com/api/v1/auth/google/callback
GITHUB_CALLBACK_URL=https://your-domain.com/api/v1/auth/github/callback

# Set frontend URL to production domain
FRONTEND_URL=https://your-domain.com

# Use strong session secret
SESSION_SECRET=generate-a-long-random-string

# Enable domain restrictions if needed
ALLOWED_EMAIL_DOMAINS=your-company.com
```

## User Model

The User model includes OAuth-related fields:

```javascript
{
  // Standard fields
  email: String,
  name: String,
  password: String, // Optional for OAuth-only users

  // OAuth fields
  oauth: {
    google: {
      id: String,
      email: String,
      verified: Boolean
    },
    github: {
      id: String,
      username: String,
      email: String
    }
  },

  // Additional fields
  emailVerified: Boolean,
  avatar: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Frontend Integration

### Dynamic Login Page

```javascript
// Fetch available authentication methods
const response = await fetch('/api/v1/auth/oauth/providers');
const { data } = await response.json();

// Show email/password form if enabled
if (data.authMethods.emailPasswordEnabled) {
  renderEmailPasswordForm();
}

// Show OAuth buttons if enabled
if (data.authMethods.oauthEnabled) {
  data.providers.forEach(provider => {
    renderOAuthButton(provider);
  });
}

// Show domain restrictions warning
if (data.domainRestricted) {
  showDomainWarning(data.allowedDomains);
}
```

### OAuth Button Implementation

```javascript
function renderOAuthButton(provider) {
  const button = document.createElement('button');
  button.textContent = `Sign in with ${provider.displayName}`;
  button.onclick = () => {
    window.location.href = provider.authUrl;
  };
  return button;
}
```

### Handle OAuth Success

```javascript
// On /auth/success page
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (token) {
    // Store token
    localStorage.setItem('authToken', token);

    // Redirect to dashboard
    window.location.href = '/dashboard';
  }
}, []);
```

### Handle OAuth Error

```javascript
// On /auth/error page
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('message');

  const errorMessages = {
    authentication_failed: 'Authentication failed. Please try again.',
    domain_not_allowed: 'Your email domain is not allowed.',
    token_generation_failed: 'Login successful but token generation failed.',
  };

  setErrorMessage(errorMessages[error] || 'An unknown error occurred.');
}, []);
```

### User Profile Page

```javascript
async function loadUserProfile() {
  const response = await fetch('/api/v1/auth/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const user = await response.json();

  // Display connected OAuth providers
  user.connectedProviders.forEach(provider => {
    renderConnectedProvider(provider);
  });

  // Show primary OAuth provider
  if (user.primaryOAuthProvider) {
    renderPrimaryProvider(user.primaryOAuthProvider);
  }

  // Show OAuth-only status
  if (user.isOAuthUser) {
    showSetPasswordOption();
  }
}

async function unlinkProvider(provider) {
  try {
    const response = await fetch(`/api/v1/auth/oauth/${provider}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      window.location.reload();
    } else {
      const error = await response.json();
      if (error.code === 'LAST_AUTH_METHOD') {
        alert('Set a password first before unlinking');
      }
    }
  } catch (error) {
    console.error('Failed to unlink provider:', error);
  }
}
```

## Error Codes

| Code                   | Description                                   | Action                                |
| ---------------------- | --------------------------------------------- | ------------------------------------- |
| `DOMAIN_NOT_ALLOWED`   | Email domain not in allowed list              | Show domain restriction message       |
| `OAUTH_ONLY_USER`      | User trying password login but only has OAuth | Show "Use OAuth provider" message     |
| `LAST_AUTH_METHOD`     | Trying to unlink only auth method             | Show "Set password first" warning     |
| `AUTH_METHOD_DISABLED` | Trying to use disabled auth method            | Show available authentication methods |

## Security Features

### Session Management

- Secure OAuth sessions with encrypted session cookies
- HTTPS-only cookies in production
- Session expiration and renewal

### CSRF Protection

- Built into Passport.js OAuth implementation
- State parameter validation
- Callback URL validation

### Domain Validation

- Server-side domain restriction enforcement
- Applied to both registration and OAuth flows
- Prevents unauthorized account creation

### Account Protection

- Cannot unlink last authentication method
- Password required before unlinking OAuth if no other methods
- Email verification for OAuth providers

## OAuth Flow Diagram

```
User → Frontend
  ↓ Click "Sign in with Google/GitHub"
Frontend → OAuth Provider (Redirect)
  ↓ User authorizes
OAuth Provider → Backend (/auth/{provider}/callback)
  ↓ Exchange code for user info
Backend → Database (Create/update user)
  ↓ Generate JWT token
Backend → Frontend (Redirect with token)
  ↓ Extract token from URL
Frontend → Store token & authenticate
```

## Troubleshooting

### Common Issues

**Invalid Redirect URI**

- **Cause**: Callback URL doesn't match OAuth provider settings
- **Solution**: Ensure callback URLs match exactly (including http/https)

**Missing Environment Variables**

- **Cause**: OAuth credentials not configured
- **Solution**: Check all required variables in `.env` file

**Domain Restrictions Not Working**

- **Cause**: Email domains incorrectly formatted
- **Solution**: Use comma-separated list without spaces

**Session Issues**

- **Cause**: `SESSION_SECRET` not set or same as `JWT_SECRET`
- **Solution**: Set unique `SESSION_SECRET` in `.env`

**OAuth Provider Not Showing**

- **Cause**: Missing client ID/secret for provider
- **Solution**: Add both `CLIENT_ID` and `CLIENT_SECRET` for provider

### Testing OAuth Locally

For local testing with OAuth providers that require HTTPS:

1. **Use ngrok or similar tool:**

   ```bash
   ngrok http 8000
   ```

2. **Update OAuth provider settings:**

   - Use ngrok HTTPS URL as callback URL
   - Update `GOOGLE_CALLBACK_URL` and `GITHUB_CALLBACK_URL`

3. **Update frontend URL:**
   ```bash
   FRONTEND_URL=https://your-ngrok-url.ngrok.io
   ```

### Debugging

Enable detailed logging:

```bash
NODE_ENV=development
DEBUG=passport:*
```

Check OAuth configuration:

```bash
curl http://localhost:8000/api/v1/auth/oauth/providers | jq
```

## Best Practices

### Security

1. **Use HTTPS in production** - Required for OAuth callbacks
2. **Rotate session secrets** - Change `SESSION_SECRET` periodically
3. **Monitor OAuth usage** - Track authentication attempts
4. **Enable domain restrictions** - For enterprise deployments
5. **Require email verification** - For password-based signups

### User Experience

1. **Show clear authentication options** - Based on enabled methods
2. **Provide account linking** - Allow users to connect multiple providers
3. **Enable password backup** - Encourage OAuth users to set passwords
4. **Display connected accounts** - Show which providers are linked
5. **Graceful error handling** - Clear messages for authentication failures

### Deployment

1. **Configure production callback URLs** - Use production domain
2. **Set strong session secrets** - Use generated random strings
3. **Enable HTTPS** - Required for OAuth in production
4. **Monitor OAuth provider status** - Check for service disruptions
5. **Backup authentication** - Don't rely solely on OAuth

## Adding More OAuth Providers

To add additional OAuth providers (Microsoft, Facebook, etc.):

1. **Install Passport strategy:**

   ```bash
   npm install passport-microsoft passport-facebook
   ```

2. **Configure in `passport.js`:**

   ```javascript
   passport.use(
     new MicrosoftStrategy(
       {
         clientID: process.env.MICROSOFT_CLIENT_ID,
         clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
         callbackURL: process.env.MICROSOFT_CALLBACK_URL,
       },
       oauthCallback
     )
   );
   ```

3. **Add routes in `authController.js`:**

   ```javascript
   router.get('/auth/microsoft', passport.authenticate('microsoft'));
   router.get(
     '/auth/microsoft/callback',
     passport.authenticate('microsoft'),
     oauthSuccessHandler
   );
   ```

4. **Update User model:**

   ```javascript
   oauth: {
     microsoft: {
       id: String,
       email: String
     }
   }
   ```

5. **Add environment variables:**
   ```bash
   MICROSOFT_CLIENT_ID=...
   MICROSOFT_CLIENT_SECRET=...
   MICROSOFT_CALLBACK_URL=...
   ```

## Additional Resources

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps)
- [Passport.js Documentation](http://www.passportjs.org/)
- [LLM Crafter Authentication Guide](/features/authentication)
