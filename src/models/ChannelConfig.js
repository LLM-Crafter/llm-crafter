const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const channelConfigSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    agent: {
      type: String,
      ref: 'Agent',
      required: true,
      unique: true, // One config per agent
    },
    organization: {
      type: String,
      ref: 'Organization',
      required: true,
    },
    project: {
      type: String,
      ref: 'Project',
      required: true,
    },
    // WhatsApp Configuration
    whatsapp: {
      enabled: {
        type: Boolean,
        default: false,
      },
      provider: {
        type: String,
        enum: ['twilio', 'meta', '360dialog'],
        default: 'twilio',
      },
      phone_number: String,
      // Provider-specific credentials (encrypted)
      credentials: {
        // Twilio
        account_sid: String,
        auth_token: String, // Encrypted
        // Meta Cloud API
        phone_number_id: String,
        access_token: String, // Encrypted
        // 360Dialog
        api_key: String, // Encrypted
      },
      webhook_url: String,
      verify_token: String, // For Meta webhook verification
      business_profile: {
        description: String,
        address: String,
        email: String,
        website: String,
      },
      settings: {
        auto_reply_delay_ms: {
          type: Number,
          default: 1000,
        },
        mark_as_read: {
          type: Boolean,
          default: true,
        },
      },
    },
    // Telegram Configuration
    telegram: {
      enabled: {
        type: Boolean,
        default: false,
      },
      bot_token: String, // Encrypted
      bot_username: String,
      webhook_url: String,
      webhook_secret: String,
      allowed_chats: [String], // Optional: restrict to specific chat IDs
      settings: {
        parse_mode: {
          type: String,
          enum: ['Markdown', 'HTML', 'MarkdownV2'],
          default: 'Markdown',
        },
        show_typing_indicator: {
          type: Boolean,
          default: true,
        },
        enable_inline_keyboard: {
          type: Boolean,
          default: false,
        },
      },
    },
    // Email Configuration
    email: {
      enabled: {
        type: Boolean,
        default: false,
      },
      provider: {
        type: String,
        enum: ['sendgrid', 'mailgun', 'ses', 'smtp'],
        default: 'smtp',
      },
      from_email: {
        type: String,
        trim: true,
      },
      from_name: {
        type: String,
        trim: true,
      },
      // SMTP Configuration
      smtp_config: {
        host: String,
        port: Number,
        secure: Boolean, // true for 465, false for other ports
        username: String,
        password: String, // Encrypted
      },
      // IMAP Configuration (for receiving)
      imap_config: {
        enabled: {
          type: Boolean,
          default: false,
        },
        host: String,
        port: Number,
        username: String,
        password: String, // Encrypted
        tls: {
          type: Boolean,
          default: true,
        },
        polling_interval: {
          type: Number,
          default: 60, // seconds
        },
      },
      // Provider-specific API keys
      api_keys: {
        sendgrid: String, // Encrypted
        mailgun: String, // Encrypted
        ses_access_key: String, // Encrypted
        ses_secret_key: String, // Encrypted
        ses_region: String,
      },
      settings: {
        auto_reply_subjects: [String], // Which subjects to auto-respond to
        signature: String,
        include_conversation_history: {
          type: Boolean,
          default: true,
        },
        max_thread_depth: {
          type: Number,
          default: 10,
        },
      },
    },
    // Website Widget Configuration
    website: {
      enabled: {
        type: Boolean,
        default: true, // Default to enabled for backward compatibility
      },
      allowed_origins: [String],
      theme: {
        primary_color: {
          type: String,
          default: '#0084ff',
        },
        position: {
          type: String,
          enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
          default: 'bottom-right',
        },
        greeting_message: String,
        avatar_url: String,
        bot_name: String,
      },
      features: {
        file_upload: {
          type: Boolean,
          default: false,
        },
        typing_indicator: {
          type: Boolean,
          default: true,
        },
        read_receipts: {
          type: Boolean,
          default: false,
        },
        message_sounds: {
          type: Boolean,
          default: true,
        },
        emojis: {
          type: Boolean,
          default: true,
        },
      },
      branding: {
        show_powered_by: {
          type: Boolean,
          default: true,
        },
        custom_logo_url: String,
      },
    },
    // Global settings across all channels
    global_settings: {
      default_language: {
        type: String,
        default: 'en',
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      business_hours: {
        enabled: {
          type: Boolean,
          default: false,
        },
        schedule: mongoose.Schema.Types.Mixed, // {monday: {start: '09:00', end: '17:00'}, ...}
        out_of_hours_message: String,
      },
      rate_limiting: {
        enabled: {
          type: Boolean,
          default: true,
        },
        max_messages_per_minute: {
          type: Number,
          default: 10,
        },
        max_messages_per_hour: {
          type: Number,
          default: 100,
        },
      },
    },
    // Analytics and monitoring
    analytics: {
      last_whatsapp_message: Date,
      last_telegram_message: Date,
      last_email_message: Date,
      last_website_message: Date,
      total_messages_by_channel: {
        whatsapp: {
          type: Number,
          default: 0,
        },
        telegram: {
          type: Number,
          default: 0,
        },
        email: {
          type: Number,
          default: 0,
        },
        website: {
          type: Number,
          default: 0,
        },
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        // Don't expose sensitive credentials
        if (ret.whatsapp?.credentials) {
          ret.whatsapp.credentials = {
            configured: !!(
              ret.whatsapp.credentials.auth_token ||
              ret.whatsapp.credentials.access_token ||
              ret.whatsapp.credentials.api_key
            ),
          };
        }
        if (ret.telegram?.bot_token) {
          ret.telegram.bot_token = '***REDACTED***';
        }
        if (ret.email?.smtp_config?.password) {
          ret.email.smtp_config.password = '***REDACTED***';
        }
        if (ret.email?.imap_config?.password) {
          ret.email.imap_config.password = '***REDACTED***';
        }
        if (ret.email?.api_keys) {
          Object.keys(ret.email.api_keys).forEach(key => {
            if (ret.email.api_keys[key]) {
              ret.email.api_keys[key] = '***REDACTED***';
            }
          });
        }
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes
channelConfigSchema.index({ agent: 1 });
channelConfigSchema.index({ organization: 1 });
channelConfigSchema.index({ project: 1 });

// Instance methods
channelConfigSchema.methods.isChannelEnabled = function (channel) {
  if (!this[channel]) return false;
  return this[channel].enabled === true;
};

channelConfigSchema.methods.getEnabledChannels = function () {
  const enabled = [];
  if (this.whatsapp?.enabled) enabled.push('whatsapp');
  if (this.telegram?.enabled) enabled.push('telegram');
  if (this.email?.enabled) enabled.push('email');
  if (this.website?.enabled) enabled.push('website');
  return enabled;
};

channelConfigSchema.methods.updateAnalytics = function (channel) {
  const now = new Date();
  switch (channel) {
    case 'whatsapp':
      this.analytics.last_whatsapp_message = now;
      this.analytics.total_messages_by_channel.whatsapp += 1;
      break;
    case 'telegram':
      this.analytics.last_telegram_message = now;
      this.analytics.total_messages_by_channel.telegram += 1;
      break;
    case 'email':
      this.analytics.last_email_message = now;
      this.analytics.total_messages_by_channel.email += 1;
      break;
    case 'website':
      this.analytics.last_website_message = now;
      this.analytics.total_messages_by_channel.website += 1;
      break;
  }
  return this.save();
};

module.exports = mongoose.model('ChannelConfig', channelConfigSchema);
