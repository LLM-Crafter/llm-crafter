# API Key Encryption Security Guide

## Overview

LLM Crafter now encrypts all API keys stored in the database using the battle-tested `crypto-js` library with AES-256 encryption. This ensures that even if your database is compromised, the API keys remain secure and cannot be used without the encryption key.

## Security Features

### 🔐 Encryption Details
- **Library**: crypto-js (industry standard, widely adopted)
- **Algorithm**: AES-256 with PBKDF2 key derivation
- **Salt**: Random salt generated per encryption
- **Format**: Base64 encoded ciphertext
- **Security**: Battle-tested library used by millions of applications

### 🛡️ Security Benefits
- **Database Breach Protection**: API keys are useless without the encryption key
- **Industry Standard**: Uses proven cryptographic library
- **Random Salting**: Each encryption uses a unique salt
- **Key Derivation**: Secure PBKDF2 key stretching
- **Zero-Knowledge**: Encrypted keys cannot be reverse-engineered

## Environment Setup

### Required Environment Variables

Add to your `.env` file:

```bash
# Required: Encryption passphrase (any secure string)
ENCRYPTION_KEY=your-very-long-and-secure-passphrase-here

# The crypto-js library will securely derive encryption keys from this passphrase
# Minimum recommended: 32 characters
```

### Generating a Secure Encryption Key

```bash
# Generate a secure passphrase (crypto-js can use any string)
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# Or use a memorable but secure passphrase
ENCRYPTION_KEY="MyApp-Super-Secure-Passphrase-2025-$(date +%s)"

# Test encryption functionality
npm run test:encryption
```

## Migration Process

### Step 1: Test Encryption
Before migrating, test that encryption is working:

```bash
npm run test:encryption
```

### Step 2: Backup Your Database
**CRITICAL**: Always backup your database before migration:

```bash
# MongoDB backup example
mongodump --uri="your_mongodb_uri" --out=backup-before-encryption
```

### Step 3: Run Migration
Encrypt all existing API keys:

```bash
npm run migrate:encrypt-api-keys
```

### Step 4: Verify Migration
Ensure all keys can be decrypted:

```bash
npm run verify:api-keys
```

## Usage

### Automatic Encryption
Once implemented, all new API keys are automatically encrypted when saved:

```javascript
// This will be automatically encrypted
const apiKey = new APIKey({
  name: 'OpenAI Key',
  key: 'sk-1234567890abcdef', // Stored encrypted
  provider: 'openai',
  project: 'project-id'
});
await apiKey.save(); // Encryption happens here
```

### Accessing Decrypted Keys
Use the model methods to safely decrypt keys:

```javascript
// Get decrypted key
const apiKey = await APIKey.findById(keyId);
const decryptedKey = apiKey.getDecryptedKey(); // Returns plain text

// Or use the virtual property
const decryptedKey = apiKey.decryptedKey;

// The encrypted key is never exposed in JSON
console.log(apiKey.toJSON()); // { id, name, provider, ... } - no key field
```

### Service Integration
Services automatically handle decryption:

```javascript
// In services, use decrypted keys
const openai = new OpenAIService(apiKey.getDecryptedKey(), apiKey.provider);
```

## Security Best Practices

### Environment Security
1. **Never commit encryption keys** to version control
2. **Use different keys** for different environments
3. **Rotate encryption keys** regularly (with re-encryption)
4. **Store keys securely** in production (e.g., AWS Secrets Manager, Azure Key Vault)

### Production Deployment
```bash
# Production environment variables
NODE_ENV=production
ENCRYPTION_KEY=${SECRET_MANAGER_ENCRYPTION_KEY}
MONGODB_URI=${SECRET_MANAGER_MONGODB_URI}
JWT_SECRET=${SECRET_MANAGER_JWT_SECRET}
```

### Key Rotation Process
1. Generate new encryption key
2. Re-encrypt all API keys with new key
3. Update environment variables
4. Restart application

## Error Handling

### Common Issues

#### ❌ "ENCRYPTION_KEY environment variable is required"
```bash
# Solution: Add encryption key to .env
echo "ENCRYPTION_KEY=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >> .env
```

#### ❌ "Decryption failed"
- Check that `ENCRYPTION_KEY` matches the one used for encryption
- Verify the encrypted data hasn't been corrupted
- Ensure the key is exactly 64 hex characters (for hex format)

#### ❌ "API key encryption failed"
- Verify the API key is a valid string
- Check disk space and database connectivity
- Ensure the encryption key is properly formatted

### Troubleshooting

```bash
# Test encryption functionality
npm run test:encryption

# Verify existing encrypted keys
npm run verify:api-keys

# Check specific API key
node -e "
require('dotenv').config();
const ApiKey = require('./src/models/ApiKey');
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const key = await ApiKey.findById('your-key-id');
  console.log('Decrypted:', key.getDecryptedKey());
  process.exit(0);
});
"
```

## Backward Compatibility

The system supports gradual migration:
- **Encrypted keys**: Automatically decrypted when accessed
- **Plain text keys**: Still work but will be encrypted on next save
- **Mixed state**: Both formats work simultaneously during migration

## Performance Impact

### Encryption Performance
- **Encryption time**: ~1-2ms per API key
- **Memory usage**: Minimal additional overhead
- **Database storage**: ~33% increase in key field size

### Runtime Performance
- **Decryption time**: ~0.5-1ms per access
- **Caching**: Decrypted keys can be cached in memory if needed
- **Impact**: Negligible for typical API usage patterns

## Monitoring

### Audit Logging
Consider adding audit logs for:
- API key encryption events
- Decryption failures
- Key access patterns
- Encryption key rotations

### Health Checks
```javascript
// Add to your health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test encryption/decryption
    const encryptionUtil = require('./src/utils/encryption');
    const test = encryptionUtil.encrypt('test');
    const decrypted = encryptionUtil.decrypt(test);
    
    res.json({ 
      status: 'ok', 
      encryption: decrypted === 'test' ? 'working' : 'failed'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      encryption: 'failed',
      error: error.message 
    });
  }
});
```

## Security Checklist

- [ ] Encryption key generated securely (32 random bytes)
- [ ] Encryption key stored securely (not in code/version control)
- [ ] Database backup created before migration
- [ ] Migration tested in development environment
- [ ] All API keys successfully encrypted
- [ ] Decryption verification passed
- [ ] Health checks include encryption status
- [ ] Key rotation process documented
- [ ] Monitoring and alerting configured
- [ ] Team trained on new security procedures

## Support

For issues with API key encryption:
1. Check the troubleshooting section above
2. Verify environment variables are set correctly
3. Test encryption functionality with `npm run test:encryption`
4. Review application logs for specific error messages

Remember: **Never share your encryption key** and always **backup your database** before making security changes.
