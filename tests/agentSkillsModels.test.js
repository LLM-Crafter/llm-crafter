'use strict';

// Uses the real JevService and Mongoose schemas (no database) to check what the
// mocked tests in agentSkills.test.js can't: the request sent to Jev, and how
// skills and skill_state behave as real documents.

jest.mock('axios');
jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
  encrypt: value => value,
}));
jest.mock('../src/services/toolService', () => ({ executeToolWithConfig: jest.fn() }));
jest.mock('../src/services/openaiService');

const axios = require('axios');
const OpenAIService = require('../src/services/openaiService');
const Agent = require('../src/models/Agent');
const Conversation = require('../src/models/Conversation');
const jevService = require('../src/services/jevService');
const { runAgentGraph } = require('../src/services/agentGraph');

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cached_tokens: 0, cost: 0.001 };
const approved = JSON.stringify({ approved: true, issues: [], reasoning: 'Fine.' });

const refunds = { id: 'refunds', name: 'refunds', description: 'Customer wants a refund', not_for: 'Order status questions', instructions: 'REFUND STEPS' };
const shipping = { id: 'shipping', name: 'shipping', description: 'Customer asks about delivery', instructions: 'SHIPPING STEPS' };

const jevAgent = () => ({ _id: 'agent1', project: 'project1', config: { jev: { api_key: 'jev-key', skill_selection: true } } });

function realAgent(overrides = {}) {
  return new Agent({
    name: 'Bob',
    organization: 'org1',
    project: 'project1',
    system_prompt: 'You are Bob.',
    api_key: 'key1',
    llm_settings: { model: 'gpt-4.1' },
    config: { enable_small_agent_graph: true },
    skills: [refunds, shipping],
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(jevService, '_resolveKey').mockResolvedValue('secret');
});
afterEach(() => jest.restoreAllMocks());

describe('jevService.selectSkills', () => {
  const history = [
    { role: 'system', content: 'Earlier summary', is_summarized: true },
    { role: 'user', content: 'I want my money back' },
  ];

  test('asks one noul per skill, using description and not_for as criteria', async () => {
    axios.post.mockResolvedValue({
      data: {
        answers: { refunds: { type: 'noul', noul: 0.91 }, shipping: { type: 'noul', noul: 0.04 } },
        usage: { input_tokens: 100, output_tokens: 3 },
      },
    });

    const result = await jevService.selectSkills(jevAgent(), { conversationHistory: history, skills: [refunds, shipping] });

    const [, body] = axios.post.mock.calls[0];
    expect(Object.keys(body.questions)).toEqual(['refunds', 'shipping']);
    expect(body.questions.refunds).toMatchObject({
      type: 'noul',
      criteria: { true: 'Customer wants a refund', false: 'Order status questions' },
    });
    expect(body.questions.shipping.criteria.false).toBe('The message is about something else.');
    expect(body.questions.refunds.instructions).toContain('`conversation`');
    expect(body.state.conversation.messages).toEqual([{ role: 'user', text: 'I want my money back' }]);
    expect(body.state.conversation.summary).toBe('Earlier summary');
    // Instructions stay out of the request; only the routing text is judged.
    expect(JSON.stringify(body)).not.toContain('REFUND STEPS');

    expect(result.probabilities).toEqual({ refunds: 0.91, shipping: 0.04 });
    expect(result.usage.total_tokens).toBe(103);
  });

  test('returns null when an answer is missing', async () => {
    axios.post.mockResolvedValue({
      data: { answers: { refunds: { type: 'noul', noul: 0.91 } }, usage: {} },
    });

    const result = await jevService.selectSkills(jevAgent(), { conversationHistory: history, skills: [refunds, shipping] });

    expect(result).toBeNull();
  });

  test('returns null when the request fails', async () => {
    axios.post.mockRejectedValue(new Error('timeout'));

    const result = await jevService.selectSkills(jevAgent(), { conversationHistory: history, skills: [refunds] });

    expect(result).toBeNull();
  });
});

describe('Agent schema', () => {
  test('stores skills and applies defaults', () => {
    const agent = realAgent({ skills: [{ name: 'refunds', description: 'd', instructions: 'i' }] });

    expect(agent.validateSync()).toBeUndefined();
    expect(agent.skills[0].id).toEqual(expect.any(String));
    expect(agent.skills[0].enabled).toBe(true);
    expect(agent.skills[0].not_for).toBe('');
  });

  test('keeps a supplied skill id', () => {
    expect(realAgent().skills[0].id).toBe('refunds');
  });

  test('requires instructions and description', () => {
    const errors = realAgent({ skills: [{ name: 'refunds' }] }).validateSync().errors;

    expect(errors).toHaveProperty(['skills.0.description']);
    expect(errors).toHaveProperty(['skills.0.instructions']);
  });

  test('defaults skill selection settings and the Jev flag', () => {
    const { config } = realAgent();

    expect(config.skill_selection.toObject?.() ?? config.skill_selection).toMatchObject({
      yes_threshold: 0.7,
      no_threshold: 0.3,
      max_active: 3,
      idle_turns: 6,
      idle_hours: 24,
    });
    expect(config.graph_models.selector_model).toBeNull();
    expect(config.jev.skill_selection).toBe(false);
  });
});

describe('real documents through the graph', () => {
  function makeLLM(selector) {
    const llm = {
      supportsStructuredOutputs: () => true,
      isFixedTemperatureModel: () => false,
      generateToolCompletion: jest.fn(),
      generateCompletion: jest.fn(async (model, prompt, params, system) => {
        if ((system || '').startsWith('You choose which')) {return { content: selector, usage };}
        return { content: system.includes('CRITIC') ? approved : 'Happy to help.', usage };
      }),
      generateStreamingCompletion: jest.fn(),
    };
    OpenAIService.mockImplementation(() => llm);
    return llm;
  }

  function realConversation() {
    return new Conversation({
      agent: 'agent1',
      organization: 'org1',
      project: 'project1',
      messages: [{ role: 'user', content: 'I want my money back', timestamp: new Date() }],
    });
  }

  function realService() {
    return {
      buildAgentContext: () => ({
        conversation_history: [{ role: 'user', content: 'I want my money back' }],
        procedure_directive: null,
      }),
      getToolResultForPrompt: (_name, result) => result,
      getAgentToolConfig: () => ({}),
    };
  }

  function withKey(agent) {
    // api_key is populated in production; set it after construction so the ref cast is skipped.
    Object.defineProperty(agent, 'api_key', {
      value: { getDecryptedKey: () => 'key', provider: { name: 'openai' } },
    });
    return agent;
  }

  test('skill_state round-trips through a real conversation across turns', async () => {
    const llm = makeLLM(JSON.stringify({ skill_ids: ['refunds'] }));
    const agent = withKey(realAgent());
    const conversation = realConversation();

    await runAgentGraph(realService(), agent, conversation);

    const stored = conversation.toObject().skill_state.active;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ skill_id: 'refunds', idle_turns: 0 });
    expect(stored[0].activated_at).toBeInstanceOf(Date);
    expect(stored[0]).not.toHaveProperty('_id');
    expect(conversation.isModified('skill_state')).toBe(true);
    expect(conversation.validateSync()?.errors?.['skill_state.active.0.skill_id']).toBeUndefined();

    // The next turn reads the stored subdocuments back: unselected now, so it ages.
    llm.generateCompletion.mockImplementation(async (model, prompt, params, system) => {
      if ((system || '').startsWith('You choose which')) {return { content: JSON.stringify({ skill_ids: [] }), usage };}
      return { content: system.includes('CRITIC') ? approved : `Reply with ${prompt.includes('REFUND STEPS')}`, usage };
    });
    const secondTurn = await runAgentGraph(realService(), agent, conversation);

    expect(conversation.toObject().skill_state.active[0].idle_turns).toBe(1);
    expect(secondTurn.content).toBe('Reply with true');
  });

  test('a disabled skill on a real agent is not offered', async () => {
    const llm = makeLLM(JSON.stringify({ skill_ids: [] }));
    const agent = withKey(realAgent({ skills: [{ ...refunds, enabled: false }, shipping] }));

    await runAgentGraph(realService(), agent, realConversation());

    const selectorCall = llm.generateCompletion.mock.calls.find(c => (c[3] || '').startsWith('You choose which'));
    expect(selectorCall[3]).toContain('id: shipping');
    expect(selectorCall[3]).not.toContain('id: refunds');
  });
});
