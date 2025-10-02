# Multi-Channel Quick Start Guide

This guide will help you get your first multi-channel agent running in 10 minutes!

## Prerequisites

- LLM Crafter installed and running
- An agent already created
- Access to one messaging platform (we'll use Telegram for this guide)

## Step 1: Install Dependencies (30 seconds)

```bash
npm install
```

## Step 2: Create a Telegram Bot (2 minutes)

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow the prompts:
   - Choose a name: "My AI Assistant"
   - Choose a username: "my_ai_assistant_bot" (must end with 'bot')
4. Save the bot token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## Step 3: Configure Channel for Your Agent (2 minutes)

Replace the placeholders with your values:

```bash
curl -X PUT http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "telegram": {
      "enabled": true,
      "bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "bot_username": "my_ai_assistant_bot",
      "webhook_secret": "my_random_secret_123"
    }
  }'
```

## Step 4: Setup Telegram Webhook (1 minute)

```bash
curl -X POST http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels/telegram/webhook/setup \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-public-domain.com/api/v1/channels/webhooks/telegram/{YOUR_AGENT_ID}"
  }'
```

**Important**:

- Your server must be publicly accessible (HTTPS required for Telegram)
- For local testing, use [ngrok](https://ngrok.com):
  ```bash
  ngrok http 3000
  # Use the https URL provided by ngrok
  ```

## Step 5: Test It! (1 minute)

1. Open Telegram
2. Search for your bot: `@my_ai_assistant_bot`
3. Send a message: "Hello!"
4. Your AI agent should respond! 🎉

## Verify It's Working

Check your server logs:

```bash
tail -f server.log
```

You should see:

```
[ChannelOrchestrator] Handling telegram message for agent {agentId}
[Telegram] Message sent, chatId: 123456, messageId: 789
[ChannelOrchestrator] Response sent via telegram to 123456
```

## What Just Happened?

1. Telegram sent a webhook to your server when user messaged your bot
2. Channel Orchestrator received and normalized the message
3. Your existing Agent Service processed it (same logic as website chat!)
4. Response was sent back through Telegram

## Add More Channels

### WhatsApp (5 minutes)

1. Sign up for [Twilio](https://www.twilio.com)
2. Get a WhatsApp sandbox number
3. Configure:

```bash
curl -X PUT http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
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

4. In Twilio console, set webhook URL:
   ```
   https://your-domain.com/api/v1/channels/webhooks/whatsapp/{YOUR_AGENT_ID}
   ```

### Email (3 minutes)

Using Gmail:

1. Enable 2FA on your Google account
2. Generate an [App Password](https://myaccount.google.com/apppasswords)
3. Configure:

```bash
curl -X PUT http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": {
      "enabled": true,
      "provider": "smtp",
      "from_email": "your-email@gmail.com",
      "from_name": "Support Team",
      "smtp_config": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "username": "your-email@gmail.com",
        "password": "your_app_password"
      }
    }
  }'
```

Note: For receiving emails, you'll need to implement IMAP polling or use a service like SendGrid for inbound webhooks.

## Testing Multiple Channels

Test your agent across all channels:

```bash
# Test Telegram
curl -X POST http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels/telegram/test \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"

# Test Email
curl -X POST http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels/email/test \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

## View Enabled Channels

```bash
curl -X GET http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels/enabled \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

Response:

```json
{
  "agent_id": "agent_123",
  "enabled_channels": ["telegram", "whatsapp", "email", "website"]
}
```

## Check Conversation in Database

```bash
# MongoDB shell
mongosh

use llm_crafter
db.conversations.find({
  agent: "YOUR_AGENT_ID",
  channel: "telegram"
}).pretty()
```

You should see:

```javascript
{
  _id: "conv_abc123",
  agent: "agent_123",
  channel: "telegram",
  user_identifier: "telegram_123456789",
  channel_metadata: {
    telegram: {
      chat_id: 123456789,
      username: "john_doe",
      first_name: "John"
    }
  },
  messages: [
    {
      role: "user",
      content: "Hello!",
      channel_info: {
        channel: "telegram",
        message_id: "789"
      }
    },
    {
      role: "assistant",
      content: "Hi John! How can I help you today?"
    }
  ]
}
```

## Troubleshooting

### "Channel not configured"

- Verify channel is enabled in your configuration
- Check server logs for initialization errors
- Try clearing cache: The orchestrator auto-reinitializes on first message

### Telegram bot not responding

- Ensure webhook URL is HTTPS
- Check webhook status:
  ```bash
  curl -X GET http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels/telegram/webhook/info \
    -H "Authorization: Bearer YOUR_AUTH_TOKEN"
  ```
- Verify your server is publicly accessible

### WhatsApp messages not arriving

- Check Twilio webhook logs in console
- Ensure webhook URL matches exactly
- Verify account SID and auth token are correct

### Email not sending

- Test SMTP connection first
- For Gmail, must use App Password, not regular password
- Check firewall/security group allows outbound on port 587

## Next Steps

1. ✅ Your agent works on Telegram!
2. Add WhatsApp support (5 min)
3. Add Email support (5 min)
4. Customize channel-specific behavior
5. Build a dashboard to view conversations across channels
6. Implement cross-channel user identification

## Pro Tips

### Development with ngrok

```bash
# Terminal 1: Start your server
npm run dev

# Terminal 2: Start ngrok
ngrok http 3000

# Use the HTTPS URL from ngrok in your webhook configurations
```

### View Real-Time Logs

```bash
# Watch all channel activity
tail -f server.log | grep -E 'WhatsApp|Telegram|Email|ChannelOrchestrator'
```

### Quick Reset

If you need to start fresh:

```bash
# Clear channel configuration
curl -X DELETE http://localhost:3000/api/v1/channels/organizations/{YOUR_ORG_ID}/projects/{YOUR_PROJECT_ID}/agents/{YOUR_AGENT_ID}/channels

# Or in MongoDB
db.channelconfigs.deleteOne({ agent: "YOUR_AGENT_ID" })
```

## Common Patterns

### Send Rich Media

```javascript
// In your agent tools, you can now specify media
{
  type: 'image',
  url: 'https://example.com/image.jpg',
  caption: 'Here is the information you requested'
}
```

### Channel-Specific Responses

```javascript
// In your agent's system prompt or tools
if (context.channel === 'telegram') {
  // Use markdown formatting
  response = '*Bold text* and _italic text_';
} else if (context.channel === 'email') {
  // Use HTML
  response = '<b>Bold text</b> and <i>italic text</i>';
}
```

### Track User Across Channels

```javascript
// When user provides email in Telegram conversation
const conversation = await Conversation.findOne({
  user_identifier: 'telegram_123456',
  channel: 'telegram',
});

// Link to email conversations
conversation.linked_identifiers = ['user@example.com'];
await conversation.save();
```

## Success! 🎉

You now have a multi-channel AI agent! Your users can interact via:

- 💬 Telegram
- 📱 WhatsApp (if configured)
- 📧 Email (if configured)
- 🌐 Your website (existing)

All conversations are unified and your agent responds consistently across all channels!

## Need Help?

- Check the full documentation: `/docs/features/multi-channel-support.md`
- Review server logs: `tail -f server.log`
- Test individual channels: Use the `/test` endpoint
- Check conversation database: `db.conversations.find()`

Happy building! 🚀
