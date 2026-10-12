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
}));
jest.mock('../src/services/openaiService');

const OpenAIService = require('../src/services/openaiService');
const toolService = require('../src/services/toolService');
const agentService = require('../src/services/agentService');
const emailAgentService = require('../src/services/email/emailAgentService');
const { getActiveGuidance, formatHistoryLines } = require('../src/utils/operatorGuidance');

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cached_tokens: 0, cost: 0.001 };

/** Fake OpenAIService whose streaming completions return the scripted replies in order. */
function fakeStreamingLLM(replies) {
  const llm = {
    supportsStructuredOutputs: () => true,
    generateStreamingCompletion: jest.fn(async (model, prompt, params, system, onChunk) => {
      const text = replies.shift();
      // Emit in small pieces like a real stream.
      for (let i = 0; i < text.length; i += 7) onChunk(text.slice(i, i + 7));
      return { content: text, usage };
    }),
  };
  OpenAIService.mockImplementation(() => llm);
  return llm;
}

function makeAgent() {
  return {
    _id: 'agent1',
    system_prompt: 'You are Bob from Acme.',
    api_key: { getDecryptedKey: () => 'key', provider: { name: 'openai' } },
    llm_settings: { model: 'gpt-4.1', parameters: {} },
    config: { max_tool_calls: 5 },
    tools: [{ name: 'api_caller', description: 'Call APIs' }],
  };
}

function makeConversation(messages) {
  return {
    _id: 'conv1',
    messages,
    metadata: {},
    current_turn_language: null,
    getContextForAgent: (max, { beforeIndex } = {}) =>
      Number.isInteger(beforeIndex) ? messages.slice(0, beforeIndex) : messages,
    getDecryptedMessages: () => messages.map(m => ({ ...m })),
  };
}

describe('buildComposeDirective', () => {
  test('numbers the staff instructions and asks for a new message', () => {
    const directive = agentService.buildComposeDirective({
      instructions: ['Tell her the refund was processed', 'Keep it short'],
      previousDraft: null,
    });

    expect(directive).toContain('<staff_instructions>\n1. Tell her the refund was processed\n2. Keep it short\n</staff_instructions>');
    expect(directive).toContain('respond right away');
    expect(directive).toContain('Do not request a human handoff');
    expect(directive).toContain('Write the message from scratch.');
    expect(directive).not.toContain('<previous_draft>');
  });

  test('includes the previous draft when revising', () => {
    const directive = agentService.buildComposeDirective({
      instructions: ['Mention the invoice'],
      previousDraft: 'Hi Alice, your refund is done.',
    });

    expect(directive).toContain('<previous_draft>\nHi Alice, your refund is done.\n</previous_draft>');
    expect(directive).toContain('Revise the previous draft');
    expect(directive).not.toContain('from scratch');
  });
});

describe('getActiveGuidance with composed messages', () => {
  test('starts with the compose instructions', () => {
    const message = { metadata: { compose: { instructions: 'Follow up on the demo' } } };
    expect(getActiveGuidance(message)).toEqual(['Follow up on the demo']);
  });

  test('keeps the compose instructions across a fresh regeneration', () => {
    const message = {
      metadata: {
        compose: { instructions: 'Follow up on the demo' },
        revisions: [
          { mode: 'revise', guidance: 'Be warmer' },
          { mode: 'fresh', guidance: 'Offer Tuesday' },
        ],
      },
    };
    expect(getActiveGuidance(message)).toEqual(['Follow up on the demo', 'Offer Tuesday']);
  });

  test('is unchanged for ordinary replies', () => {
    const message = { metadata: { revisions: [{ mode: 'revise', guidance: 'Be warmer' }] } };
    expect(getActiveGuidance(message)).toEqual(['Be warmer']);
    expect(getActiveGuidance({ metadata: {} })).toEqual([]);
  });

  test('labels the composed message as staff guidance in history', () => {
    const text = formatHistoryLines([
      { role: 'user', content: 'Thanks!' },
      { role: 'assistant', content: 'Hi Alice', metadata: { compose: { instructions: 'Say hi' } } },
    ]);
    expect(text).toContain('operator_guidance');
    expect(text).toContain('"Say hi"');
  });
});

describe('composeAssistantMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  test('streams only the email body and passes the compose directive to the loop', async () => {
    const body = 'Hi Alice,\nyour refund has been processed.';
    const llm = fakeStreamingLLM([
      JSON.stringify({ action: 'respond', reasoning: 'Instructions are enough.', response: body }),
    ]);
    const chunks = [];

    const result = await agentService.composeAssistantMessage(
      makeAgent(),
      makeConversation([{ role: 'user', content: 'Where is my refund?' }]),
      {
        instructions: ['Tell her the refund was processed'],
        streamCallback: chunk => chunks.push(chunk),
      }
    );

    expect(result.content).toBe(body);
    expect(chunks.join('')).toBe(body);
    expect(llm.generateStreamingCompletion).toHaveBeenCalledTimes(1);
    const prompt = llm.generateStreamingCompletion.mock.calls[0][1];
    expect(prompt).toContain('## Staff-Requested Message');
    expect(prompt).toContain('1. Tell her the refund was processed');
    expect(toolService.executeToolWithConfig).not.toHaveBeenCalled();
  });

  test('reports a status before running a tool, then streams the reply', async () => {
    toolService.executeToolWithConfig.mockResolvedValue({ success: true, result: { status: 'refunded' } });
    fakeStreamingLLM([
      JSON.stringify({ action: 'use_tool', reasoning: 'Need status.', tool_name: 'api_caller', tool_parameters: {} }),
      JSON.stringify({ action: 'respond', reasoning: 'Done.', response: 'Your refund is complete.' }),
    ]);
    const chunks = [];
    const statuses = [];

    const result = await agentService.composeAssistantMessage(
      makeAgent(),
      makeConversation([{ role: 'user', content: 'Where is my refund?' }]),
      {
        instructions: ['Give her the refund status'],
        streamCallback: chunk => chunks.push(chunk),
        statusCallback: status => statuses.push(status),
      }
    );

    expect(statuses).toEqual([{ stage: 'looking_up_data' }]);
    expect(chunks.join('')).toBe('Your refund is complete.');
    expect(result.tools_used).toHaveLength(1);
  });

  test('hides the message being revised and everything after it', async () => {
    const llm = fakeStreamingLLM([
      JSON.stringify({ action: 'respond', reasoning: 'ok', response: 'New version' }),
    ]);

    await agentService.composeAssistantMessage(
      makeAgent(),
      makeConversation([
        { role: 'user', content: 'Where is my refund?' },
        { role: 'assistant', content: 'OLD DRAFT TEXT' },
      ]),
      { instructions: ['x'], historyCutoffIndex: 1, streamCallback: () => {} }
    );

    const prompt = llm.generateStreamingCompletion.mock.calls[0][1];
    expect(prompt).toContain('Where is my refund?');
    expect(prompt).not.toContain('OLD DRAFT TEXT');
  });

  test('uses the non-streaming loop without a stream callback', async () => {
    const spy = jest
      .spyOn(agentService, 'executeAgentReasoning')
      .mockResolvedValue({ content: 'Hi', thinking_process: [], tools_used: [], token_usage: usage });
    const conversation = makeConversation([]);

    await agentService.composeAssistantMessage(makeAgent(), conversation, { instructions: ['Say hi'] });

    expect(spy).toHaveBeenCalledTimes(1);
    const contextOptions = spy.mock.calls[0][4];
    expect(contextOptions.regenerationDirective).toContain('1. Say hi');
    spy.mockRestore();
  });
});

describe('buildThreadOutboundFields', () => {
  const conversation = {
    user_identifier: 'fallback@example.com',
    channel_metadata: {
      email: {
        from_email: 'alice@example.com',
        subject: 'Refund',
        message_id: '<root@example.com>',
        provider_thread_id: 'thread-1',
        provider_message_id: 'msg-1',
      },
    },
    getDecryptedMessages: () => [
      {
        role: 'user',
        content: 'Where is my refund?',
        timestamp: new Date('2026-10-01T10:00:00Z'),
        channel_info: {
          channel: 'email',
          email: { message_id: '<root@example.com>', from_email: 'alice@example.com', from_name: 'Alice' },
        },
      },
    ],
  };

  test('replies to the thread starter under Re: by default', () => {
    const fields = emailAgentService.buildThreadOutboundFields({ conversation });

    expect(fields.to).toEqual(['alice@example.com']);
    expect(fields.subject).toBe('Re: Refund');
    expect(fields.inReplyTo).toBe('<root@example.com>');
    expect(fields.references).toEqual(['<root@example.com>']);
    expect(fields.replyContext).toMatchObject({ text: 'Where is my refund?', from_name: 'Alice' });
    expect(fields.providerThreadId).toBe('thread-1');
    expect(fields.providerParentMessageId).toBe('msg-1');
  });

  test('honours recipient and subject overrides', () => {
    const fields = emailAgentService.buildThreadOutboundFields({
      conversation,
      to: ['bob@example.com'],
      subject: 'Your refund',
    });

    expect(fields.to).toEqual(['bob@example.com']);
    expect(fields.subject).toBe('Your refund');
  });
});

describe('_assertAgentWroteDraft', () => {
  test('rejects a handoff and an empty reply', () => {
    expect(() => emailAgentService._assertAgentWroteDraft({
      content: 'Let me connect you',
      thinking_process: [{ step: 'human_handoff_requested' }],
    })).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => emailAgentService._assertAgentWroteDraft({ content: '', thinking_process: [] }))
      .toThrow(expect.objectContaining({ status: 502 }));
    expect(() => emailAgentService._assertAgentWroteDraft({ content: 'Hi', thinking_process: [] }))
      .not.toThrow();
  });
});
