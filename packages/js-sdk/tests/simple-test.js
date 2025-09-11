#!/usr/bin/env node
import { LLMCrafterClient } from '../src/index.js';

// Simple test framework
const tests = [];
const describe = (name, fn) => {
  console.log(`\n📋 ${name}`);
  fn();
};

const test = (name, fn) => {
  tests.push({ name, fn });
};

const expect = actual => ({
  toBe: expected => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, but got ${actual}`);
    }
  },
  toEqual: expected => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`
      );
    }
  },
  toThrow: expectedMessage => {
    try {
      if (typeof actual === 'function') {
        actual();
      }
      throw new Error(`Expected function to throw, but it didn't`);
    } catch (error) {
      if (expectedMessage && !error.message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to contain "${expectedMessage}", but got "${error.message}"`
        );
      }
    }
  },
});

// Mock fetch
const mockFetch = () => {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return (
      fn.returnValue ||
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { success: true } }),
      })
    );
  };

  fn.calls = calls;
  fn.mockClear = () => {
    calls.length = 0;
  };
  fn.mockResolvedValueOnce = value => {
    fn.returnValue = value;
    return fn;
  };

  return fn;
};

global.fetch = mockFetch();

// Test suite
describe('LLMCrafterClient', () => {
  let client;

  const beforeEach = fn => {
    const originalTestFn = tests[tests.length - 1]?.fn;
    if (originalTestFn) {
      tests[tests.length - 1].fn = () => {
        fn();
        return originalTestFn();
      };
    }
  };

  test('should create client with valid parameters', () => {
    client = new LLMCrafterClient(
      'test-api-key',
      'https://api.test.com/api/v1'
    );
    expect(client.apiKey).toBe('test-api-key');
    expect(client.baseUrl).toBe('https://api.test.com/api/v1');
    expect(client.timeout).toBe(30000);
  });

  test('should throw error if API key is missing', () => {
    expect(() => {
      new LLMCrafterClient('', 'https://api.test.com');
    }).toThrow('API key and base URL are required');
  });

  test('should remove trailing slash from base URL', () => {
    const clientWithSlash = new LLMCrafterClient(
      'test-key',
      'https://api.test.com/'
    );
    expect(clientWithSlash.baseUrl).toBe('https://api.test.com');
  });

  test('should accept custom options', () => {
    const customClient = new LLMCrafterClient(
      'test-key',
      'https://api.test.com',
      {
        timeout: 60000,
        retryAttempts: 5,
        retryDelay: 2000,
      }
    );

    expect(customClient.timeout).toBe(60000);
    expect(customClient.retryAttempts).toBe(5);
    expect(customClient.retryDelay).toBe(2000);
  });

  test('should have all required methods', () => {
    client = new LLMCrafterClient('test-key', 'https://api.test.com');

    expect(typeof client.executePrompt).toBe('function');
    expect(typeof client.createAgentSession).toBe('function');
    expect(typeof client.chatWithAgent).toBe('function');
    expect(typeof client.testConnection).toBe('function');
    expect(typeof client.getUsage).toBe('function');
  });
});

// Run tests
async function runTests() {
  console.log('🚀 Running LLM Crafter SDK Tests\n');

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
  }
}

runTests();
