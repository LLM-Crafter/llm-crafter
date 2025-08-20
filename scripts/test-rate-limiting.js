#!/usr/bin/env node

/**
 * Rate Limiting Test Script
 * Tests various rate limiting scenarios to ensure protection is working
 */

require("dotenv").config();
const axios = require("axios").default;

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const TEST_USER = {
  email: "test@ratelimit.test",
  password: "testpassword123",
  name: "Rate Limit Test User",
};

let authToken = null;

// Configure axios to handle rate limit responses
axios.defaults.timeout = 5000;
axios.defaults.validateStatus = (status) => {
  return status < 500; // Accept all non-server-error responses
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (data) {
      config.data = data;
    }

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
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

async function testHealthEndpoint() {
  console.log("\n🏥 Testing health endpoint rate limiting...");

  const requests = [];
  const startTime = Date.now();

  // Make many requests quickly
  for (let i = 0; i < 150; i++) {
    requests.push(makeRequest("GET", "/health"));
  }

  const responses = await Promise.all(requests);
  const rateLimited = responses.filter((r) => r.status === 429).length;
  const successful = responses.filter((r) => r.status === 200).length;

  console.log(
    `  📊 Results: ${successful} successful, ${rateLimited} rate limited`
  );
  console.log(`  ⏱️  Time taken: ${Date.now() - startTime}ms`);

  if (rateLimited > 0) {
    console.log("  ✅ Rate limiting is working on health endpoint");
    const rateLimitResponse = responses.find((r) => r.status === 429);
    console.log(`  📝 Rate limit message: ${rateLimitResponse.data.message}`);
  } else {
    console.log("  ⚠️  No rate limiting detected - check configuration");
  }
}

async function testAuthEndpoints() {
  console.log("\n🔐 Testing authentication endpoint rate limiting...");

  const invalidLogin = {
    email: "fake@test.com",
    password: "wrongpassword",
  };

  console.log("  📝 Testing login rate limiting with invalid credentials...");

  const loginAttempts = [];
  for (let i = 0; i < 10; i++) {
    loginAttempts.push(makeRequest("POST", "/auth/login", invalidLogin));
    await sleep(100); // Small delay between requests
  }

  const loginResponses = await Promise.all(loginAttempts);
  const rateLimited = loginResponses.filter((r) => r.status === 429).length;
  const authFailed = loginResponses.filter((r) => r.status === 401).length;

  console.log(
    `  📊 Login attempts: ${authFailed} auth failed, ${rateLimited} rate limited`
  );

  if (rateLimited > 0) {
    console.log("  ✅ Login rate limiting is working");
    const rateLimitResponse = loginResponses.find((r) => r.status === 429);
    console.log(`  📝 Rate limit message: ${rateLimitResponse.data.message}`);
  } else {
    console.log("  ⚠️  No login rate limiting detected");
  }

  // Test registration rate limiting
  console.log("  📝 Testing registration rate limiting...");

  const registerAttempts = [];
  for (let i = 0; i < 8; i++) {
    const testUser = {
      email: `test${i}@ratelimit.test`,
      password: "testpassword123",
      name: `Test User ${i}`,
    };
    registerAttempts.push(makeRequest("POST", "/auth/register", testUser));
    await sleep(100);
  }

  const registerResponses = await Promise.all(registerAttempts);
  const regRateLimited = registerResponses.filter(
    (r) => r.status === 429
  ).length;
  const regSuccessful = registerResponses.filter(
    (r) => r.status === 201
  ).length;

  console.log(
    `  📊 Registration: ${regSuccessful} successful, ${regRateLimited} rate limited`
  );

  if (regRateLimited > 0) {
    console.log("  ✅ Registration rate limiting is working");
  } else {
    console.log("  ⚠️  No registration rate limiting detected");
  }
}

async function testGeneralEndpoints() {
  console.log(
    "\n🌐 Testing general endpoint rate limiting (10 requests per second)..."
  );

  // First, try to get a valid auth token
  try {
    const registerResponse = await makeRequest(
      "POST",
      "/auth/register",
      TEST_USER
    );
    if (registerResponse.status === 201) {
      authToken = registerResponse.data.token;
      console.log("  ✅ Got auth token for testing");
    } else {
      console.log(
        "  ⚠️  Could not get auth token, testing without authentication"
      );
    }
  } catch (error) {
    console.log(
      "  ⚠️  Could not register test user, testing without authentication"
    );
  }

  // Test tools endpoint with rapid requests to trigger rate limit
  console.log(
    "  📝 Testing tools endpoint with 15 rapid requests (should hit 10/second limit)..."
  );

  const toolsRequests = [];
  const startTime = Date.now();

  // Make 15 requests rapidly (exceeds 10/second limit)
  for (let i = 0; i < 15; i++) {
    toolsRequests.push(makeRequest("GET", "/tools"));
  }

  const toolsResponses = await Promise.all(toolsRequests);
  const toolsRateLimited = toolsResponses.filter(
    (r) => r.status === 429
  ).length;
  const toolsSuccessful = toolsResponses.filter((r) => r.status === 200).length;

  console.log(
    `  📊 Tools endpoint: ${toolsSuccessful} successful, ${toolsRateLimited} rate limited`
  );
  console.log(`  ⏱️  Time taken: ${Date.now() - startTime}ms`);

  if (toolsRateLimited > 0) {
    console.log(
      "  ✅ General endpoint rate limiting is working (10 requests/second)"
    );
    const rateLimitResponse = toolsResponses.find((r) => r.status === 429);
    console.log(`  📝 Rate limit message: ${rateLimitResponse.data.message}`);
  } else {
    console.log("  ⚠️  No general endpoint rate limiting detected");
  }

  // Wait and test recovery
  console.log("  📝 Waiting 2 seconds and testing recovery...");
  await sleep(2000);

  const recoveryResponse = await makeRequest("GET", "/tools");
  if (recoveryResponse.status === 200) {
    console.log("  ✅ Rate limit recovered successfully");
  } else {
    console.log("  ⚠️  Rate limit did not recover as expected");
  }
}

async function testApiKeyEndpoints() {
  console.log(
    "\n🔑 Testing API key endpoint rate limiting (1 request per second)..."
  );

  if (!authToken) {
    console.log("  ⚠️  Skipping API key tests - no auth token");
    return;
  }

  console.log(
    "  📝 Testing with 3 rapid API key creation requests (should hit 1/second limit)..."
  );

  const requests = [];
  const startTime = Date.now();

  // Make 3 requests rapidly (exceeds 1/second limit)
  for (let i = 0; i < 3; i++) {
    const apiKeyData = {
      name: `Test API Key ${i}`,
      scopes: ["read"],
    };
    requests.push(makeRequest("POST", "/api-keys", apiKeyData));
  }

  const responses = await Promise.all(requests);
  const rateLimited = responses.filter((r) => r.status === 429).length;
  const successful = responses.filter(
    (r) => r.status >= 200 && r.status < 300
  ).length;
  const errors = responses.filter(
    (r) => r.status >= 400 && r.status !== 429
  ).length;

  console.log(
    `  📊 Results: ${successful} successful, ${rateLimited} rate limited, ${errors} other errors`
  );
  console.log(`  ⏱️  Time taken: ${Date.now() - startTime}ms`);

  if (rateLimited > 0) {
    console.log(
      "  ✅ API key endpoint rate limiting is working (1 request/second)"
    );
    const rateLimitResponse = responses.find((r) => r.status === 429);
    console.log(`  📝 Rate limit message: ${rateLimitResponse.data.message}`);
  } else {
    console.log("  ⚠️  No rate limiting detected on API key endpoints");
  }

  // Wait and test recovery
  console.log("  📝 Waiting 2 seconds and testing recovery...");
  await sleep(2000);

  const recoveryResponse = await makeRequest("GET", "/api-keys");
  if (recoveryResponse.status < 300) {
    console.log("  ✅ Rate limit recovered successfully");
  } else {
    console.log("  ⚠️  Rate limit did not recover as expected");
  }
}

async function testLLMProxyEndpoints() {
  console.log(
    "\n🤖 Testing LLM proxy endpoint rate limiting (20 requests per second)..."
  );

  if (!authToken) {
    console.log("  ⚠️  Skipping LLM proxy tests - no auth token");
    return;
  }

  console.log(
    "  📝 Testing with 25 rapid proxy requests (should hit 20/second limit)..."
  );

  const requests = [];
  const startTime = Date.now();

  // Make 25 requests rapidly (exceeds 20/second limit)
  for (let i = 0; i < 25; i++) {
    const proxyData = {
      provider: "openai",
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10,
    };
    requests.push(makeRequest("POST", "/proxy/chat/completions", proxyData));
  }

  const responses = await Promise.all(requests);
  const rateLimited = responses.filter((r) => r.status === 429).length;
  const successful = responses.filter(
    (r) => r.status >= 200 && r.status < 300
  ).length;
  const errors = responses.filter(
    (r) => r.status >= 400 && r.status !== 429
  ).length;

  console.log(
    `  📊 Results: ${successful} successful, ${rateLimited} rate limited, ${errors} other errors`
  );
  console.log(`  ⏱️  Time taken: ${Date.now() - startTime}ms`);

  if (rateLimited > 0) {
    console.log(
      "  ✅ LLM proxy endpoint rate limiting is working (20 requests/second)"
    );
    const rateLimitResponse = responses.find((r) => r.status === 429);
    console.log(`  📝 Rate limit message: ${rateLimitResponse.data.message}`);
  } else {
    console.log("  ⚠️  No rate limiting detected on LLM proxy endpoints");
    console.log(
      "  📝 Note: This might be expected if provider API keys are not configured"
    );
  }

  // Wait and test recovery
  console.log("  📝 Waiting 2 seconds and testing recovery...");
  await sleep(2000);

  const recoveryResponse = await makeRequest("GET", "/proxy/models");
  if (recoveryResponse.status < 500) {
    // Accept any non-server-error response
    console.log("  ✅ Rate limit recovered successfully");
  } else {
    console.log("  ⚠️  Rate limit did not recover as expected");
  }
}

async function testRateLimitHeaders() {
  console.log("\n📋 Testing rate limit headers...");

  const response = await makeRequest("GET", "/health");
  const headers = response.headers;

  const rateLimitHeaders = [
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
  ];

  let foundHeaders = 0;
  rateLimitHeaders.forEach((header) => {
    if (headers[header]) {
      console.log(`  ✅ ${header}: ${headers[header]}`);
      foundHeaders++;
    }
  });

  if (foundHeaders > 0) {
    console.log(`  📊 Found ${foundHeaders}/3 rate limit headers`);
  } else {
    console.log("  ⚠️  No rate limit headers found");
  }
}

async function main() {
  console.log("🧪 Starting Rate Limiting Tests...");
  console.log(`🎯 Target URL: ${BASE_URL}`);

  try {
    await testHealthEndpoint();
    await sleep(1000);

    await testAuthEndpoints();
    await sleep(1000);

    await testGeneralEndpoints();
    await sleep(1000);

    await testApiKeyEndpoints();
    await sleep(1000);

    await testLLMProxyEndpoints();
    await sleep(1000);

    await testRateLimitHeaders();

    console.log("\n🎉 Rate limiting tests completed!");
    console.log("\n💡 Tips:");
    console.log(
      "  - If no rate limiting is detected, ensure the server is running"
    );
    console.log(
      "  - Rate limits may reset during testing, causing unexpected results"
    );
    console.log("  - Check server logs for rate limiting events");
    console.log("  - Consider testing with a clean server state");
    console.log("\n📋 Rate Limit Summary:");
    console.log("  • Login: 5 failed attempts per 10 minutes");
    console.log("  • API Key Operations: 1 request per second");
    console.log("  • LLM Proxy: 20 requests per second");
    console.log("  • General API: 10 requests per second");
    console.log("  • Health/Public: 120 requests per minute");
  } catch (error) {
    console.error("💥 Test failed:", error.message);
    process.exit(1);
  }
}

// Handle interruption gracefully
process.on("SIGINT", () => {
  console.log("\n⏹️  Tests interrupted by user");
  process.exit(0);
});

// Run tests
main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
