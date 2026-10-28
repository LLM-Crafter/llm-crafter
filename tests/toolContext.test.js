'use strict';

jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
  encrypt: value => value,
}));
jest.mock('../src/services/toolService', () => ({ executeToolWithConfig: jest.fn() }));
jest.mock('../src/services/procedureService', () => ({
  checkToolAllowed: jest.fn(() => ({ allowed: true })),
  recordToolResult: jest.fn(),
  getPromptDirective: jest.fn(() => null),
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
const agentService = require('../src/services/agentService');
const summarizationService = require('../src/services/summarizationService');
const Conversation = require('../src/models/Conversation');
const { runAgentGraph } = require('../src/services/agentGraph');
const { formatHistoryLines } = require('../src/utils/operatorGuidance');
const { TOOL_CONTEXT_NOTE, attachToolContext, estimateTokens } = require('../src/utils/toolContext');

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cached_tokens: 0, cost: 0.001 };

/** A stored api_caller entry, shaped like what the agents save on the message. */
function apiCall(endpoint, params, body, { method = 'GET', statusCode = 200 } = {}) {
  return {
    tool_name: 'api_caller',
    parameters: { endpoint_name: endpoint, method, ...params },
    result: {
      endpoint_name: endpoint,
      url: `https://api.example.test/${endpoint}`,
      method,
      status_code: statusCode,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-123' },
      success: true,
      body,
      data: JSON.stringify(body),
    },
    success: true,
    execution_time_ms: 12,
  };
}

function car(id, color, year, mileage) {
  return {
    external_id: id,
    title: `Example SUV ${id}`,
    description: 'Lots of options. '.repeat(150),
    price: 40000 + Number(id),
    images: [`https://cdn.example.test/${id}-1.webp`, `https://cdn.example.test/${id}-2.webp`],
    attributes: { exterior_color: color, first_registration_date: `${year}-03-06`, mileage, fuel_type: 'Gasoline' },
  };
}

const searchCall = apiCall(
  'search_cars',
  { query_params: { model: 'SUV' } },
  { items: [car('3035', 'White', 2022, 82020), car('3094', 'Black', 2019, 96729)], total: 2 }
);

/** A result made of many small fields, which no compaction level can shrink. */
function manyFields(prefix) {
  return Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${prefix}${i}`, i]));
}

function assistant(content, toolsUsed, extra = {}) {
  return { role: 'assistant', content, tools_used: toolsUsed, ...extra };
}

function toolLines(message) {
  return message.tool_context.split('\n').slice(1);
}

function makeConversation(messages) {
  return {
    _id: 'conv1',
    messages,
    metadata: {},
    current_turn_language: null,
    getContextForAgent: () => messages,
    getDecryptedMessages: () => messages.map(m => ({ ...m })),
  };
}

/** The reported case: two cars were shown as cards, then the customer picks one by colour. */
function stockConversation() {
  return makeConversation([
    { role: 'user', content: 'Do you have the SUV in stock?' },
    assistant('We have two: [listing:3035] [listing:3094]. Which one do you like?', [searchCall], {
      timestamp: new Date('2026-10-26T07:35:29Z'),
    }),
    { role: 'user', content: 'the black one' },
  ]);
}

function makeAgent() {
  return {
    _id: 'agent1',
    system_prompt: 'You are Bob from Acme Cars.',
    api_key: { getDecryptedKey: () => 'key', provider: { name: 'openai' } },
    llm_settings: { model: 'gpt-4.1', parameters: {} },
    config: { max_tool_calls: 5 },
    tools: [
      {
        name: 'api_caller',
        description: 'Call APIs',
        parameters: {
          endpoints: {
            search_cars: { base_url: 'https://api.example.test', path: '/cars', methods: ['GET'], description: 'Search stock' },
          },
        },
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('attachToolContext', () => {
  test('keeps a small result as the agent saw it, without headers or fields that repeat the call', () => {
    const call = apiCall('get_order', { path_params: { order_id: '42' } }, { status: 'shipped' });
    const [, message] = attachToolContext([
      { role: 'user', content: 'Where is order 42?' },
      assistant('It has shipped.', [call], { timestamp: '2026-10-26T07:35:29Z' }),
    ]);

    expect(message.tool_context).toBe(
      'tool_results (2026-10-26 07:35 UTC):\n' +
        '- api_caller {"endpoint_name":"get_order","method":"GET","path_params":{"order_id":"42"}} → ' +
        '{"status_code":200,"success":true,"body":{"status":"shipped"}}'
    );
  });

  test('keeps the most recent tool turn as the agent saw it, even above the budget for older turns', () => {
    const [message] = attachToolContext([assistant('Two cars.', [searchCall])], {
      max_tokens: 100,
      max_tokens_per_turn: 100,
    });

    expect(message.tool_context).not.toContain('…');
    expect(message.tool_context).toContain('Lots of options. '.repeat(150));
    expect(message.tool_context).toContain('"images":["https://cdn.example.test/3094-1.webp"');
  });

  test('shrinks a large result to fit its budget and marks every cut', () => {
    const [message] = attachToolContext([assistant('Two cars.', [searchCall])], { max_tokens_latest_turn: 400 });

    expect(estimateTokens(message.tool_context)).toBeLessThanOrEqual(410);
    expect(message.tool_context).toContain('"external_id":"3094"');
    expect(message.tool_context).toContain('"exterior_color":"Black"');
    expect(message.tool_context).toContain('"images":"[2 links omitted]"');
    expect(message.tool_context).toMatch(/Lots of options\. .*…\(\+\d+ chars\)/);
  });

  test('cuts the largest result and keeps small ones whole', () => {
    const lead = apiCall('create_lead', { body_data: { listing_id: '3094' } }, { result: 'created' }, {
      method: 'POST',
      statusCode: 201,
    });
    const [message] = attachToolContext([assistant('Noted.', [searchCall, lead])], { max_tokens_latest_turn: 500 });
    const [search, created] = toolLines(message);

    expect(search).toContain('…');
    expect(created).toBe(
      '- api_caller {"endpoint_name":"create_lead","method":"POST","body_data":{"listing_id":"3094"}} → ' +
        '{"status_code":201,"success":true,"body":{"result":"created"}}'
    );
  });

  test('drops results from the earliest call when even the heaviest cut does not fit', () => {
    const first = { tool_name: 'catalog', parameters: { kind: 'filters' }, result: manyFields('a'), success: true };
    const second = { tool_name: 'lookup', parameters: { id: '7' }, result: manyFields('b'), success: true };
    const [message] = attachToolContext([assistant('Here.', [first, second])], { max_tokens_latest_turn: 200 });
    const [catalog, lookup] = toolLines(message);

    expect(catalog).toBe('- catalog {"kind":"filters"} → result omitted to save space');
    expect(lookup).toContain('"b39":39');
  });

  test('older turns share max_tokens, newest first, and keep only their calls once it is used', () => {
    const lookup = (id, prefix) => ({ tool_name: 'lookup', parameters: { id }, result: manyFields(prefix), success: true });
    const [oldest, middle, latest] = attachToolContext(
      [assistant('One.', [lookup('1', 'a')]), assistant('Two.', [lookup('2', 'b')]), assistant('Three.', [lookup('3', 'c')])],
      { max_tokens: 200 }
    );

    expect(toolLines(latest)[0]).toContain('"c39":39');
    expect(toolLines(middle)[0]).toContain('"b39":39');
    expect(toolLines(oldest)).toEqual(['- lookup {"id":"1"} → result omitted to save space']);
  });

  test('keeps only the newest result of a call repeated with the same parameters', () => {
    const call = { tool_name: 'catalog', parameters: { kind: 'filters' }, result: { colors: ['Black'] }, success: true };
    const [first, second] = attachToolContext([assistant('One.', [call]), assistant('Two.', [call])]);

    expect(toolLines(first)).toEqual(['- catalog {"kind":"filters"} → result omitted to save space']);
    expect(toolLines(second)).toEqual(['- catalog {"kind":"filters"} → {"colors":["Black"]}']);
  });

  test('a later failure of the same call does not hide the earlier result', () => {
    const worked = { tool_name: 'catalog', parameters: { kind: 'filters' }, result: { colors: ['Black'] }, success: true };
    const failed = { tool_name: 'catalog', parameters: { kind: 'filters' }, success: false, error: 'Request timed out' };
    const [first, second] = attachToolContext([assistant('One.', [worked]), assistant('Two.', [failed])]);

    expect(toolLines(first)).toEqual(['- catalog {"kind":"filters"} → {"colors":["Black"]}']);
    expect(toolLines(second)).toEqual(['- catalog {"kind":"filters"} → FAILED: Request timed out']);
  });

  test('a result that cannot be rendered leaves only its own message without tool context', () => {
    const unrenderable = { tool_name: 'lookup', parameters: { id: '1' }, result: { count: 10n }, success: true };
    const fine = { tool_name: 'lookup', parameters: { id: '2' }, result: { count: 2 }, success: true };

    const [first, second] = attachToolContext([assistant('One.', [unrenderable]), assistant('Two.', [fine])]);

    expect(first.tool_context).toBeUndefined();
    expect(toolLines(second)).toEqual(['- lookup {"id":"2"} → {"count":2}']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[ToolContext]'));
  });

  test('always shows failed calls with their error', () => {
    const failed = { tool_name: 'lookup', parameters: { id: '9' }, success: false, error: 'Request timed out' };

    for (const config of [{}, { max_tokens_latest_turn: 0 }]) {
      const [message] = attachToolContext([assistant('Sorry.', [failed])], config);
      expect(toolLines(message)).toEqual(['- lookup {"id":"9"} → FAILED: Request timed out']);
    }
  });

  test('reads entries saved before success was stored by whether they have a result', () => {
    const worked = { tool_name: 'lookup', parameters: { id: '1' }, result: { ok: true } };
    const failed = { tool_name: 'lookup', parameters: { id: '2' } };
    const [message] = attachToolContext([assistant('Done.', [worked, failed])]);

    expect(toolLines(message)).toEqual([
      '- lookup {"id":"1"} → {"ok":true}',
      '- lookup {"id":"2"} → FAILED: unknown error',
    ]);
  });

  test('leaves summarized and user messages alone, and can be turned off', () => {
    const messages = [
      { role: 'user', content: 'Hi', tools_used: [searchCall] },
      assistant('Old reply.', [searchCall], { is_summarized: true }),
      assistant('New reply.', [searchCall]),
    ];

    const result = attachToolContext(messages);
    expect(result[0].tool_context).toBeUndefined();
    expect(result[1].tool_context).toBeUndefined();
    expect(result[2].tool_context).toContain('search_cars');
    expect(messages[2].tool_context).toBeUndefined();

    expect(attachToolContext(messages, { enabled: false })).toBe(messages);
  });
});

describe('formatHistoryLines with tool context', () => {
  test('puts tool results right before their reply and explains them once', () => {
    const text = formatHistoryLines([
      { role: 'user', content: 'Where is order 42?' },
      { role: 'assistant', content: 'It has shipped.', tool_context: 'tool_results:\n- lookup → {"status":"shipped"}' },
      { role: 'user', content: 'Thanks' },
      { role: 'assistant', content: 'You are welcome.', tool_context: 'tool_results:\n- lookup → {"status":"shipped"}' },
    ]);

    expect(text).toContain('user: Where is order 42?\ntool_results:\n- lookup → {"status":"shipped"}\nassistant: It has shipped.');
    expect(text.endsWith(`\n\n${TOOL_CONTEXT_NOTE}`)).toBe(true);
    expect(text.split(TOOL_CONTEXT_NOTE)).toHaveLength(2);
  });

  test('shows tool results before staff guidance on the same reply', () => {
    const text = formatHistoryLines([
      {
        role: 'assistant',
        content: 'Hi Alice',
        tool_context: 'tool_results:\n- lookup → {}',
        metadata: { compose: { instructions: 'Say hi' } },
      },
    ]);

    expect(text.indexOf('tool_results:')).toBeLessThan(text.indexOf('operator_guidance'));
    expect(text.indexOf('operator_guidance')).toBeLessThan(text.indexOf('assistant: Hi Alice'));
  });

  test('adds no note when no message has tool context', () => {
    expect(formatHistoryLines([{ role: 'user', content: 'Hi' }])).toBe('user: Hi');
  });
});

describe('agents see tool results from earlier turns', () => {
  const reply = 'That is the 2019 one.';

  test('the ReAct loop prompt has the earlier search result', async () => {
    const llm = {
      supportsStructuredOutputs: () => true,
      generateCompletion: jest.fn(async () => ({
        content: JSON.stringify({ action: 'respond', reasoning: 'The black car is 3094.', response: reply }),
        usage,
      })),
    };
    OpenAIService.mockImplementation(() => llm);

    const result = await agentService.executeAgentReasoning(makeAgent(), stockConversation());

    expect(result.content).toBe(reply);
    const prompt = llm.generateCompletion.mock.calls[0][1];
    expect(prompt).toContain('"external_id":"3094"');
    expect(prompt).toContain('"exterior_color":"Black"');
    expect(prompt).toContain('Lots of options. '.repeat(150));
    expect(prompt).toContain(TOOL_CONTEXT_NOTE);
  });

  test('the graph planner, responder and critic all see the earlier search result', async () => {
    const llm = {
      supportsStructuredOutputs: () => true,
      isFixedTemperatureModel: () => false,
      generateToolCompletion: jest.fn(async () => ({
        content: 'informing',
        tool_calls: [],
        assistantMessage: { role: 'assistant', content: 'informing' },
        usage,
      })),
      generateCompletion: jest
        .fn()
        .mockResolvedValueOnce({ content: reply, usage })
        .mockResolvedValueOnce({ content: JSON.stringify({ approved: true, issues: [], reasoning: 'Grounded.' }), usage }),
    };
    OpenAIService.mockImplementation(() => llm);

    const result = await runAgentGraph(agentService, makeAgent(), stockConversation());

    expect(result.content).toBe(reply);
    const prompts = [llm.generateToolCompletion.mock.calls[0][1], ...llm.generateCompletion.mock.calls.map(call => call[1])];
    expect(prompts).toHaveLength(3);
    for (const prompt of prompts) {
      expect(prompt).toContain('"exterior_color":"Black"');
    }
  });

  test('the summarizer gets the compacted result body, not the headers', () => {
    const prompt = summarizationService.buildSummarizationPrompt([
      { role: 'user', content: 'Do you have the SUV in stock?' },
      assistant('We have two.', [searchCall]),
    ]);

    expect(prompt).toContain('[Tool: api_caller {"endpoint_name":"search_cars"');
    expect(prompt).toContain('"exterior_color":"Black"');
    expect(prompt).not.toContain('x-request-id');
  });
});

describe('Conversation model', () => {
  test('the history budget counts only the content the prompt gets', () => {
    const message = {
      role: 'assistant',
      content: 'x'.repeat(30),
      thinking_process: [{ step: 'analyze_input', reasoning: 'y'.repeat(4000) }],
    };
    expect(Conversation.prototype.estimateTokenCount([message])).toBe(10);
  });

  test('stores whether a tool call worked, and its error', () => {
    const conversation = new Conversation({
      agent: 'agent1',
      user_identifier: 'user1',
      messages: [
        {
          role: 'assistant',
          content: 'Sorry',
          tools_used: [{ tool_name: 'api_caller', parameters: {}, success: false, error: 'Request timed out' }],
        },
      ],
    });
    const [entry] = conversation.messages[0].tools_used;

    expect(entry.success).toBe(false);
    expect(entry.error).toBe('Request timed out');
  });
});
