/**
 * Meta Template Builder
 *
 * Builds the Send API `message` object for Instagram and Messenger from a
 * message-transformer card. Both platforms share the same template format:
 *
 * - "card"     → generic template, one element
 * - "carousel" → generic template, up to 10 horizontally scrollable elements
 * - "list"     → text + quick replies (one per row, up to 13)
 * - other      → text + quick replies built from the card's actions
 */

const MAX_ELEMENTS = 10;
const MAX_BUTTONS = 3;
const MAX_QUICK_REPLIES = 13;

const truncate = (value, max) => (value ? String(value).substring(0, max) : undefined);

/**
 * Map card actions to template buttons (web_url / postback).
 */
function buildButtons(actions = []) {
  return actions
    .filter(a => a.type !== 'url' || a.url)
    .slice(0, MAX_BUTTONS)
    .map(action => {
      if (action.type === 'url') {
        return {
          type: 'web_url',
          url: action.url,
          title: truncate(action.label || 'View', 20),
        };
      }
      return {
        type: 'postback',
        title: truncate(action.label || 'Select', 20),
        payload: String(action.payload || action.label || 'select').substring(0, 1000),
      };
    });
}

/**
 * Build one generic-template element from a card-shaped object.
 */
function buildElement(item) {
  const buttons = buildButtons(item.actions);
  const element = {
    title: truncate(item.title || item.body || 'Details', 80),
    subtitle: truncate(item.body && item.title ? item.body : item.subtitle, 80),
    image_url: item.image_url || undefined,
    buttons: buttons.length > 0 ? buttons : undefined,
  };

  if (item.default_url) {
    element.default_action = { type: 'web_url', url: item.default_url };
  }

  return element;
}

function genericTemplate(elements) {
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements,
      },
    },
  };
}

function quickReplies(text, replies) {
  const message = { text: text || 'Choose an option:' };
  if (replies.length > 0) {
    message.quick_replies = replies.slice(0, MAX_QUICK_REPLIES).map(r => ({
      content_type: 'text',
      title: truncate(r.title || 'Option', 20),
      payload: String(r.payload || r.title || 'option').substring(0, 1000),
    }));
  }
  return message;
}

/**
 * Build the `message` object for a transformer card.
 * @param {Object} card - Card payload returned by the transformer webhook
 * @returns {Object} Send API `message` field
 */
function buildRichCardMessage(card) {
  switch (card.type) {
    case 'card':
      return genericTemplate([buildElement(card)]);

    case 'carousel':
      return genericTemplate((card.elements || []).slice(0, MAX_ELEMENTS).map(buildElement));

    case 'list': {
      const rows = (card.sections || []).flatMap(s => s.rows || []);
      const text = [card.title, card.body].filter(Boolean).join('\n');
      return quickReplies(
        text,
        rows.map(row => ({ title: row.title, payload: row.id }))
      );
    }

    default:
      return quickReplies(
        card.body || card.title,
        (card.actions || [])
          .filter(a => a.type !== 'url')
          .map(a => ({ title: a.label, payload: a.payload || a.label }))
      );
  }
}

module.exports = { buildRichCardMessage };
