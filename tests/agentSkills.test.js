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
jest.mock('../src/services/jevService', () => ({
  isEnabled: jest.fn(() => false),
  selectSkills: jest.fn(),
  assessToolNeed: jest.fn(),
  checkDraftReply: jest.fn(),
}));
jest.mock('../src/services/openaiService');

const OpenAIService = require('../src/services/openaiService');
const jevService = require('../src/services/jevService');
const { runAgentGraph } = require('../src/services/agentGraph');
const { getSelectorModel, nextActiveEntries, DEFAULT_SETTINGS } = require('../src/services/agentGraph/skills');
const { validateSkills } = require('../src/utils/agentSkills');

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cached_tokens: 0, cost: 0.001 };
const approved = JSON.stringify({ approved: true, issues: [], reasoning: 'Fine.' });

const refunds = {
  id: 'refunds',
  name: 'refunds',
  description: 'Customer wants a refund',
  not_for: 'Order status questions',
  instructions: 'REFUND STEPS: look up the order first.',
};
const shipping = {
  id: 'shipping',
  name: 'shipping',
  description: 'Customer asks about delivery',
  instructions: 'SHIPPING STEPS: check the carrier.',
};

/**
 * Fake LLM. `completions` answers generateCompletion calls in order; the selector
 * is told apart by its prompt so tests can assert on it.
 */
function fakeLLM({ completions = [], selector = [] } = {}) {
  const selectorQueue = [...selector];
  const queue = [...completions];
  const llm = {
    supportsStructuredOutputs: () => true,
    isFixedTemperatureModel: () => false,
    generateToolCompletion: jest.fn(async () => ({
      content: 'support',
      tool_calls: [],
      assistantMessage: { role: 'assistant', content: 'support' },
      usage,
    })),
    generateCompletion: jest.fn(async (model, prompt, params, system) => {
      if ((system || '').startsWith('You choose which instruction sets')) {
        const next = selectorQueue.shift();
        if (next instanceof Error) {throw next;}
        return { content: next, usage };
      }
      return { content: queue.shift(), usage };
    }),
    generateStreamingCompletion: jest.fn(),
  };
  OpenAIService.mockImplementation(() => llm);
  return llm;
}

function makeAgent({ skills = [refunds, shipping], config = {}, provider = { name: 'openai' } } = {}) {
  return {
    _id: 'agent1',
    system_prompt: 'You are Bob from Acme.',
    api_key: { getDecryptedKey: () => 'key', provider },
    llm_settings: { model: 'gpt-4.1', parameters: {} },
    config: { max_tool_calls: 5, ...config },
    skills,
    tools: [{ name: 'rag_search', description: 'Search the knowledge base' }],
  };
}

const service = {
  buildAgentContext: () => ({
    conversation_history: [{ role: 'user', content: 'I want my money back' }],
    procedure_directive: null,
  }),
  getToolResultForPrompt: (_name, result) => result,
  getAgentToolConfig: () => ({}),
};

const newConversation = (extra = {}) => ({ _id: 'conv1', current_turn_language: null, ...extra });
const selectorCalls = llm => llm.generateCompletion.mock.calls.filter(c => (c[3] || '').startsWith('You choose which'));
const nonSelectorCalls = llm => llm.generateCompletion.mock.calls.filter(c => !(c[3] || '').startsWith('You choose which'));
const stepsNamed = (result, step) => result.thinking_process.filter(s => s.step === step);

beforeEach(() => {
  jest.clearAllMocks();
  jevService.isEnabled.mockReturnValue(false);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('agents without skills', () => {
  test('make no selector call and add no skill text or state', async () => {
    const llm = fakeLLM({ completions: ['Hello.', approved] });
    const conversation = newConversation();

    const result = await runAgentGraph(service, makeAgent({ skills: [] }), conversation);

    expect(result.content).toBe('Hello.');
    expect(selectorCalls(llm)).toHaveLength(0);
    expect(jevService.selectSkills).not.toHaveBeenCalled();
    expect(conversation.skill_state).toBeUndefined();
    expect(llm.generateToolCompletion.mock.calls[0][1]).not.toContain('Active Skills');
  });

  test('treat disabled skills as absent', async () => {
    const llm = fakeLLM({ completions: ['Hello.', approved] });

    await runAgentGraph(service, makeAgent({ skills: [{ ...refunds, enabled: false }] }), newConversation());

    expect(selectorCalls(llm)).toHaveLength(0);
  });
});

describe('selection without Jev', () => {
  test('uses the small model and renders the skill for planner, responder and critic', async () => {
    const llm = fakeLLM({
      selector: [JSON.stringify({ skill_ids: ['refunds'], reasoning: 'refund' })],
      completions: ['Let me help with that refund.', approved],
    });
    const conversation = newConversation();

    const result = await runAgentGraph(service, makeAgent(), conversation);

    expect(selectorCalls(llm)[0][0]).toBe('gpt-6-luna');
    // Near-misses reach the selector; the instructions don't need to.
    expect(selectorCalls(llm)[0][3]).toContain('not for: Order status questions');
    expect(selectorCalls(llm)[0][3]).not.toContain('REFUND STEPS');

    expect(llm.generateToolCompletion.mock.calls[0][1]).toContain('REFUND STEPS');
    const [responderCall, criticCall] = nonSelectorCalls(llm);
    expect(responderCall[1]).toContain('REFUND STEPS');
    expect(criticCall[1]).toContain('REFUND STEPS');
    expect(responderCall[1]).not.toContain('SHIPPING STEPS');

    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds']);
    expect(stepsNamed(result, 'skill_selection')[0].reasoning).toContain('Active skills: refunds');
  });

  test('counts selector usage in the turn total', async () => {
    fakeLLM({
      selector: [JSON.stringify({ skill_ids: [] })],
      completions: ['Hi.', approved],
    });

    const result = await runAgentGraph(service, makeAgent(), newConversation());

    // selector + planner + responder + critic
    expect(result.token_usage.total_tokens).toBe(usage.total_tokens * 4);
  });

  test('retries on the main model when the small model fails', async () => {
    const llm = fakeLLM({
      selector: [new Error('model not available'), JSON.stringify({ skill_ids: ['shipping'] })],
      completions: ['Your parcel is on its way.', approved],
    });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    expect(selectorCalls(llm).map(c => c[0])).toEqual(['gpt-6-luna', 'gpt-4.1']);
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['shipping']);
  });

  test('keeps current skills, without ageing them, when every selector attempt fails', async () => {
    const llm = fakeLLM({
      selector: [new Error('down'), new Error('down')],
      completions: ['Still on your refund.', approved],
    });
    const lastSelected = new Date(Date.now() - 60_000);
    const conversation = newConversation({
      skill_state: {
        active: [{ skill_id: 'refunds', activated_at: lastSelected, last_selected_at: lastSelected, idle_turns: 2 }],
      },
    });

    const result = await runAgentGraph(service, makeAgent(), conversation);

    expect(result.content).toBe('Still on your refund.');
    expect(nonSelectorCalls(llm)[0][1]).toContain('REFUND STEPS');
    expect(conversation.skill_state.active[0].idle_turns).toBe(2);
    expect(stepsNamed(result, 'skill_selection')[0].reasoning).toContain('Selector failed');
  });

  test('ignores ids the selector invented, and duplicates', async () => {
    fakeLLM({
      selector: [JSON.stringify({ skill_ids: ['made_up', 'refunds', 'refunds'] })],
      completions: ['OK.', approved],
    });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds']);
  });
});

describe('selection with Jev', () => {
  const enableJev = (...features) => jevService.isEnabled.mockImplementation((_agent, f) => features.includes(f));
  const jevAnswers = probabilities => jevService.selectSkills.mockResolvedValue({
    probabilities,
    usage: { ...usage, cost: 0.0001 },
    latency_ms: 40,
  });

  test('activates every clear yes without calling the small model', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.95, shipping: 0.8 });
    const llm = fakeLLM({ completions: ['OK.', approved] });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    expect(selectorCalls(llm)).toHaveLength(0);
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds', 'shipping']);
  });

  test('activates nothing when every answer is a clear no', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.1, shipping: 0.2 });
    const llm = fakeLLM({ completions: ['OK.', approved] });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    expect(selectorCalls(llm)).toHaveLength(0);
    expect(conversation.skill_state.active).toEqual([]);
  });

  test('shows the small model every skill when one is unclear, even with a clear yes', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.9, shipping: 0.5 });
    const llm = fakeLLM({
      selector: [JSON.stringify({ skill_ids: ['refunds', 'shipping'] })],
      completions: ['OK.', approved],
    });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    const system = selectorCalls(llm)[0][3];
    expect(system).toContain('id: shipping');
    expect(system).toContain('id: refunds');
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds', 'shipping']);
  });

  test('the small model has the final say over an unclear skill', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.9, shipping: 0.5 });
    fakeLLM({
      selector: [JSON.stringify({ skill_ids: ['refunds'] })],
      completions: ['OK.', approved],
    });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds']);
  });

  test('the small model can overrule a clear yes, and can choose no skill at all', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.9, shipping: 0.5 });
    fakeLLM({
      selector: [JSON.stringify({ skill_ids: [] })],
      completions: ['OK.', approved],
    });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    expect(conversation.skill_state.active).toEqual([]);
  });

  test('keeps a clear yes when the small model fails on the unclear skills', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.9, shipping: 0.5 });
    const llm = fakeLLM({
      selector: [new Error('down'), new Error('down')],
      completions: ['OK.', approved],
    });
    const conversation = newConversation();

    const result = await runAgentGraph(service, makeAgent(), conversation);

    expect(selectorCalls(llm)).toHaveLength(2);
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds']);
    expect(stepsNamed(result, 'skill_selection')[0].reasoning).toContain('using Jev\'s clear answers');
  });

  test('a probability exactly on a threshold counts as clear', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.7, shipping: 0.3 });
    const llm = fakeLLM({ completions: ['OK.', approved] });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    expect(selectorCalls(llm)).toHaveLength(0);
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds']);
  });

  test('shows the small model every skill when the only answers are unclear or a clear no', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.5, shipping: 0.1 });
    const llm = fakeLLM({
      selector: [JSON.stringify({ skill_ids: ['refunds'] })],
      completions: ['OK.', approved],
    });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    const system = selectorCalls(llm)[0][3];
    expect(system).toContain('id: refunds');
    expect(system).toContain('id: shipping');
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds']);
  });

  test('falls back to the small model over all skills when Jev fails', async () => {
    enableJev('skill_selection');
    jevService.selectSkills.mockResolvedValue(null);
    const llm = fakeLLM({
      selector: [JSON.stringify({ skill_ids: ['shipping'] })],
      completions: ['OK.', approved],
    });
    const conversation = newConversation();

    await runAgentGraph(service, makeAgent(), conversation);

    const system = selectorCalls(llm)[0][3];
    expect(system).toContain('id: refunds');
    expect(system).toContain('id: shipping');
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['shipping']);
  });

  test('honours configured thresholds', async () => {
    enableJev('skill_selection');
    jevAnswers({ refunds: 0.6, shipping: 0.1 });
    const llm = fakeLLM({ completions: ['OK.', approved] });
    const conversation = newConversation();
    const agent = makeAgent({ config: { skill_selection: { yes_threshold: 0.5 } } });

    await runAgentGraph(service, agent, conversation);

    expect(selectorCalls(llm)).toHaveLength(0);
    expect(conversation.skill_state.active.map(e => e.skill_id)).toEqual(['refunds']);
  });

  test('never skips the planner through the Jev gate while a skill is active', async () => {
    enableJev('skill_selection', 'planner_gate');
    jevAnswers({ refunds: 0.9, shipping: 0.1 });
    jevService.assessToolNeed.mockResolvedValue({ skip: true, funnel_state: 'general', probability: 0.99, usage, latency_ms: 5 });
    const llm = fakeLLM({ completions: ['OK.', approved] });

    await runAgentGraph(service, makeAgent(), newConversation());

    expect(jevService.assessToolNeed).not.toHaveBeenCalled();
    expect(llm.generateToolCompletion).toHaveBeenCalledTimes(1);
  });

  test('still uses the Jev gate when no skill is active', async () => {
    enableJev('skill_selection', 'planner_gate');
    jevAnswers({ refunds: 0.1, shipping: 0.1 });
    jevService.assessToolNeed.mockResolvedValue({ skip: true, funnel_state: 'general', probability: 0.99, usage, latency_ms: 5 });
    const llm = fakeLLM({ completions: ['OK.', approved] });

    await runAgentGraph(service, makeAgent(), newConversation());

    expect(jevService.assessToolNeed).toHaveBeenCalledTimes(1);
    expect(llm.generateToolCompletion).not.toHaveBeenCalled();
  });

  test('passes active skills to the Jev critic pre-check ahead of the system prompt', async () => {
    enableJev('skill_selection', 'critic_precheck');
    jevAnswers({ refunds: 0.9, shipping: 0.1 });
    jevService.checkDraftReply.mockResolvedValue({ passed: true, summary: 'ok', latency_ms: 5, usage });
    fakeLLM({ completions: ['OK.'] });

    await runAgentGraph(service, makeAgent(), newConversation());

    const instructions = jevService.checkDraftReply.mock.calls[0][1].agentInstructions;
    expect(instructions).toContain('REFUND STEPS');
    expect(instructions.indexOf('REFUND STEPS')).toBeLessThan(instructions.indexOf('You are Bob'));
  });
});

describe('procedures', () => {
  test('a running procedure suspends skills without ageing them', async () => {
    const llm = fakeLLM({ completions: ['What is your order number?', approved] });
    const lastSelected = new Date(Date.now() - 60_000);
    const stored = { active: [{ skill_id: 'refunds', activated_at: lastSelected, last_selected_at: lastSelected, idle_turns: 1 }] };
    const conversation = newConversation({ procedure_state: { status: 'active' }, skill_state: stored });

    const result = await runAgentGraph(service, makeAgent(), conversation);

    expect(selectorCalls(llm)).toHaveLength(0);
    expect(nonSelectorCalls(llm)[0][1]).not.toContain('REFUND STEPS');
    expect(conversation.skill_state).toBe(stored);
    expect(stepsNamed(result, 'skills_suspended')).toHaveLength(1);
  });

  test('skills select again once the procedure has completed', async () => {
    const llm = fakeLLM({
      selector: [JSON.stringify({ skill_ids: ['refunds'] })],
      completions: ['OK.', approved],
    });

    await runAgentGraph(service, makeAgent(), newConversation({ procedure_state: { status: 'completed' } }));

    expect(selectorCalls(llm)).toHaveLength(1);
  });
});

describe('active skill lifecycle', () => {
  const entry = (skill_id, overrides = {}) => ({
    skill_id,
    activated_at: new Date(1000),
    last_selected_at: new Date(1000),
    idle_turns: 0,
    ...overrides,
  });
  const now = 5000;

  test('an unselected skill stays active and ages', () => {
    const [carried] = nextActiveEntries([entry('a')], [], DEFAULT_SETTINGS, now);
    expect(carried).toMatchObject({ skill_id: 'a', idle_turns: 1 });
  });

  test('a skill is released after idle_turns turns without selection', () => {
    expect(nextActiveEntries([entry('a', { idle_turns: 5 })], [], DEFAULT_SETTINGS, now)).toEqual([]);
    expect(nextActiveEntries([entry('a', { idle_turns: 4 })], [], DEFAULT_SETTINGS, now)).toHaveLength(1);
  });

  test('selecting a skill resets its idle count and keeps its activation time', () => {
    const [selected] = nextActiveEntries([entry('a', { idle_turns: 3 })], ['a'], DEFAULT_SETTINGS, now);
    expect(selected.idle_turns).toBe(0);
    expect(selected.activated_at).toEqual(new Date(1000));
    expect(selected.last_selected_at).toEqual(new Date(now));
  });

  test('the cap keeps selected skills ahead of carried ones', () => {
    const previous = [entry('old1'), entry('old2', { last_selected_at: new Date(2000) })];
    const active = nextActiveEntries(previous, ['new1', 'new2'], DEFAULT_SETTINGS, now);
    expect(active.map(e => e.skill_id)).toEqual(['new1', 'new2', 'old2']);
  });

  test('a failed selector leaves the active set unchanged', () => {
    const previous = [entry('a', { idle_turns: 2 })];
    expect(nextActiveEntries(previous, null, DEFAULT_SETTINGS, now)).toEqual(previous);
  });

  test('skills unused for longer than idle_hours are dropped before selection', async () => {
    fakeLLM({ selector: [JSON.stringify({ skill_ids: [] })], completions: ['Hi.', approved] });
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const conversation = newConversation({
      skill_state: { active: [{ skill_id: 'refunds', activated_at: stale, last_selected_at: stale, idle_turns: 0 }] },
    });

    await runAgentGraph(service, makeAgent(), conversation);

    expect(conversation.skill_state.active).toEqual([]);
  });

  test('skills removed from the agent stop rendering', async () => {
    const llm = fakeLLM({ selector: [JSON.stringify({ skill_ids: [] })], completions: ['Hi.', approved] });
    const recent = new Date();
    const conversation = newConversation({
      skill_state: { active: [{ skill_id: 'deleted', activated_at: recent, last_selected_at: recent, idle_turns: 0 }] },
    });

    await runAgentGraph(service, makeAgent(), conversation);

    expect(conversation.skill_state.active).toEqual([]);
    expect(nonSelectorCalls(llm)[0][1]).not.toContain('Active Skills');
  });

  test('edited instructions apply on the next turn', async () => {
    const llm = fakeLLM({ selector: [JSON.stringify({ skill_ids: ['refunds'] })], completions: ['OK.', approved] });
    const recent = new Date();
    const conversation = newConversation({
      skill_state: { active: [{ skill_id: 'refunds', activated_at: recent, last_selected_at: recent, idle_turns: 0 }] },
    });
    const agent = makeAgent({ skills: [{ ...refunds, instructions: 'EDITED STEPS' }] });

    await runAgentGraph(service, agent, conversation);

    expect(nonSelectorCalls(llm)[0][1]).toContain('EDITED STEPS');
  });
});

describe('selector model', () => {
  test('prefers the per-agent override', () => {
    const agent = makeAgent({ config: { graph_models: { selector_model: 'gpt-4.1-mini' } } });
    expect(getSelectorModel(agent)).toBe('gpt-4.1-mini');
  });

  test.each([
    ['openai', 'gpt-6-luna'],
    ['anthropic', 'claude-haiku-5-5'],
    ['google', 'gemini-2.0-flash'],
    ['deepseek', 'deepseek-chat'],
    ['xai', 'grok-4.20-0309-non-reasoning'],
    ['openrouter', 'deepseek/deepseek-chat'],
  ])('uses the small model for %s', (name, model) => {
    expect(getSelectorModel(makeAgent({ provider: { name } }))).toBe(model);
  });

  test('uses the main model for providers with no small model', () => {
    expect(getSelectorModel(makeAgent({ provider: { name: 'other' } }))).toBe('gpt-4.1');
  });

  test('uses the main model when the provider no longer lists the small model', () => {
    const agent = makeAgent({ provider: { name: 'openai', models: ['gpt-4.1'] } });
    expect(getSelectorModel(agent)).toBe('gpt-4.1');
  });
});

describe('streaming', () => {
  test('sends the planning status before selection, once', async () => {
    jest.clearAllMocks();
    const llm = fakeLLM({ selector: [JSON.stringify({ skill_ids: [] })], completions: ['Hi.'] });
    llm.generateStreamingCompletion.mockImplementation(async (model, prompt, params, system, onChunk) => {
      onChunk(approved);
      return { content: approved, usage };
    });
    const stages = [];

    await runAgentGraph(service, makeAgent(), newConversation(), {}, {
      streamCallback: () => {},
      statusCallback: status => stages.push(status.stage),
    });

    expect(stages[0]).toBe('planning');
    expect(stages.filter(stage => stage === 'planning')).toHaveLength(1);
  });
});

describe('validateSkills', () => {
  const valid = () => ({ name: 'refunds', description: 'When a refund is wanted', instructions: 'Do this.' });

  test('accepts a valid skill and assigns an id', () => {
    const skills = [valid()];
    expect(validateSkills(skills)).toBeNull();
    expect(skills[0].id).toEqual(expect.any(String));
  });

  test.each([
    ['not an array', 'nope', /must be an array/],
    ['a non-object entry', ['nope'], /must be an object/],
    ['a missing name', [{ ...valid(), name: undefined }], /name is required/],
    ['a name with spaces', [{ ...valid(), name: 'my skill' }], /name is required/],
    ['a bad id', [{ ...valid(), id: 'has space' }], /id may only contain/],
    ['a missing description', [{ ...valid(), description: ' ' }], /description is required/],
    ['a long description', [{ ...valid(), description: 'x'.repeat(1025) }], /description must be at most/],
    ['a non-string not_for', [{ ...valid(), not_for: 5 }], /not_for must be a string/],
    ['a long not_for', [{ ...valid(), not_for: 'x'.repeat(1025) }], /not_for must be at most/],
    ['missing instructions', [{ ...valid(), instructions: '' }], /instructions is required/],
    ['long instructions', [{ ...valid(), instructions: 'x'.repeat(20_001) }], /instructions must be at most/],
    ['a closing tag in instructions', [{ ...valid(), instructions: 'a </skill> b' }], /closing <\/skill> tag/],
    ['a non-boolean enabled', [{ ...valid(), enabled: 'yes' }], /enabled must be a boolean/],
  ])('rejects %s', (_label, input, message) => {
    expect(validateSkills(input)).toMatch(message);
  });

  test('rejects duplicate ids and names', () => {
    expect(validateSkills([{ ...valid(), id: 'a' }, { ...valid(), id: 'a', name: 'other' }])).toMatch(/duplicate skill id/);
    expect(validateSkills([valid(), valid()])).toMatch(/duplicate skill name/);
  });

  test('rejects more than the maximum number of skills', () => {
    const skills = Array.from({ length: 51 }, (_, i) => ({ ...valid(), name: `skill${i}` }));
    expect(validateSkills(skills)).toMatch(/at most 50/);
  });
});
