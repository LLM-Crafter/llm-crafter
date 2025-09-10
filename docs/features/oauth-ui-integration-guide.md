# OAuth Authentication - UI Integration Guide

## 🔗 New API Endpoints

### 1. Get Available OAuth Providers

```http
GET /api/v1/auth/oauth/providers
```

**Response:**

````json
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
````

**Usage in UI:**

- Use `authMethods` to determine which authentication options to show
- Show email/password form only if `emailPasswordEnabled: true`
- Show OAuth buttons only if `oauthEnabled: true`
- Display domain restrictions warning if `domainRestricted: true`

````

**Usage in UI:**

- Call this endpoint to determine which OAuth buttons to show
- Display domain restrictions warning if `domainRestricted: true`
- Show allowed domains list to users if applicable

### 2. OAuth Authentication Flow

#### Initiate OAuth (Redirect URLs)

```http
GET /api/v1/auth/google     # Redirects to Google OAuth
GET /api/v1/auth/github     # Redirects to GitHub OAuth
````

**UI Implementation:**

```javascript
// Redirect user to OAuth provider
window.location.href = '/api/v1/auth/google';
// or
window.location.href = '/api/v1/auth/github';
```

#### OAuth Success/Failure Redirects

After OAuth completion, users are redirected to your frontend:

**Success:**

```
${FRONTEND_URL}/auth/success?token=<jwt_token>
```

**Failure:**

```
${FRONTEND_URL}/auth/error?message=<error_message>
```

**UI Implementation:**

```javascript
// On your success page
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
if (token) {
  localStorage.setItem('authToken', token);
  // Redirect to dashboard or main app
  window.location.href = '/dashboard';
}

// On your error page
const errorMessage = urlParams.get('message');
// Display error to user
```

### 3. Unlink OAuth Provider

```http
DELETE /api/v1/auth/oauth/{provider}
Authorization: Bearer <jwt_token>
```

**Example:**

```http
DELETE /api/v1/auth/oauth/google
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**

```json
{
  "success": true,
  "message": "google account unlinked successfully"
}
```

**Error Response (if last auth method):**

```json
{
  "error": "Cannot unlink the only authentication method. Set a password first.",
  "code": "LAST_AUTH_METHOD"
}
```

## 📊 Updated User Data Structure

### Enhanced Registration Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-uuid",
    "email": "user@company.com",
    "name": "User Name",
    "emailVerified": false,
    "isOAuthUser": false,
    "avatar": null
  },
  "passwordStrength": "very-strong",
  "warnings": []
}
```

### Enhanced Profile Response

```http
GET /api/v1/auth/profile
Authorization: Bearer <jwt_token>
```

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

## 🎨 UI Components to Build

### 1. OAuth Provider Buttons

```javascript
// Fetch available providers
const response = await fetch('/api/v1/auth/oauth/providers');
const { data } = await response.json();

// Render buttons for each provider
data.providers.forEach(provider => {
  // Create button with provider.displayName
  // On click: window.location.href = provider.authUrl
});
```

### 2. Login/Register Form Updates

#### Domain Restriction Warning

```javascript
if (data.domainRestricted) {
  // Show warning: "Only emails from these domains are allowed:"
  // List: data.allowedDomains.join(', ')
}
```

#### Registration Error Handling

New error code to handle:

```json
{
  "error": "Email domain not allowed. Contact administrator for access.",
  "code": "DOMAIN_NOT_ALLOWED"
}
```

#### Login Error Handling

New error for OAuth-only users:

```json
{
  "error": "Please sign in using your OAuth provider",
  "code": "OAUTH_ONLY_USER",
  "availableProviders": ["google", "github"]
}
```

### 3. User Profile Page

#### Display Connected Accounts

```javascript
// Show connected OAuth providers
user.connectedProviders.forEach(provider => {
  // Display: "Connected to Google", "Connected to GitHub", etc.
  // Add "Disconnect" button for each (except if it's the last auth method)
});

// Show primary OAuth provider
if (user.primaryOAuthProvider) {
  // Display: "Primary sign-in method: Google"
}

// Show OAuth-only status
if (user.isOAuthUser) {
  // Display: "This account uses OAuth sign-in only"
  // Option to "Set a password" for backup authentication
}
```

#### Account Settings Actions

```javascript
// Unlink OAuth provider
async function unlinkProvider(provider) {
  try {
    const response = await fetch(`/api/v1/auth/oauth/${provider}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      // Success: refresh user profile
      window.location.reload();
    } else {
      const error = await response.json();
      if (error.code === 'LAST_AUTH_METHOD') {
        // Show warning: "Set a password first before unlinking"
      }
    }
  } catch (error) {
    // Handle network errors
  }
}
```

### 4. OAuth Success/Error Pages

#### Success Page (`/auth/success`)

```javascript
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (token) {
    // Store token
    localStorage.setItem('authToken', token);

    // Show success message
    setMessage('Successfully signed in!');

    // Redirect after 2 seconds
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 2000);
  } else {
    // Handle missing token
    window.location.href = '/login';
  }
}, []);
```

#### Error Page (`/auth/error`)

```javascript
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('message');

  const errorMessages = {
    authentication_failed: 'Authentication failed. Please try again.',
    token_generation_failed: 'Login successful but token generation failed.',
    domain_not_allowed: 'Your email domain is not allowed. Contact support.',
  };

  setErrorMessage(errorMessages[error] || 'An unknown error occurred.');
}, []);
```

## 🔄 Complete OAuth Flow Example

```javascript
// 1. Show OAuth buttons on login page
const { data } = await fetch('/api/v1/auth/oauth/providers');
data.providers.forEach(provider => {
  // Render: <button onClick={() => window.location.href = provider.authUrl}>
  //           Sign in with {provider.displayName}
  //         </button>
});

// 2. User clicks OAuth button → redirected to provider

// 3. User authorizes → redirected back to your app

// 4. Handle success/error on redirect pages

// 5. Use JWT token for authenticated requests
const userProfile = await fetch('/api/v1/auth/profile', {
  headers: { Authorization: `Bearer ${token}` },
});
```

## 🚨 Error Codes to Handle

| Code                   | Description                                   | UI Action                             |
| ---------------------- | --------------------------------------------- | ------------------------------------- |
| `DOMAIN_NOT_ALLOWED`   | Email domain not in allowed list              | Show domain restriction message       |
| `OAUTH_ONLY_USER`      | User trying password login but only has OAuth | Show "Use OAuth provider" message     |
| `LAST_AUTH_METHOD`     | Trying to unlink only auth method             | Show "Set password first" warning     |
| `AUTH_METHOD_DISABLED` | Trying to use disabled auth method            | Show available authentication methods |

## � Authentication Method Configuration

### Environment Variable: `AUTH_METHODS`

Control which authentication methods are available:

```bash
# Both email/password and OAuth enabled (default)
AUTH_METHODS=emailpassword,oauth

# OAuth only (no email/password registration/login)
AUTH_METHODS=oauth

# Email/password only (no OAuth)
AUTH_METHODS=emailpassword
```

### Frontend Implementation Examples

#### Dynamic Login/Register Form

```javascript
// Fetch configuration
const response = await fetch('/api/v1/auth/oauth/providers');
const { data } = await response.json();

// Conditionally render authentication options
const showEmailPassword = data.authMethods.emailPasswordEnabled;
const showOAuth = data.authMethods.oauthEnabled;

if (showEmailPassword) {
  // Render email/password form
}

if (showOAuth) {
  // Render OAuth provider buttons
  data.providers.forEach(provider => {
    // Render OAuth buttons
  });
}

if (!showEmailPassword && !showOAuth) {
  // Show "No authentication methods available" message
}
```

#### Error Handling for Disabled Methods

```javascript
// Handle AUTH_METHOD_DISABLED errors
if (error.code === 'AUTH_METHOD_DISABLED') {
  const availableMethods = error.enabledMethods;

  if (availableMethods.includes('oauth')) {
    // Redirect to OAuth providers
    showMessage('Please use social login');
  } else if (availableMethods.includes('emailpassword')) {
    // Show email/password form
    showMessage('Please use email/password login');
  }
}
```

## �💡 UI/UX Recommendations

1. **OAuth Buttons**: Use provider brand colors and logos
2. **Domain Restrictions**: Show allowed domains clearly on registration
3. **Account Linking**: Allow users to connect multiple providers
4. **Security Settings**: Show connected accounts in user settings
5. **Fallback Auth**: Encourage setting a password as backup for OAuth users
6. **Error Handling**: Provide clear, actionable error messages
7. **Authentication Methods**: Dynamically show/hide auth options based on configuration

This implementation provides a seamless OAuth experience while maintaining security and flexibility!
