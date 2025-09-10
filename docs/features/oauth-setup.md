# OAuth Authentication Setup

This guide explains how to set up OAuth authentication with Google and GitHub providers in LLM Crafter.

## Overview

LLM Crafter supports multiple authentication methods:

- **Email/Password** - Traditional authentication
- **Google OAuth** - Sign in with Google
- **GitHub OAuth** - Sign in with GitHub
- **Domain Restrictions** - Optionally limit registration to specific email domains

## Environment Variables

Add these variables to your `.env` file:

```bash
# Frontend URL for OAuth redirects
FRONTEND_URL=http://localhost:3000

# Session secret for OAuth (different from JWT secret)
SESSION_SECRET=your-session-secret-for-oauth-here

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8000/auth/google/callback

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:8000/auth/github/callback

# Domain restrictions (optional)
ALLOWED_EMAIL_DOMAINS=company.com,trusted-partner.com
```

## Setting Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API
4. Go to "Credentials" and create "OAuth 2.0 Client ID"
5. Configure authorized redirect URIs:
   - Development: `http://localhost:8000/auth/google/callback`
   - Production: `https://your-domain.com/auth/google/callback`
6. Copy the Client ID and Client Secret to your `.env` file

## Setting Up GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - Application name: "LLM Crafter"
   - Homepage URL: `http://localhost:3000` (development)
   - Authorization callback URL: `http://localhost:8000/auth/github/callback`
4. Copy the Client ID and Client Secret to your `.env` file

## Domain Restrictions

To restrict registration/login to specific email domains:

1. Set the `ALLOWED_EMAIL_DOMAINS` environment variable:

   ```bash
   ALLOWED_EMAIL_DOMAINS=company.com,partner.org,trusted-domain.net
   ```

2. Only users with emails from these domains will be able to:

   - Register new accounts
   - Sign in via OAuth
   - Be created through OAuth flows

3. Existing users with non-allowed domains will still be able to log in

## API Endpoints

### Get Available Providers

```http
GET /auth/oauth/providers
```

Response:

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "name": "google",
        "displayName": "Google",
        "authUrl": "/auth/google"
      },
      {
        "name": "github",
        "displayName": "GitHub",
        "authUrl": "/auth/github"
      }
    ],
    "domainRestricted": true,
    "allowedDomains": ["company.com", "partner.org"]
  }
}
```

### OAuth Flow

1. **Initiate OAuth**: Direct users to `/auth/google` or `/auth/github`
2. **Callback**: Users are redirected to your frontend with a JWT token
3. **Success**: `${FRONTEND_URL}/auth/success?token=<jwt_token>`
4. **Error**: `${FRONTEND_URL}/auth/error?message=<error_message>`

### Unlink OAuth Provider

```http
DELETE /auth/oauth/{provider}
Authorization: Bearer <jwt_token>
```

## User Model Changes

The User model now includes:

```javascript
{
  // ... existing fields
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
  emailVerified: Boolean,
  avatar: String
}
```

## Frontend Integration

### Check Available Providers

```javascript
const response = await fetch('/auth/oauth/providers');
const { data } = await response.json();
// Show OAuth buttons based on available providers
```

### Initiate OAuth Flow

```javascript
// Redirect to OAuth provider
window.location.href = '/auth/google';
```

### Handle OAuth Success

```javascript
// On your success page, extract token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
if (token) {
  localStorage.setItem('authToken', token);
  // Redirect to dashboard
}
```

## Security Considerations

1. **HTTPS in Production**: Always use HTTPS for OAuth callbacks in production
2. **Secure Sessions**: Session cookies are secure in production mode
3. **Domain Validation**: OAuth providers validate redirect URIs
4. **Email Verification**: OAuth providers typically provide verified emails
5. **Account Linking**: Users can link multiple OAuth providers to one account

## Troubleshooting

### Common Issues

1. **Invalid Redirect URI**: Ensure callback URLs match exactly in OAuth provider settings
2. **Missing Environment Variables**: Check that all required OAuth variables are set
3. **Domain Restrictions**: Verify email domains are correctly formatted (no spaces)
4. **Session Issues**: Ensure `SESSION_SECRET` is set and different from `JWT_SECRET`

### Error Codes

- `DOMAIN_NOT_ALLOWED`: User's email domain is not in allowed list
- `OAUTH_ONLY_USER`: User trying to log in with password but only has OAuth
- `LAST_AUTH_METHOD`: Trying to unlink the only authentication method

## Testing

To test OAuth integration:

1. Set up OAuth applications with localhost callback URLs
2. Add OAuth credentials to `.env`
3. Start the application: `npm run dev`
4. Visit `http://localhost:8000/auth/oauth/providers` to verify configuration
5. Test OAuth flows through your frontend application
