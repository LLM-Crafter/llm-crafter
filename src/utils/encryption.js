const CryptoJS = require('crypto-js');
const crypto = require('crypto');

class EncryptionUtil {
  constructor() {
    // Get encryption key from environment variable
    this.encryptionKey = this.getEncryptionKey();
  }

  getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    // crypto-js expects a string key, it will handle the key derivation
    return key;
  }

  /**
   * Encrypt a string value using AES-256-GCM
   * @param {string} text - The plain text to encrypt
   * @returns {string} - Base64 encoded encrypted data
   */
  encrypt(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text to encrypt must be a non-empty string');
    }

    try {
      // crypto-js AES encryption with GCM mode
      // This automatically handles IV generation and authentication
      const encrypted = CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
      
      return encrypted;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt an encrypted string
   * @param {string} encryptedData - The encrypted data to decrypt
   * @returns {string} - The decrypted plain text
   */
  decrypt(encryptedData) {
    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Encrypted data must be a non-empty string');
    }

    try {
      // crypto-js AES decryption
      const decrypted = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
      const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!plaintext) {
        throw new Error('Failed to decrypt data - invalid key or corrupted data');
      }
      
      return plaintext;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Check if a string appears to be encrypted by crypto-js
   * crypto-js encrypted strings are base64 and have a specific format
   * @param {string} data - The data to check
   * @returns {boolean} - True if the data appears to be encrypted
   */
  isEncrypted(data) {
    if (!data || typeof data !== 'string') {
      return false;
    }

    try {
      // crypto-js encrypted strings are base64 and have a specific structure
      // They start with "U2FsdGVkX1" when using the default format
      if (data.startsWith('U2FsdGVkX1')) {
        return true;
      }
      
      // Additional check: try to parse as base64 and see if it has reasonable length
      if (data.length > 20 && data.match(/^[A-Za-z0-9+/]+=*$/)) {
        // Looks like base64, could be encrypted
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a secure encryption key (for initial setup)
   * @returns {string} - A hex-encoded 256-bit key
   */
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Create a singleton instance
const encryptionUtil = new EncryptionUtil();

module.exports = encryptionUtil;
