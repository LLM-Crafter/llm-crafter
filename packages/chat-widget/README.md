# LLM Crafter Chat Widget

Embeddable AI chat widget for any website. Add conversational AI powered by LLM Crafter agents to your site with a simple script tag.

## Features

- 🚀 **Easy Integration** - Add to any website with a single script tag
- 🎨 **Fully Customizable** - Colors, text, positioning, and more
- 💬 **Conversational UI** - Beautiful chat interface inspired by modern messaging apps
- 📱 **Mobile Responsive** - Works perfectly on all screen sizes
- 🔒 **Secure** - API key authentication with session management
- ⚡ **Lightweight** - Minimal bundle size with no dependencies
- 🌊 **Streaming Responses** - Real-time AI responses with Server-Sent Events
- 🔄 **Conversation Continuity** - Maintains context across messages
- 👤 **Human Handoff Detection** - Automatic detection and display of human operator takeover
- 📡 **Message Polling** - Real-time updates from human operators

## Quick Start

### Using Script Tag (Recommended)

Add this script tag to your HTML, right before the closing `</body>` tag:

#### Option 1: From Your LLM Crafter API Server

```html
<script
  src="https://your-api-domain.com/widget/chat-widget.min.js"
  data-api-key="your-api-key-here"
  data-agent-id="your-agent-id"
  data-organization-id="your-org-id"
  data-project-id="your-project-id"
  data-api-url="https://your-api-domain.com"
></script>
```

#### Option 2: From CDN (NPM)

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="your-api-key-here"
  data-agent-id="your-agent-id"
  data-organization-id="your-org-id"
  data-project-id="your-project-id"
></script>
```

That's it! The chat widget will automatically appear in the bottom-right corner of your page.

### Using NPM

```bash
npm install @llm-crafter/chat-widget
```

```javascript
import LLMCrafterChatWidget from '@llm-crafter/chat-widget';

const widget = new LLMCrafterChatWidget({
  apiKey: 'your-api-key-here',
  agentId: 'your-agent-id',
  organizationId: 'your-org-id',
  projectId: 'your-project-id',
});
```

## Configuration Options

### Basic Configuration

| Option           | Type   | Required | Default                      | Description                           |
| ---------------- | ------ | -------- | ---------------------------- | ------------------------------------- |
| `apiKey`         | string | ✅ Yes   | -                            | Your LLM Crafter API key              |
| `agentId`        | string | ✅ Yes   | -                            | The agent ID to use for conversations |
| `organizationId` | string | ✅ Yes   | -                            | Your organization ID                  |
| `projectId`      | string | ✅ Yes   | -                            | Your project ID                       |
| `apiUrl`         | string | No       | `https://api.llmcrafter.com` | Base API URL                          |

### Customization Options

| Option              | Type   | Default                                  | Description                                |
| ------------------- | ------ | ---------------------------------------- | ------------------------------------------ |
| `title`             | string | `'AI Assistant'`                         | Chat header title                          |
| `subtitle`          | string | `'Online • Typically replies instantly'` | Chat header subtitle                       |
| `placeholder`       | string | `'Type your message...'`                 | Input placeholder text                     |
| `avatarText`        | string | `'AI'`                                   | Text shown in bot avatar                   |
| `userAvatarText`    | string | `'U'`                                    | Text shown in user avatar                  |
| `humanAvatarText`   | string | `'👤'`                                   | Text shown in human operator avatar        |
| `botName`           | string | `'AI'`                                   | Name displayed for bot messages            |
| `humanOperatorName` | string | `'Human'`                                | Name displayed for human operator messages |
| `welcomeMessage`    | string | `'Hello! 👋 How can I help you today?'`  | Initial greeting message                   |

### Styling Options

| Option            | Type   | Default     | Description           |
| ----------------- | ------ | ----------- | --------------------- |
| `primaryColor`    | string | `'#4a90e2'` | Primary brand color   |
| `secondaryColor`  | string | `'#357abd'` | Secondary/hover color |
| `backgroundColor` | string | `'#f5f7fa'` | Background color      |
| `textColor`       | string | `'#333333'` | Text color            |

### Behavior Options

| Option            | Type    | Default          | Description                                           |
| ----------------- | ------- | ---------------- | ----------------------------------------------------- |
| `position`        | string  | `'bottom-right'` | Widget position (`'bottom-right'` or `'bottom-left'`) |
| `autoOpen`        | boolean | `false`          | Automatically open chat on page load                  |
| `showPoweredBy`   | boolean | `true`           | Show "Powered by LLM Crafter" badge                   |
| `poweredByUrl`    | string  | `'#'`            | URL for the "Powered by" link                         |
| `userIdentifier`  | string  | `null`           | Optional identifier for the user                      |
| `enableStreaming` | boolean | `true`           | Enable streaming responses (real-time text)           |
| `pollingInterval` | number  | `3000`           | Interval in ms to poll for human operator messages    |

### Callback Options

| Option              | Type     | Description                                 |
| ------------------- | -------- | ------------------------------------------- |
| `onMessageSent`     | function | Called when user sends a message            |
| `onMessageReceived` | function | Called when bot responds                    |
| `onError`           | function | Called when an error occurs                 |
| `onHumanTakeover`   | function | Called when a human operator joins the chat |

## Usage Examples

### Example 1: Basic Implementation

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Website</title>
  </head>
  <body>
    <h1>Welcome to my website</h1>

    <!-- Add widget at the end of body -->
    <script
      src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
      data-api-key="sk_live_abc123..."
      data-agent-id="agent_xyz789"
      data-organization-id="org_123"
      data-project-id="proj_456"
    ></script>
  </body>
</html>
```

### Example 2: Customized Appearance

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="sk_live_abc123..."
  data-agent-id="agent_xyz789"
  data-organization-id="org_123"
  data-project-id="proj_456"
  data-title="Customer Support"
  data-subtitle="We're here to help!"
  data-primary-color="#6B46C1"
  data-secondary-color="#553C9A"
  data-position="bottom-left"
  data-auto-open="true"
></script>
```

### Example 3: JavaScript API

```html
<script src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"></script>

<script>
  // Initialize manually with full control
  const widget = new LLMCrafterChatWidget({
    apiKey: 'sk_live_abc123...',
    agentId: 'agent_xyz789',
    organizationId: 'org_123',
    projectId: 'proj_456',

    // Customization
    title: 'Sales Assistant',
    welcomeMessage: 'Hi! Looking for the perfect solution? I can help! 🎯',
    primaryColor: '#FF6B6B',

    // Callbacks
    onMessageSent: message => {
      console.log('User sent:', message);
      // Track in analytics
      gtag('event', 'chat_message_sent', { message });
    },

    onMessageReceived: (response, data) => {
      console.log('Bot replied:', response);
      // Track in analytics
      gtag('event', 'chat_message_received');
    },

    onError: error => {
      console.error('Chat error:', error);
      // Send to error tracking
      Sentry.captureException(new Error(error));
    },
  });

  // Control the widget programmatically
  document.getElementById('openChat').addEventListener('click', () => {
    widget.open();
  });

  // Set user identifier after login
  function onUserLogin(userId) {
    widget.setUserIdentifier(userId);
  }
</script>
```

### Example 4: React Integration

```jsx
import { useEffect, useRef } from 'react';
import LLMCrafterChatWidget from '@llm-crafter/chat-widget';

function App() {
  const widgetRef = useRef(null);

  useEffect(() => {
    widgetRef.current = new LLMCrafterChatWidget({
      apiKey: process.env.REACT_APP_LLM_CRAFTER_API_KEY,
      agentId: process.env.REACT_APP_AGENT_ID,
      organizationId: process.env.REACT_APP_ORG_ID,
      projectId: process.env.REACT_APP_PROJECT_ID,
      title: 'Support Chat',
      primaryColor: '#3B82F6',
      onMessageSent: message => {
        // Track message
        analytics.track('Chat Message Sent', { message });
      },
    });

    // Cleanup on unmount
    return () => {
      if (widgetRef.current) {
        widgetRef.current.destroy();
      }
    };
  }, []);

  return (
    <div>
      <h1>My App</h1>
      {/* Widget is automatically rendered */}
    </div>
  );
}
```

### Example 5: Vue Integration

```vue
<template>
  <div id="app">
    <h1>My App</h1>
  </div>
</template>

<script>
import LLMCrafterChatWidget from '@llm-crafter/chat-widget';

export default {
  name: 'App',
  data() {
    return {
      widget: null,
    };
  },
  mounted() {
    this.widget = new LLMCrafterChatWidget({
      apiKey: process.env.VUE_APP_LLM_CRAFTER_API_KEY,
      agentId: process.env.VUE_APP_AGENT_ID,
      organizationId: process.env.VUE_APP_ORG_ID,
      projectId: process.env.VUE_APP_PROJECT_ID,
      title: 'Help Center',
      primaryColor: '#10B981',
    });
  },
  beforeUnmount() {
    if (this.widget) {
      this.widget.destroy();
    }
  },
};
</script>
```

## API Methods

After initializing the widget, you can control it programmatically:

```javascript
const widget = new LLMCrafterChatWidget({
  /* config */
});

// Open the chat window
widget.open();

// Close the chat window
widget.close();

// Toggle the chat window
widget.toggle();

// Clear all messages
widget.clearMessages();

// Set user identifier (for tracking conversations)
widget.setUserIdentifier('user_12345');

// Destroy the widget and remove from DOM
widget.destroy();
```

## Advanced Features

### Streaming Responses

The widget supports real-time streaming of AI responses using Server-Sent Events (SSE). This provides a more engaging user experience as text appears progressively instead of all at once.

```javascript
const widget = new LLMCrafterChatWidget({
  apiKey: 'your-api-key',
  agentId: 'your-agent-id',
  organizationId: 'org_123',
  projectId: 'proj_456',

  // Enable streaming (default: true)
  enableStreaming: true,
});

// You can toggle streaming dynamically
widget.config.enableStreaming = false; // Switch to non-streaming mode
```

#### How it works:

- Uses `/api/v1/external/agents/chat/stream` endpoint
- Text appears word-by-word as the AI generates it
- Falls back to non-streaming if disabled
- No additional configuration required

### Conversation Continuity

The widget automatically maintains conversation context across multiple messages. The `conversationId` is tracked internally and sent with each request.

```javascript
// After the first message, conversationId is automatically set
widget.conversationId; // Returns the current conversation ID

// Manually clear conversation and start fresh
widget.clearMessages(); // Resets conversationId and removes all messages
```

#### Benefits:

- AI remembers previous messages in the conversation
- Provides contextual and coherent responses
- No manual tracking required

### Human Handoff Detection

The widget automatically polls for messages from human operators and updates the UI when a human takes over the conversation.

```javascript
const widget = new LLMCrafterChatWidget({
  apiKey: 'your-api-key',
  agentId: 'your-agent-id',
  organizationId: 'org_123',
  projectId: 'proj_456',

  // Configure polling interval (default: 3000ms)
  pollingInterval: 3000,

  // Callback when human operator joins
  onHumanTakeover: data => {
    console.log('Human operator joined!');
    console.log('Handoff status:', data.handoff_active);

    // Show a custom notification
    showNotification('A human operator has joined the conversation');
  },

  // Callback for all messages (including from humans)
  onMessageReceived: (message, data) => {
    if (data.from_human) {
      console.log('Message from human operator:', message);
    }
  },
});
```

#### Features:

- Polls `/api/v1/external/conversations/:conversationId/messages/latest` every 3 seconds (configurable)
- Automatically displays messages from human operators
- Updates UI subtitle to show "👤 Human operator" when handoff occurs
- Returns to AI mode when human hands control back

### Custom Branding

Customize the "Powered by" link to match your branding:

```javascript
const widget = new LLMCrafterChatWidget({
  apiKey: 'your-api-key',
  agentId: 'your-agent-id',
  organizationId: 'org_123',
  projectId: 'proj_456',

  // Show/hide the badge
  showPoweredBy: true,

  // Customize the URL (default: '#')
  poweredByUrl: 'https://yourcompany.com',
});
```

Or via script tag:

```html
<script
  src="chat-widget.js"
  data-api-key="your-api-key"
  data-agent-id="agent-id"
  data-organization-id="org-id"
  data-project-id="proj-id"
  data-show-powered-by="true"
  data-powered-by-url="https://yourcompany.com"
></script>
```

### Complete Advanced Example

```javascript
const widget = new LLMCrafterChatWidget({
  // Required
  apiKey: 'your-api-key',
  agentId: 'your-agent-id',
  organizationId: 'org_123',
  projectId: 'proj_456',

  // Customization
  title: 'Customer Support',
  subtitle: 'Online • We respond instantly',
  primaryColor: '#667eea',

  // Advanced features
  enableStreaming: true,
  pollingInterval: 2000, // Poll every 2 seconds
  poweredByUrl: 'https://yourcompany.com',

  // Callbacks
  onMessageSent: message => {
    console.log('User:', message);
    analytics.track('chat_message_sent');
  },

  onMessageReceived: (message, data) => {
    if (data.from_human) {
      console.log('Human operator:', message);
      analytics.track('human_message_received');
    } else {
      console.log('AI:', message);
      analytics.track('ai_message_received');
    }
  },

  onHumanTakeover: data => {
    console.log('Human operator joined the conversation');
    analytics.track('human_takeover', {
      conversation_id: data.conversation_id,
    });

    // Optional: Play a notification sound
    playNotificationSound();
  },

  onError: error => {
    console.error('Chat error:', error);
    Sentry.captureException(new Error(error));
  },
});

// Access conversation state
console.log('Conversation ID:', widget.conversationId);
console.log('Is human controlling?', widget.isHumanControlled);
console.log('Is polling active?', !!widget.pollingIntervalId);
console.log('Message count:', widget.messages.length);
```

## Getting Your API Credentials

1. Log in to your [LLM Crafter Dashboard](https://llmcrafter.com/dashboard)
2. Navigate to your project
3. Go to **API Keys** section
4. Create a new API key with `agents:chat` scope
5. Copy your API key, agent ID, organization ID, and project ID

> ⚠️ **Security Note**: Never expose your API keys in client-side code for production. The widget is designed for public-facing chat interfaces with appropriate rate limiting.

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome for Android)

## Troubleshooting

### Widget doesn't appear

1. Check that your API key is valid
2. Open browser console and look for errors
3. Verify your agent ID, organization ID, and project ID are correct
4. Ensure your API key has `agents:chat` scope

### Messages not sending

1. Check network tab for failed requests
2. Verify your API endpoint is correct
3. Check CORS configuration if self-hosting
4. Ensure your agent is properly configured

### Styling issues

1. Check for CSS conflicts with your existing styles
2. Increase specificity if needed by adding custom CSS
3. Use browser dev tools to inspect the widget elements

## Custom Styling

You can override widget styles with custom CSS:

```css
/* Change widget button size */
.llm-crafter-widget-button {
  width: 70px !important;
  height: 70px !important;
}

/* Customize chat window size */
.llm-crafter-chat-window {
  width: 450px !important;
  height: 700px !important;
}

/* Style message bubbles */
.llm-crafter-message-bubble {
  font-size: 15px !important;
}
```

## Development

```bash
# Install dependencies
npm install

# Build the widget
npm run build

# Development mode with watch
npm run dev
```

## License

MIT License - see LICENSE file for details

## Support

- 📚 [Documentation](https://docs.llmcrafter.com)
- 💬 [Discord Community](https://discord.gg/llmcrafter)
- 📧 [Email Support](mailto:support@llmcrafter.com)
- 🐛 [Report Issues](https://github.com/LLM-Crafter/llm-crafter/issues)

---

Made with ❤️ by the LLM Crafter team
