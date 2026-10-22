'use strict';

jest.mock('../src/models/ApiKey', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/Conversation', () => ({ countDocuments: jest.fn(async () => 0) }));
jest.mock('../src/models/OutboundEmail', () => ({ distinct: jest.fn(async () => []) }));
jest.mock('../src/services/openaiService');
jest.mock('../src/services/jevService', () => ({
  ask: jest.fn(),
  getConfig: jest.fn(agent => agent?.config?.jev?.api_key ? agent.config.jev : null),
  minConfidence: jest.fn(() => 0.85),
}));

const ApiKey = require('../src/models/ApiKey');
const Conversation = require('../src/models/Conversation');
const OutboundEmail = require('../src/models/OutboundEmail');
const OpenAIService = require('../src/services/openaiService');
const jevService = require('../src/services/jevService');
const gateService = require('../src/services/email/emailAnswerGateService');

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cached_tokens: 0, cost: 0.001 };

// The dealership config from the design discussion.
const DEALER_GATE = {
  enabled: true,
  enforce: true,
  actions: { high: 'reply', medium: 'skip', low: 'skip' },
  signals: [
    { id: 'unclear_intent', type: 'triage_confidence_below', value: 0.6, caps_at: 'low' },
    { id: 'restricted_topic', type: 'triage_topic_in', value: ['trade_in', 'finance'], caps_at: 'low' },
    { id: 'returning_customer', type: 'sender_has_prior_threads', caps_at: 'medium' },
    { id: 'tool_error', type: 'tool_failed', caps_at: 'medium' },
  ],
  criteria: [
    { id: 'grounded', description: 'Every fact comes from the stock feed, FAQ or Knowledge.', caps_at: 'low' },
    { id: 'no_deferral', description: 'The reply does not defer any part to the dealer.', caps_at: 'medium', reason: 'Bob deferred part of the answer.' },
  ],
};

function makeAgent(overrides = {}) {
  return {
    _id: 'agent1',
    project: 'proj1',
    system_prompt: 'You are Bob from the dealership.',
    api_key: { getDecryptedKey: () => 'key', provider: { name: 'openai' } },
    config: {},
    ...overrides,
  };
}

function makeCtx({ gate = DEALER_GATE, triage, agent, reasoning } = {}) {
  return {
    account: { _id: 'acc1', answer_gate: gate },
    agent: agent || makeAgent(),
    conversation: {
      _id: 'conv1',
      messages: [{ role: 'user', content: 'Is the 2021 Golf still available?' }],
      getDecryptedMessages() { return this.messages; },
    },
    email: { from_address: 'alice@customer.com', attachments: [] },
    triage: triage || { topic: 'stock', intent: 'question', confidence: 0.9 },
    customerAddress: 'alice@customer.com',
    reasoning,
  };
}

function fakeJudge(criteria) {
  const llm = {
    supportsStructuredOutputs: () => true,
    generateCompletion: jest.fn(async () => ({ content: JSON.stringify({ criteria }), usage })),
  };
  OpenAIService.mockImplementation(() => llm);
  return llm;
}

const goodReply = {
  content: 'Hi Alice, yes, the 2021 Golf is still available for €18,900.',
  tools_used: [{ tool_name: 'stock_feed', success: true, result: { model: 'Golf', price: 18900 } }],
  thinking_process: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  Conversation.countDocuments.mockResolvedValue(0);
  OutboundEmail.distinct.mockResolvedValue([]);
});

describe('evaluateInbound', () => {
  test('a restricted topic is low and skips before reasoning', async () => {
    const gate = await gateService.evaluateInbound(
      makeCtx({ triage: { topic: 'trade_in', intent: 'question', confidence: 0.95 } })
    );

    expect(gate.level).toBe('low');
    expect(gate.action).toBe('skip');
    expect(gate.skip_early).toBe(true);
    expect(gate.reasons).toEqual(['Topic "trade_in" needs a human.']);
  });

  test('unclear intent (low triage confidence) is low', async () => {
    const gate = await gateService.evaluateInbound(
      makeCtx({ triage: { topic: 'stock', intent: 'question', confidence: 0.4 } })
    );
    expect(gate.level).toBe('low');
  });

  test('a returning customer caps at medium', async () => {
    Conversation.countDocuments.mockResolvedValue(2);
    const gate = await gateService.evaluateInbound(makeCtx());

    expect(gate.level).toBe('medium');
    expect(gate.reasons).toEqual(['Returning customer with 2 earlier thread(s).']);
    // medium and low both skip for this dealer, so reasoning can be skipped.
    expect(gate.skip_early).toBe(true);
  });

  test('does not skip early when a lower level would still draft', async () => {
    Conversation.countDocuments.mockResolvedValue(1);
    const gate = await gateService.evaluateInbound(makeCtx({
      gate: { ...DEALER_GATE, actions: { high: 'reply', medium: 'skip', low: 'draft_flagged' } },
    }));
    expect(gate.level).toBe('medium');
    expect(gate.skip_early).toBe(false);
  });

  test('finds returning lead customers through earlier replies', async () => {
    OutboundEmail.distinct.mockResolvedValue(['convA']);
    const ctx = makeCtx();
    ctx.email.from_address = 'noreply@leads.example';
    ctx.customerAddress = 'bob@buyer.com';

    const gate = await gateService.evaluateInbound(ctx);

    expect(OutboundEmail.distinct).toHaveBeenCalledWith('conversation', expect.objectContaining({ to: 'bob@buyer.com' }));
    expect(gate.level).toBe('medium');
  });

  test('ignores the triage confidence signal when triage is disabled', async () => {
    const gate = await gateService.evaluateInbound(makeCtx({ triage: { in_scope: true, decision: 'triage_disabled' } }));
    expect(gate.level).toBe('high');
    expect(gate.skip_early).toBe(false);
  });
});

describe('evaluateReply with the LLM judge', () => {
  test('all checks pass → high, reply', async () => {
    const llm = fakeJudge([
      { id: 'grounded', passed: true, reason: 'Price matches the stock feed.' },
      { id: 'no_deferral', passed: true, reason: 'No deferral.' },
    ]);
    const ctx = makeCtx({ reasoning: goodReply });
    const inbound = await gateService.evaluateInbound(ctx);
    const gate = await gateService.evaluateReply(ctx, inbound);

    expect(gate.level).toBe('high');
    expect(gate.action).toBe('reply');
    expect(gate.judge).toEqual({ provider: 'llm', model: 'gpt-5.4-nano', fallback: false });
    expect(gate.usage).toBe(usage);

    const [model, prompt] = llm.generateCompletion.mock.calls[0];
    expect(model).toBe('gpt-5.4-nano');
    expect(prompt).toContain('- grounded: Every fact comes from the stock feed');
    expect(prompt).toContain('"tool":"stock_feed"');
    expect(prompt).toContain(goodReply.content);
  });

  test('uses the configured model and API key', async () => {
    const llm = fakeJudge([
      { id: 'grounded', passed: true, reason: '' },
      { id: 'no_deferral', passed: true, reason: '' },
    ]);
    ApiKey.findOne.mockReturnValue({
      populate: async () => ({ getDecryptedKey: () => 'other-key', provider: { name: 'openai' } }),
    });
    const ctx = makeCtx({ gate: { ...DEALER_GATE, model: 'gpt-5.4-mini', api_key: 'key2' }, reasoning: goodReply });

    await gateService.evaluateReply(ctx, null);

    expect(ApiKey.findOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'key2', project: 'proj1' }));
    expect(OpenAIService).toHaveBeenCalledWith('other-key', 'openai');
    expect(llm.generateCompletion.mock.calls[0][0]).toBe('gpt-5.4-mini');
  });

  test('a deferral caps at medium and uses the configured reason', async () => {
    fakeJudge([
      { id: 'grounded', passed: true, reason: 'ok' },
      { id: 'no_deferral', passed: false, reason: 'Says the dealer will confirm the price.' },
    ]);
    const gate = await gateService.evaluateReply(makeCtx({ reasoning: goodReply }), null);

    expect(gate.level).toBe('medium');
    expect(gate.action).toBe('skip');
    expect(gate.reasons).toEqual(['Bob deferred part of the answer.']);
    expect(gate.checks.find(c => c.id === 'no_deferral').judge_reason).toBe('Says the dealer will confirm the price.');
  });

  test('a criterion the judge left out counts as failed', async () => {
    fakeJudge([{ id: 'no_deferral', passed: true, reason: 'ok' }]);
    const gate = await gateService.evaluateReply(makeCtx({ reasoning: goodReply }), null);

    expect(gate.level).toBe('low');
    expect(gate.reasons).toEqual(['Not assessed by the judge.']);
  });

  test('a judge error fails closed', async () => {
    OpenAIService.mockImplementation(() => ({
      supportsStructuredOutputs: () => true,
      generateCompletion: jest.fn(async () => { throw new Error('rate limited'); }),
    }));
    const gate = await gateService.evaluateReply(makeCtx({ reasoning: goodReply }), null);

    expect(gate.level).toBe('low');
    expect(gate.checks.filter(c => !c.passed)).toEqual([expect.objectContaining({ id: 'judge_error', caps_at: 'low' })]);
  });

  test('keeps inbound checks and adds reply signals', async () => {
    Conversation.countDocuments.mockResolvedValue(1);
    fakeJudge([
      { id: 'grounded', passed: true, reason: 'ok' },
      { id: 'no_deferral', passed: true, reason: 'ok' },
    ]);
    const ctx = makeCtx({
      reasoning: { ...goodReply, tools_used: [{ tool_name: 'stock_feed', success: false, error: 'timeout' }] },
    });
    const inbound = await gateService.evaluateInbound(ctx);
    const gate = await gateService.evaluateReply(ctx, inbound);

    expect(gate.level).toBe('medium');
    expect(gate.checks.filter(c => !c.passed).map(c => c.id)).toEqual(['returning_customer', 'tool_error']);
  });
});

describe('evaluateReply with Jev', () => {
  const jevGate = { ...DEALER_GATE, provider: 'jev', model: 'jev-2' };
  const jevAgent = () => makeAgent({ config: { jev: { api_key: 'jevkey', model: 'jev-latest' } } });

  test('scores each criterion as a noul question with the configured model', async () => {
    jevService.ask.mockResolvedValue({
      answers: { grounded: { noul: 0.97 }, no_deferral: { noul: 0.4 } },
      model: 'jev-2',
      usage,
    });
    const gate = await gateService.evaluateReply(makeCtx({ gate: jevGate, agent: jevAgent(), reasoning: goodReply }), null);

    const [, state, questions, label, options] = jevService.ask.mock.calls[0];
    expect(Object.keys(questions)).toEqual(['grounded', 'no_deferral']);
    expect(questions.grounded.type).toBe('noul');
    expect(state.draft_reply).toBe(goodReply.content);
    expect(label).toBe('email_answer_gate');
    expect(options).toEqual({ model: 'jev-2' });

    expect(gate.level).toBe('medium');
    expect(gate.judge).toEqual({ provider: 'jev', model: 'jev-2', fallback: false });
    expect(gate.checks.find(c => c.id === 'grounded').score).toBe(0.97);
    expect(OpenAIService).not.toHaveBeenCalled();
  });

  test('uses min_confidence as the pass threshold', async () => {
    jevService.ask.mockResolvedValue({
      answers: { grounded: { noul: 0.7 }, no_deferral: { noul: 0.7 } },
      model: 'jev-2',
      usage,
    });
    const gate = await gateService.evaluateReply(
      makeCtx({ gate: { ...jevGate, min_confidence: 0.6 }, agent: jevAgent(), reasoning: goodReply }),
      null
    );
    expect(gate.level).toBe('high');
  });

  test('falls back to the LLM judge with its default model when Jev fails', async () => {
    jevService.ask.mockResolvedValue(null);
    const llm = fakeJudge([
      { id: 'grounded', passed: true, reason: 'ok' },
      { id: 'no_deferral', passed: true, reason: 'ok' },
    ]);
    const gate = await gateService.evaluateReply(makeCtx({ gate: jevGate, agent: jevAgent(), reasoning: goodReply }), null);

    // `model` names a Jev model here, so the LLM fallback must not use it.
    expect(llm.generateCompletion.mock.calls[0][0]).toBe('gpt-5.4-nano');
    expect(gate.judge).toEqual({ provider: 'llm', model: 'gpt-5.4-nano', fallback: true });
    expect(gate.level).toBe('high');
  });

  test('uses the LLM judge when the agent has no Jev key', async () => {
    fakeJudge([
      { id: 'grounded', passed: true, reason: 'ok' },
      { id: 'no_deferral', passed: true, reason: 'ok' },
    ]);
    const gate = await gateService.evaluateReply(makeCtx({ gate: jevGate, reasoning: goodReply }), null);

    expect(jevService.ask).not.toHaveBeenCalled();
    expect(gate.judge.fallback).toBe(true);
  });
});

describe('applyToDecision', () => {
  const gate = (level, action) => ({ level, action, reasons: ['why'] });

  test('reply keeps the reply_policy decision', () => {
    const decision = gateService.applyToDecision({ action: 'auto_send', reason: 'auto_send' }, gate('high', 'reply'));
    expect(decision).toMatchObject({ action: 'auto_send', reason: 'auto_send', answer_gate_level: 'high' });
  });

  test('draft downgrades auto_send', () => {
    const decision = gateService.applyToDecision({ action: 'auto_send', reason: 'auto_send' }, gate('medium', 'draft'));
    expect(decision).toMatchObject({ action: 'draft_only', reason: 'answer_gate' });
  });

  test('draft_flagged routes to human review but keeps an escalation reason', () => {
    expect(gateService.applyToDecision({ action: 'draft_only', reason: 'draft_only' }, gate('medium', 'draft_flagged')))
      .toMatchObject({ action: 'human_review', reason: 'answer_gate' });
    expect(gateService.applyToDecision({ action: 'human_review', reason: 'escalated', notes: 'intent=billing' }, gate('medium', 'draft_flagged')))
      .toMatchObject({ action: 'human_review', reason: 'escalated', notes: 'intent=billing; answer_gate=medium: why' });
  });
});
