# Multi-Channel Support

Complete guide for enabling and configuring multi-channel communication in LLM Crafter agents.

## Overview

LLM Crafter supports multiple communication channels, allowing your AI agents to interact with users across various platforms while maintaining unified conversation history.

### Supported Channels

- 📱 **WhatsApp** - Via Twilio, Meta Cloud API, or 360Dialog
- 💬 **Telegram** - Via Telegram Bot API
- 📧 **Email** - Via SMTP, SendGrid, Mailgun, or AWS SES
- 🌐 **Website** - Built-in web widget (default)

### Key Features

- **Unified Conversations** - All channels share the same conversation database
- **Context Preservation** - Seamless context across channels
- **Encrypted Credentials** - Secure storage of API keys and tokens
- **Channel Analytics** - Track usage per channel
- **Flexible Configuration** - Per-agent channel settings

## Quick Start

### Step 1: Choose a Channel

For the fastest setup, start with Telegram (requires no additional accounts):

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts
3. Save your bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 2: Configure Channel

```bash
curl -X PUT "http://localhost:3000/api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "telegram": {
      "enabled": true,
      "bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "bot_username": "my_ai_assistant_bot",
      "webhook_secret": "random_secret_123"
    }
  }'
```

### Step 3: Setup Webhook

```bash
curl -X POST "http://localhost:3000/api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/webhook/setup" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-domain.com/api/v1/channels/webhooks/telegram/{agentId}"
  }'
```

**Note:** For local testing, use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 3000
# Use the https URL provided
```

### Step 4: Test It

Send a message to your bot on Telegram - your agent should respond!

## Architecture

```
External Channel → Webhook → Channel Orchestrator → Agent Service → LLM
                                      ↓
                                Conversation DB
```

### Components

1. **Channel Services** - Handle channel-specific communication
2. **Channel Orchestrator** - Routes messages and manages conversations
3. **Channel Configuration** - Stores encrypted channel settings
4. **Conversation Model** - Unified storage with channel metadata

## Channel Setup Guides

### WhatsApp

#### Option 1: Twilio (Recommended for Development)

**Prerequisites:**

- Twilio account (https://www.twilio.com)
- WhatsApp-enabled phone number

**Configuration:**

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

**Webhook Setup:**

1. Go to Twilio Console → WhatsApp → Sandbox
2. Configure webhook URL: `https://your-domain.com/api/v1/channels/webhooks/whatsapp/{agentId}`
3. Test by sending "join [your-sandbox-code]" to your Twilio number

#### Option 2: Meta Cloud API (Production)

**Prerequisites:**

- Meta Business account
- WhatsApp Business API access

**Configuration:**

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "meta",
    "phone_number": "+14155551234",
    "verify_token": "your_verify_token",
    "credentials": {
      "phone_number_id": "123456789",
      "access_token": "your_access_token",
      "business_account_id": "987654321"
    }
  }
}
```

**Webhook Setup:**

1. Configure webhook in Meta App Dashboard
2. URL: `https://your-domain.com/api/v1/channels/webhooks/whatsapp/{agentId}`
3. Verify token: Use the same token from configuration
4. Subscribe to message webhooks

#### Option 3: 360Dialog

**Prerequisites:**

- 360Dialog account (https://www.360dialog.com)

**Configuration:**

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "360dialog",
    "phone_number": "+14155551234",
    "credentials": {
      "api_key": "your_360dialog_api_key",
      "client_id": "your_client_id"
    }
  }
}
```

### Telegram

**Prerequisites:**

- Telegram account
- Bot token from @BotFather

**Configuration:**

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

**Webhook Setup:**

```bash
curl -X POST "https://your-domain.com/api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/webhook/setup" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-domain.com/api/v1/channels/webhooks/telegram/{agentId}"
  }'
```

**Verify Webhook:**

```bash
curl -X GET "https://your-domain.com/api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/webhook/info" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Email

#### Option 1: SMTP (Gmail)

**Prerequisites:**

- Google account with 2FA enabled
- App password generated (https://myaccount.google.com/apppasswords)

**Configuration:**

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
      "username": "your-email@gmail.com",
      "password": "your_app_password"
    }
  }
}
```

#### Option 2: SendGrid

**Prerequisites:**

- SendGrid account (https://sendgrid.com)
- API key with mail send permissions

**Configuration:**

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

#### Option 3: Mailgun

**Configuration:**

```json
{
  "email": {
    "enabled": true,
    "provider": "mailgun",
    "from_email": "support@yourdomain.com",
    "from_name": "Support Team",
    "api_keys": {
      "mailgun": "your_mailgun_api_key"
    },
    "mailgun_config": {
      "domain": "mg.yourdomain.com"
    }
  }
}
```

#### Option 4: AWS SES

**Configuration:**

```json
{
  "email": {
    "enabled": true,
    "provider": "ses",
    "from_email": "support@yourdomain.com",
    "from_name": "Support Team",
    "ses_config": {
      "region": "us-east-1",
      "access_key_id": "your_access_key",
      "secret_access_key": "your_secret_key"
    }
  }
}
```

**Incoming Email:**
For receiving emails, configure your email provider to forward to:
`https://your-domain.com/api/v1/channels/webhooks/email/{agentId}`

### Website

Website chat is enabled by default for all agents.

**Configuration:**

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

## API Reference

### Get Channel Configuration

Retrieve current channel settings for an agent.

```http
GET /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels
```

**Response:**

```json
{
  "success": true,
  "data": {
    "agent": "agent_123",
    "whatsapp": {
      "enabled": true,
      "provider": "twilio",
      "phone_number": "+14155551234"
    },
    "telegram": {
      "enabled": true,
      "bot_username": "my_bot"
    },
    "email": {
      "enabled": false
    },
    "website": {
      "enabled": true
    },
    "analytics": {
      "total_messages_by_channel": {
        "whatsapp": 145,
        "telegram": 89,
        "website": 567
      }
    }
  }
}
```

### Update Channel Configuration

Update or create channel configuration.

```http
PUT /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels
```

**Request Body:**

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "twilio",
    "phone_number": "+14155551234",
    "credentials": {
      "account_sid": "ACxxxx",
      "auth_token": "your_token"
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Channel configuration updated successfully"
}
```

### Get Enabled Channels

List all enabled channels for an agent.

```http
GET /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/enabled
```

**Response:**

```json
{
  "agent_id": "agent_123",
  "enabled_channels": ["whatsapp", "telegram", "website"]
}
```

### Test Channel Connection

Test if a channel is properly configured.

```http
POST /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/{channel}/test
```

**Channels:** `whatsapp`, `telegram`, `email`

**Response (Success):**

```json
{
  "success": true,
  "message": "Telegram connection test successful",
  "details": {
    "bot_username": "my_bot",
    "webhook_set": true
  }
}
```

**Response (Failure):**

```json
{
  "success": false,
  "error": "Failed to connect to Telegram API",
  "details": "Invalid bot token"
}
```

### Telegram Webhook Management

**Setup Webhook:**

```http
POST /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/webhook/setup
```

**Request Body:**

```json
{
  "webhook_url": "https://your-domain.com/api/v1/channels/webhooks/telegram/{agentId}"
}
```

**Get Webhook Info:**

```http
GET /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/webhook/info
```

**Response:**

```json
{
  "success": true,
  "webhook_info": {
    "url": "https://your-domain.com/api/v1/channels/webhooks/telegram/agent_123",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": null,
    "max_connections": 40
  }
}
```

## Conversation Model

Conversations include channel metadata:

```javascript
{
  "_id": "conv_123",
  "agent": "agent_123",
  "user_identifier": "user_456",
  "channel": "telegram",  // 'whatsapp', 'telegram', 'email', 'website'
  "channel_metadata": {
    "platform_user_id": "telegram:123456789",
    "chat_id": "123456789",
    "username": "@johndoe"
  },
  "channel_history": [
    {
      "channel": "website",
      "timestamp": "2024-10-01T10:00:00Z",
      "message_count": 5
    },
    {
      "channel": "telegram",
      "timestamp": "2024-10-01T11:00:00Z",
      "message_count": 3
    }
  ],
  "messages": [ /* ... */ ],
  "status": "active"
}
```

## Security

### Credential Encryption

- All sensitive credentials (API keys, tokens, passwords) are encrypted using AES-256-GCM
- Credentials are encrypted at rest in the database
- Decryption only happens when sending messages
- Credentials are never exposed in API responses

### Access Control

- Channel configuration requires organization member role or higher
- Webhook endpoints validate authenticity (tokens, signatures)
- Rate limiting applied to prevent abuse

### Webhook Validation

**WhatsApp (Meta):** Validates `X-Hub-Signature-256` header
**Telegram:** Validates webhook secret token
**Email:** Validates sender addresses and SPF/DKIM

## Database Indexes

Recommended indexes for performance:

```javascript
// Conversations
db.conversations.createIndex({ agent: 1, channel: 1, status: 1 });
db.conversations.createIndex({ channel: 1, 'metadata.last_activity': 1 });
db.conversations.createIndex({ 'channel_metadata.platform_user_id': 1 });

// Channel Configurations
db.channelconfigs.createIndex({ agent: 1 }, { unique: true });
db.channelconfigs.createIndex({ organization: 1, project: 1 });
```

## Troubleshooting

### Webhook Not Receiving Messages

**Telegram:**

1. Verify webhook is set: `GET /channels/telegram/webhook/info`
2. Check webhook URL is publicly accessible (HTTPS required)
3. Verify bot token is correct
4. Test connection: `POST /channels/telegram/test`

**WhatsApp:**

1. Verify webhook is configured in Twilio/Meta console
2. Check webhook URL matches agent ID
3. Verify credentials (account SID, auth token, etc.)
4. Test connection: `POST /channels/whatsapp/test`

### Messages Not Sending

**Check Logs:**

```bash
tail -f server.log | grep -i channel
```

**Common Issues:**

- Invalid credentials (check configuration)
- Rate limiting (check provider limits)
- Incorrect phone number format (use E.164 format: +14155551234)
- Missing permissions (check API key scopes)

### Channel Configuration Not Saving

1. Verify user has proper permissions
2. Check agent exists and is accessible
3. Validate JSON format in request body
4. Check server logs for encryption errors

## Best Practices

### Development

1. **Use Sandbox Environments**: Test with Twilio sandbox, Telegram test bots
2. **Local Testing**: Use ngrok for webhook testing
3. **Separate Credentials**: Use different credentials for dev/staging/prod

### Production

1. **HTTPS Required**: All webhooks must use HTTPS
2. **Monitor Rate Limits**: Track API usage per provider
3. **Credential Rotation**: Regularly update API keys and tokens
4. **Backup Credentials**: Store encrypted backups securely
5. **Error Handling**: Implement retry logic with exponential backoff

### Performance

1. **Use Indexes**: Ensure database indexes are created
2. **Cache Channel Configs**: Channel orchestrator caches configurations
3. **Async Processing**: Webhook processing is non-blocking
4. **Connection Pooling**: Reuse HTTP connections to providers

## Analytics

Track channel usage through the analytics field:

```javascript
{
  "analytics": {
    "total_messages_by_channel": {
      "whatsapp": 145,
      "telegram": 89,
      "email": 23,
      "website": 567
    },
    "last_whatsapp_message": "2024-10-01T10:30:00Z",
    "last_telegram_message": "2024-10-01T11:15:00Z",
    "last_email_message": "2024-10-01T09:45:00Z",
    "last_website_message": "2024-10-01T12:00:00Z"
  }
}
```

## Advanced Features

### Cross-Channel Conversations

Users can continue conversations across channels:

```javascript
// User starts on website
POST /api/chat { channel: 'website', user_identifier: 'user@email.com' }

// User continues on Telegram
POST /webhooks/telegram { chat_id: 123, text: 'continue chat' }
// System links based on email/phone if configured
```

### Channel-Specific Responses

Agents can customize responses per channel:

```javascript
// In system prompt
"When responding on WhatsApp, use emojis frequently.
On Email, be formal and detailed.
On Telegram, keep responses concise."
```

### Rich Media Support

**WhatsApp:** Images, documents, location
**Telegram:** Photos, videos, files, inline keyboards
**Email:** HTML formatting, attachments
**Website:** Markdown, code blocks, buttons

## Migration Guide

### Existing Conversations

Existing conversations automatically default to 'website' channel for backward compatibility. No migration needed.

### Adding Channels to Existing Agents

1. Configure channel using PUT endpoint
2. Setup webhooks for Telegram/WhatsApp
3. Test connection
4. Enable in production

## Additional Resources

- [Twilio WhatsApp Documentation](https://www.twilio.com/docs/whatsapp)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Meta WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [SendGrid Documentation](https://docs.sendgrid.com/)
- [LLM Crafter Agent Documentation](/concepts/agents)
- [Conversation Management](/concepts/conversations)
