'use strict';

const OpenAIService = require('../src/services/openaiService');

const tools = [{ name: 'get_order', description: 'Fetch an order', parameters: { type: 'object', properties: {} } }];

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('generateToolCompletion (OpenAI-compatible)', () => {
  test('replays earlier rounds as assistant + tool messages and returns tool calls', async () => {
    const service = new OpenAIService('key', 'openai');
    const create = jest.fn().mockResolvedValue({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_b', type: 'function', function: { name: 'get_order', arguments: '{"id":"2"}' } }],
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    });
    service.client = { chat: { completions: { create } } };

    const previous = { role: 'assistant', content: null, tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'get_order', arguments: '{}' } }] };
    const result = await service.generateToolCompletion(
      'gpt-4.1', 'Where is my order?', tools,
      [{ assistantMessage: previous, results: [{ id: 'call_a', content: '{"ok":true}' }] }],
      { temperature: 0.2, max_tokens: 500 }, 'You plan.', { prompt_cache_key: 'k' }
    );

    const request = create.mock.calls[0][0];
    expect(request.messages).toEqual([
      { role: 'system', content: 'You plan.' },
      { role: 'user', content: 'Where is my order?' },
      previous,
      { role: 'tool', tool_call_id: 'call_a', content: '{"ok":true}' },
    ]);
    expect(request.tools[0]).toEqual({ type: 'function', function: tools[0] });
    expect(request.max_completion_tokens).toBe(500);
    expect(result.tool_calls).toEqual([{ id: 'call_b', name: 'get_order', arguments: '{"id":"2"}' }]);
    expect(result.content).toBe('');
  });

  test('assigns ids when the provider omits them', async () => {
    const service = new OpenAIService('key', 'google');
    service.client = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { role: 'assistant', tool_calls: [{ type: 'function', function: { name: 'get_order', arguments: '{}' } }] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        },
      },
    };

    const result = await service.generateToolCompletion('gemini-2.5-flash', 'hi', tools);

    expect(result.tool_calls[0].id).toBe('call_0_0');
    expect(result.assistantMessage.tool_calls[0].id).toBe('call_0_0');
  });
});

describe('generateToolCompletion (Anthropic)', () => {
  test('sends tool_result blocks and returns tool_use calls', async () => {
    const service = new OpenAIService('key', 'anthropic');
    const stream = jest.fn(() => ({
      finalMessage: async () => ({
        model: 'claude-haiku-4-5',
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Looking it up.' },
          { type: 'tool_use', id: 'toolu_2', name: 'get_order', input: { id: '2' } },
        ],
        usage: { input_tokens: 50, output_tokens: 10 },
      }),
    }));
    service.anthropicClient = { messages: { stream } };

    const previous = { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_order', input: {} }] };
    const result = await service.generateToolCompletion(
      'claude-haiku-4-5', 'Where is my order?', tools,
      [{ assistantMessage: previous, results: [{ id: 'toolu_1', content: 'ERROR: not found', is_error: true }] }],
      { max_tokens: 500 }, 'You plan.', { prompt_cache_key: 'k' }
    );

    const params = stream.mock.calls[0][0];
    expect(params.messages[1]).toBe(previous);
    expect(params.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ERROR: not found', is_error: true }],
    });
    expect(params.tools[0]).toEqual({ name: 'get_order', description: 'Fetch an order', input_schema: tools[0].parameters });
    expect(params.cache_control).toEqual({ type: 'ephemeral' });
    expect(result.tool_calls).toEqual([{ id: 'toolu_2', name: 'get_order', arguments: '{"id":"2"}' }]);
    expect(result.content).toBe('Looking it up.');
    expect(result.assistantMessage.content).toHaveLength(2);
  });
});
