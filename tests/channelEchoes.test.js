'use strict';

process.env.CHANNEL_ECHO_MATCH_GRACE_MS = '1';

jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
}));
jest.mock('../src/models/Conversation', () => ({ exists: jest.fn(), findById: jest.fn() }));
jest.mock('../src/models/ChannelOutboundMessage', () => ({ exists: jest.fn(), insertMany: jest.fn() }));
jest.mock('../src/models/ChannelConfig', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/Agent', () => ({ findById: jest.fn() }));
jest.mock('../src/services/agentService', () => ({ executeChatbotAgent: jest.fn() }));
jest.mock('../src/services/mediaStorageService', () => ({ processAndStore: jest.fn() }));
jest.mock('../src/services/attachmentProcessingService', () => ({ interpretChannelMedia: jest.fn() }));
jest.mock('../src/services/channelTurnBufferService', () => ({ bufferTurn: jest.fn() }));
jest.mock('../src/services/messageTransformerService', () => ({ process: jest.fn() }));

const Agent = require('../src/models/Agent');
const Conversation = require('../src/models/Conversation');
const ChannelOutboundMessage = require('../src/models/ChannelOutboundMessage');
const agentService = require('../src/services/agentService');
const channelTurnBufferService = require('../src/services/channelTurnBufferService');
const InstagramService = require('../src/services/channels/instagramService');
const orchestrator = require('../src/services/channelOrchestrator');

const AGENT_ID = 'agent-1';

const echoWebhook = (mid, text = 'Hi from the app') => ({
  entry: [{
    messaging: [{
      sender: { id: 'BUSINESS' },
      recipient: { id: 'USER' },
      timestamp: 1760000000000,
      message: { mid, text, is_echo: true },
    }],
  }],
});

describe('instagram echoes', () => {
  const service = new InstagramService({ instagram: { enabled: true, credentials: { page_id: 'BUSINESS' } } });
  let conversation;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    orchestrator.initialized.add(AGENT_ID);
    orchestrator.channelServices.set(`${AGENT_ID}_instagram`, service);
    conversation = { _id: 'conv-1', addMessage: jest.fn().mockResolvedValue() };
    jest.spyOn(orchestrator, 'getOrCreateConversation').mockResolvedValue(conversation);
    Conversation.exists.mockResolvedValue(null);
    ChannelOutboundMessage.exists.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('normalizes an echo onto the recipient\'s conversation', async () => {
    const result = await service.handleIncomingMessage(echoWebhook('m_ECHO'));
    expect(result).toMatchObject({
      type: 'echo',
      channel: 'instagram',
      user_identifier: 'USER',
      account_id: 'BUSINESS',
      content: 'Hi from the app',
      message_id: 'm_ECHO',
    });
  });

  test('ignores echoes of messages Crafter sent', async () => {
    ChannelOutboundMessage.exists.mockResolvedValue({ _id: 'instagram:m_OURS' });

    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'instagram', echoWebhook('m_OURS'));

    expect(result).toMatchObject({ status: 'ignored', reason: 'own_echo' });
    expect(ChannelOutboundMessage.exists).toHaveBeenCalledWith({ _id: 'instagram:m_OURS' });
    expect(conversation.addMessage).not.toHaveBeenCalled();
  });

  test('ignores redelivered echoes already on a conversation', async () => {
    Conversation.exists.mockResolvedValue({ _id: 'conv-1' });

    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'instagram', echoWebhook('m_STORED'));

    expect(result).toMatchObject({ status: 'ignored', reason: 'own_echo' });
    expect(conversation.addMessage).not.toHaveBeenCalled();
  });

  test('records a message sent from the Instagram app without running the agent', async () => {
    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'instagram', echoWebhook('m_APP'));

    expect(result).toEqual({ success: true, status: 'echo_recorded', conversation_id: 'conv-1' });
    expect(orchestrator.getOrCreateConversation).toHaveBeenCalledWith(AGENT_ID, 'USER', 'instagram', null, service);
    expect(conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'human_operator',
      content: 'Hi from the app',
      handler_info: {
        channel_app_operator: {
          channel: 'instagram',
          account_id: 'BUSINESS',
          timestamp: new Date(1760000000000),
        },
      },
      channel_info: { channel: 'instagram', message_id: 'm_APP', media: undefined },
    }));
    expect(agentService.executeChatbotAgent).not.toHaveBeenCalled();
    expect(channelTurnBufferService.bufferTurn).not.toHaveBeenCalled();
  });

  test('records the IDs of everything sent on instagram', async () => {
    Agent.findById.mockReturnValue({ select: () => ({ lean: async () => ({}) }) });
    Conversation.findById.mockReturnValue({ select: () => ({ lean: async () => ({}) }) });
    const channelService = { sendMessage: jest.fn().mockResolvedValue({ message_id: 'm_SENT' }) };

    const sentId = await orchestrator.sendResponse(
      AGENT_ID, channelService, 'USER', { response: 'Hello' }, 'instagram', { instagram: { sender_id: 'USER' } }
    );

    expect(sentId).toBe('m_SENT');
    expect(ChannelOutboundMessage.insertMany).toHaveBeenCalledWith([{ _id: 'instagram:m_SENT' }], { ordered: false });
  });
});
