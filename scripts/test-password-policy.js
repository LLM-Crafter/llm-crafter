#!/usr/bin/env node

/**
 * Password Policy Test Script
 * Tests password validation and strength calculation
 */

const {
  validatePassword,
  calculatePasswordStrength,
  getPasswordPolicyDescription,
} = require("../src/utils/passwordPolicy");

// Test cases
const testPasswords = [
  // Weak passwords
  { password: "password", expected: false, description: "Common word" },
  {
    password: "123456",
    expected: false,
    description: "Too short and all numbers",
  },
  { password: "qwerty123", expected: false, description: "Keyboard pattern" },
  {
    password: "Password1",
    expected: false,
    description: "Too short, missing special chars",
  },
  {
    password: "aaaaaaaaaaaaa",
    expected: false,
    description: "Repeated characters",
  },
  {
    password: "abcdefghijk",
    expected: false,
    description: "Sequential pattern",
  },

  // Borderline passwords
  {
    password: "StrongPass123!",
    expected: false,
    description: 'Contains banned word "pass"',
  },
  {
    password: "MyCoding456!",
    expected: true,
    description: "Meets minimum requirements",
  },

  // Strong passwords
  {
    password: "MyDog$Loves2Fetch!",
    expected: true,
    description: "Strong passphrase",
  },
  {
    password: "Coffee&Code#2024Time",
    expected: true,
    description: "Mixed words and symbols",
  },
  {
    password: "Tr0ub4dor&3BlueOcean!",
    expected: true,
    description: "Complex with substitutions",
  },
  {
    password: "Th1s-1s-4-V3ry-$tr0ng-P4ssw0rd!",
    expected: true,
    description: "Very strong with hyphens",
  },
];

function runPasswordTests() {
  console.log("🔐 Password Policy Test Suite\n");

  let passed = 0;
  let failed = 0;

  testPasswords.forEach((test, index) => {
    console.log(`Test ${index + 1}: ${test.description}`);
    console.log(`  Password: "${test.password}"`);

    const result = validatePassword(test.password);
    const strength = calculatePasswordStrength(test.password);

    console.log(
      `  Expected Valid: ${test.expected}, Actual: ${result.isValid}`
    );
    console.log(`  Strength: ${strength}`);

    if (result.isValid === test.expected) {
      console.log(`  ✅ PASS`);
      passed++;
    } else {
      console.log(`  ❌ FAIL`);
      failed++;
    }

    if (!result.isValid && result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.join(", ")}`);
    }

    if (result.warnings.length > 0) {
      console.log(`  Warnings: ${result.warnings.join(", ")}`);
    }

    console.log("");
  });

  console.log(`📊 Test Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log("🎉 All tests passed!");
  } else {
    console.log(
      "⚠️  Some tests failed. Please review the password policy implementation."
    );
  }
}

function showPasswordPolicy() {
  console.log("📋 Password Policy Information\n");

  const policy = getPasswordPolicyDescription();

  console.log("Requirements:");
  policy.requirements.forEach((req) => console.log(`  • ${req}`));

  console.log("\nRecommendations:");
  policy.recommendations.forEach((rec) => console.log(`  • ${rec}`));

  console.log("\nGood Examples:");
  policy.examples.good.forEach((ex) => console.log(`  ✅ ${ex}`));

  console.log("\nBad Examples:");
  policy.examples.bad.forEach((ex) => console.log(`  ❌ ${ex}`));

  console.log("");
}

function testPasswordStrengths() {
  console.log("💪 Password Strength Analysis\n");

  const testCases = [
    "weak123",
    "Password123!",
    "MyDog$Loves2Fetch!",
    "Th1s-1s-4-V3ry-$tr0ng-P4ssw0rd-W1th-L0ts-0f-Ch4r4ct3rs!@#$",
  ];

  testCases.forEach((password) => {
    const strength = calculatePasswordStrength(password);
    console.log(`"${password}"`);
    console.log(`  Strength: ${strength}\n`);
  });
}

function interactiveTest() {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🧪 Interactive Password Testing");
  console.log('Enter a password to test (type "exit" to quit):\n');

  function promptForPassword() {
    rl.question("Password: ", (password) => {
      if (password.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      const result = validatePassword(password);
      const strength = calculatePasswordStrength(password);

      console.log(`\nValidation Result:`);
      console.log(`  Valid: ${result.isValid ? "✅" : "❌"}`);
      console.log(`  Strength: ${strength}`);

      if (!result.isValid) {
        console.log(`  Errors:`);
        result.errors.forEach((error) => console.log(`    • ${error}`));
      }

      if (result.warnings.length > 0) {
        console.log(`  Warnings:`);
        result.warnings.forEach((warning) => console.log(`    • ${warning}`));
      }

      console.log("");
      promptForPassword();
    });
  }

  promptForPassword();
}

// Main execution
function main() {
  const args = process.argv.slice(2);

  if (args.includes("--policy")) {
    showPasswordPolicy();
  } else if (args.includes("--strength")) {
    testPasswordStrengths();
  } else if (args.includes("--interactive")) {
    interactiveTest();
  } else {
    runPasswordTests();

    if (args.includes("--all")) {
      console.log("\n" + "=".repeat(60) + "\n");
      showPasswordPolicy();
      console.log("\n" + "=".repeat(60) + "\n");
      testPasswordStrengths();
    }
  }
}

main();
