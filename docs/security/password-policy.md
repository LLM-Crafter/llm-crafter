# Password Policy Security Guide

## Overview

LLM Crafter implements a comprehensive password policy to protect user accounts from unauthorized access. The policy enforces strong password requirements that significantly improve security against brute force attacks, dictionary attacks, and credential stuffing.

## Password Requirements

### 🔒 **Minimum Requirements**

All passwords must meet the following criteria:

- **Length**: At least 12 characters long
- **Uppercase**: At least one uppercase letter (A-Z)
- **Lowercase**: At least one lowercase letter (a-z)
- **Numbers**: At least one digit (0-9)
- **Special Characters**: At least one special character (!@#$%^&\*()\_+-=[]{}|;:,.<>?)

### 🚫 **Prohibited Patterns**

Passwords cannot contain:

- **Common words**: password, admin, user, login, guest, test, demo, etc.
- **Repeated characters**: aaaaaaa, 1111111, etc.
- **Sequential patterns**: 123456, abcdef, qwerty, etc.
- **Keyboard patterns**: qwerty, asdfgh, zxcvbn, etc.
- **Simple substitutions**: p@ssw0rd, 4dmin, etc.

## Password Strength Levels

The system calculates password strength on a 5-level scale:

| Level           | Description  | Score Range | Characteristics                                |
| --------------- | ------------ | ----------- | ---------------------------------------------- |
| **Very Weak**   | Unacceptable | 0-2         | Missing multiple requirements, common patterns |
| **Weak**        | Poor         | 3-4         | Meets minimum but predictable                  |
| **Medium**      | Acceptable   | 5-6         | Good variety, reasonable length                |
| **Strong**      | Good         | 7-8         | Excellent variety, good length                 |
| **Very Strong** | Excellent    | 9+          | Outstanding variety, excellent length          |

## Implementation Details

### 🔧 **Server-Side Validation**

Password validation occurs at multiple levels:

1. **Express Validator**: Initial request validation
2. **Mongoose Schema**: Database-level validation
3. **Password Policy Utility**: Comprehensive policy enforcement

```javascript
// Example usage in routes
const { expressValidatorPassword } = require("../utils/passwordPolicy");

const registerValidation = [
  body("password").custom(expressValidatorPassword),
  // ... other validations
];
```

### 📊 **Strength Calculation**

The strength calculation considers:

- **Length bonus**: Longer passwords score higher
- **Character variety**: Different character types add points
- **Uniqueness**: Higher character diversity improves score
- **Pattern penalties**: Common patterns reduce score

### 🛡️ **Security Features**

- **Bcrypt hashing**: Passwords hashed with salt rounds of 12
- **No plaintext storage**: Passwords never stored in readable form
- **Validation before hashing**: Policy enforced before encryption
- **Strength tracking**: Password strength stored for security audits

## API Endpoints

### Get Password Policy

```http
GET /api/v1/auth/password-policy
```

Returns the current password policy requirements and examples.

**Response:**

```json
{
  "success": true,
  "data": {
    "requirements": [
      "At least 12 characters long",
      "At least one uppercase letter (A-Z)"
      // ... more requirements
    ],
    "recommendations": [
      "Use a mix of unrelated words, numbers, and symbols"
      // ... more recommendations
    ],
    "examples": {
      "good": ["MyDog$Loves2Fetch!", "Coffee&Code#2024Time"],
      "bad": ["password123", "qwerty"]
    }
  }
}
```

### User Registration

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "MyStrong$Password123!",
  "name": "John Doe"
}
```

**Success Response:**

```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "passwordStrength": "strong",
  "warnings": []
}
```

**Error Response (Weak Password):**

```json
{
  "error": "Password does not meet security requirements",
  "details": [
    "Password must be at least 12 characters long",
    "Password must contain at least one special character"
  ],
  "policy": {
    "minLength": 12,
    "requireUppercase": true
    // ... full policy object
  }
}
```

## Examples

### ✅ **Good Passwords**

```
MyDog$Loves2Fetch!        (Strong - 17 chars, good variety)
Coffee&Code#2024Time      (Strong - 19 chars, mixed elements)
BlueOcean$Waves9!         (Medium - 16 chars, good pattern)
Tr0ub4dor&3Complex        (Strong - substitutions + symbols)
```

### ❌ **Bad Passwords**

```
password123               (Too short, common word)
Password1!                (Too short, predictable)
qwerty123456              (Keyboard pattern)
aaaaaaaaaaaaa            (Repeated characters)
123456789012             (Sequential numbers)
admin123!                (Common word)
```

## Testing

### 🧪 **Automated Testing**

```bash
# Run all password policy tests
npm run test:password-policy

# Show policy information only
npm run test:password-policy -- --policy

# Test password strength calculation
npm run test:password-policy -- --strength

# Interactive password testing
npm run test:password-policy -- --interactive

# Full test suite with examples
npm run test:password-policy -- --all
```

### 📝 **Manual Testing**

```bash
# Test weak password
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"weak123","name":"Test User"}'

# Test strong password
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyStrong$Password123!","name":"Test User"}'

# Get password policy
curl http://localhost:3000/api/v1/auth/password-policy
```

## Security Considerations

### 🔐 **Best Practices**

1. **Client-Side Validation**: Implement matching validation on frontend
2. **Password Strength Indicator**: Show real-time strength feedback
3. **User Education**: Display policy requirements clearly
4. **Progressive Enhancement**: Allow stronger passwords over time
5. **Regular Audits**: Monitor password strength across user base

### 🚨 **Security Monitoring**

- **Weak Password Alerts**: Monitor users with weak passwords
- **Failed Registration Tracking**: Log attempts with weak passwords
- **Password Change Recommendations**: Suggest updates for weak passwords
- **Breach Response**: Force password updates if needed

### 📋 **Compliance Considerations**

The password policy helps meet various security standards:

- **NIST SP 800-63B**: Meets length and complexity guidelines
- **OWASP**: Follows authentication security recommendations
- **PCI DSS**: Satisfies password complexity requirements
- **SOC 2**: Supports access control requirements

## Migration Guide

### For Existing Users

Users with passwords that don't meet the new policy:

1. **Immediate Impact**: Existing passwords continue to work
2. **Gradual Migration**: Users prompted to update on next login
3. **Security Indicators**: Profile shows password strength status
4. **Forced Updates**: Optional administrative capability

### Database Schema

The User model includes password strength tracking:

```javascript
{
  password: String,           // Bcrypt hashed
  passwordStrength: String,   // 'very-weak' to 'very-strong'
  // ... other fields
}
```

## Troubleshooting

### Common Issues

#### "Password too short"

- **Solution**: Use at least 12 characters
- **Tip**: Consider using a passphrase with spaces

#### "Password contains common words"

- **Solution**: Avoid dictionary words like "password", "admin"
- **Tip**: Use uncommon word combinations

#### "Password contains predictable patterns"

- **Solution**: Avoid sequences like "123" or "abc"
- **Tip**: Mix random elements throughout

#### "Missing special characters"

- **Solution**: Add symbols like !@#$%^&\*
- **Tip**: Place symbols between words for readability

### Support Commands

```bash
# Test a specific password
node scripts/test-password-policy.js --interactive

# Show complete policy
node scripts/test-password-policy.js --policy

# Validate implementation
npm run test:password-policy
```

## Summary

The password policy implementation provides:

- ✅ **Strong Security**: Comprehensive requirements prevent weak passwords
- ✅ **User Friendly**: Clear feedback and helpful error messages
- ✅ **Flexible**: Configurable policy parameters
- ✅ **Compliant**: Meets industry security standards
- ✅ **Testable**: Comprehensive testing tools and scripts

This implementation significantly improves security while maintaining good user experience through clear communication of requirements and helpful feedback.
