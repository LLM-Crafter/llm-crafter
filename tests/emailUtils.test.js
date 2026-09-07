'use strict';

const emailUtils = require('../src/services/email/emailUtils');

describe('renderReplyContent', () => {
  test('appends the triggering email below the editable reply', () => {
    const result = emailUtils.renderReplyContent({
      text: 'Thanks for reaching out.',
      html: '<p>Thanks for reaching out.</p>',
      reply_context: {
        text: 'I would like more information.\nPlease call me.',
        from_email: 'lead@example.com',
        from_name: 'Ada Lead',
        received_at: new Date('2026-09-07T12:00:00.000Z'),
      },
    });

    expect(result.text).toContain(
      'On Mon, 07 Sep 2026 12:00:00 GMT, Ada Lead <lead@example.com> wrote:'
    );
    expect(result.text).toContain('> I would like more information.');
    expect(result.text).toContain('> Please call me.');
    expect(result.html).toContain('<blockquote');
    expect(result.html).toContain('I would like more information.<br>Please call me.');
  });

  test('escapes inbound content before adding it to HTML', () => {
    const result = emailUtils.renderReplyContent({
      text: 'Reply',
      html: '<p>Reply</p>',
      reply_context: {
        text: '<script>alert("x")</script>',
        from_email: 'lead@example.com',
      },
    });

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  test('preserves safe inbound HTML and removes active content', () => {
    const result = emailUtils.renderReplyContent({
      text: 'Reply',
      html: '<p>Reply</p>',
      reply_context: {
        text: 'Important link',
        html: '<p onclick="alert(1)"><strong>Important</strong> ' +
          '<a href="https://example.com">link</a><script>alert(1)</script></p>',
        from_email: 'lead@example.com',
      },
    });

    expect(result.html).toContain('<strong>Important</strong>');
    expect(result.html).toContain('<a href="https://example.com">link</a>');
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('onclick');
    expect(result.text).toContain('> Important link');
  });

  test('leaves messages without reply context unchanged', () => {
    expect(emailUtils.renderReplyContent({
      text: 'New message',
      html: '<p>New message</p>',
    })).toEqual({
      text: 'New message',
      html: '<p>New message</p>',
    });
  });

  test('renders from the current editable body without mutating reply context', () => {
    const outbound = {
      text: 'First draft',
      html: '<p>First draft</p>',
      reply_context: {
        text: 'Original email',
        from_email: 'lead@example.com',
      },
    };

    emailUtils.renderReplyContent(outbound);
    outbound.text = 'Edited draft';
    outbound.html = '<p>Edited draft</p>';
    const result = emailUtils.renderReplyContent(outbound);

    expect(result.text.match(/Original email/g)).toHaveLength(1);
    expect(result.text).toContain('Edited draft');
    expect(outbound.reply_context.text).toBe('Original email');
  });
});
