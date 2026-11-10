'use strict';

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
  encrypt: value => `enc:${value}`,
}));
jest.mock('../src/models/Conversation', () => ({
  exists: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../src/models/ChannelOutboundMessage', () => ({ exists: jest.fn(), insertMany: jest.fn() }));
jest.mock('../src/models/ChannelConfig', () => ({ find: jest.fn(), findOne: jest.fn(), updateMany: jest.fn() }));
jest.mock('../src/models/Agent', () => ({ find: jest.fn(), findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/services/agentService', () => ({ executeChatbotAgent: jest.fn() }));
jest.mock('../src/services/hookService', () => ({
  executeHooks: jest.fn(),
  scheduleInactivityHooks: jest.fn(),
}));
jest.mock('../src/services/mediaStorageService', () => ({ processAndStore: jest.fn() }));
jest.mock('../src/services/attachmentProcessingService', () => ({ interpretChannelMedia: jest.fn() }));
jest.mock('../src/services/channelTurnBufferService', () => ({
  bufferTurn: jest.fn(),
  hasNewerTurn: jest.fn(),
}));
jest.mock('../src/services/messageTransformerService', () => ({ process: jest.fn() }));

const axios = require('axios');
const Agent = require('../src/models/Agent');
const ChannelConfig = require('../src/models/ChannelConfig');
const Conversation = require('../src/models/Conversation');
const ChannelOutboundMessage = require('../src/models/ChannelOutboundMessage');
const agentService = require('../src/services/agentService');
const hookService = require('../src/services/hookService');
const channelTurnBufferService = require('../src/services/channelTurnBufferService');
const WhatsAppService = require('../src/services/channels/whatsappService');
const orchestrator = require('../src/services/channelOrchestrator');
const channelController = require('../src/controllers/channelController');
const handoffController = require('../src/controllers/handoffController');
const {
  normalizePhone,
  parseIgnoredContacts,
  mergeWelcomeMessage,
  isIgnoredContact,
  WhatsAppSettingsError,
} = require('../src/utils/whatsappContactSettings');

const AGENT_ID = 'agent-1';
const PHONE_NUMBER_ID = '106540352242922';
const USER = '351912345678';
const IMAGE_URL = 'https://cdn.example.com/welcome.jpg';

const metadata = { display_phone_number: '15550783881', phone_number_id: PHONE_NUMBER_ID };
const inboundWebhook = (from = USER, body = 'Hello') => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata,
        contacts: [{ wa_id: from, profile: { name: 'Ana' } }],
        messages: [{ from, id: 'wamid.IN', timestamp: '1700255121', type: 'text', text: { body } }],
      },
    }],
  }],
});

const makeService = (whatsapp = {}) =>
  new WhatsAppService({
    whatsapp: {
      enabled: true,
      provider: 'meta',
      credentials: { phone_number_id: PHONE_NUMBER_ID, access_token: 'token' },
      ...whatsapp,
    },
  });

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const agentDoc = { _id: AGENT_ID, hooks: [{ name: 'quelp_message_human_controlled', enabled: true }] };

let conversation;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(orchestrator, 'initializeChannelsForAgent').mockResolvedValue({ enabled: ['whatsapp'] });
  conversation = {
    _id: 'conv-1',
    agent: AGENT_ID,
    user_identifier: USER,
    status: 'agent_controlled',
    current_handler: 'agent',
    ai_disabled_reason: null,
    welcome_message_sent_at: null,
    handoff_info: {},
    messages: [],
    addMessage: jest.fn().mockResolvedValue(),
  };
  jest.spyOn(orchestrator, 'getOrCreateConversation').mockResolvedValue(conversation);
  Conversation.exists.mockResolvedValue(null);
  Conversation.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  ChannelOutboundMessage.insertMany.mockResolvedValue([]);
  Agent.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(agentDoc) });
  hookService.executeHooks.mockResolvedValue();
  channelTurnBufferService.hasNewerTurn.mockResolvedValue(false);
});

afterEach(() => {
  orchestrator.channelServices.clear();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('settings validation', () => {
  test('normalizePhone ignores +, spaces and leading zeros', () => {
    expect(normalizePhone('+351 912 345 678')).toBe(USER);
    expect(normalizePhone('00351912345678')).toBe(USER);
    expect(normalizePhone(USER)).toBe(USER);
  });

  test('ignored contacts are normalized, deduplicated and capped at 500', () => {
    expect(
      parseIgnoredContacts([
        { phone_e164: '+351 912 345 678', note: ' Supplier ' },
        { phone_e164: '00351912345678', note: 'duplicate' },
        { phone_e164: '+14155550100' },
      ])
    ).toEqual([
      { phone_e164: `+${USER}`, note: 'Supplier' },
      { phone_e164: '+14155550100' },
    ]);
    expect(parseIgnoredContacts([])).toEqual([]);

    const tooMany = Array.from({ length: 501 }, (_, i) => ({ phone_e164: `+3519100${String(i).padStart(5, '0')}` }));
    expect(() => parseIgnoredContacts(tooMany)).toThrow(WhatsAppSettingsError);
    expect(() => parseIgnoredContacts([{ phone_e164: '123' }])).toThrow('not a valid E.164 number');
    expect(() => parseIgnoredContacts([{ note: 'no number' }])).toThrow('phone_e164 is required');
  });

  test('isIgnoredContact matches the sender wa_id against the list', () => {
    const config = { ignored_contacts: [{ phone_e164: `+${USER}` }] };
    expect(isIgnoredContact(config, USER)).toBe(true);
    expect(isIgnoredContact(config, '351900000000')).toBe(false);
    expect(isIgnoredContact({}, USER)).toBe(false);
  });

  test('welcome message needs content when enabled, an HTTPS image and a short caption', () => {
    expect(mergeWelcomeMessage(undefined, { enabled: true, image_url: IMAGE_URL })).toEqual({
      enabled: true,
      image_url: IMAGE_URL,
      text: undefined,
    });
    expect(() => mergeWelcomeMessage(undefined, { enabled: true })).toThrow('needs an image_url or a text');
    expect(() => mergeWelcomeMessage(undefined, { enabled: true, image_url: 'http://x.com/a.jpg' })).toThrow('HTTPS');
    expect(() =>
      mergeWelcomeMessage(undefined, { enabled: true, image_url: IMAGE_URL, text: 'x'.repeat(1025) })
    ).toThrow('1024');
    expect(mergeWelcomeMessage(undefined, { enabled: true, text: 'x'.repeat(1025) }).text).toHaveLength(1025);
  });

  test('welcome message updates merge into the stored one; null clears a field', () => {
    const stored = { enabled: true, image_url: IMAGE_URL, text: 'Hi' };
    expect(mergeWelcomeMessage(stored, { enabled: false })).toEqual({ enabled: false, image_url: IMAGE_URL, text: 'Hi' });
    expect(mergeWelcomeMessage(stored, { text: null })).toEqual({ enabled: true, image_url: IMAGE_URL, text: undefined });
    expect(() => mergeWelcomeMessage(stored, { image_url: null, text: null })).toThrow('needs an image_url or a text');
  });
});

describe('channel config endpoint', () => {
  const update = async whatsapp => {
    const channelConfig = { agent: AGENT_ID, whatsapp: { enabled: false, credentials: {} }, save: jest.fn() };
    Agent.findOne.mockResolvedValue({ _id: AGENT_ID });
    ChannelConfig.findOne.mockResolvedValue(channelConfig);
    const res = mockRes();
    await channelController.updateChannelConfig(
      { params: { agentId: AGENT_ID, orgId: 'org', projectId: 'proj' }, body: { whatsapp } },
      res
    );
    return { res, channelConfig };
  };

  test('stores the welcome message and replaces the ignored list', async () => {
    const { res, channelConfig } = await update({
      welcome_message: { enabled: true, image_url: IMAGE_URL },
      ignored_contacts: [{ phone_e164: '+351 912 345 678', note: 'Supplier' }],
    });

    expect(res.status).not.toHaveBeenCalled();
    expect(channelConfig.save).toHaveBeenCalled();
    expect(channelConfig.whatsapp.welcome_message).toEqual({ enabled: true, image_url: IMAGE_URL, text: undefined });
    expect(channelConfig.whatsapp.ignored_contacts).toEqual([{ phone_e164: `+${USER}`, note: 'Supplier' }]);
  });

  test('rejects invalid settings without saving', async () => {
    const { res, channelConfig } = await update({ welcome_message: { enabled: true } });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_WHATSAPP_SETTINGS', field: 'whatsapp.welcome_message' })
    );
    expect(channelConfig.save).not.toHaveBeenCalled();
  });
});

describe('ignored contacts', () => {
  test('a listed number is stored, handed to the team and never reaches the agent', async () => {
    orchestrator.channelServices.set(
      `${AGENT_ID}_whatsapp`,
      makeService({ ignored_contacts: [{ phone_e164: '+351 912 345 678' }] })
    );

    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', inboundWebhook());

    expect(result).toEqual({ conversation_id: 'conv-1', status: 'human_controlled', reason: 'ignored_contact' });
    expect(conversation).toMatchObject({
      status: 'human_controlled',
      current_handler: 'human',
      ai_disabled_reason: 'ignored_contact',
    });
    expect(conversation.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'Hello', channel_info: expect.objectContaining({ message_id: 'wamid.IN' }) })
    );
    expect(hookService.executeHooks).toHaveBeenCalledWith(agentDoc, conversation, 'Hello', 'user', 'message');
    expect(channelTurnBufferService.bufferTurn).not.toHaveBeenCalled();
    expect(agentService.executeChatbotAgent).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("a listed number's media is stored but not interpreted by an LLM", async () => {
    const mediaStorageService = require('../src/services/mediaStorageService');
    const attachmentProcessingService = require('../src/services/attachmentProcessingService');
    const stored = [{ type: 'image', url: 's3-key', stored: true }];
    mediaStorageService.processAndStore.mockResolvedValue(stored);
    orchestrator.channelServices.set(`${AGENT_ID}_whatsapp`, makeService({ ignored_contacts: [{ phone_e164: `+${USER}` }] }));
    const body = inboundWebhook();
    body.entry[0].changes[0].value.messages[0] = {
      from: USER, id: 'wamid.IMG', timestamp: '1700255121', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' },
    };

    await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', body);

    expect(mediaStorageService.processAndStore).toHaveBeenCalled();
    expect(attachmentProcessingService.interpretChannelMedia).not.toHaveBeenCalled();
    expect(conversation.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel_info: expect.objectContaining({ media: stored }) })
    );
  });

  test('a number listed while its turn was buffered is still not answered', async () => {
    orchestrator.channelServices.set(`${AGENT_ID}_whatsapp`, makeService({ ignored_contacts: [{ phone_e164: `+${USER}` }] }));
    Conversation.findById.mockResolvedValue(conversation);

    await orchestrator._processClaimedTurn({
      _id: 'conv-1',
      agent: AGENT_ID,
      channel: 'whatsapp',
      user_identifier: USER,
      content: 'Hello',
    });

    expect(conversation.ai_disabled_reason).toBe('ignored_contact');
    expect(agentService.executeChatbotAgent).not.toHaveBeenCalled();
  });

  test('other numbers still run a turn', async () => {
    orchestrator.channelServices.set(`${AGENT_ID}_whatsapp`, makeService({ ignored_contacts: [{ phone_e164: '+14155550100' }] }));

    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', inboundWebhook());

    expect(result.status).toBe('debounced');
    expect(conversation.ai_disabled_reason).toBeNull();
  });

  test('messages on human-controlled conversations fire message hooks', async () => {
    orchestrator.channelServices.set(`${AGENT_ID}_whatsapp`, makeService());
    conversation.status = 'human_controlled';
    conversation.current_handler = 'human';

    await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', inboundWebhook());

    expect(hookService.executeHooks).toHaveBeenCalledWith(agentDoc, conversation, 'Hello', 'user', 'message');
    expect(hookService.scheduleInactivityHooks).toHaveBeenCalledWith(agentDoc, conversation);
  });
});

describe('handback', () => {
  const handBack = async ignoredContacts => {
    const conv = {
      _id: 'conv-1',
      agent: AGENT_ID,
      channel: 'whatsapp',
      user_identifier: USER,
      handoff_info: {},
      handBackToAgent: jest.fn().mockResolvedValue(),
    };
    Conversation.findById.mockResolvedValue(conv);
    ChannelConfig.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ whatsapp: { ignored_contacts: ignoredContacts } }) }),
    });
    const res = mockRes();
    await handoffController.handBackToAgent(
      { params: { conversationId: 'conv-1' }, body: {}, user: { _id: 'user-1' } },
      res
    );
    return { res, conv };
  };

  test('is refused while the number is listed', async () => {
    const { res, conv } = await handBack([{ phone_e164: `+${USER}` }]);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONTACT_IGNORED' }));
    expect(conv.handBackToAgent).not.toHaveBeenCalled();
  });

  test('goes through once the number is removed', async () => {
    const { res, conv } = await handBack([]);

    expect(conv.handBackToAgent).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('welcome message', () => {
  const normalizedMessage = {
    user_identifier: USER,
    content: 'Hello',
    message_id: 'wamid.IN',
    channel_metadata: { whatsapp: { phone_number: USER, wa_id: USER } },
  };

  const runTurn = service => {
    agentService.executeChatbotAgent.mockImplementation(async (...args) => {
      const turnOptions = args[6] || {};
      await turnOptions.onUserMessageStored?.(conversation);
      return { response: 'How can I help?', message_id: 'reply-1' };
    });
    jest.spyOn(orchestrator, 'sendResponse').mockResolvedValue('wamid.REPLY');
    jest.spyOn(orchestrator, 'recordPlatformMessageId').mockResolvedValue();
    jest.spyOn(orchestrator, 'updateChannelAnalytics').mockResolvedValue();
    return orchestrator._runAgentTurn(AGENT_ID, 'whatsapp', service, conversation, normalizedMessage, [], {});
  };

  test('image only: sent as an image with no caption before the reply, and stored', async () => {
    axios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.WELCOME' }] } });
    const service = makeService({ welcome_message: { enabled: true, image_url: IMAGE_URL } });

    const result = await runTurn(service);

    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload).toMatchObject({ to: USER, type: 'image', image: { link: IMAGE_URL } });
    expect(payload.image.caption).toBeUndefined();
    expect(axios.post.mock.invocationCallOrder[0]).toBeLessThan(orchestrator.sendResponse.mock.invocationCallOrder[0]);

    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'conv-1', welcome_message_sent_at: null },
      { $set: { welcome_message_sent_at: expect.any(Date) } }
    );
    expect(ChannelOutboundMessage.insertMany).toHaveBeenCalledWith([{ _id: 'whatsapp:wamid.WELCOME' }], { ordered: false });
    expect(conversation.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: '',
        metadata: { kind: 'welcome_message' },
        channel_info: expect.objectContaining({
          message_id: 'wamid.WELCOME',
          media: [expect.objectContaining({ type: 'image', url: IMAGE_URL })],
        }),
      })
    );
  });

  test('image and text: text is the caption', async () => {
    axios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.WELCOME' }] } });

    await runTurn(makeService({ welcome_message: { enabled: true, image_url: IMAGE_URL, text: 'Welcome!' } }));

    expect(axios.post.mock.calls[0][1].image).toEqual({ link: IMAGE_URL, caption: 'Welcome!' });
  });

  test('text only: sent as a text message', async () => {
    axios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.WELCOME' }] } });

    await runTurn(makeService({ welcome_message: { enabled: true, text: 'Welcome!' } }));

    expect(axios.post.mock.calls[0][1]).toMatchObject({ type: 'text', text: { body: 'Welcome!' } });
  });

  test('a failed send is logged and the reply still goes out', async () => {
    axios.post.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { data: { error: { code: 131053 } } } }));

    const result = await runTurn(makeService({ welcome_message: { enabled: true, image_url: IMAGE_URL } }));

    expect(result.success).toBe(true);
    expect(orchestrator.sendResponse).toHaveBeenCalled();
    expect(conversation.addMessage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Welcome message failed'), expect.stringContaining('131053'));
  });

  test('is not sent to a number with an earlier conversation', async () => {
    Conversation.exists.mockResolvedValue({ _id: 'old-conv' });

    await runTurn(makeService({ welcome_message: { enabled: true, image_url: IMAGE_URL } }));

    expect(axios.post).not.toHaveBeenCalled();
    expect(agentService.executeChatbotAgent.mock.calls[0][6]).toEqual({});
  });

  test('is not sent later in a conversation', async () => {
    conversation.messages = [{ role: 'user', content: 'earlier' }];

    await runTurn(makeService({ welcome_message: { enabled: true, image_url: IMAGE_URL } }));

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('is sent at most once when another instance claimed it', async () => {
    Conversation.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await runTurn(makeService({ welcome_message: { enabled: true, image_url: IMAGE_URL } }));

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('is not sent when it is switched off', async () => {
    await runTurn(makeService({ welcome_message: { enabled: false, image_url: IMAGE_URL } }));

    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('delivery failures', () => {
  test('are logged and recorded on the message we sent', async () => {
    orchestrator.channelServices.set(`${AGENT_ID}_whatsapp`, makeService());
    const body = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'waba',
        changes: [{
          field: 'messages',
          value: {
            metadata,
            statuses: [{
              id: 'wamid.WELCOME',
              status: 'failed',
              recipient_id: USER,
              errors: [{ code: 131053, title: 'Media upload error', error_data: { details: 'Unable to download the media' } }],
            }],
          },
        }],
      }],
    };

    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', body);

    expect(result.status).toBe('delivery_failure_recorded');
    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { agent: AGENT_ID, channel: 'whatsapp', 'messages.channel_info.message_id': 'wamid.WELCOME' },
      {
        $set: expect.objectContaining({
          'messages.$[m].metadata.delivery_status': 'failed',
          'messages.$[m].metadata.delivery_errors': [
            { code: 131053, title: 'Media upload error', message: undefined, details: 'Unable to download the media' },
          ],
        }),
      },
      { arrayFilters: [{ 'm.channel_info.message_id': 'wamid.WELCOME' }] }
    );
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('failed to deliver'), expect.stringContaining('131053'));
    expect(orchestrator.getOrCreateConversation).not.toHaveBeenCalled();
  });
});
