#!/usr/bin/env node

/**
 * Password Policy API Test Script
 * Tests the password policy API endpoints
 */

require("dotenv").config();
const axios = require("axios").default;

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";

// Configure axios
axios.defaults.timeout = 5000;
axios.defaults.validateStatus = (status) => {
  return status < 500; // Accept all non-server-error responses
};

async function makeRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
    };
  } catch (error) {
    return {
      status: error.response?.status || 500,
      data: error.response?.data || { error: error.message },
      headers: error.response?.headers || {},
    };
  }
}

async function testPasswordPolicyEndpoint() {
  console.log("🔐 Testing Password Policy API Endpoint\n");

  const response = await makeRequest("GET", "/auth/password-policy");

  console.log(`Status: ${response.status}`);

  if (response.status === 200) {
    console.log("✅ Password policy endpoint working");
    console.log("\nPolicy Data:");
    console.log(
      "Requirements:",
      response.data.data.requirements.length,
      "items"
    );
    console.log(
      "Recommendations:",
      response.data.data.recommendations.length,
      "items"
    );
    console.log(
      "Good Examples:",
      response.data.data.examples.good.length,
      "items"
    );
    console.log(
      "Bad Examples:",
      response.data.data.examples.bad.length,
      "items"
    );

    // Show first few requirements
    console.log("\nFirst 3 Requirements:");
    response.data.data.requirements.slice(0, 3).forEach((req, i) => {
      console.log(`  ${i + 1}. ${req}`);
    });
  } else {
    console.log("❌ Password policy endpoint failed");
    console.log("Error:", response.data);
  }
}

async function testPasswordValidation() {
  console.log("\n🧪 Testing Password Validation in Registration\n");

  const testCases = [
    {
      name: "Weak Password",
      data: {
        email: "test-weak@example.com",
        password: "weak123",
        name: "Test User",
      },
      expectedStatus: 400,
      shouldSucceed: false,
    },
    {
      name: "Strong Password",
      data: {
        email: "test-strong@example.com",
        password: "MyDog$Loves2Fetch!",
        name: "Test User",
      },
      expectedStatus: 201,
      shouldSucceed: true,
    },
  ];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log(`  Password: "${testCase.data.password}"`);

    const response = await makeRequest("POST", "/auth/register", testCase.data);

    console.log(
      `  Status: ${response.status} (expected: ${testCase.expectedStatus})`
    );

    if (testCase.shouldSucceed) {
      if (response.status === 201) {
        console.log("  ✅ Registration succeeded");
        console.log(`  Password Strength: ${response.data.passwordStrength}`);
        if (response.data.warnings?.length > 0) {
          console.log(`  Warnings: ${response.data.warnings.join(", ")}`);
        }
      } else {
        console.log("  ❌ Registration should have succeeded");
        console.log(`  Error: ${response.data.error}`);
      }
    } else {
      if (response.status === 400) {
        console.log("  ✅ Registration correctly rejected");
        console.log(`  Error: ${response.data.error}`);
        if (response.data.details) {
          console.log("  Details:");
          response.data.details.forEach((detail) =>
            console.log(`    • ${detail}`)
          );
        }
      } else {
        console.log("  ❌ Registration should have been rejected");
      }
    }

    console.log("");
  }
}

async function main() {
  console.log("🧪 Password Policy API Tests");
  console.log(`🎯 Target URL: ${BASE_URL}\n`);

  try {
    await testPasswordPolicyEndpoint();
    await testPasswordValidation();

    console.log("🎉 Password policy API tests completed!");
    console.log(
      "\n💡 Note: Registration tests may fail if server is not running or users already exist."
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

main();
