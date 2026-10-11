'use strict';

jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
}));
jest.mock('../src/services/toolService', () => ({ executeToolWithConfig: jest.fn() }));
jest.mock('../src/services/procedureService', () => ({
  checkToolAllowed: jest.fn(() => ({ allowed: true })),
  recordToolResult: jest.fn(),
  parseJsonResponse: content => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  },
}));
jest.mock('../src/services/jevService', () => ({ isEnabled: () => false }));
jest.mock('../src/services/openaiService');

const OpenAIService = require('../src/services/openaiService');
const toolService = require('../src/services/toolService');
const { runAgentGraph } = require('../src/services/agentGraph');
const { buildToolCatalog } = require('../src/services/agentGraph/toolCatalog');

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cached_tokens: 0, cost: 0.001 };

/** Scripted fake of OpenAIService: each method pops the next scripted reply. */
function fakeLLM(script) {
  const take = (name, args) => {
    const queue = script[name] || [];
    if (queue.length === 0) {
      throw new Error(`Unexpected ${name} call`);
    }
    const next = queue.shift();
    return typeof next === 'function' ? next(...args) : next;
  };
  const toolStep = (calls, content = '') => ({
    content,
    tool_calls: calls,
    assistantMessage: { role: 'assistant', content, tool_calls: calls },
    usage,
  });
  const llm = {
    supportsStructuredOutputs: () => true,
    isFixedTemperatureModel: () => false,
    generateToolCompletion: jest.fn(async (...args) => {
      const next = take('tool', args);
      return next instanceof Error ? Promise.reject(next) : toolStep(next.calls || [], next.content);
    }),
    generateCompletion: jest.fn(async (...args) => ({ content: take('complete', args), usage })),
    generateStreamingCompletion: jest.fn(async (model, prompt, params, system, onChunk, ...rest) => {
      const text = take('stream', [model, prompt, params, system, onChunk, ...rest]);
      // Emit in two pieces like a real stream.
      const mid = Math.ceil(text.length / 2);
      [text.slice(0, mid), text.slice(mid)].filter(Boolean).forEach(piece => onChunk && onChunk(piece));
      return { content: text, usage };
    }),
  };
  OpenAIService.mockImplementation(() => llm);
  return llm;
}

const approved = JSON.stringify({ approved: true, issues: [], reasoning: 'Fine.' });

function makeAgent(config = {}) {
  return {
    _id: 'agent1',
    system_prompt: 'You are Bob from Acme.',
    api_key: { getDecryptedKey: () => 'key', provider: { name: 'openai' } },
    llm_settings: { model: 'gpt-4.1', parameters: {} },
    config: { max_tool_calls: 5, ...config },
    tools: [
      { name: 'rag_search', description: 'Search the knowledge base' },
      {
        name: 'api_caller',
        description: 'Call APIs',
        parameters: {
          endpoints: {
            get_order: { base_url: 'https://api.test', path: '/orders/{order_id}', methods: ['GET'], description: 'Fetch an order' },
          },
        },
      },
    ],
  };
}

const service = {
  buildAgentContext: () => ({
    conversation_history: [{ role: 'user', content: 'Where is order 42?' }],
    procedure_directive: null,
  }),
  getToolResultForPrompt: (_name, result) => result,
  getAgentToolConfig: () => ({}),
};
const conversation = { _id: 'conv1', current_turn_language: null };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  toolService.executeToolWithConfig.mockResolvedValue({ success: true, result: { status: 'shipped' }, execution_time_ms: 3 });
});
afterEach(() => jest.restoreAllMocks());

describe('native planner', () => {
  test('re-plans after each batch and maps endpoint functions to api_caller', async () => {
    const llm = fakeLLM({
      tool: [
        { calls: [{ id: 'c1', name: 'get_order', arguments: '{"path_params":{"order_id":"42"}}' }] },
        { content: 'support' },
      ],
      complete: ['Your order has shipped.', approved],
    });

    const result = await runAgentGraph(service, makeAgent(), conversation, { customer_id: 'C-1' });

    expect(toolService.executeToolWithConfig).toHaveBeenCalledWith(
      'api_caller',
      { endpoint_name: 'get_order', method: 'GET', path_params: { order_id: '42' }, query_params: {} },
      {}
    );
    // Second planner call replays the first step with its result.
    expect(llm.generateToolCompletion).toHaveBeenCalledTimes(2);
    const rounds = llm.generateToolCompletion.mock.calls[1][3];
    expect(rounds[0].results).toEqual([{ id: 'c1', content: '{"status":"shipped"}', is_error: false }]);
    // Planner sees dynamic context.
    expect(llm.generateToolCompletion.mock.calls[0][1]).toContain('customer_id: "C-1"');

    expect(result.content).toBe('Your order has shipped.');
    expect(result.tools_used).toHaveLength(1);
    expect(result.thinking_process.find(s => s.step === 'planner' && s.round === 2).funnel_state).toBe('support');
  });

  test('falls back to the JSON planner when native tool calling fails', async () => {
    const llm = fakeLLM({
      tool: [new Error('tools not supported')],
      complete: [
        JSON.stringify({ funnel_state: 'informing', needs_tools: false, tools_to_call: [], needs_another_round: false, reasoning: 'none' }),
        'Hello!',
        approved,
      ],
    });

    const result = await runAgentGraph(service, makeAgent(), conversation);

    expect(result.content).toBe('Hello!');
    expect(result.thinking_process.some(s => s.step === 'planner_fallback')).toBe(true);
    expect(llm.generateCompletion).toHaveBeenCalledTimes(3);
  });

  test('answers every tool call when the budget runs out and stops planning', async () => {
    const llm = fakeLLM({
      tool: [{
        calls: [
          { id: 'a', name: 'rag_search', arguments: '{"query":"returns"}' },
          { id: 'b', name: 'rag_search', arguments: '{"query":"refunds"}' },
        ],
      }],
      complete: ['Here is our policy.', approved],
    });

    const result = await runAgentGraph(service, makeAgent({ max_tool_calls: 1 }), conversation);

    expect(toolService.executeToolWithConfig).toHaveBeenCalledTimes(1);
    expect(llm.generateToolCompletion).toHaveBeenCalledTimes(1);
    expect(result.thinking_process.some(s => s.step === 'budget_exhausted')).toBe(true);
    expect(result.content).toBe('Here is our policy.');
  });

  test('skips the planner when the agent has no callable tools', async () => {
    const llm = fakeLLM({ complete: ['Hi there.', approved] });
    const agent = { ...makeAgent(), tools: [] };

    const result = await runAgentGraph(service, agent, conversation);

    expect(llm.generateToolCompletion).not.toHaveBeenCalled();
    expect(result.content).toBe('Hi there.');
  });

  test('propagates cancellation instead of replying with an error', async () => {
    fakeLLM({});
    await expect(
      runAgentGraph(service, makeAgent(), conversation, {}, { cancellationToken: { cancelled: true } })
    ).rejects.toMatchObject({ code: 'EXECUTION_CANCELLED' });
  });
});

describe('critic', () => {
  test('a rejected draft is revised by the responder using the issues', async () => {
    const llm = fakeLLM({
      tool: [{ content: 'informing' }],
      complete: [
        'Delivery is always free!',
        JSON.stringify({ approved: false, issues: ['Remove the free delivery claim'], reasoning: 'Unsupported.' }),
        'Delivery costs depend on your location.',
      ],
    });

    const result = await runAgentGraph(service, makeAgent(), conversation);

    expect(result.content).toBe('Delivery costs depend on your location.');
    const revisionPrompt = llm.generateCompletion.mock.calls[2][1];
    expect(revisionPrompt).toContain('Delivery is always free!');
    expect(revisionPrompt).toContain('- Remove the free delivery claim');
  });

  test('greeting turns without tools skip the critic', async () => {
    const llm = fakeLLM({ tool: [{ content: 'greeting' }], complete: ['Hello! How can I help?'] });

    const result = await runAgentGraph(service, makeAgent(), conversation);

    expect(result.content).toBe('Hello! How can I help?');
    expect(llm.generateCompletion).toHaveBeenCalledTimes(1);
  });
});

describe('streaming', () => {
  test('sends the approved draft once, after status events', async () => {
    fakeLLM({
      tool: [
        { calls: [{ id: 'c1', name: 'rag_search', arguments: '{"query":"hours"}' }] },
        { content: 'informing' },
      ],
      complete: ['We open at 9.'],
      stream: [approved],
    });
    const events = [];

    const result = await runAgentGraph(service, makeAgent(), conversation, {}, {
      streamCallback: text => events.push(['text', text]),
      statusCallback: status => events.push(['status', status.stage]),
    });

    expect(result.content).toBe('We open at 9.');
    expect(events).toEqual([
      ['status', 'planning'],
      ['status', 'searching_knowledge_base'],
      ['status', 'writing'],
      ['status', 'reviewing'],
      ['text', 'We open at 9.'],
    ]);
  });

  test('streams only the revision when the critic rejects the draft', async () => {
    fakeLLM({
      tool: [{ content: 'informing' }],
      complete: ['Bad draft.'],
      stream: [
        JSON.stringify({ approved: false, issues: ['Be accurate'], reasoning: 'x' }),
        'Good reply.',
      ],
    });
    let streamed = '';

    const result = await runAgentGraph(service, makeAgent(), conversation, {}, {
      streamCallback: text => { streamed += text; },
    });

    expect(streamed).toBe('Good reply.');
    expect(result.content).toBe('Good reply.');
  });

  test('streams the draft directly when the critic is disabled', async () => {
    const llm = fakeLLM({ tool: [{ content: 'informing' }], stream: ['Direct reply.'] });
    const chunks = [];

    const result = await runAgentGraph(service, makeAgent({ graph_enable_critic: false }), conversation, {}, {
      streamCallback: text => chunks.push(text),
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe('Direct reply.');
    expect(result.content).toBe('Direct reply.');
    expect(llm.generateCompletion).not.toHaveBeenCalled();
  });
});

describe('tool catalog', () => {
  test('renames endpoints that clash with tools or have invalid names', () => {
    const agent = {
      tools: [
        { name: 'rag_search', description: 'KB' },
        {
          name: 'api_caller',
          description: 'APIs',
          parameters: {
            endpoints: {
              rag_search: { path: '/search', methods: ['GET'] },
              'create lead!': { path: '/leads', methods: ['POST'] },
            },
          },
        },
      ],
    };
    const { functions, resolve } = buildToolCatalog(agent);

    expect(functions.map(f => f.name)).toEqual(['rag_search', 'api_rag_search', 'api_create_lead_']);
    expect(functions[2].parameters.properties).toHaveProperty('body_data');
    expect(resolve({ name: 'api_create_lead_', arguments: '{"body_data":{"name":"Ana"}}' })).toEqual({
      tool_name: 'api_caller',
      tool_parameters: { endpoint_name: 'create lead!', method: 'POST', path_params: {}, query_params: {}, body_data: { name: 'Ana' } },
    });
    expect(resolve({ name: 'rag_search', arguments: 'not json' })).toEqual({ error: 'Arguments were not valid JSON.' });
    expect(resolve({ name: 'nope', arguments: '{}' }).error).toMatch(/Unknown tool/);
  });
});
