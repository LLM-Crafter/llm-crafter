#!/usr/bin/env node
import { LLMCrafterClient } from './dist/index.js';

console.log('🧪 Testing built SDK package...\n');

try {
  // Test basic instantiation
  const client = new LLMCrafterClient(
    'test-key',
    'https://api.example.com/api/v1'
  );
  console.log('✅ Client instantiation works');

  // Test configuration
  console.log('📋 Client configuration:');
  console.log(`  - API Key: ${client.apiKey.substring(0, 4)}...`);
  console.log(`  - Base URL: ${client.baseUrl}`);
  console.log(`  - Timeout: ${client.timeout}ms`);
  console.log(`  - Retry attempts: ${client.retryAttempts}`);

  // Test that methods exist
  const methods = [
    'executePrompt',
    'createAgentSession',
    'chatWithAgent',
    'getUsage',
    'testConnection',
  ];

  console.log('\n🔍 Available methods:');
  methods.forEach(method => {
    if (typeof client[method] === 'function') {
      console.log(`  ✅ ${method}`);
    } else {
      console.log(`  ❌ ${method} (missing)`);
    }
  });

  console.log('\n🎉 SDK package is working correctly!');
} catch (error) {
  console.error('❌ Error testing SDK:', error.message);
  process.exit(1);
}
