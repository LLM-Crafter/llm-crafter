'use strict';

const OpenAIService = require('../src/services/openaiService');

const tools = [{ name: 'get_order', description: 'Fetch an order', parameters: { type: 'object', properties: {} } }];

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('generateToolCompletion (OpenAI-compatible)', () => {
  test('replays earlier rounds as assistant + tool messages and returns tool calls', async () => {
    const service = new OpenAIService('key', 'xai');
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

describe('OpenAI Responses API', () => {
  const usage = { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 40 } };
  const textResponse = (text = 'done', extra = {}) => ({
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
    usage,
    ...extra,
  });

  function serviceWith(create, provider = 'openai') {
    const service = new OpenAIService('key', provider);
    const chatCreate = jest.fn().mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'from chat' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    service.client = { responses: { create }, chat: { completions: { create: chatCreate } } };
    return { service, chatCreate };
  }

  async function* eventStream(events) {
    yield* events;
  }

  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));

  describe('generateCompletion', () => {
    test('maps the request and keeps the result shape callers expect', async () => {
      const create = jest.fn().mockResolvedValue(textResponse('Hello'));
      const { service, chatCreate } = serviceWith(create);

      const result = await service.generateCompletion(
        'gpt-4.1',
        'Hi',
        { temperature: 0.2, max_tokens: 500, top_p: 1, frequency_penalty: 0, presence_penalty: 0, reasoning_effort: null },
        '  Be nice.  ',
        null,
        { prompt_cache_key: 'k' }
      );

      expect(create.mock.calls[0][0]).toEqual({
        model: 'gpt-4.1',
        input: [{ role: 'user', content: 'Hi' }],
        instructions: 'Be nice.',
        store: false,
        temperature: 0.2,
        max_output_tokens: 500,
        prompt_cache_key: 'k',
      });
      expect(chatCreate).not.toHaveBeenCalled();
      expect(result.content).toBe('Hello');
      expect(result.finish_reason).toBe('stop');
      expect(result.usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cached_tokens: 40 });
    });

    test('always asks OpenAI not to store the response', async () => {
      const create = jest.fn().mockResolvedValue(textResponse());
      await serviceWith(create).service.generateCompletion('gpt-4.1', 'Hi', {});
      expect(create.mock.calls[0][0].store).toBe(false);
    });

    test('sends structured outputs as text.format', async () => {
      const create = jest.fn().mockResolvedValue(textResponse('{}'));
      const schema = { type: 'object', properties: {} };
      await serviceWith(create).service.generateCompletion(
        'gpt-4.1', 'Hi', {}, null,
        { type: 'json_schema', json_schema: { name: 'verdict', strict: false, schema } }
      );

      const request = create.mock.calls[0][0];
      expect(request.text.format).toEqual({ type: 'json_schema', name: 'verdict', strict: false, schema });
      expect(request).not.toHaveProperty('response_format');
    });

    test.each([
      'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.5-cyber',
      'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-cyber',
      'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna',
    ])('sends structured outputs on %s', async model => {
      const create = jest.fn().mockResolvedValue(textResponse('{}'));
      await serviceWith(create).service.generateCompletion(
        model, 'Hi', {}, null,
        { type: 'json_schema', json_schema: { name: 'verdict', strict: false, schema: { type: 'object' } } }
      );
      expect(create.mock.calls[0][0].text.format.name).toBe('verdict');
    });

    test('leaves out structured outputs on models that do not support them', async () => {
      const create = jest.fn().mockResolvedValue(textResponse('{}'));
      await serviceWith(create).service.generateCompletion(
        'gpt-3.5-turbo', 'Hi', {}, null,
        { type: 'json_schema', json_schema: { name: 'verdict', schema: {} } }
      );
      expect(create.mock.calls[0][0]).not.toHaveProperty('text');
    });

    test('converts text and image content parts', async () => {
      const create = jest.fn().mockResolvedValue(textResponse());
      await serviceWith(create).service.generateCompletion('gpt-4.1', [
        { type: 'text', text: 'Describe this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA', detail: 'low' } },
      ], {});

      expect(create.mock.calls[0][0].input[0].content).toEqual([
        { type: 'input_text', text: 'Describe this' },
        { type: 'input_image', image_url: 'data:image/png;base64,AA', detail: 'low' },
      ]);
    });

    test('sends reasoning_effort as reasoning.effort, and no temperature on fixed-temperature models', async () => {
      const create = jest.fn().mockResolvedValue(textResponse());
      await serviceWith(create).service.generateCompletion('gpt-6-luna', 'Hi', { temperature: 0.7, reasoning_effort: 'high' });

      const request = create.mock.calls[0][0];
      expect(request.reasoning).toEqual({ effort: 'high' });
      expect(request).not.toHaveProperty('temperature');
      expect(request).not.toHaveProperty('reasoning_effort');
    });

    test('raises very small output caps to the API minimum', async () => {
      const create = jest.fn().mockResolvedValue(textResponse());
      await serviceWith(create).service.generateCompletion('gpt-4.1', 'Hi', { max_tokens: 5 });
      expect(create.mock.calls[0][0].max_output_tokens).toBe(16);
    });

    test('reports hitting the output cap as finish_reason "length"', async () => {
      const create = jest.fn().mockResolvedValue({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'reasoning', summary: [] }],
        usage,
      });
      const result = await serviceWith(create).service.generateCompletion('gpt-4.1', 'Hi', {});
      expect(result.finish_reason).toBe('length');
      expect(result.content).toBe('');
    });

    test('throws on a failed response', async () => {
      const create = jest.fn().mockResolvedValue({ status: 'failed', error: { message: 'server_error' }, output: [] });
      await expect(serviceWith(create).service.generateCompletion('gpt-4.1', 'Hi', {}))
        .rejects.toThrow('openai API Error: server_error');
    });

    test.each([
      ['temperature', "Unsupported parameter: 'temperature' is not supported with this model."],
      ['top_p', "Unsupported parameter: 'top_p' is not supported with this model."],
    ])('retries without %s when the model rejects it', async (parameter, message) => {
      const create = jest.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce(textResponse());
      const result = await serviceWith(create).service.generateCompletion('gpt-4.1', 'Hi', { temperature: 0.5, top_p: 0.5 });

      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[1][0]).not.toHaveProperty(parameter);
      expect(result.content).toBe('done');
    });

    test('does not retry other errors', async () => {
      const create = jest.fn().mockRejectedValue(new Error('Incorrect API key'));
      await expect(serviceWith(create).service.generateCompletion('gpt-4.1', 'Hi', {}))
        .rejects.toThrow('openai API Error: Incorrect API key');
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('which API is used', () => {
    test('other OpenAI-compatible providers stay on Chat Completions', async () => {
      for (const provider of ['google', 'xai', 'deepseek', 'openrouter']) {
        const create = jest.fn();
        const { service, chatCreate } = serviceWith(create, provider);

        const result = await service.generateCompletion('some-model', 'Hi', { max_tokens: 10 });

        expect(create).not.toHaveBeenCalled();
        expect(chatCreate.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'Hi' }]);
        expect(result.content).toBe('from chat');
      }
    });

    test('search models go straight to Chat Completions', async () => {
      const create = jest.fn();
      const { service, chatCreate } = serviceWith(create);

      await service.generateCompletion('gpt-5-search-api', 'Hi', {});

      expect(create).not.toHaveBeenCalled();
      expect(chatCreate).toHaveBeenCalledTimes(1);
    });

    test('falls back to Chat Completions when a model is not available on Responses', async () => {
      const create = jest.fn().mockRejectedValue(new Error('This model is only supported in v1/chat/completions.'));
      const { service, chatCreate } = serviceWith(create);

      const result = await service.generateCompletion('chat-latest', 'Hi', {});

      expect(chatCreate).toHaveBeenCalledTimes(1);
      expect(result.content).toBe('from chat');
    });
  });

  describe('generateStreamingCompletion', () => {
    test('emits text deltas and reads usage from the final event', async () => {
      const create = jest.fn().mockResolvedValue(eventStream([
        { type: 'response.created', response: {} },
        { type: 'response.output_text.delta', delta: 'Hel' },
        { type: 'response.output_text.delta', delta: 'lo' },
        { type: 'response.completed', response: { status: 'completed', usage } },
      ]));
      const chunks = [];

      const result = await serviceWith(create).service.generateStreamingCompletion(
        'gpt-4.1', 'Hi', { max_tokens: 50 }, 'Sys', chunk => chunks.push(chunk)
      );

      expect(create.mock.calls[0][0]).toMatchObject({ stream: true, store: false, instructions: 'Sys', max_output_tokens: 50 });
      expect(create.mock.calls[0][0]).not.toHaveProperty('stream_options');
      expect(chunks).toEqual(['Hel', 'lo']);
      expect(result.content).toBe('Hello');
      expect(result.finish_reason).toBe('stop');
      expect(result.usage.total_tokens).toBe(110);
    });

    test('reports an incomplete stream as "length"', async () => {
      const create = jest.fn().mockResolvedValue(eventStream([
        { type: 'response.output_text.delta', delta: 'Hel' },
        { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage } },
      ]));
      const result = await serviceWith(create).service.generateStreamingCompletion('gpt-4.1', 'Hi', {}, null, () => {});
      expect(result.finish_reason).toBe('length');
      expect(result.content).toBe('Hel');
    });

    test.each([
      ['a failed response', { type: 'response.failed', response: { status: 'failed', error: { message: 'boom' } } }],
      ['an error event', { type: 'error', message: 'boom' }],
    ])('throws on %s', async (_label, event) => {
      const create = jest.fn().mockResolvedValue(eventStream([event]));
      await expect(serviceWith(create).service.generateStreamingCompletion('gpt-4.1', 'Hi', {}, null, () => {}))
        .rejects.toThrow('openai API Error: boom');
    });

    test('without a chunk callback it makes a plain request', async () => {
      const create = jest.fn().mockResolvedValue(textResponse('Hello'));
      const result = await serviceWith(create).service.generateStreamingCompletion('gpt-4.1', 'Hi', {});
      expect(create.mock.calls[0][0]).not.toHaveProperty('stream');
      expect(result.content).toBe('Hello');
    });
  });

  describe('generateToolCompletion', () => {
    const functionCall = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_order', arguments: '{"id":"2"}' };
    const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' };

    test('uses flat non-strict tool definitions and returns tool calls', async () => {
      const create = jest.fn().mockResolvedValue({ status: 'completed', output: [reasoning, functionCall], usage });

      const result = await serviceWith(create).service.generateToolCompletion('gpt-4.1', 'Where?', tools, [], { max_tokens: 500 }, 'You plan.', { prompt_cache_key: 'k' });

      const request = create.mock.calls[0][0];
      expect(request.tools).toEqual([{ type: 'function', ...tools[0], strict: false }]);
      expect(request).toMatchObject({ tool_choice: 'auto', store: false, instructions: 'You plan.', max_output_tokens: 500, prompt_cache_key: 'k' });
      expect(result.tool_calls).toEqual([{ id: 'call_1', name: 'get_order', arguments: '{"id":"2"}' }]);
      expect(result.finish_reason).toBe('tool_calls');
      expect(result.assistantMessage).toEqual([reasoning, functionCall]);
    });

    test('replays reasoning items and tool calls with their results', async () => {
      const create = jest.fn().mockResolvedValue(textResponse('support'));

      const result = await serviceWith(create).service.generateToolCompletion(
        'gpt-6-luna', 'Where?', tools,
        [{ assistantMessage: [reasoning, functionCall], results: [{ id: 'call_1', content: '{"ok":true}', is_error: false }] }]
      );

      expect(create.mock.calls[0][0].input).toEqual([
        { role: 'user', content: 'Where?' },
        reasoning,
        functionCall,
        { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' },
      ]);
      expect(result.tool_calls).toEqual([]);
      expect(result.content).toBe('support');
      expect(result.finish_reason).toBe('stop');
    });

    describe('reasoning effort', () => {
      const requestFor = async (model, parameters = {}, provider = 'openai') => {
        const create = jest.fn().mockResolvedValue(textResponse());
        await serviceWith(create, provider).service.generateToolCompletion(model, 'hi', tools, [], parameters);
        return create.mock.calls[0]?.[0];
      };

      test.each(['gpt-6-luna', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-luna', 'gpt-5.4', 'o3'])('defaults %s to low', async model => {
        expect((await requestFor(model)).reasoning).toEqual({ effort: 'low' });
        expect((await requestFor(model, { reasoning_effort: null })).reasoning).toEqual({ effort: 'low' });
      });

      test('keeps an effort the agent configured', async () => {
        expect((await requestFor('gpt-6-luna', { reasoning_effort: 'high' })).reasoning).toEqual({ effort: 'high' });
      });

      test.each(['gpt-4.1', 'gpt-4o', 'gpt-5-pro', 'gpt-5.1-chat-latest'])('sends no effort for %s', async model => {
        expect(await requestFor(model)).not.toHaveProperty('reasoning');
      });

      test('retries without reasoning when a model rejects it', async () => {
        const create = jest.fn()
          .mockRejectedValueOnce(new Error("Unsupported parameter: 'reasoning.effort' is not supported with this model."))
          .mockResolvedValueOnce(textResponse());

        await serviceWith(create).service.generateToolCompletion('gpt-6-luna', 'hi', tools);

        expect(create.mock.calls[1][0]).not.toHaveProperty('reasoning');
      });
    });

    test('surfaces failures so the graph planner can fall back', async () => {
      const create = jest.fn().mockRejectedValue(new Error('tools rejected'));
      await expect(serviceWith(create).service.generateToolCompletion('gpt-4.1', 'hi', tools))
        .rejects.toThrow('openai API Error: tools rejected');
    });
  });

  test('fixed-temperature detection covers the gpt-6 family', () => {
    const service = new OpenAIService('key', 'openai');
    ['gpt-6-luna', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-terra'].forEach(model => {
      expect(service.isFixedTemperatureModel(model)).toBe(true);
    });
    ['gpt-5.5', 'gpt-4.1', 'gpt-60'].forEach(model => {
      expect(service.isFixedTemperatureModel(model)).toBe(false);
    });
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
