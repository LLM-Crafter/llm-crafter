/**
 * Environment validation utility
 * Validates required environment variables on startup
 */

const validateEnvironment = () => {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'ENCRYPTION_KEY'];

  const missing = [];
  const weak = [];

  for (const variable of required) {
    const value = process.env[variable];

    if (!value) {
      missing.push(variable);
      continue;
    }

    // Check for weak values
    if (variable === 'JWT_SECRET' && value.length < 32) {
      weak.push(`${variable} should be at least 32 characters long`);
    }

    if (variable === 'ENCRYPTION_KEY') {
      // Check if it's a proper hex key (64 chars) or at least 32 chars if string
      if (value.length === 64 && /^[0-9a-fA-F]+$/.test(value)) {
        // Valid hex key
        continue;
      } else if (value.length < 32) {
        weak.push(`${variable} should be at least 32 characters long`);
      }
    }
  }

  // Check for common weak values
  const commonWeak = [
    'secret',
    'password',
    '123456',
    'test',
    'development',
    'admin',
    'key',
    'sdjahdkjsahjkdha', // The current weak JWT secret in .env
  ];

  for (const variable of required) {
    const value = process.env[variable];
    if (value && commonWeak.some(weak => value.toLowerCase().includes(weak))) {
      weak.push(`${variable} appears to use a weak/default value`);
    }
  }

  if (missing.length > 0) {
    console.error('🚨 Missing required environment variables:');
    missing.forEach(variable => {
      console.error(`   - ${variable}`);
    });
    console.error(
      '\nPlease set these environment variables before starting the application.'
    );
    process.exit(1);
  }

  if (weak.length > 0) {
    console.warn('⚠️  Weak environment variable values detected:');
    weak.forEach(warning => {
      console.warn(`   - ${warning}`);
    });

    if (process.env.NODE_ENV === 'production') {
      console.error(
        '\n🚨 Weak security values detected in production environment. Exiting for security.'
      );
      process.exit(1);
    } else {
      console.warn(
        '\n💡 Consider using stronger values before going to production.'
      );
    }
  }

  // Test encryption functionality
  try {
    const encryptionUtil = require('./encryption');
    const testValue = 'test-encryption-functionality';
    const encrypted = encryptionUtil.encrypt(testValue);
    const decrypted = encryptionUtil.decrypt(encrypted);

    if (decrypted !== testValue) {
      console.error(
        '🚨 Encryption test failed - encrypted/decrypted values do not match'
      );
      process.exit(1);
    }

    console.log('✅ Environment validation passed');
    console.log('✅ Encryption functionality verified');
  } catch (error) {
    console.error('🚨 Encryption test failed:', error.message);
    process.exit(1);
  }
};

module.exports = { validateEnvironment };
