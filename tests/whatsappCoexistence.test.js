'use strict';

process.env.CHANNEL_ECHO_MATCH_GRACE_MS = '1';

jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
  encrypt: value => `enc:${value}`,
}));
jest.mock('../src/models/Conversation', () => ({ exists: jest.fn(), findById: jest.fn() }));
jest.mock('../src/models/ChannelOutboundMessage', () => ({ exists: jest.fn(), insertMany: jest.fn() }));
jest.mock('../src/models/ChannelConfig', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../src/models/Agent', () => ({ find: jest.fn(), findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/services/agentService', () => ({ executeChatbotAgent: jest.fn() }));
jest.mock('../src/services/mediaStorageService', () => ({ processAndStore: jest.fn() }));
jest.mock('../src/services/attachmentProcessingService', () => ({ interpretChannelMedia: jest.fn() }));
jest.mock('../src/services/channelTurnBufferService', () => ({ bufferTurn: jest.fn() }));
jest.mock('../src/services/messageTransformerService', () => ({ process: jest.fn() }));

const Agent = require('../src/models/Agent');
const ChannelConfig = require('../src/models/ChannelConfig');
const Conversation = require('../src/models/Conversation');
const ChannelOutboundMessage = require('../src/models/ChannelOutboundMessage');
const agentService = require('../src/services/agentService');
const channelTurnBufferService = require('../src/services/channelTurnBufferService');
const WhatsAppService = require('../src/services/channels/whatsappService');
const orchestrator = require('../src/services/channelOrchestrator');
const channelController = require('../src/controllers/channelController');

const AGENT_ID = 'agent-1';
const PHONE_NUMBER_ID = '106540352242922';
const BUSINESS = '15550783881';
const USER = '16505551234';
const WABA_ID = '102290129340398';
const PERSONAL_DATA = 'private customer text';

const metadata = { display_phone_number: BUSINESS, phone_number_id: PHONE_NUMBER_ID };
const webhook = (field, value) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: WABA_ID, changes: [{ field, value }] }],
});
const withMetadata = (field, value) => webhook(field, { messaging_product: 'whatsapp', metadata, ...value });

const textEcho = (id, body = 'Reply from the phone') => ({
  from: BUSINESS,
  to: USER,
  id,
  timestamp: '1700255121',
  type: 'text',
  text: { body },
});
const echoWebhook = (...echoes) => withMetadata('smb_message_echoes', { message_echoes: echoes });

const historyWithMedia = withMetadata('history', {
  messages: [{
    from: USER,
    id: 'wamid.OLD',
    timestamp: '1690000000',
    type: 'image',
    image: { caption: PERSONAL_DATA, id: '24230790383178626', mime_type: 'image/jpeg' },
  }],
});
const historyWithThreads = withMetadata('history', {
  history: [{
    metadata: { phase: 0, chunk_order: 1, progress: 55 },
    threads: [{ id: USER, messages: [{ from: USER, id: 'wamid.OLD', type: 'text', text: { body: PERSONAL_DATA } }] }],
  }],
});
const historyDeclined = withMetadata('history', {
  history: [{ errors: [{ code: 2593109, title: 'History sync is turned off by the business' }] }],
});
const stateSync = withMetadata('smb_app_state_sync', {
  state_sync: [{ type: 'contact', contact: { full_name: PERSONAL_DATA, phone_number: USER }, action: 'add' }],
});
const partnerRemoved = webhook('account_update', {
  event: 'PARTNER_REMOVED',
  waba_info: { waba_id: WABA_ID, owner_business_id: '999' },
  disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' },
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
};
const post = async (handler, body, params = {}) => {
  const res = mockRes();
  await handler({ method: 'POST', body, params, ip: '127.0.0.1' }, res);
  return res;
};

const service = new WhatsAppService({
  whatsapp: {
    enabled: true,
    provider: 'meta',
    credentials: { phone_number_id: PHONE_NUMBER_ID, access_token: 'token' },
  },
});

let conversation;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(orchestrator, 'initializeChannelsForAgent').mockResolvedValue({ enabled: ['whatsapp'] });
  orchestrator.channelServices.set(`${AGENT_ID}_whatsapp`, service);
  conversation = {
    _id: 'conv-1',
    status: 'agent_controlled',
    addMessage: jest.fn().mockResolvedValue(),
    assignChannelAppOperator: jest.fn().mockResolvedValue(),
  };
  jest.spyOn(orchestrator, 'getOrCreateConversation').mockResolvedValue(conversation);
  Conversation.exists.mockResolvedValue(null);
  ChannelOutboundMessage.exists.mockResolvedValue(null);
  ChannelConfig.find.mockReset();
  ChannelConfig.findOne.mockReset();
  ChannelConfig.updateMany.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('field dispatch', () => {
  test.each([
    ['history with media in value.messages', historyWithMedia],
    ['history with threads', historyWithThreads],
    ['history declined with error 2593109', historyDeclined],
    ['smb_app_state_sync', stateSync],
    ['account_update', partnerRemoved],
    ['an unknown field', withMetadata('something_new', { anything: true })],
  ])('%s never reaches a conversation or the agent', async (_name, body) => {
    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', body);

    expect(result).toMatchObject({ status: 'ignored', reason: 'non_message_webhook' });
    expect(orchestrator.getOrCreateConversation).not.toHaveBeenCalled();
    expect(channelTurnBufferService.bufferTurn).not.toHaveBeenCalled();
    expect(agentService.executeChatbotAgent).not.toHaveBeenCalled();
  });

  test.each([
    ['field: messages', 'messages'],
    ['a missing field', undefined],
  ])('inbound messages with %s still run a turn', async (_name, field) => {
    const body = webhook(field, {
      metadata,
      contacts: [{ wa_id: USER, profile: { name: 'Ana' } }],
      messages: [{ from: USER, id: 'wamid.IN', timestamp: '1700255121', type: 'text', text: { body: 'Hello' } }],
    });

    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', body);

    expect(result).toEqual({ success: true, status: 'debounced', conversation_id: 'conv-1' });
    expect(channelTurnBufferService.bufferTurn).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ userIdentifier: USER, content: 'Hello', messageId: 'wamid.IN' }),
      expect.any(Number)
    );
  });

  test('status updates are still ignored', async () => {
    const body = webhook('messages', { metadata, statuses: [{ id: 'wamid.S', status: 'read', recipient_id: USER }] });

    await expect(service.handleIncomingMessage(body)).resolves.toBeNull();
  });
});

describe('smb_message_echoes', () => {
  test('normalizes onto the end user, with the business as the account', async () => {
    const [echo] = await service.handleIncomingMessage(echoWebhook(textEcho('wamid.APP')));

    expect(echo).toMatchObject({
      type: 'echo',
      channel: 'whatsapp',
      message_id: 'wamid.APP',
      user_identifier: USER,
      account_id: PHONE_NUMBER_ID,
      content: 'Reply from the phone',
      timestamp: new Date(1700255121000),
    });
  });

  test('falls back to the sender when there is no phone_number_id', async () => {
    const body = webhook('smb_message_echoes', { message_echoes: [textEcho('wamid.APP')] });

    const [echo] = await service.handleIncomingMessage(body);

    expect(echo.account_id).toBe(BUSINESS);
  });

  test('normalizes media echoes', async () => {
    const [echo] = await service.handleIncomingMessage(echoWebhook({
      from: BUSINESS,
      to: USER,
      id: 'wamid.IMG',
      timestamp: '1700255121',
      type: 'image',
      image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'A photo' },
    }));

    expect(echo.content).toBe('A photo');
    expect(echo.media).toEqual([{ type: 'image', url: 'media-1', mime_type: 'image/jpeg', file_size: null }]);
  });

  test('an empty message_echoes list is ignored', async () => {
    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', echoWebhook());

    expect(result).toMatchObject({ status: 'ignored', reason: 'non_message_webhook' });
  });

  test('records an owner reply as human_operator and takes over, with no agent run', async () => {
    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', echoWebhook(textEcho('wamid.APP')));

    expect(result).toEqual({
      success: true,
      status: 'echoes_processed',
      results: [{ success: true, status: 'echo_recorded', conversation_id: 'conv-1' }],
    });
    expect(orchestrator.getOrCreateConversation).toHaveBeenCalledWith(AGENT_ID, USER, 'whatsapp', null, service);
    expect(conversation.assignChannelAppOperator).toHaveBeenCalledWith('whatsapp', PHONE_NUMBER_ID);
    expect(conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'human_operator',
      content: 'Reply from the phone',
      handler_info: {
        channel_app_operator: {
          channel: 'whatsapp',
          account_id: PHONE_NUMBER_ID,
          timestamp: new Date(1700255121000),
        },
      },
      channel_info: { channel: 'whatsapp', message_id: 'wamid.APP', media: undefined },
    }));
    expect(agentService.executeChatbotAgent).not.toHaveBeenCalled();
    expect(channelTurnBufferService.bufferTurn).not.toHaveBeenCalled();
  });

  test('ignores an echo of a message Crafter sent', async () => {
    ChannelOutboundMessage.exists.mockResolvedValue({ _id: 'whatsapp:wamid.OURS' });

    const result = await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', echoWebhook(textEcho('wamid.OURS')));

    expect(result.results).toEqual([{ success: true, status: 'ignored', reason: 'own_echo' }]);
    expect(ChannelOutboundMessage.exists).toHaveBeenCalledWith({ _id: 'whatsapp:wamid.OURS' });
    expect(conversation.assignChannelAppOperator).not.toHaveBeenCalled();
    expect(conversation.addMessage).not.toHaveBeenCalled();
  });

  test('cancels a reply being generated', async () => {
    const executionToken = { cancelled: false };
    orchestrator.executionTokens.set('conv-1', executionToken);

    await orchestrator.handleIncomingMessage(AGENT_ID, 'whatsapp', echoWebhook(textEcho('wamid.APP')));

    expect(executionToken.cancelled).toBe(true);
    orchestrator.executionTokens.delete('conv-1');
  });

  test('records every echo in a webhook, in order', async () => {
    await orchestrator.handleIncomingMessage(
      AGENT_ID,
      'whatsapp',
      echoWebhook(textEcho('wamid.1', 'first'), textEcho('wamid.2', 'second'))
    );

    expect(conversation.addMessage.mock.calls.map(([message]) => message.content)).toEqual(['first', 'second']);
  });

  test('one failed echo does not lose the others', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    conversation.addMessage.mockRejectedValueOnce(new Error('write failed'));

    const result = await orchestrator.handleIncomingMessage(
      AGENT_ID,
      'whatsapp',
      echoWebhook(textEcho('wamid.1'), textEcho('wamid.2'))
    );

    expect(result.results).toEqual([
      { success: false, status: 'failed', message_id: 'wamid.1' },
      { success: true, status: 'echo_recorded', conversation_id: 'conv-1' },
    ]);
  });

  test('the takeover notice names the WhatsApp app', () => {
    const RealConversation = jest.requireActual('../src/models/Conversation');
    const real = new RealConversation({ agent: AGENT_ID, user_identifier: USER, channel: 'whatsapp' });
    jest.spyOn(real, 'save').mockResolvedValue(real);

    real.assignChannelAppOperator('whatsapp', PHONE_NUMBER_ID);

    expect(real.status).toBe('human_controlled');
    expect(real.current_handler).toBe('human');
    expect(real.messages[real.messages.length - 1].content).toBe(
      'A member of our team joined from the WhatsApp app.'
    );
  });
});

describe('sending', () => {
  const sendText = metadataArg => {
    Agent.findById.mockReturnValue({ select: () => ({ lean: async () => ({}) }) });
    Conversation.findById.mockReturnValue({ select: () => ({ lean: async () => ({}) }) });
    const channelService = { sendMessage: jest.fn().mockResolvedValue({ message_id: 'wamid.SENT' }) };
    return orchestrator
      .sendResponse(AGENT_ID, channelService, USER, { response: 'Hello' }, 'whatsapp', metadataArg)
      .then(sentId => ({ channelService, sentId }));
  };

  test('records the wamids Crafter sends', async () => {
    const { sentId } = await sendText({ whatsapp: { phone_number: USER } });

    expect(sentId).toBe('wamid.SENT');
    expect(ChannelOutboundMessage.insertMany).toHaveBeenCalledWith([{ _id: 'whatsapp:wamid.SENT' }], { ordered: false });
  });

  test('a conversation started by an echo, with no metadata, still has a recipient', async () => {
    const { channelService, sentId } = await sendText(null);

    expect(sentId).toBe('wamid.SENT');
    expect(channelService.sendMessage).toHaveBeenCalledWith(USER, 'Hello', {});
  });
});

describe('shared webhook endpoint', () => {
  const handler = channelController.handleWhatsAppSharedWebhook;

  beforeEach(() => {
    jest.spyOn(orchestrator, 'handleIncomingMessage').mockResolvedValue({ success: true });
  });

  test.each([
    ['history with media', historyWithMedia],
    ['history with threads', historyWithThreads],
    ['history declined', historyDeclined],
    ['smb_app_state_sync', stateSync],
  ])('%s gets a 200 without a lookup or logging its contents', async (_name, body) => {
    const res = await post(handler, body);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ChannelConfig.find).not.toHaveBeenCalled();
    expect(orchestrator.handleIncomingMessage).not.toHaveBeenCalled();
    expect(JSON.stringify(console.log.mock.calls)).not.toContain(PERSONAL_DATA);
    expect(JSON.stringify(console.log.mock.calls)).not.toContain(USER);
  });

  test('history logs its progress', async () => {
    await post(handler, historyWithThreads);

    expect(console.log).toHaveBeenCalledWith('[WhatsApp] Received shared webhook:', expect.objectContaining({
      field: 'history',
      phone_number_id: PHONE_NUMBER_ID,
      phase: 0,
      chunk_order: 1,
      progress: 55,
    }));
  });

  test('a declined history logs the error code', async () => {
    await post(handler, historyDeclined);

    expect(console.log).toHaveBeenCalledWith(
      '[WhatsApp] Received shared webhook:',
      expect.objectContaining({ field: 'history', error_code: 2593109 })
    );
  });

  test('routes echoes by phone_number_id', async () => {
    ChannelConfig.find.mockReturnValue({
      sort: () => ({ select: () => ({ lean: async () => [{ agent: AGENT_ID, organization: 'org-1' }] }) }),
    });
    Agent.find.mockReturnValue({ select: () => ({ lean: async () => [{ _id: AGENT_ID, name: 'Agent' }] }) });
    const body = echoWebhook(textEcho('wamid.APP'));

    const res = await post(handler, body);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ChannelConfig.find).toHaveBeenCalledWith({
      'whatsapp.credentials.phone_number_id': PHONE_NUMBER_ID,
      'whatsapp.enabled': true,
    });
    expect(orchestrator.handleIncomingMessage).toHaveBeenCalledWith(AGENT_ID, 'whatsapp', body, expect.anything());
  });

  describe('account_update', () => {
    const mockConfigs = configs => ChannelConfig.find.mockReturnValue({
      select: () => ({ lean: async () => configs }),
    });

    test('PARTNER_REMOVED disables every enabled config on the WABA and keeps credentials', async () => {
      mockConfigs([{ agent: 'agent-a' }, { agent: 'agent-b' }]);
      const clearAgentCache = jest.spyOn(orchestrator, 'clearAgentCache');

      const res = await post(handler, partnerRemoved);

      const filter = { 'whatsapp.credentials.waba_id': WABA_ID, 'whatsapp.enabled': true };
      expect(res.status).toHaveBeenCalledWith(200);
      expect(ChannelConfig.find).toHaveBeenCalledWith(filter);
      expect(ChannelConfig.updateMany).toHaveBeenCalledWith(filter, {
        $set: {
          'whatsapp.enabled': false,
          'whatsapp.disconnection': {
            event: 'PARTNER_REMOVED',
            reason: 'PRIMARY_INACTIVITY',
            initiated_by: 'SYSTEM',
            at: expect.any(Date),
          },
        },
      });
      expect(clearAgentCache.mock.calls).toEqual([['agent-a'], ['agent-b']]);
      expect(orchestrator.handleIncomingMessage).not.toHaveBeenCalled();
    });

    test('other events change nothing', async () => {
      const res = await post(handler, webhook('account_update', {
        event: 'VERIFIED_ACCOUNT',
        waba_info: { waba_id: WABA_ID },
      }));

      expect(res.status).toHaveBeenCalledWith(200);
      expect(ChannelConfig.find).not.toHaveBeenCalled();
      expect(ChannelConfig.updateMany).not.toHaveBeenCalled();
    });

    test('an unknown WABA changes nothing', async () => {
      mockConfigs([]);

      const res = await post(handler, partnerRemoved);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(ChannelConfig.updateMany).not.toHaveBeenCalled();
    });

    test('a database failure answers 500 so Meta retries', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      ChannelConfig.find.mockImplementation(() => {
        throw new Error('db down');
      });

      const res = await post(handler, partnerRemoved);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('a retry after the channel was already disabled changes nothing and answers 200', async () => {
      mockConfigs([]);

      const res = await post(handler, partnerRemoved);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(ChannelConfig.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('webhooks with several changes', () => {
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const change = (field, value) => ({ field, value: { metadata, ...value } });
    const echoChange = id => change('smb_message_echoes', { message_echoes: [textEcho(id)] });
    const historyChange = change('history', { history: [{ metadata: { phase: 0 } }] });
    const mockRouting = () => {
      const lean = async () => [{ agent: AGENT_ID, organization: 'org-1' }];
      ChannelConfig.find.mockReturnValue({ select: () => ({ lean }), sort: () => ({ select: () => ({ lean }) }) });
      Agent.find.mockReturnValue({ select: () => ({ lean: async () => [{ _id: AGENT_ID, name: 'Agent' }] }) });
    };
    const dispatchedIds = () => orchestrator.handleIncomingMessage.mock.calls.map(
      ([, , body]) => body.entry[0].changes[0].value.message_echoes[0].id
    );

    test('an owner reply after the first change is not dropped', async () => {
      mockRouting();
      const body = { entry: [{ id: WABA_ID, changes: [historyChange, echoChange('wamid.2')] }] };

      const res = await post(handler, body);
      await flush();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(dispatchedIds()).toEqual(['wamid.2']);
    });

    test('every entry is read and each change goes on its own', async () => {
      mockRouting();
      const body = {
        object: 'whatsapp_business_account',
        entry: [
          { id: WABA_ID, changes: [echoChange('wamid.1'), echoChange('wamid.2')] },
          { id: 'other-waba', changes: [echoChange('wamid.3')] },
        ],
      };

      await post(handler, body);
      await flush();

      expect(dispatchedIds()).toEqual(['wamid.1', 'wamid.2', 'wamid.3']);
      const [, , second] = orchestrator.handleIncomingMessage.mock.calls[1];
      expect(second.object).toBe('whatsapp_business_account');
      expect(second.entry).toHaveLength(1);
      expect(second.entry[0].changes).toHaveLength(1);
    });

    test('changes run one at a time, in order', async () => {
      mockRouting();
      let finishFirst;
      orchestrator.handleIncomingMessage.mockImplementationOnce(() => new Promise(resolve => {
        finishFirst = resolve;
      }));
      const body = { entry: [{ changes: [echoChange('wamid.1'), echoChange('wamid.2')] }] };

      await post(handler, body);
      await flush();
      expect(dispatchedIds()).toEqual(['wamid.1']);

      finishFirst({ success: true });
      await flush();
      expect(dispatchedIds()).toEqual(['wamid.1', 'wamid.2']);
    });

    test('a failed change does not stop the next one', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockRouting();
      orchestrator.handleIncomingMessage.mockRejectedValueOnce(new Error('boom'));
      const body = { entry: [{ changes: [echoChange('wamid.1'), echoChange('wamid.2')] }] };

      const res = await post(handler, body);
      await flush();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(dispatchedIds()).toEqual(['wamid.1', 'wamid.2']);
    });

    test('a failed account_update answers 500 before any message runs, so a retry cannot repeat one', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockRouting();
      ChannelConfig.updateMany.mockRejectedValue(new Error('db down'));
      const body = { entry: [{ changes: [echoChange('wamid.1'), partnerRemoved.entry[0].changes[0]] }] };

      const res = await post(handler, body);
      await flush();

      expect(res.status).toHaveBeenCalledWith(500);
      expect(orchestrator.handleIncomingMessage).not.toHaveBeenCalled();
    });
  });
});

describe('channel service cache', () => {
  const CACHE_AGENT = 'agent-cache';
  const config = (updatedAt, whatsapp) => ({
    agent: CACHE_AGENT,
    updatedAt: new Date(updatedAt),
    whatsapp: { provider: 'meta', credentials: {}, ...whatsapp },
  });
  const mockConfig = doc => ChannelConfig.findOne.mockReturnValue({
    select: () => ({ lean: async () => doc && { updatedAt: doc.updatedAt } }),
    lean: async () => doc,
  });
  const cached = () => orchestrator.getChannelService(CACHE_AGENT, 'whatsapp');
  const token = 'token-1';

  beforeEach(async () => {
    orchestrator.initializeChannelsForAgent.mockRestore();
    mockConfig(config(1000, { enabled: true, credentials: { access_token: token } }));
    await orchestrator.initializeChannelsForAgent(CACHE_AGENT);
  });

  afterEach(() => orchestrator.clearAgentCache(CACHE_AGENT));

  test('reuses the services while the config is unchanged', async () => {
    const before = cached();

    await orchestrator.initializeChannelsForAgent(CACHE_AGENT);

    expect(cached()).toBe(before);
  });

  test('a reconnect through another instance picks up the new token', async () => {
    mockConfig(config(2000, { enabled: true, credentials: { access_token: 'token-2' } }));

    await orchestrator.initializeChannelsForAgent(CACHE_AGENT);

    expect(cached().whatsappConfig.credentials.access_token).toBe('token-2');
  });

  test('a disconnect through another instance removes the service, and a reconnect brings it back', async () => {
    mockConfig(config(2000, { enabled: false }));
    await orchestrator.initializeChannelsForAgent(CACHE_AGENT);
    expect(cached()).toBeNull();

    mockConfig(config(3000, { enabled: true }));
    await orchestrator.initializeChannelsForAgent(CACHE_AGENT);
    expect(cached()).not.toBeNull();
  });

  test('a deleted config removes the service', async () => {
    mockConfig(null);

    await orchestrator.initializeChannelsForAgent(CACHE_AGENT);

    expect(cached()).toBeNull();
  });

  test('analytics updates do not count as a config change', async () => {
    const RealChannelConfig = jest.requireActual('../src/models/ChannelConfig');
    const doc = new RealChannelConfig({ agent: CACHE_AGENT, organization: 'o', project: 'p' });
    const save = jest.spyOn(doc, 'save').mockResolvedValue(doc);

    await doc.updateAnalytics('whatsapp');

    expect(save).toHaveBeenCalledWith({ timestamps: false });
  });
});

describe('legacy per-agent endpoint', () => {
  test('does not log sync webhook contents', async () => {
    jest.spyOn(orchestrator, 'handleIncomingMessage').mockResolvedValue({ success: true });

    const res = await post(channelController.handleWhatsAppWebhook, historyWithThreads, { agentId: AGENT_ID });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(JSON.stringify(console.log.mock.calls)).not.toContain(PERSONAL_DATA);
  });

  test('reads every change', async () => {
    jest.spyOn(orchestrator, 'handleIncomingMessage').mockResolvedValue({ success: true });
    const change = id => ({ field: 'smb_message_echoes', value: { metadata, message_echoes: [textEcho(id)] } });

    await post(
      channelController.handleWhatsAppWebhook,
      { entry: [{ changes: [change('wamid.1'), change('wamid.2')] }] },
      { agentId: AGENT_ID }
    );
    await new Promise(resolve => setImmediate(resolve));

    expect(orchestrator.handleIncomingMessage).toHaveBeenCalledTimes(2);
  });

  test('passes other providers\' formats through untouched', async () => {
    jest.spyOn(orchestrator, 'handleIncomingMessage').mockResolvedValue({ success: true });
    const twilio = { From: `whatsapp:+${USER}`, Body: 'Hello', MessageSid: 'SM1' };

    await post(channelController.handleWhatsAppWebhook, twilio, { agentId: AGENT_ID });

    expect(orchestrator.handleIncomingMessage).toHaveBeenCalledWith(AGENT_ID, 'whatsapp', twilio, expect.anything());
  });
});

describe('disconnection on the channel config API', () => {
  const RealChannelConfig = jest.requireActual('../src/models/ChannelConfig');
  const params = { agentId: AGENT_ID, orgId: 'org-1', projectId: 'project-1' };
  const disconnection = {
    event: 'PARTNER_REMOVED',
    reason: 'PRIMARY_INACTIVITY',
    initiated_by: 'SYSTEM',
    at: new Date('2026-11-04T10:00:00Z'),
  };

  const disconnectedConfig = () => {
    const config = new RealChannelConfig({
      agent: AGENT_ID,
      organization: 'org-1',
      project: 'project-1',
      whatsapp: {
        enabled: false,
        provider: 'meta',
        credentials: { phone_number_id: PHONE_NUMBER_ID, waba_id: WABA_ID, access_token: 'old' },
        disconnection,
      },
    });
    jest.spyOn(config, 'save').mockResolvedValue(config);
    return config;
  };
  const responseBody = res => JSON.parse(JSON.stringify(res.json.mock.calls[0][0]));

  beforeEach(() => {
    Agent.findOne.mockResolvedValue({ _id: AGENT_ID });
    jest.spyOn(orchestrator, 'clearAgentCache').mockImplementation(() => {});
  });

  test('the read API returns it, without exposing credentials', async () => {
    ChannelConfig.findOne.mockResolvedValue(disconnectedConfig());
    const res = mockRes();

    await channelController.getChannelConfig({ params }, res);

    const { whatsapp } = responseBody(res);
    expect(whatsapp.enabled).toBe(false);
    expect(whatsapp.disconnection).toEqual({ ...disconnection, at: disconnection.at.toISOString() });
    expect(whatsapp.credentials).toEqual({ configured: true });
  });

  test('re-enabling clears it and the new credentials apply', async () => {
    const config = disconnectedConfig();
    ChannelConfig.findOne.mockResolvedValue(config);
    ChannelConfig.find.mockReturnValue({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
    const res = mockRes();

    await channelController.updateChannelConfig({
      params,
      body: { whatsapp: { enabled: true, credentials: { access_token: 'new' } } },
    }, res);

    expect(config.save).toHaveBeenCalled();
    expect(config.whatsapp.enabled).toBe(true);
    expect(config.whatsapp.credentials.access_token).toBe('enc:new');
    expect(responseBody(res).config.whatsapp.disconnection).toBeUndefined();
    expect(orchestrator.clearAgentCache).toHaveBeenCalledWith(AGENT_ID);
  });

  test('an update that leaves the channel disabled keeps it', async () => {
    const config = disconnectedConfig();
    ChannelConfig.findOne.mockResolvedValue(config);
    const res = mockRes();

    await channelController.updateChannelConfig({
      params,
      body: { whatsapp: { phone_number: BUSINESS } },
    }, res);

    expect(responseBody(res).config.whatsapp.disconnection.reason).toBe('PRIMARY_INACTIVITY');
  });

  test('callers cannot set it', async () => {
    const config = disconnectedConfig();
    ChannelConfig.findOne.mockResolvedValue(config);
    const res = mockRes();

    await channelController.updateChannelConfig({
      params,
      body: { whatsapp: { disconnection: { reason: 'FORGED' } } },
    }, res);

    expect(responseBody(res).config.whatsapp.disconnection.reason).toBe('PRIMARY_INACTIVITY');
  });
});
