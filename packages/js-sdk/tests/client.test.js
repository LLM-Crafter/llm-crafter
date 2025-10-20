import { jest } from '@jest/globals';
import { LLMCrafterClient } from '../src/index.js';

describe('LLMCrafterClient', () => {
  let client;

  beforeEach(() => {
    client = new LLMCrafterClient(
      'test-api-key',
      'https://api.test.com/api/v1'
    );
    fetch.mockReset();
  });

  describe('Constructor', () => {
    test('should create client with valid parameters', () => {
      expect(client.apiKey).toBe('test-api-key');
      expect(client.baseUrl).toBe('https://api.test.com/api/v1');
      expect(client.timeout).toBe(30000);
      expect(client.retryAttempts).toBe(3);
      expect(client.retryDelay).toBe(1000);
    });

    test('should throw error if API key is missing', () => {
      expect(() => {
        new LLMCrafterClient('', 'https://api.test.com');
      }).toThrow('API key and base URL are required');
    });

    test('should throw error if base URL is missing', () => {
      expect(() => {
        new LLMCrafterClient('test-key', '');
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
  });

  describe('_request method', () => {
    test('should make successful GET request', async () => {
      const mockResponse = { data: { result: 'success' } };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client._request('/test-endpoint');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/test-endpoint',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key',
          },
        }
      );
      expect(result).toEqual(mockResponse);
    });

    test('should make successful POST request with body', async () => {
      const mockResponse = { data: { result: 'created' } };
      const requestBody = { name: 'test' };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client._request('/test-endpoint', {
        method: 'POST',
        body: requestBody,
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/test-endpoint',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key',
          },
          body: JSON.stringify(requestBody),
        }
      );
      expect(result).toEqual(mockResponse);
    });

    test('should handle 4xx client errors without retry', async () => {
      const errorResponse = { error: 'Not found', code: 'NOT_FOUND' };
      fetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: jest.fn().mockResolvedValueOnce(errorResponse),
        })
      );

      await expect(client._request('/test-endpoint')).rejects.toThrow(
        'Not found'
      );
      expect(fetch).toHaveBeenCalledTimes(1); // No retry for 4xx errors
    });

    test('should retry on 5xx server errors', async () => {
      const errorResponse = { error: 'Server error' };
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: jest.fn().mockResolvedValueOnce(errorResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: jest.fn().mockResolvedValueOnce(errorResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce({ data: { success: true } }),
        });

      const result = await client._request('/test-endpoint');

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ data: { success: true } });
    });
  });

  describe('API Methods', () => {
    beforeEach(() => {
      fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: { success: true } }),
      });
    });

    test('executePrompt should make correct API call', async () => {
      await client.executePrompt('org123', 'proj456', 'greeting', {
        name: 'John',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/external/organizations/org123/projects/proj456/prompts/greeting/execute',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ variables: { name: 'John' } }),
        })
      );
    });

    test('createAgentSession should make correct API call', async () => {
      await client.createAgentSession('agent123', { maxInteractions: 50 });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/sessions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            agentId: 'agent123',
            maxInteractions: 50,
            expiresIn: 3600,
          }),
        })
      );
    });

    test('chatWithAgent should make correct API call', async () => {
      await client.chatWithAgent(
        'session-token',
        'Hello',
        'conv123',
        'user456',
        { context: 'test' }
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/external/agents/chat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Session-Token': 'session-token',
          }),
          body: JSON.stringify({
            message: 'Hello',
            conversationId: 'conv123',
            userIdentifier: 'user456',
            dynamicContext: { context: 'test' },
          }),
        })
      );
    });

    test('getUsage should make correct API call', async () => {
      await client.getUsage();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/external/usage/api-key',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('Streaming API Methods', () => {
    test('chatWithAgentStream should send correct payload format', async () => {
      const mockReader = {
        read: () => Promise.resolve({ done: true, value: new Uint8Array() }),
        releaseLock: () => {},
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      await client.chatWithAgentStream(
        'session-token',
        'Stream hello',
        'conv-123',
        'user-456',
        { context: 'test' }
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/external/agents/chat/stream',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key',
            'X-Session-Token': 'session-token',
          }),
          body: JSON.stringify({
            message: 'Stream hello',
            conversationId: 'conv-123',
            userIdentifier: 'user-456',
            dynamicContext: { context: 'test' },
          }),
        })
      );
    });
  });

  describe('testConnection method', () => {
    test('should return success when connection works', async () => {
      const usageData = { requests: 100, limit: 1000 };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ data: usageData }),
      });

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('API key is valid and working');
      expect(result.usage).toEqual(usageData);
    });

    test('should return failure when connection fails', async () => {
      fetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: jest.fn().mockResolvedValueOnce({ error: 'Unauthorized' }),
        })
      );

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unauthorized');
      expect(result.error).toBeDefined();
    });
  });
});
