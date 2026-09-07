'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const { simpleParser } = require('mailparser');
const { buildRaw } = require('../src/services/email/transports/imapDraftTransport');
const microsoftGraphService = require('../src/services/email/microsoftGraphService');

const outbound = {
  _id: 'outbound-1',
  agent: 'agent-1',
  from_email: 'support@example.com',
  from_name: 'Support',
  to: ['lead@example.com'],
  cc: [],
  bcc: [],
  subject: 'Re: Product enquiry',
  text: 'Thanks for your interest.',
  html: '<p>Thanks for your interest.</p>',
  message_id: '<reply@example.com>',
  in_reply_to: '<initial@lead-platform.example>',
  references: ['<initial@lead-platform.example>'],
  attachments: [],
  reply_context: {
    text: 'Please tell me more about the product.',
    html: '<p>Please tell me <strong>more</strong> about the ' +
      '<a href="https://example.com/product">product</a>.</p>',
    from_email: 'notifications@lead-platform.example',
    from_name: 'Lead Platform',
    received_at: new Date('2026-09-07T12:00:00.000Z'),
  },
};

const account = {
  organization: 'org-1',
  send_profile: {},
};

describe('provider reply bodies', () => {
  test('raw MIME includes visible quoted history and threading headers', async () => {
    const parsed = await simpleParser(await buildRaw(outbound, account));

    expect(parsed.text).toContain('Thanks for your interest.');
    expect(parsed.text).toContain('> Please tell me more about the product.');
    expect(parsed.html).toContain('<blockquote');
    expect(parsed.html).toContain('<strong>more</strong>');
    expect(parsed.html).toContain('href="https://example.com/product"');
    expect(parsed.inReplyTo).toBe('<initial@lead-platform.example>');
    expect(parsed.references).toContain('<initial@lead-platform.example>');
  });

  test('Microsoft Graph draft body includes the same quoted history', () => {
    const patch = microsoftGraphService._draftPatch(outbound, false);

    expect(patch.body.contentType).toBe('HTML');
    expect(patch.body.content).toContain('Thanks for your interest.');
    expect(patch.body.content).toContain('<blockquote');
    expect(patch.body.content).toContain('<strong>more</strong>');
    expect(patch.body.content).toContain('href="https://example.com/product"');
  });
});
