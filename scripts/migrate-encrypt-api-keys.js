#!/usr/bin/env node

/**
 * Migration script to encrypt existing API keys in the database
 * Run this script once after implementing encryption to encrypt all existing API keys
 */

require("dotenv").config();
const mongoose = require("mongoose");
const ApiKey = require("../src/models/ApiKey");
const encryptionUtil = require("../src/utils/encryption");

async function migrateApiKeys() {
  try {
    console.log("🔐 Starting API key encryption migration...");

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to database");

    // Find all API keys
    const apiKeys = await ApiKey.find({});
    console.log(`📊 Found ${apiKeys.length} API keys to process`);

    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;
    let errorCount = 0;

    for (const apiKey of apiKeys) {
      try {
        // Check if already encrypted
        if (encryptionUtil.isEncrypted(apiKey.key)) {
          console.log(
            `⏭️  API key ${apiKey._id} (${apiKey.name}) is already encrypted`
          );
          alreadyEncryptedCount++;
          continue;
        }

        // Store original key for logging (safely)
        const originalKeyPrefix = apiKey.key.substring(0, 8) + "...";

        // Encrypt the key directly in the model
        const encryptedKey = encryptionUtil.encrypt(apiKey.key);

        // Update the key in database using updateOne to bypass the pre-save hook
        await ApiKey.updateOne({ _id: apiKey._id }, { key: encryptedKey });

        console.log(
          `✅ Encrypted API key ${apiKey._id} (${apiKey.name}) - ${originalKeyPrefix}`
        );
        encryptedCount++;
      } catch (error) {
        console.error(
          `❌ Failed to encrypt API key ${apiKey._id} (${apiKey.name}):`,
          error.message
        );
        errorCount++;
      }
    }

    console.log("\n🎉 Migration completed!");
    console.log(`📈 Summary:`);
    console.log(`   - Encrypted: ${encryptedCount}`);
    console.log(`   - Already encrypted: ${alreadyEncryptedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Total processed: ${apiKeys.length}`);

    if (errorCount > 0) {
      console.log(
        "\n⚠️  Some API keys failed to encrypt. Please check the errors above and re-run if needed."
      );
      process.exit(1);
    } else {
      console.log("\n✅ All API keys have been successfully encrypted!");
    }
  } catch (error) {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from database");
  }
}

// Test encryption/decryption before migration
async function testEncryption() {
  try {
    const testKey = "sk-test1234567890abcdef";
    console.log("🧪 Testing encryption/decryption...");

    const encrypted = encryptionUtil.encrypt(testKey);
    console.log(`✅ Encryption successful: ${encrypted.substring(0, 32)}...`);

    const decrypted = encryptionUtil.decrypt(encrypted);
    console.log(
      `✅ Decryption successful: ${decrypted === testKey ? "MATCH" : "MISMATCH"}`
    );

    if (decrypted !== testKey) {
      throw new Error("Encryption/decryption test failed - keys do not match");
    }

    console.log("✅ Encryption test passed\n");
    return true;
  } catch (error) {
    console.error("❌ Encryption test failed:", error.message);
    return false;
  }
}

// Verification function to check that encrypted keys can be decrypted
async function verifyEncryption() {
  try {
    console.log("\n🔍 Verifying encrypted API keys...");

    await mongoose.connect(process.env.MONGODB_URI);

    const apiKeys = await ApiKey.find({});
    let verifiedCount = 0;
    let errorCount = 0;

    for (const apiKey of apiKeys) {
      try {
        // Try to decrypt the key using the model method
        const decryptedKey = apiKey.getDecryptedKey();

        if (decryptedKey && decryptedKey.length > 0) {
          verifiedCount++;
          console.log(
            `✅ API key ${apiKey._id} (${apiKey.name}) - decryption verified`
          );
        } else {
          throw new Error("Decrypted key is empty");
        }
      } catch (error) {
        console.error(
          `❌ Failed to decrypt API key ${apiKey._id} (${apiKey.name}):`,
          error.message
        );
        errorCount++;
      }
    }

    console.log(`\n📊 Verification Summary:`);
    console.log(`   - Successfully verified: ${verifiedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Total checked: ${apiKeys.length}`);

    await mongoose.disconnect();

    return errorCount === 0;
  } catch (error) {
    console.error("💥 Verification failed:", error);
    return false;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🔐 API Key Encryption Migration Tool

Usage:
  node migrate-encrypt-api-keys.js [options]

Options:
  --test-only    Only run encryption tests, don't migrate
  --verify-only  Only verify existing encrypted keys
  --help, -h     Show this help message

Examples:
  node migrate-encrypt-api-keys.js                # Run full migration
  node migrate-encrypt-api-keys.js --test-only    # Test encryption only
  node migrate-encrypt-api-keys.js --verify-only  # Verify existing keys
`);
    process.exit(0);
  }

  // Test encryption first
  const testPassed = await testEncryption();
  if (!testPassed) {
    console.error(
      "❌ Encryption test failed. Please check your ENCRYPTION_KEY environment variable."
    );
    process.exit(1);
  }

  if (args.includes("--test-only")) {
    console.log(
      "✅ Test completed successfully. Encryption is working correctly."
    );
    process.exit(0);
  }

  if (args.includes("--verify-only")) {
    const verifyPassed = await verifyEncryption();
    process.exit(verifyPassed ? 0 : 1);
  }

  // Run migration
  await migrateApiKeys();

  // Verify the migration
  console.log("\n🔍 Running post-migration verification...");
  const verifyPassed = await verifyEncryption();

  if (!verifyPassed) {
    console.error("❌ Post-migration verification failed!");
    process.exit(1);
  }

  console.log("🎉 Migration completed and verified successfully!");
}

// Handle uncaught errors
process.on("unhandledRejection", (error) => {
  console.error("💥 Unhandled promise rejection:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught exception:", error);
  process.exit(1);
});

// Run the script
main();
