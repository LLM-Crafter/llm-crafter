'use strict';

jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
  encrypt: value => value,
}));
jest.mock('../src/services/openaiService');

const MailAccount = require('../src/models/MailAccount');
const Agent = require('../src/models/Agent');
const Conversation = require('../src/models/Conversation');
const agentService = require('../src/services/agentService');
const attachmentProcessingService = require('../src/services/attachmentProcessingService');
const emailTriageService = require('../src/services/email/emailTriageService');
const emailRecipientResolverService = require('../src/services/email/emailRecipientResolverService');
const gateService = require('../src/services/email/emailAnswerGateService');
const draftService = require('../src/services/email/draftService');
const hookService = require('../src/services/hookService');
const emailAgentService = require('../src/services/email/emailAgentService');

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cached_tokens: 0, cost: 0.001 };

function makeConversation() {
  const conversation = {
    _id: 'conv1',
    messages: [],
    metadata: { total_cost: 0, total_tokens_used: 0 },
    channel_metadata: { email: {} },
    addMessage: jest.fn(async msg => { conversation.messages.push(msg); }),
    getDecryptedMessages: () => conversation.messages,
    save: jest.fn(),
  };
  return conversation;
}

function gateResult(level, action, extra = {}) {
  return { level, action, enforced: true, checks: [], reasons: [`${level} because`], usage, ...extra };
}

let conversation;

beforeEach(() => {
  jest.restoreAllMocks();
  conversation = makeConversation();

  jest.spyOn(MailAccount, 'findById').mockResolvedValue({
    _id: 'acc1',
    is_active: true,
    is_paused: false,
    send_profile: { from_email: 'sales@dealer.com' },
    reply_policy: { mode: 'draft_only' },
    answer_gate: { enabled: true },
  });
  jest.spyOn(Agent, 'findById').mockReturnValue({
    populate: async () => ({
      _id: 'agent1',
      config: { enforce_language_detection: false },
      api_key: { getDecryptedKey: () => 'key', provider: { name: 'openai' } },
    }),
  });
  jest.spyOn(emailTriageService, 'classify').mockResolvedValue({
    in_scope: true, topic: 'stock', intent: 'question', confidence: 0.9, usage,
  });
  jest.spyOn(emailRecipientResolverService, 'resolve').mockResolvedValue(null);
  jest.spyOn(attachmentProcessingService, 'storeAndInterpret').mockResolvedValue([]);
  jest.spyOn(emailAgentService, '_resolveConversation').mockResolvedValue(conversation);
  jest.spyOn(Conversation, 'updateOne').mockResolvedValue({});
  jest.spyOn(emailAgentService, '_markProcessed').mockResolvedValue();
  jest.spyOn(emailAgentService, '_isThreadRateLimited').mockResolvedValue(false);
  jest.spyOn(emailAgentService, '_createOutbound').mockImplementation(async ({ decision }) => ({
    _id: 'out1', state: 'drafted', reason: decision.reason,
  }));
  jest.spyOn(draftService, 'create').mockResolvedValue();
  jest.spyOn(hookService, 'executeHooks').mockResolvedValue();
  jest.spyOn(agentService, 'executeAgentReasoning').mockResolvedValue({
    content: 'Hi Alice, the Golf is available.', tools_used: [], thinking_process: [], token_usage: usage,
  });
});

const run = () => emailAgentService.processIncomingEmail({
  mailAccountId: 'acc1',
  processedEmail: { _id: 'pe1' },
  email: {
    message_id: '<m1@customer.com>',
    from_address: 'alice@customer.com',
    reply_to: 'alice@customer.com',
    subject: 'Golf',
    body_text: 'Is the Golf still available?',
  },
});

test('skips reasoning entirely when the inbound phase settles on skip', async () => {
  jest.spyOn(gateService, 'evaluateInbound').mockResolvedValue(gateResult('low', 'skip', { skip_early: true }));
  const evaluateReply = jest.spyOn(gateService, 'evaluateReply');

  const result = await run();

  expect(result.status).toBe('skipped_answer_gate');
  expect(agentService.executeAgentReasoning).not.toHaveBeenCalled();
  expect(evaluateReply).not.toHaveBeenCalled();
  expect(emailAgentService._createOutbound).not.toHaveBeenCalled();
  expect(emailAgentService._markProcessed).toHaveBeenCalledWith({ _id: 'pe1' }, 'skipped_answer_gate', { conversation_id: 'conv1' });

  const note = conversation.messages.at(-1);
  expect(note).toMatchObject({ role: 'system', code: 'ANSWER_GATE_SKIPPED' });
  expect(note.content).toBe('No reply was drafted: answer confidence is low. low because');
});

test('a reply-phase skip stores no assistant message and no outbound', async () => {
  jest.spyOn(gateService, 'evaluateInbound').mockResolvedValue(gateResult('high', 'reply', { skip_early: false }));
  jest.spyOn(gateService, 'evaluateReply').mockResolvedValue(gateResult('medium', 'skip'));

  const result = await run();

  expect(result.status).toBe('skipped_answer_gate');
  expect(agentService.executeAgentReasoning).toHaveBeenCalled();
  expect(emailAgentService._createOutbound).not.toHaveBeenCalled();
  expect(conversation.messages.map(m => m.role)).toEqual(['user', 'system']);
  expect(conversation.messages[1].metadata.answer_gate.discarded_reply).toBe('Hi Alice, the Golf is available.');
  // Reasoning and judge usage still count towards the conversation's cost.
  expect(conversation.metadata.total_tokens_used).toBe(45);
});

test('draft_flagged creates a human_review draft carrying the gate result', async () => {
  const gate = gateResult('medium', 'draft_flagged');
  jest.spyOn(gateService, 'evaluateInbound').mockResolvedValue(gateResult('high', 'reply', { skip_early: false }));
  jest.spyOn(gateService, 'evaluateReply').mockResolvedValue(gate);

  const result = await run();

  expect(result.status).toBe('processed');
  const args = emailAgentService._createOutbound.mock.calls[0][0];
  expect(args.decision).toMatchObject({ action: 'human_review', reason: 'answer_gate', answer_gate_level: 'medium' });
  expect(args.answerGate).toBe(gate);
});

test('shadow mode records the gate but keeps the normal outcome', async () => {
  jest.spyOn(gateService, 'evaluateInbound').mockResolvedValue(gateResult('low', 'skip', { skip_early: true, enforced: false }));
  jest.spyOn(gateService, 'evaluateReply').mockResolvedValue(gateResult('low', 'skip', { enforced: false }));

  const result = await run();

  expect(result.status).toBe('processed');
  const args = emailAgentService._createOutbound.mock.calls[0][0];
  expect(args.decision).toMatchObject({ action: 'draft_only', reason: 'draft_only' });
  expect(args.answerGate.level).toBe('low');
});

test('does nothing when the gate is disabled', async () => {
  MailAccount.findById.mockResolvedValue({
    _id: 'acc1', is_active: true, is_paused: false,
    send_profile: {}, reply_policy: { mode: 'draft_only' }, answer_gate: { enabled: false },
  });
  const evaluateInbound = jest.spyOn(gateService, 'evaluateInbound');

  const result = await run();

  expect(result.status).toBe('processed');
  expect(evaluateInbound).not.toHaveBeenCalled();
  expect(emailAgentService._createOutbound.mock.calls[0][0].answerGate).toBeNull();
});
