/**
 * Per-agent WhatsApp contact settings stored on ChannelConfig.whatsapp:
 *   - welcome_message:  sent before the first AI reply of a number's first-ever conversation
 *   - ignored_contacts: numbers the agent never answers (their conversations go to the team)
 */

const MAX_IGNORED_CONTACTS = 500;
const MAX_NOTE_LENGTH = 200;
// Meta limits: image captions are capped at 1024 characters, text bodies at 4096
const MAX_CAPTION_LENGTH = 1024;
const MAX_TEXT_LENGTH = 4096;
// E.164 numbers have at most 15 digits; anything shorter than 7 can't be a real number
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

class WhatsAppSettingsError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'WhatsAppSettingsError';
    this.field = field;
  }
}

/**
 * Digits only, without leading zeros, so "+351 912 345 678", "00351912345678" and the
 * sender's wa_id "351912345678" all compare equal. Returns '' when there are no digits.
 */
const normalizePhone = value => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');

/**
 * Validates the full ignored_contacts list sent by the client (it replaces the stored one).
 * Numbers are stored as "+<digits>"; duplicates are collapsed, keeping the first note.
 * @returns {Array<{phone_e164: string, note?: string}>}
 */
const parseIgnoredContacts = list => {
  if (!Array.isArray(list)) {
    throw new WhatsAppSettingsError('ignored_contacts must be an array', 'ignored_contacts');
  }
  if (list.length > MAX_IGNORED_CONTACTS) {
    throw new WhatsAppSettingsError(
      `ignored_contacts can hold at most ${MAX_IGNORED_CONTACTS} entries`,
      'ignored_contacts'
    );
  }

  const seen = new Set();
  const contacts = [];
  list.forEach((entry, index) => {
    const field = `ignored_contacts[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new WhatsAppSettingsError(`${field} must be an object`, field);
    }
    if (typeof entry.phone_e164 !== 'string') {
      throw new WhatsAppSettingsError(`${field}.phone_e164 is required`, `${field}.phone_e164`);
    }
    const digits = normalizePhone(entry.phone_e164);
    if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
      throw new WhatsAppSettingsError(
        `${field}.phone_e164 is not a valid E.164 number`,
        `${field}.phone_e164`
      );
    }
    if (entry.note != null && typeof entry.note !== 'string') {
      throw new WhatsAppSettingsError(`${field}.note must be a string`, `${field}.note`);
    }
    if (entry.note && entry.note.length > MAX_NOTE_LENGTH) {
      throw new WhatsAppSettingsError(
        `${field}.note can be at most ${MAX_NOTE_LENGTH} characters`,
        `${field}.note`
      );
    }

    if (seen.has(digits)) {return;}
    seen.add(digits);
    const note = entry.note?.trim();
    contacts.push({ phone_e164: `+${digits}`, ...(note && { note }) });
  });
  return contacts;
};

/**
 * Merges a welcome_message update into the stored one (fields left out are kept, null
 * clears a field) and validates the result.
 * @returns {{enabled: boolean, image_url?: string, text?: string}}
 */
const mergeWelcomeMessage = (current, update) => {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    throw new WhatsAppSettingsError('welcome_message must be an object', 'welcome_message');
  }

  const merged = {
    enabled: current?.enabled === true,
    image_url: current?.image_url || undefined,
    text: current?.text || undefined
  };

  if (update.enabled !== undefined) {
    if (typeof update.enabled !== 'boolean') {
      throw new WhatsAppSettingsError('welcome_message.enabled must be a boolean', 'welcome_message.enabled');
    }
    merged.enabled = update.enabled;
  }
  for (const key of ['image_url', 'text']) {
    if (update[key] === undefined) {continue;}
    if (update[key] !== null && typeof update[key] !== 'string') {
      throw new WhatsAppSettingsError(`welcome_message.${key} must be a string`, `welcome_message.${key}`);
    }
    merged[key] = update[key]?.trim() || undefined;
  }

  if (merged.image_url) {
    let url;
    try {
      url = new URL(merged.image_url);
    } catch {
      url = null;
    }
    if (url?.protocol !== 'https:') {
      throw new WhatsAppSettingsError(
        'welcome_message.image_url must be a public HTTPS URL',
        'welcome_message.image_url'
      );
    }
  }
  if (merged.text) {
    const limit = merged.image_url ? MAX_CAPTION_LENGTH : MAX_TEXT_LENGTH;
    if (merged.text.length > limit) {
      throw new WhatsAppSettingsError(
        merged.image_url
          ? `welcome_message.text is sent as the image caption, which WhatsApp caps at ${MAX_CAPTION_LENGTH} characters`
          : `welcome_message.text can be at most ${MAX_TEXT_LENGTH} characters`,
        'welcome_message.text'
      );
    }
  }
  if (merged.enabled && !merged.image_url && !merged.text) {
    throw new WhatsAppSettingsError(
      'welcome_message needs an image_url or a text when enabled',
      'welcome_message'
    );
  }

  return merged;
};

/** Whether `userIdentifier` (the sender's wa_id) is on the config's ignored list. */
const isIgnoredContact = (whatsappConfig, userIdentifier) => {
  const contacts = whatsappConfig?.ignored_contacts;
  if (!contacts?.length) {return false;}
  const sender = normalizePhone(userIdentifier);
  return Boolean(sender) && contacts.some(contact => normalizePhone(contact.phone_e164) === sender);
};

/** The welcome message to send, or null when it is off or has nothing to send. */
const getActiveWelcomeMessage = whatsappConfig => {
  const welcome = whatsappConfig?.welcome_message;
  if (!welcome?.enabled || (!welcome.image_url && !welcome.text)) {return null;}
  return { image_url: welcome.image_url || null, text: welcome.text || null };
};

module.exports = {
  MAX_IGNORED_CONTACTS,
  WhatsAppSettingsError,
  normalizePhone,
  parseIgnoredContacts,
  mergeWelcomeMessage,
  isIgnoredContact,
  getActiveWelcomeMessage
};
