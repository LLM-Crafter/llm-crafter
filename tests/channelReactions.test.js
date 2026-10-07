'use strict';

jest.mock('../src/utils/encryption', () => ({
  isEncrypted: () => false,
  decrypt: value => value,
}));

const WhatsAppService = require('../src/services/channels/whatsappService');
const InstagramService = require('../src/services/channels/instagramService');
const MessengerService = require('../src/services/channels/messengerService');

const silence = () => jest.spyOn(console, 'log').mockImplementation(() => {});

describe('WhatsApp reactions', () => {
  const service = new WhatsAppService({ whatsapp: { enabled: true, provider: 'meta' } });
  const webhook = reaction => ({
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: '351910000000', profile: { name: 'Ana' } }],
          messages: [{
            from: '351910000000',
            id: 'wamid.REACTION',
            timestamp: '1760000000',
            type: 'reaction',
            reaction,
          }],
        },
      }],
    }],
  });

  beforeEach(silence);
  afterEach(() => jest.restoreAllMocks());

  test('normalizes a reaction to the message it targets', async () => {
    const result = await service.handleIncomingMessage(
      webhook({ message_id: 'wamid.TARGET', emoji: '👍' })
    );
    expect(result).toEqual({
      type: 'reaction',
      channel: 'whatsapp',
      user_identifier: '351910000000',
      timestamp: new Date(1760000000 * 1000),
      reaction: { message_id: 'wamid.TARGET', emoji: '👍' },
    });
  });

  test('treats an empty emoji as a removed reaction', async () => {
    const result = await service.handleIncomingMessage(
      webhook({ message_id: 'wamid.TARGET', emoji: '' })
    );
    expect(result.reaction).toEqual({ message_id: 'wamid.TARGET', emoji: null });
  });

  test('still normalizes regular text messages', async () => {
    const result = await service.handleIncomingMessage({
      entry: [{ changes: [{ value: { messages: [{ from: '351910000000', id: 'wamid.TEXT', type: 'text', text: { body: 'hi' } }] } }] }],
    });
    expect(result.type).toBeUndefined();
    expect(result.content).toBe('hi');
    expect(result.message_id).toBe('wamid.TEXT');
  });
});

describe.each([
  ['instagram', InstagramService],
  ['messenger', MessengerService],
])('%s reactions', (channel, Service) => {
  const service = new Service({ [channel]: { enabled: true, credentials: {} } });
  const event = reaction => ({
    sender: { id: 'USER' },
    recipient: { id: 'PAGE' },
    timestamp: 1760000000000,
    reaction,
  });

  test('normalizes a react event', async () => {
    const result = await service.handleIncomingMessage({
      entry: [{ messaging: [event({ mid: 'm_TARGET', action: 'react', reaction: 'love', emoji: '❤️' })] }],
    });
    expect(result).toEqual({
      type: 'reaction',
      channel,
      user_identifier: 'USER',
      timestamp: new Date(1760000000000),
      reaction: { message_id: 'm_TARGET', emoji: '❤️' },
    });
  });

  test('normalizes an unreact event as a removal', async () => {
    const result = await service.handleIncomingMessage({
      entry: [{ messaging: [event({ mid: 'm_TARGET', action: 'unreact' })] }],
    });
    expect(result.reaction).toEqual({ message_id: 'm_TARGET', emoji: null });
  });
});

test('instagram handles reactions delivered via the message_reactions change field', async () => {
  const service = new InstagramService({ instagram: { enabled: true, credentials: {} } });
  const result = await service.handleIncomingMessage({
    entry: [{
      changes: [{
        field: 'message_reactions',
        value: {
          sender: { id: 'USER' },
          recipient: { id: 'PAGE' },
          timestamp: 1760000000000,
          reaction: { mid: 'm_TARGET', action: 'react', reaction: 'like', emoji: '👍' },
        },
      }],
    }],
  });
  expect(result.type).toBe('reaction');
  expect(result.reaction).toEqual({ message_id: 'm_TARGET', emoji: '👍' });
});
