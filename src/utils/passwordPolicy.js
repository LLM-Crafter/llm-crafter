/**
 * Password Policy Utilities
 * Implements comprehensive password security requirements
 */

/**
 * Password policy configuration
 */
const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  bannedPatterns: [
    // Common patterns to reject
    /^(.)\1+$/, // All same character (e.g., "aaaaaaa")
    /^(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i, // Sequential patterns
    /^(qwerty|asdfgh|zxcvbn)/i // Keyboard patterns
  ],
  bannedWords: [
    'password',
    'pass',
    '123456',
    'qwerty',
    'admin',
    'root',
    'user',
    'login',
    'guest',
    'test',
    'demo',
    'temp',
    'default',
    'secret'
  ]
};

/**
 * Validates password against security policy
 * @param {string} password - Password to validate
 * @returns {Object} - Validation result with success status and messages
 */
function validatePassword(password) {
  const errors = [];
  const warnings = [];

  // Basic checks
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      errors: ['Password is required and must be a string'],
      warnings: [],
      strength: 'invalid'
    };
  }

  // Length requirements
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(
      `Password must be at least ${PASSWORD_POLICY.minLength} characters long`
    );
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(
      `Password must be no more than ${PASSWORD_POLICY.maxLength} characters long`
    );
  }

  // Character requirements
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD_POLICY.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD_POLICY.requireSpecialChars) {
    const specialCharsRegex = new RegExp(
      `[${PASSWORD_POLICY.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`
    );
    if (!specialCharsRegex.test(password)) {
      errors.push(
        `Password must contain at least one special character (${PASSWORD_POLICY.specialChars})`
      );
    }
  }

  // Pattern checks
  for (const pattern of PASSWORD_POLICY.bannedPatterns) {
    if (pattern.test(password)) {
      errors.push('Password contains a common or predictable pattern');
      break;
    }
  }

  // Banned words check
  const lowerPassword = password.toLowerCase();
  for (const word of PASSWORD_POLICY.bannedWords) {
    if (lowerPassword.includes(word.toLowerCase())) {
      errors.push(`Password cannot contain common words like "${word}"`);
      break;
    }
  }

  // Calculate password strength
  const strength = calculatePasswordStrength(password);

  // Add warnings for weak but valid passwords
  if (strength === 'weak' && errors.length === 0) {
    warnings.push('Password meets minimum requirements but is considered weak');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    strength,
    policy: PASSWORD_POLICY
  };
}

/**
 * Calculate password strength score
 * @param {string} password - Password to analyze
 * @returns {string} - Strength level: 'very-weak', 'weak', 'medium', 'strong', 'very-strong'
 */
function calculatePasswordStrength(password) {
  let score = 0;

  // Length scoring
  if (password.length >= 12) {score += 2;}
  else if (password.length >= 8) {score += 1;}

  // Character variety scoring
  if (/[a-z]/.test(password)) {score += 1;}
  if (/[A-Z]/.test(password)) {score += 1;}
  if (/[0-9]/.test(password)) {score += 1;}
  if (/[^a-zA-Z0-9]/.test(password)) {score += 2;}

  // Bonus for length
  if (password.length >= 16) {score += 1;}
  if (password.length >= 20) {score += 1;}

  // Penalty for common patterns
  if (
    PASSWORD_POLICY.bannedPatterns.some((pattern) => pattern.test(password))
  ) {
    score -= 2;
  }

  // Character uniqueness bonus
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.7) {score += 1;}

  // Return strength level
  if (score <= 2) {return 'very-weak';}
  if (score <= 4) {return 'weak';}
  if (score <= 6) {return 'medium';}
  if (score <= 8) {return 'strong';}
  return 'very-strong';
}

/**
 * Generate password policy description for users
 * @returns {Object} - Human-readable policy description
 */
function getPasswordPolicyDescription() {
  return {
    requirements: [
      `At least ${PASSWORD_POLICY.minLength} characters long`,
      'At least one uppercase letter (A-Z)',
      'At least one lowercase letter (a-z)',
      'At least one number (0-9)',
      `At least one special character (${PASSWORD_POLICY.specialChars})`,
      'Cannot contain common words or predictable patterns',
      'Cannot be all the same character or simple sequences'
    ],
    recommendations: [
      'Use a mix of unrelated words, numbers, and symbols',
      'Consider using a passphrase with special characters',
      'Avoid personal information like names or dates',
      'Use a password manager to generate and store strong passwords'
    ],
    examples: {
      good: ['MyDog$Loves2Fetch!', 'Coffee&Code#2024Time', 'BlueOcean$Waves9!'],
      bad: ['password123', 'qwerty', '123456789', 'admin', 'aaaaaaaaaa']
    }
  };
}

/**
 * Express validator custom validation function
 * @param {string} password - Password to validate
 * @returns {boolean} - True if valid, throws error if invalid
 */
function expressValidatorPassword(password) {
  const result = validatePassword(password);
  if (!result.isValid) {
    throw new Error(result.errors[0]); // Express validator will use the first error
  }
  return true;
}

module.exports = {
  validatePassword,
  calculatePasswordStrength,
  getPasswordPolicyDescription,
  expressValidatorPassword,
  PASSWORD_POLICY
};
