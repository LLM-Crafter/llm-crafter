import { jest } from '@jest/globals';

// Ensure fetch is mocked before modules are evaluated
if (typeof globalThis.fetch !== 'function' || !globalThis.fetch._isMockFunction) {
  globalThis.fetch = jest.fn();
}
