# Multi-Channel Support Documentation

## Overview

LLM Crafter now supports multiple communication channels, allowing your AI agents to interact with users across:

- 📱 **WhatsApp** (via Twilio, Meta Cloud API, or 360Dialog)
- 💬 **Telegram** (via Telegram Bot API)
- 📧 **Email** (via SMTP, SendGrid, Mailgun, AWS SES)
- 🌐 **Website** (existing web widget)

All conversations are unified in a single database, allowing seamless context preservation across channels.

## Architecture

```
External Channels → Channel Services → Channel Orchestrator → Agent Service → LLM
                                                ↓
                                         Conversation DB
```

### Key Components

1. **Channel Services** (`src/services/channels/`)

   - `baseChannelService.js` - Abstract base class
   - `whatsappService.js` - WhatsApp integration
   - `telegramService.js` - Telegram integration
   - `emailService.js` - Email integration

2. **Channel Orchestrator** (`src/services/channelOrchestrator.js`)

   - Routes messages to appropriate channel services
   - Manages conversation context across channels
   - Handles channel initialization and caching

3. **Channel Configuration Model** (`src/models/ChannelConfig.js`)

   - Stores channel-specific settings per agent
   - Encrypts sensitive credentials
   - Tracks analytics per channel

4. **Updated Conversation Model** (`src/models/Conversation.js`)
   - Added `channel` field
   - Added `channel_metadata` for channel-specific data
   - Added `channel_history` for cross-channel tracking

## Setup Guide

### 1. Install Dependencies

```bash
npm install
```

The following new dependency has been added:

- `nodemailer` - For email support

### 2. Database Migration

The existing conversations will continue to work. New fields are optional and default to 'website' for backward compatibility.

No migration script is needed, but you can verify indexes:

```javascript
// MongoDB shell
db.conversations.createIndex({ agent: 1, channel: 1, status: 1 });
db.conversations.createIndex({ channel: 1, 'metadata.last_activity': 1 });
```

### 3. Configure Channels for an Agent

#### Via API

```bash
# Update channel configuration
curl -X PUT http://localhost:3000/api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp": {
      "enabled": true,
      "provider": "twilio",
      "phone_number": "+14155551234",
      "credentials": {
        "account_sid": "ACxxxxxxxxxxxx",
        "auth_token": "your_auth_token"
      }
    }
  }'
```

## Channel-Specific Setup

### WhatsApp Setup

#### Option 1: Twilio

1. Create a Twilio account at https://www.twilio.com
2. Get a WhatsApp-enabled phone number
3. Configure webhook URL: `https://your-domain.com/api/v1/channels/webhooks/whatsapp/{agentId}`
4. Update channel configuration:

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "twilio",
    "phone_number": "+14155551234",
    "credentials": {
      "account_sid": "ACxxxxxxxxxxxx",
      "auth_token": "your_auth_token"
    }
  }
}
```

#### Option 2: Meta Cloud API

1. Create a Meta Business account
2. Set up WhatsApp Business API
3. Configure webhook:
   - URL: `https://your-domain.com/api/v1/channels/webhooks/whatsapp/{agentId}`
   - Verify token: Generate a random string
4. Update channel configuration:

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "meta",
    "phone_number": "+14155551234",
    "verify_token": "your_verify_token",
    "credentials": {
      "phone_number_id": "123456789",
      "access_token": "your_access_token"
    }
  }
}
```

### Telegram Setup

1. Create a bot via [@BotFather](https://t.me/botfather)
2. Get your bot token
3. Configure your bot:

```json
{
  "telegram": {
    "enabled": true,
    "bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "bot_username": "your_bot_username",
    "webhook_secret": "random_secret_string"
  }
}
```

4. Setup webhook:

```bash
curl -X POST http://localhost:3000/api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/webhook/setup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-domain.com/api/v1/channels/webhooks/telegram/{agentId}"
  }'
```

### Email Setup

#### Option 1: SMTP

```json
{
  "email": {
    "enabled": true,
    "provider": "smtp",
    "from_email": "support@yourdomain.com",
    "from_name": "Support Team",
    "smtp_config": {
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "username": "your_email@gmail.com",
      "password": "your_app_password"
    }
  }
}
```

#### Option 2: SendGrid

```json
{
  "email": {
    "enabled": true,
    "provider": "sendgrid",
    "from_email": "support@yourdomain.com",
    "from_name": "Support Team",
    "api_keys": {
      "sendgrid": "SG.xxxxxxxxxxxx"
    }
  }
}
```

For incoming emails, configure your email provider to forward to:
`https://your-domain.com/api/v1/channels/webhooks/email/{agentId}`

### Website Setup

Website chat is enabled by default for backward compatibility:

```json
{
  "website": {
    "enabled": true,
    "theme": {
      "primary_color": "#0084ff",
      "position": "bottom-right",
      "greeting_message": "Hello! How can I help you?"
    }
  }
}
```

## API Endpoints

### Configuration Endpoints

```
GET    /api/v1/channels/organizations/:orgId/projects/:projectId/agents/:agentId/channels
PUT    /api/v1/channels/organizations/:orgId/projects/:projectId/agents/:agentId/channels
GET    /api/v1/channels/organizations/:orgId/projects/:projectId/agents/:agentId/channels/enabled
POST   /api/v1/channels/organizations/:orgId/projects/:projectId/agents/:agentId/channels/:channel/test
```

### Webhook Endpoints (Public)

```
GET/POST /api/v1/channels/webhooks/whatsapp/:agentId
POST     /api/v1/channels/webhooks/telegram/:agentId
POST     /api/v1/channels/webhooks/email/:agentId
```

### Telegram Specific

```
POST /api/v1/channels/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/setup
GET  /api/v1/channels/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/info
```

## Testing Channels

### Test Connection

```bash
curl -X POST http://localhost:3000/api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```json
{
  "success": true,
  "bot_info": {
    "id": 123456789,
    "is_bot": true,
    "first_name": "Your Bot",
    "username": "your_bot"
  }
}
```

### Send Test Message

#### WhatsApp (via Twilio Console)

Send a message to your WhatsApp number

#### Telegram

Send a message to your bot: `https://t.me/your_bot_username`

#### Email

Send an email to the configured address

## How It Works

### Message Flow

1. **External platform** (WhatsApp/Telegram/Email) sends webhook to your server
2. **Channel Controller** receives the webhook
3. **Channel Service** normalizes the message to unified format
4. **Channel Orchestrator** finds or creates conversation
5. **Agent Service** processes message (existing logic)
6. **Channel Orchestrator** sends response back through appropriate channel

### Conversation Continuity

All messages are stored in a unified conversation with:

- `channel`: The channel name (whatsapp, telegram, email, website)
- `channel_metadata`: Channel-specific information (phone number, chat ID, email address)
- `user_identifier`: Unique identifier per channel (e.g., `telegram_123456`)

Users can switch channels and continue the same conversation if you implement identifier mapping.

## Security

### Credential Encryption

All sensitive credentials are encrypted using your existing encryption utility:

- WhatsApp tokens
- Telegram bot tokens
- Email passwords
- API keys

### Webhook Validation

Each channel service validates incoming webhooks:

- **WhatsApp (Twilio)**: Validates X-Twilio-Signature
- **WhatsApp (Meta)**: Validates X-Hub-Signature-256
- **Telegram**: Validates secret token
- **Email**: Provider-specific validation

## Analytics

Track channel usage via the `ChannelConfig` model:

```javascript
{
  "analytics": {
    "total_messages_by_channel": {
      "whatsapp": 150,
      "telegram": 89,
      "email": 45,
      "website": 320
    },
    "last_whatsapp_message": "2024-10-01T10:30:00Z",
    "last_telegram_message": "2024-10-01T09:15:00Z"
  }
}
```

## Troubleshooting

### WhatsApp messages not being received

1. Check webhook URL is correctly configured
2. Verify phone number is WhatsApp-enabled
3. Check server logs for incoming webhook requests
4. Validate credentials are correct and not expired

### Telegram bot not responding

1. Verify bot token is correct
2. Check webhook is set up: `GET /channels/.../telegram/webhook/info`
3. Ensure webhook URL is HTTPS (required by Telegram)
4. Check bot username matches configuration

### Email not sending

1. Test SMTP connection: `POST /channels/.../email/test`
2. Check SMTP credentials and port
3. For Gmail, use App Password instead of regular password
4. Verify firewall allows outbound SMTP connections

### Channel not initialized

Clear the orchestrator cache and reinitialize:

```javascript
channelOrchestrator.clearAgentCache(agentId);
await channelOrchestrator.initializeChannelsForAgent(agentId);
```

## Advanced Features

### Cross-Channel Handoff

Track when a user switches channels:

```javascript
conversation.channel_history.push({
  channel: 'telegram',
  switched_at: new Date(),
  reason: 'User preferred Telegram',
});
```

### Channel-Specific Features

Each channel service supports unique features:

**Telegram**:

- Inline keyboards
- Typing indicators
- Button callbacks

**WhatsApp**:

- Media messages (images, videos, documents)
- Location sharing
- Contact cards

**Email**:

- HTML formatting
- Attachments
- Thread management

### Business Hours

Configure business hours per agent:

```json
{
  "global_settings": {
    "business_hours": {
      "enabled": true,
      "schedule": {
        "monday": { "start": "09:00", "end": "17:00" },
        "tuesday": { "start": "09:00", "end": "17:00" }
      },
      "out_of_hours_message": "We're currently closed. We'll respond during business hours."
    }
  }
}
```

## Extending to New Channels

To add a new channel:

1. Create a new service extending `BaseChannelService`
2. Implement required methods:

   - `sendMessage()`
   - `handleIncomingMessage()`
   - `extractUserIdentifier()`
   - `extractContent()`
   - `extractChannelMetadata()`

3. Add configuration to `ChannelConfig` model
4. Register in `ChannelOrchestrator`
5. Create webhook endpoint in `channelController`

Example for Slack:

```javascript
// services/channels/slackService.js
class SlackService extends BaseChannelService {
  constructor(channelConfig) {
    super(channelConfig, 'slack');
  }

  async sendMessage(recipient, message, options = {}) {
    // Implement Slack API call
  }

  // ... other methods
}
```

## Migration from Existing System

Your existing website chat will continue to work without changes. To migrate:

1. Existing conversations will default to `channel: 'website'`
2. No data loss - all fields are optional
3. New conversations will use the appropriate channel
4. Analytics will show website as the primary channel initially

## Performance Considerations

- Channel services are cached per agent
- Webhooks respond quickly (<200ms) and process asynchronously
- Conversation lookup is indexed by `agent`, `channel`, and `user_identifier`
- Credentials are only decrypted when needed

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Configure your first channel (recommend starting with Telegram - easiest)
3. ✅ Test with a simple message
4. ✅ Monitor logs for any issues
5. ✅ Configure additional channels as needed
6. 🔄 Build admin UI for channel configuration (optional)

## Support

For issues or questions:

1. Check server logs in `server.log`
2. Review webhook delivery in external platform dashboards
3. Test channel connections via API
4. Check MongoDB for conversation records

---

**Congratulations!** 🎉 Your AI agents can now communicate across multiple channels!
