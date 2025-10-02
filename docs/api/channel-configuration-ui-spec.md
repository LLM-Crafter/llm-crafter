# Channel Configuration API - UI Developer Specification

## Overview

This document provides the complete API specification for building a management UI to configure multi-channel support (WhatsApp, Telegram, Email) for chatbot agents.

**Base URL**: `http://localhost:3000/api/v1/channels`

**Authentication**: All configuration endpoints require:

- Header: `Authorization: Bearer <JWT_TOKEN>`
- User must have appropriate organization permissions

---

## 📋 Quick Reference

| Method | Endpoint                                                                                    | Purpose                     |
| ------ | ------------------------------------------------------------------------------------------- | --------------------------- |
| GET    | `/organizations/:orgId/projects/:projectId/agents/:agentId/channels`                        | Get all channel configs     |
| PUT    | `/organizations/:orgId/projects/:projectId/agents/:agentId/channels`                        | Update channel configs      |
| GET    | `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/enabled`                | Get enabled channels list   |
| POST   | `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/:channel/test`          | Test channel connection     |
| POST   | `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/setup` | Setup Telegram webhook      |
| GET    | `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/info`  | Get Telegram webhook status |

---

## 🔧 Configuration Endpoints

### 1. Get Channel Configuration

**GET** `/organizations/:orgId/projects/:projectId/agents/:agentId/channels`

Get the current channel configuration for an agent.

**Path Parameters:**

- `orgId` (string, required) - Organization ID
- `projectId` (string, required) - Project ID
- `agentId` (string, required) - Agent ID

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Response 200 - Success:**

```json
{
  "success": true,
  "data": {
    "_id": "67012abc...",
    "agent": "670123...",
    "organization": "67011...",
    "project": "67012...",
    "whatsapp": {
      "enabled": true,
      "provider": "twilio",
      "account_sid": "AC1234...",
      "auth_token": "encrypted:...",
      "phone_number": "+14155551234",
      "verify_token": "my_secret_token"
    },
    "telegram": {
      "enabled": true,
      "bot_token": "encrypted:...",
      "bot_username": "mybot",
      "webhook_url": "https://example.com/api/v1/channels/webhooks/telegram/..."
    },
    "email": {
      "enabled": false,
      "provider": "smtp",
      "from_email": "bot@example.com",
      "from_name": "My Bot"
    },
    "analytics": {
      "total_messages_by_channel": {
        "whatsapp": 145,
        "telegram": 89,
        "email": 23
      },
      "last_whatsapp_message": "2025-10-01T10:30:00.000Z",
      "last_telegram_message": "2025-10-01T11:15:00.000Z"
    },
    "created_at": "2025-09-15T10:00:00.000Z",
    "updated_at": "2025-10-01T09:00:00.000Z"
  }
}
```

**Response 404 - Not Found:**

```json
{
  "success": false,
  "error": "Channel configuration not found"
}
```

---

### 2. Update Channel Configuration

**PUT** `/organizations/:orgId/projects/:projectId/agents/:agentId/channels`

Update or create channel configuration for an agent. Credentials are automatically encrypted.

**Path Parameters:**

- `orgId` (string, required)
- `projectId` (string, required)
- `agentId` (string, required)

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body Examples:**

#### Configure WhatsApp (Twilio):

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "twilio",
    "account_sid": "AC1234567890abcdef1234567890abcdef",
    "auth_token": "your_twilio_auth_token",
    "phone_number": "+14155551234",
    "verify_token": "optional_webhook_verification_token"
  }
}
```

#### Configure WhatsApp (Meta Cloud API):

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "meta",
    "phone_number_id": "123456789012345",
    "access_token": "your_meta_access_token",
    "verify_token": "webhook_verification_token",
    "business_account_id": "987654321098765"
  }
}
```

#### Configure WhatsApp (360Dialog):

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "360dialog",
    "api_key": "your_360dialog_api_key",
    "client_id": "your_client_id",
    "phone_number": "+14155551234"
  }
}
```

#### Configure Telegram:

```json
{
  "telegram": {
    "enabled": true,
    "bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "bot_username": "myawesomebot"
  }
}
```

#### Configure Email (SMTP):

```json
{
  "email": {
    "enabled": true,
    "provider": "smtp",
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_secure": false,
    "smtp_user": "your_email@gmail.com",
    "smtp_password": "your_app_password",
    "from_email": "bot@example.com",
    "from_name": "My Support Bot"
  }
}
```

#### Configure Email (SendGrid):

```json
{
  "email": {
    "enabled": true,
    "provider": "sendgrid",
    "api_key": "SG.1234567890abcdef...",
    "from_email": "bot@example.com",
    "from_name": "My Support Bot"
  }
}
```

#### Configure Email (Mailgun):

```json
{
  "email": {
    "enabled": true,
    "provider": "mailgun",
    "api_key": "key-1234567890abcdef...",
    "domain": "mg.example.com",
    "from_email": "bot@example.com",
    "from_name": "My Support Bot"
  }
}
```

#### Configure Email (AWS SES):

```json
{
  "email": {
    "enabled": true,
    "provider": "ses",
    "region": "us-east-1",
    "access_key_id": "AKIAIOSFODNN7EXAMPLE",
    "secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "from_email": "bot@example.com",
    "from_name": "My Support Bot"
  }
}
```

#### Update Multiple Channels at Once:

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "twilio",
    "account_sid": "AC123...",
    "auth_token": "token123",
    "phone_number": "+14155551234"
  },
  "telegram": {
    "enabled": true,
    "bot_token": "123456:ABC...",
    "bot_username": "mybot"
  },
  "email": {
    "enabled": true,
    "provider": "smtp",
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_user": "user@gmail.com",
    "smtp_password": "password",
    "from_email": "bot@example.com",
    "from_name": "My Bot"
  }
}
```

#### Disable a Channel:

```json
{
  "telegram": {
    "enabled": false
  }
}
```

**Response 200 - Success:**

```json
{
  "success": true,
  "data": {
    "_id": "67012abc...",
    "agent": "670123...",
    "whatsapp": {
      "enabled": true,
      "provider": "twilio",
      "phone_number": "+14155551234"
      // Sensitive fields like auth_token are returned as "encrypted:..."
    },
    "telegram": {
      "enabled": true,
      "bot_username": "mybot"
      // bot_token is returned as "encrypted:..."
    },
    "updated_at": "2025-10-01T12:00:00.000Z"
  },
  "message": "Channel configuration updated successfully"
}
```

**Response 400 - Validation Error:**

```json
{
  "success": false,
  "error": "Invalid configuration",
  "details": {
    "whatsapp": "Missing required field: account_sid for Twilio provider"
  }
}
```

**Response 404 - Agent Not Found:**

```json
{
  "success": false,
  "error": "Agent not found"
}
```

---

### 3. Get Enabled Channels

**GET** `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/enabled`

Get a simple list of enabled channels for an agent.

**Response 200:**

```json
{
  "success": true,
  "enabled_channels": ["whatsapp", "telegram"],
  "total": 2
}
```

---

### 4. Test Channel Connection

**POST** `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/:channel/test`

Test if a channel is properly configured and can send messages.

**Path Parameters:**

- `:channel` - Channel name: `whatsapp`, `telegram`, or `email`

**Request Body (optional):**

```json
{
  "test_recipient": "+14155551234"  // For WhatsApp
  // or
  "test_recipient": "123456789"      // For Telegram (chat_id)
  // or
  "test_recipient": "test@example.com"  // For Email
}
```

**Response 200 - Success:**

```json
{
  "success": true,
  "message": "Channel connection test successful",
  "channel": "telegram",
  "details": {
    "bot_username": "mybot",
    "bot_id": 123456789,
    "can_send_messages": true
  }
}
```

**Response 400 - Configuration Error:**

```json
{
  "success": false,
  "error": "Channel not configured or disabled",
  "channel": "telegram"
}
```

**Response 500 - Connection Failed:**

```json
{
  "success": false,
  "error": "Connection test failed",
  "details": "Invalid bot token"
}
```

---

### 5. Setup Telegram Webhook

**POST** `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/setup`

Automatically configure Telegram webhook with the correct URL.

**Request Body (optional):**

```json
{
  "webhook_url": "https://your-domain.com/api/v1/channels/webhooks/telegram/:agentId"
}
```

If not provided, uses the server's base URL automatically.

**Response 200:**

```json
{
  "success": true,
  "message": "Telegram webhook configured successfully",
  "webhook_url": "https://example.com/api/v1/channels/webhooks/telegram/670123..."
}
```

---

### 6. Get Telegram Webhook Info

**GET** `/organizations/:orgId/projects/:projectId/agents/:agentId/channels/telegram/webhook/info`

Get current Telegram webhook configuration status.

**Response 200:**

```json
{
  "success": true,
  "webhook_info": {
    "url": "https://example.com/api/v1/channels/webhooks/telegram/670123...",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": null,
    "max_connections": 40,
    "allowed_updates": ["message", "callback_query"]
  }
}
```

---

## 🎨 UI Implementation Guide

### Recommended UI Flow

#### 1. Channel Selection View

```
┌─────────────────────────────────────┐
│  Configure Channels for Agent       │
├─────────────────────────────────────┤
│                                     │
│  ☑ WhatsApp  [Configure]  [Test]   │
│  ☐ Telegram  [Configure]           │
│  ☐ Email     [Configure]           │
│                                     │
└─────────────────────────────────────┘
```

#### 2. WhatsApp Configuration Form

```
┌─────────────────────────────────────┐
│  WhatsApp Configuration              │
├─────────────────────────────────────┤
│  Provider: [Twilio ▼]               │
│                                     │
│  Account SID: [____________]        │
│  Auth Token:  [____________]        │
│  Phone Number: [+1__________]       │
│                                     │
│  [Test Connection] [Save] [Cancel] │
└─────────────────────────────────────┘
```

#### 3. Telegram Configuration Form

```
┌─────────────────────────────────────┐
│  Telegram Configuration              │
├─────────────────────────────────────┤
│  Bot Token: [____________:_______]  │
│  Bot Username: [@_____________]     │
│                                     │
│  ℹ️ Get token from @BotFather       │
│                                     │
│  [Setup Webhook] [Test] [Save]     │
└─────────────────────────────────────┘
```

#### 4. Email Configuration Form

```
┌─────────────────────────────────────┐
│  Email Configuration                 │
├─────────────────────────────────────┤
│  Provider: [SMTP ▼]                 │
│                                     │
│  SMTP Host: [smtp.gmail.com]       │
│  SMTP Port: [587]                   │
│  Secure: ☐ SSL/TLS                 │
│                                     │
│  Username: [____________]           │
│  Password: [____________]           │
│                                     │
│  From Email: [____________]         │
│  From Name:  [____________]         │
│                                     │
│  [Test Connection] [Save] [Cancel] │
└─────────────────────────────────────┘
```

### Form Validation Rules

#### WhatsApp (Twilio):

- `provider`: Required, must be "twilio"
- `account_sid`: Required, starts with "AC"
- `auth_token`: Required, 32 characters
- `phone_number`: Required, E.164 format (e.g., +14155551234)

#### WhatsApp (Meta):

- `provider`: Required, must be "meta"
- `phone_number_id`: Required, numeric
- `access_token`: Required
- `verify_token`: Required for webhook verification

#### WhatsApp (360Dialog):

- `provider`: Required, must be "360dialog"
- `api_key`: Required
- `phone_number`: Required, E.164 format

#### Telegram:

- `bot_token`: Required, format: `{bot_id}:{auth_token}`
- `bot_username`: Optional, starts with @

#### Email (SMTP):

- `smtp_host`: Required
- `smtp_port`: Required, numeric (common: 587, 465, 25)
- `smtp_user`: Required, valid email
- `smtp_password`: Required
- `from_email`: Required, valid email
- `from_name`: Optional

#### Email (SendGrid):

- `provider`: Must be "sendgrid"
- `api_key`: Required, starts with "SG."
- `from_email`: Required, verified in SendGrid
- `from_name`: Optional

#### Email (Mailgun):

- `provider`: Must be "mailgun"
- `api_key`: Required, starts with "key-"
- `domain`: Required
- `from_email`: Required

#### Email (AWS SES):

- `provider`: Must be "ses"
- `region`: Required (e.g., us-east-1)
- `access_key_id`: Required, starts with "AKIA"
- `secret_access_key`: Required
- `from_email`: Required, verified in SES

### Error Handling

Display user-friendly error messages:

```javascript
const errorMessages = {
  'Invalid configuration': 'Please check all required fields',
  'Channel not configured': 'This channel needs to be configured first',
  'Connection test failed': 'Unable to connect. Please verify credentials',
  'Agent not found': 'Agent does not exist',
  Unauthorized: "You don't have permission to modify this agent",
  'Invalid bot token': 'The Telegram bot token is invalid',
  'Webhook setup failed': 'Unable to configure webhook. Check bot permissions',
};
```

### Loading States

Show loading indicators during:

1. Fetching configuration (initial load)
2. Saving configuration
3. Testing connection
4. Setting up webhooks

### Success Messages

```javascript
const successMessages = {
  save: 'Channel configuration saved successfully',
  test: 'Connection test successful! Channel is working.',
  webhook: 'Telegram webhook configured successfully',
};
```

---

## 🔒 Security Considerations

1. **Sensitive Data**: All credentials (tokens, passwords, API keys) are automatically encrypted on the server. Never store them in plain text in your UI state.

2. **Display Encrypted Values**: When displaying saved configurations, sensitive fields will return as `"encrypted:..."`. Show this as `"••••••••"` or similar in the UI.

3. **Update vs Create**: When updating, users can leave sensitive fields empty to keep existing values. Only send the fields they want to change.

4. **Permissions**: The API checks organization-level permissions:
   - `agent:read` - View channel configurations
   - `agent:manage` - Modify channel configurations

---

## 📊 Analytics Display

Show channel usage statistics:

```javascript
// From GET /channels endpoint
const analytics = response.data.analytics;

{
  total_messages_by_channel: {
    whatsapp: 145,
    telegram: 89,
    email: 23
  },
  last_whatsapp_message: "2025-10-01T10:30:00.000Z",
  last_telegram_message: "2025-10-01T11:15:00.000Z",
  last_email_message: "2025-09-30T15:45:00.000Z"
}
```

Display as:

```
WhatsApp: 145 messages (last: 2 hours ago)
Telegram: 89 messages (last: 1 hour ago)
Email: 23 messages (last: 1 day ago)
```

---

## 🧪 Testing Workflow

Recommended testing flow for users:

1. **Configure Channel** → Save configuration
2. **Test Connection** → Verify credentials work
3. **Setup Webhook** (Telegram only) → Configure callback URL
4. **Send Test Message** → Use platform to send message to bot
5. **Verify Response** → Check if agent responds correctly

---

## 📝 Example Implementation (React)

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function ChannelConfiguration({ agentId, orgId, projectId, authToken }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const baseURL = `/api/v1/channels/organizations/${orgId}/projects/${projectId}/agents/${agentId}`;

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${baseURL}/channels`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setConfig(response.data.data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async channelData => {
    try {
      const response = await axios.put(`${baseURL}/channels`, channelData, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      alert('Configuration saved successfully!');
      fetchConfig(); // Reload
    } catch (error) {
      alert('Failed to save: ' + error.response?.data?.error);
    }
  };

  const testConnection = async channel => {
    try {
      const response = await axios.post(
        `${baseURL}/channels/${channel}/test`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      alert(`${channel} connection test successful!`);
    } catch (error) {
      alert(`Connection test failed: ${error.response?.data?.error}`);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>Channel Configuration</h2>

      <div>
        <h3>Telegram</h3>
        <input
          type="text"
          placeholder="Bot Token"
          onChange={e => {
            /* Update state */
          }}
        />
        <button
          onClick={() =>
            saveConfig({
              telegram: {
                enabled: true,
                bot_token: '...',
              },
            })
          }
        >
          Save
        </button>
        <button onClick={() => testConnection('telegram')}>Test</button>
      </div>

      {/* Repeat for other channels */}
    </div>
  );
}
```

---

## 🚀 Quick Start for UI Developer

1. **First API Call** - Get existing config:

```bash
GET /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels
```

2. **Configure Telegram** (easiest to test):

```bash
PUT /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels
Body: { "telegram": { "enabled": true, "bot_token": "YOUR_TOKEN" } }
```

3. **Test Connection**:

```bash
POST /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/test
```

4. **Setup Webhook** (for production):

```bash
POST /api/v1/channels/organizations/{orgId}/projects/{projectId}/agents/{agentId}/channels/telegram/webhook/setup
```

5. **Send message from Telegram** to your bot and watch it respond! 🎉

---

## 📚 Additional Resources

- **Full Documentation**: `/docs/features/multi-channel-support.md`
- **Quick Tutorial**: `/docs/features/multi-channel-quickstart.md`
- **Architecture**: `/ARCHITECTURE_DIAGRAM.md`
- **Implementation Details**: `/MULTI_CHANNEL_IMPLEMENTATION.md`

---

## ❓ Common Questions

**Q: Do I need to configure webhooks manually?**
A: For Telegram, use the auto-setup endpoint. For WhatsApp/Email, configure in your provider's dashboard.

**Q: Can I use multiple WhatsApp providers?**
A: Each agent can only use one WhatsApp provider at a time. Choose the one that fits your needs.

**Q: What happens to existing website conversations?**
A: They continue to work! The website channel is the default and always enabled.

**Q: How do I know which fields are required?**
A: Check the validation rules section above for each provider.

**Q: Can I update just one channel without affecting others?**
A: Yes! Send only the channel you want to update in the PUT request.

---

Need help? Check the troubleshooting section in `/docs/features/multi-channel-support.md`!
