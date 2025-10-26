# Quick Start Guide

## Installation & Setup

### 1. Get Your Credentials

First, you'll need to get your API credentials from the LLM Crafter dashboard:

1. Log in to [LLM Crafter Dashboard](https://llmcrafter.com/dashboard)
2. Navigate to your project
3. Go to **API Keys** section
4. Create a new API key with `agents:chat` scope
5. Note down:
   - API Key (starts with `sk_`)
   - Agent ID
   - Organization ID
   - Project ID

### 2. Add to Your Website

Add this script tag just before the closing `</body>` tag in your HTML:

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="YOUR_API_KEY_HERE"
  data-agent-id="YOUR_AGENT_ID"
  data-organization-id="YOUR_ORG_ID"
  data-project-id="YOUR_PROJECT_ID"
></script>
```

### 3. Test It

Open your website in a browser. You should see a chat bubble in the bottom-right corner. Click it to start chatting!

## Customization

### Change Colors

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="YOUR_API_KEY"
  data-agent-id="YOUR_AGENT_ID"
  data-organization-id="YOUR_ORG_ID"
  data-project-id="YOUR_PROJECT_ID"
  data-primary-color="#6B46C1"
  data-secondary-color="#553C9A"
></script>
```

### Customize Text

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="YOUR_API_KEY"
  data-agent-id="YOUR_AGENT_ID"
  data-organization-id="YOUR_ORG_ID"
  data-project-id="YOUR_PROJECT_ID"
  data-title="Customer Support"
  data-subtitle="We're here to help!"
  data-welcome-message="Hi! How can we assist you today? 👋"
></script>
```

### Change Position

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="YOUR_API_KEY"
  data-agent-id="YOUR_AGENT_ID"
  data-organization-id="YOUR_ORG_ID"
  data-project-id="YOUR_PROJECT_ID"
  data-position="bottom-left"
></script>
```

### Auto-Open on Load

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="YOUR_API_KEY"
  data-agent-id="YOUR_AGENT_ID"
  data-organization-id="YOUR_ORG_ID"
  data-project-id="YOUR_PROJECT_ID"
  data-auto-open="true"
></script>
```

## Advanced Usage

### Control Programmatically

```html
<script src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"></script>

<script>
  // Initialize manually
  const chatWidget = new LLMCrafterChatWidget({
    apiKey: 'YOUR_API_KEY',
    agentId: 'YOUR_AGENT_ID',
    organizationId: 'YOUR_ORG_ID',
    projectId: 'YOUR_PROJECT_ID',
    title: 'AI Assistant',
    primaryColor: '#4a90e2',
  });

  // Control with buttons
  document.getElementById('openChat').addEventListener('click', () => {
    chatWidget.open();
  });
</script>
```

### Track Events

```javascript
const chatWidget = new LLMCrafterChatWidget({
  apiKey: 'YOUR_API_KEY',
  agentId: 'YOUR_AGENT_ID',
  organizationId: 'YOUR_ORG_ID',
  projectId: 'YOUR_PROJECT_ID',

  onMessageSent: message => {
    // Track in Google Analytics
    gtag('event', 'chat_message', { message });
  },

  onMessageReceived: response => {
    console.log('Bot replied:', response);
  },

  onError: error => {
    console.error('Chat error:', error);
  },
});
```

## Troubleshooting

### Widget doesn't appear

- Check browser console for errors
- Verify your API credentials are correct
- Make sure the script tag is before `</body>`

### Can't send messages

- Check that your API key has `agents:chat` scope
- Verify your agent is properly configured
- Check network tab for failed requests

### Styling conflicts

- The widget uses isolated CSS classes
- If needed, add custom CSS to override styles

## Need Help?

- 📚 [Full Documentation](README.md)
- 💬 [Discord Community](https://discord.gg/llmcrafter)
- 📧 [Email Support](mailto:support@llmcrafter.com)

## Next Steps

1. ✅ Customize the appearance to match your brand
2. ✅ Set up analytics tracking with callbacks
3. ✅ Configure your agent's personality and responses
4. ✅ Test on mobile devices
5. ✅ Add to your production website
