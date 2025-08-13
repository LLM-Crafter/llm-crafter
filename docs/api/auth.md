# Authentication API

The Authentication API provides endpoints for user registration, login, token management, and API key operations.

## Base URL
```
https://your-domain.com/api/auth
```

## Endpoints

### User Registration

Register a new user account.

```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Validation Rules:**
- `name`: Required, minimum 2 characters
- `email`: Required, valid email format, unique
- `password`: Required, minimum 8 characters

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123456",
      "name": "John Doe",
      "email": "john@example.com",
      "created_at": "2024-01-15T10:30:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
```json
// 400 Bad Request - Validation Error
{
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Email already exists"
    }
  ]
}

// 422 Unprocessable Entity - Invalid Data
{
  "error": "Invalid email format"
}
```

### User Login

Authenticate a user and receive a JWT token.

```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123456",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2024-01-16T10:30:00Z"
  }
}
```

**Error Responses:**
```json
// 401 Unauthorized - Invalid Credentials
{
  "error": "Invalid email or password"
}

// 429 Too Many Requests - Rate Limited
{
  "error": "Too many login attempts. Please try again later.",
  "retry_after": 300
}
```

### Token Refresh

Refresh an existing JWT token to extend the session.

```http
POST /api/auth/refresh
```

**Headers:**
```
Authorization: Bearer {current_token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2024-01-16T10:30:00Z"
  }
}
```

### User Logout

Invalidate the current JWT token.

```http
POST /api/auth/logout
```

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

### Get Current User

Get information about the currently authenticated user.

```http
GET /api/auth/me
```

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123456",
      "name": "John Doe",
      "email": "john@example.com",
      "created_at": "2024-01-15T10:30:00Z",
      "organizations": [
        {
          "id": "org_789",
          "name": "My Organization",
          "role": "owner"
        }
      ]
    }
  }
}
```

### Update User Profile

Update the current user's profile information.

```http
PUT /api/auth/me
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "name": "John Smith",
  "email": "johnsmith@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123456",
      "name": "John Smith",
      "email": "johnsmith@example.com",
      "updated_at": "2024-01-15T11:30:00Z"
    }
  }
}
```

### Change Password

Change the current user's password.

```http
PUT /api/auth/password
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "current_password": "oldPassword123",
  "new_password": "newPassword456",
  "confirm_password": "newPassword456"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

## API Key Management

### List API Keys

Get all API keys for the current user.

```http
GET /api/auth/api-keys
```

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "api_keys": [
      {
        "id": "key_123",
        "name": "Production Integration",
        "permissions": ["agents:read", "agents:execute"],
        "created_at": "2024-01-15T10:30:00Z",
        "expires_at": "2024-12-31T23:59:59Z",
        "last_used_at": "2024-01-15T09:15:00Z"
      }
    ]
  }
}
```

### Create API Key

Create a new API key.

```http
POST /api/auth/api-keys
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "name": "Production Integration",
  "permissions": ["agents:read", "agents:execute"],
  "expires_at": "2024-12-31T23:59:59Z"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "api_key": {
      "id": "key_123",
      "name": "Production Integration",
      "key": "ak_1234567890abcdef...",
      "permissions": ["agents:read", "agents:execute"],
      "created_at": "2024-01-15T10:30:00Z",
      "expires_at": "2024-12-31T23:59:59Z"
    }
  }
}
```

### Rotate API Key

Generate a new key value for an existing API key.

```http
PUT /api/auth/api-keys/{key_id}/rotate
```

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "api_key": {
      "id": "key_123",
      "name": "Production Integration",
      "key": "ak_9876543210fedcba...",
      "updated_at": "2024-01-15T11:30:00Z"
    }
  }
}
```

### Delete API Key

Delete an API key.

```http
DELETE /api/auth/api-keys/{key_id}
```

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

## Password Reset

### Request Password Reset

Request a password reset email.

```http
POST /api/auth/forgot-password
```

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

### Reset Password

Reset password using the token from email.

```http
POST /api/auth/reset-password
```

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "password": "newPassword123",
  "confirm_password": "newPassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

## Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED"
}
```

**403 Forbidden:**
```json
{
  "error": "Access denied",
  "code": "ACCESS_DENIED"
}
```

**422 Unprocessable Entity:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

**429 Too Many Requests:**
```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 300
}
```

## Authentication Examples

### JavaScript/Node.js
```javascript
// Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'password123'
  })
});

const { data } = await loginResponse.json();
const token = data.token;

// Make authenticated request
const userResponse = await fetch('/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### cURL
```bash
# Login
curl -X POST "https://api.example.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}'

# Get current user
curl -X GET "https://api.example.com/api/auth/me" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Python
```python
import requests

# Login
login_response = requests.post(
    'https://api.example.com/api/auth/login',
    json={
        'email': 'john@example.com',
        'password': 'password123'
    }
)

token = login_response.json()['data']['token']

# Make authenticated request
user_response = requests.get(
    'https://api.example.com/api/auth/me',
    headers={'Authorization': f'Bearer {token}'}
)
```
