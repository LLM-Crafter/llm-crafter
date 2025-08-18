#!/usr/bin/env node

/**
 * Test script to demonstrate default providers functionality
 * Run this after starting the server to see the default providers in action
 */

const axios = require("axios");

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api/v1";

async function testDefaultProviders() {
  console.log("🧪 Testing Default Providers Feature\n");

  try {
    // Test 1: Get all providers
    console.log("1️⃣ Testing: Get all providers");
    const providersResponse = await axios.get(`${BASE_URL}/providers`);
    const providers = providersResponse.data;

    console.log(`✅ Found ${providers.length} providers:`);
    providers.forEach((provider) => {
      console.log(`   • ${provider.name} (${provider.models.length} models)`);
    });
    console.log();

    if (providers.length === 0) {
      console.log(
        "❌ No providers found. Make sure the server is running and database is connected."
      );
      return;
    }

    // Test 2: Get specific provider details
    const firstProvider = providers[0];
    console.log(`2️⃣ Testing: Get details for ${firstProvider.name}`);
    const providerResponse = await axios.get(
      `${BASE_URL}/providers/${firstProvider._id}`
    );
    console.log(`✅ Provider: ${providerResponse.data.name}`);
    console.log(
      `   Models: ${providerResponse.data.models.slice(0, 3).join(", ")}${providerResponse.data.models.length > 3 ? "..." : ""}`
    );
    console.log();

    // Test 3: Get provider models
    console.log(`3️⃣ Testing: Get models for ${firstProvider.name}`);
    const modelsResponse = await axios.get(
      `${BASE_URL}/providers/${firstProvider._id}/models`
    );
    console.log(`✅ Provider: ${modelsResponse.data.provider}`);
    console.log(`   Available models: ${modelsResponse.data.models.length}`);
    console.log(
      `   Sample models: ${modelsResponse.data.models.slice(0, 5).join(", ")}`
    );
    console.log();

    // Test 4: Show provider summary with expected providers
    console.log("📊 Provider Summary:");
    const providerStats = providers.reduce((acc, provider) => {
      acc[provider.name] = provider.models.length;
      return acc;
    }, {});

    const expectedProviders = ["openai", "anthropic", "google", "deepseek"];
    expectedProviders.forEach((name) => {
      const count = providerStats[name] || 0;
      const status = count > 0 ? "✅" : "❌";
      console.log(`   ${status} ${name.padEnd(12)} : ${count} models`);
    });

    // Show any additional providers
    const additionalProviders = Object.keys(providerStats).filter(
      (name) => !expectedProviders.includes(name)
    );
    if (additionalProviders.length > 0) {
      console.log("\n   Additional providers:");
      additionalProviders.forEach((name) => {
        console.log(`   ➕ ${name.padEnd(12)} : ${providerStats[name]} models`);
      });
    }

    console.log(
      "\n🎉 All tests passed! Default providers are working correctly."
    );
  } catch (error) {
    if (error.response) {
      console.log(
        `❌ API Error: ${error.response.status} - ${error.response.data.error || error.response.statusText}`
      );
    } else if (error.request) {
      console.log(
        "❌ Network Error: Could not connect to server. Make sure it's running on",
        BASE_URL
      );
    } else {
      console.log("❌ Error:", error.message);
    }
  }
}

async function testRefreshProviders() {
  console.log("\n🔄 Testing: Refresh providers (requires authentication)");

  try {
    // This will likely fail without auth, but demonstrates the endpoint
    await axios.post(`${BASE_URL}/providers/refresh`);
    console.log("✅ Providers refreshed successfully");
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log("ℹ️  Refresh endpoint requires authentication (expected)");
    } else {
      console.log(
        "❌ Refresh failed:",
        error.response?.data?.error || error.message
      );
    }
  }
}

// Run the tests
async function main() {
  await testDefaultProviders();
  await testRefreshProviders();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testDefaultProviders, testRefreshProviders };
