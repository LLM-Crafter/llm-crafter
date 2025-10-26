# Integration Guide: Chat Widget

This guide shows you how to integrate the LLM Crafter chat widget into various platforms and frameworks.

## Table of Contents

1. [Plain HTML/JavaScript](#plain-htmljavascript)
2. [React](#react)
3. [Vue.js](#vuejs)
4. [Angular](#angular)
5. [Next.js](#nextjs)
6. [WordPress](#wordpress)
7. [Shopify](#shopify)
8. [Webflow](#webflow)

---

## Plain HTML/JavaScript

### Basic Integration

Add this script tag before the closing `</body>` tag:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Website</title>
  </head>
  <body>
    <!-- Your page content -->

    <script
      src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
      data-api-key="sk_live_..."
      data-agent-id="agent_..."
      data-organization-id="org_..."
      data-project-id="proj_..."
      data-title="Support Chat"
      data-primary-color="#4a90e2"
    ></script>
  </body>
</html>
```

### With Custom Controls

```html
<button id="openChatBtn">Chat with us</button>

<script src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"></script>
<script>
  const widget = new LLMCrafterChatWidget({
    apiKey: 'sk_live_...',
    agentId: 'agent_...',
    organizationId: 'org_...',
    projectId: 'proj_...',
  });

  document.getElementById('openChatBtn').addEventListener('click', () => {
    widget.open();
  });
</script>
```

---

## React

### Functional Component with Hooks

```jsx
import { useEffect, useRef } from 'react';

function App() {
  const widgetRef = useRef(null);

  useEffect(() => {
    // Dynamically load the widget script
    const script = document.createElement('script');
    script.src =
      'https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js';
    script.async = true;

    script.onload = () => {
      widgetRef.current = new window.LLMCrafterChatWidget({
        apiKey: process.env.REACT_APP_LLM_API_KEY,
        agentId: process.env.REACT_APP_AGENT_ID,
        organizationId: process.env.REACT_APP_ORG_ID,
        projectId: process.env.REACT_APP_PROJECT_ID,
        title: 'Support Assistant',
        primaryColor: '#3B82F6',
        onMessageSent: message => {
          console.log('Message sent:', message);
        },
      });
    };

    document.body.appendChild(script);

    // Cleanup
    return () => {
      if (widgetRef.current) {
        widgetRef.current.destroy();
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="App">
      <h1>My React App</h1>
      {/* Widget is automatically rendered */}
    </div>
  );
}

export default App;
```

### Custom Hook

```jsx
// hooks/useChatWidget.js
import { useEffect, useRef } from 'react';

export function useChatWidget(config) {
  const widgetRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src =
      'https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js';
    script.async = true;

    script.onload = () => {
      widgetRef.current = new window.LLMCrafterChatWidget(config);
    };

    document.body.appendChild(script);

    return () => {
      if (widgetRef.current) {
        widgetRef.current.destroy();
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [config]);

  return widgetRef;
}

// Usage in component
function App() {
  const widgetRef = useChatWidget({
    apiKey: process.env.REACT_APP_LLM_API_KEY,
    agentId: process.env.REACT_APP_AGENT_ID,
    organizationId: process.env.REACT_APP_ORG_ID,
    projectId: process.env.REACT_APP_PROJECT_ID,
  });

  const handleOpenChat = () => {
    widgetRef.current?.open();
  };

  return (
    <div>
      <button onClick={handleOpenChat}>Open Chat</button>
    </div>
  );
}
```

---

## Vue.js

### Vue 3 Composition API

```vue
<template>
  <div id="app">
    <h1>My Vue App</h1>
    <button @click="openChat">Open Chat</button>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';

const widget = ref(null);

onMounted(() => {
  const script = document.createElement('script');
  script.src =
    'https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js';
  script.async = true;

  script.onload = () => {
    widget.value = new window.LLMCrafterChatWidget({
      apiKey: import.meta.env.VITE_LLM_API_KEY,
      agentId: import.meta.env.VITE_AGENT_ID,
      organizationId: import.meta.env.VITE_ORG_ID,
      projectId: import.meta.env.VITE_PROJECT_ID,
      title: 'Vue Support',
      primaryColor: '#42b883',
    });
  };

  document.body.appendChild(script);
});

onBeforeUnmount(() => {
  if (widget.value) {
    widget.value.destroy();
  }
});

const openChat = () => {
  widget.value?.open();
};
</script>
```

### Vue 2 Options API

```vue
<template>
  <div id="app">
    <h1>My Vue App</h1>
  </div>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      widget: null,
    };
  },
  mounted() {
    const script = document.createElement('script');
    script.src =
      'https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js';
    script.async = true;

    script.onload = () => {
      this.widget = new window.LLMCrafterChatWidget({
        apiKey: process.env.VUE_APP_LLM_API_KEY,
        agentId: process.env.VUE_APP_AGENT_ID,
        organizationId: process.env.VUE_APP_ORG_ID,
        projectId: process.env.VUE_APP_PROJECT_ID,
      });
    };

    document.body.appendChild(script);
  },
  beforeDestroy() {
    if (this.widget) {
      this.widget.destroy();
    }
  },
};
</script>
```

---

## Angular

### Component Integration

```typescript
// app.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';

declare global {
  interface Window {
    LLMCrafterChatWidget: any;
  }
}

@Component({
  selector: 'app-root',
  template: `
    <h1>My Angular App</h1>
    <button (click)="openChat()">Open Chat</button>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private widget: any;

  ngOnInit() {
    this.loadChatWidget();
  }

  ngOnDestroy() {
    if (this.widget) {
      this.widget.destroy();
    }
  }

  loadChatWidget() {
    const script = document.createElement('script');
    script.src =
      'https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js';
    script.async = true;

    script.onload = () => {
      this.widget = new window.LLMCrafterChatWidget({
        apiKey: 'your-api-key',
        agentId: 'your-agent-id',
        organizationId: 'your-org-id',
        projectId: 'your-project-id',
        title: 'Angular Support',
        primaryColor: '#dd0031',
      });
    };

    document.body.appendChild(script);
  }

  openChat() {
    this.widget?.open();
  }
}
```

---

## Next.js

### Using Script Component

```jsx
// pages/_app.js or app/layout.js
import Script from 'next/script';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />

      <Script
        src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
        strategy="lazyOnload"
        onLoad={() => {
          new window.LLMCrafterChatWidget({
            apiKey: process.env.NEXT_PUBLIC_LLM_API_KEY,
            agentId: process.env.NEXT_PUBLIC_AGENT_ID,
            organizationId: process.env.NEXT_PUBLIC_ORG_ID,
            projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
          });
        }}
      />
    </>
  );
}
```

### Custom Component

```jsx
// components/ChatWidget.js
import { useEffect } from 'react';
import Script from 'next/script';

export default function ChatWidget() {
  useEffect(() => {
    return () => {
      // Cleanup if needed
    };
  }, []);

  const handleLoad = () => {
    if (typeof window !== 'undefined') {
      new window.LLMCrafterChatWidget({
        apiKey: process.env.NEXT_PUBLIC_LLM_API_KEY,
        agentId: process.env.NEXT_PUBLIC_AGENT_ID,
        organizationId: process.env.NEXT_PUBLIC_ORG_ID,
        projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
        title: 'Next.js Support'
      });
    }
  };

  return (
    <Script
      src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
      strategy="lazyOnload"
      onLoad={handleLoad}
    />
  );
}

// Use in _app.js or layout
import ChatWidget from '@/components/ChatWidget';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <ChatWidget />
    </>
  );
}
```

---

## WordPress

### Method 1: Theme Footer

Add to your theme's `footer.php` before `</body>`:

```php
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="<?php echo get_option('llm_api_key'); ?>"
  data-agent-id="<?php echo get_option('llm_agent_id'); ?>"
  data-organization-id="<?php echo get_option('llm_org_id'); ?>"
  data-project-id="<?php echo get_option('llm_project_id'); ?>"
></script>
```

### Method 2: Plugin

Create a custom plugin:

```php
<?php
/*
Plugin Name: LLM Crafter Chat Widget
Description: Adds LLM Crafter chat widget to your site
Version: 1.0
*/

function llm_crafter_chat_widget() {
    $api_key = get_option('llm_api_key');
    $agent_id = get_option('llm_agent_id');
    $org_id = get_option('llm_org_id');
    $project_id = get_option('llm_project_id');

    if ($api_key && $agent_id && $org_id && $project_id) {
        ?>
        <script
          src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
          data-api-key="<?php echo esc_attr($api_key); ?>"
          data-agent-id="<?php echo esc_attr($agent_id); ?>"
          data-organization-id="<?php echo esc_attr($org_id); ?>"
          data-project-id="<?php echo esc_attr($project_id); ?>"
        ></script>
        <?php
    }
}
add_action('wp_footer', 'llm_crafter_chat_widget');

// Add settings page
function llm_crafter_settings_page() {
    add_options_page(
        'LLM Crafter Settings',
        'LLM Crafter',
        'manage_options',
        'llm-crafter',
        'llm_crafter_settings_html'
    );
}
add_action('admin_menu', 'llm_crafter_settings_page');
```

---

## Shopify

### Add to Theme

1. Go to **Online Store > Themes**
2. Click **Actions > Edit code**
3. Open `layout/theme.liquid`
4. Add before `</body>`:

```liquid
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="{{ settings.llm_api_key }}"
  data-agent-id="{{ settings.llm_agent_id }}"
  data-organization-id="{{ settings.llm_org_id }}"
  data-project-id="{{ settings.llm_project_id }}"
  data-title="Shop Support"
></script>
```

5. Save the file

---

## Webflow

1. Open your Webflow project
2. Go to **Project Settings > Custom Code**
3. In the **Footer Code** section, add:

```html
<script
  src="https://unpkg.com/@llm-crafter/chat-widget@latest/dist/chat-widget.min.js"
  data-api-key="YOUR_API_KEY"
  data-agent-id="YOUR_AGENT_ID"
  data-organization-id="YOUR_ORG_ID"
  data-project-id="YOUR_PROJECT_ID"
  data-primary-color="#4a90e2"
></script>
```

4. Click **Save Changes**
5. Publish your site

---

## Environment Variables

### React (.env)

```
REACT_APP_LLM_API_KEY=sk_live_...
REACT_APP_AGENT_ID=agent_...
REACT_APP_ORG_ID=org_...
REACT_APP_PROJECT_ID=proj_...
```

### Next.js (.env.local)

```
NEXT_PUBLIC_LLM_API_KEY=sk_live_...
NEXT_PUBLIC_AGENT_ID=agent_...
NEXT_PUBLIC_ORG_ID=org_...
NEXT_PUBLIC_PROJECT_ID=proj_...
```

### Vue (.env)

```
VITE_LLM_API_KEY=sk_live_...
VITE_AGENT_ID=agent_...
VITE_ORG_ID=org_...
VITE_PROJECT_ID=proj_...
```

---

## Tips

1. **Always use HTTPS** in production
2. **Use environment variables** for sensitive data
3. **Test on mobile** devices
4. **Consider loading the widget lazily** to improve page load
5. **Track events** with the callback functions
6. **Customize colors** to match your brand
7. **Test with different API keys** to ensure proper scoping

---

## Troubleshooting

### Widget doesn't load

- Check browser console for errors
- Verify script URL is accessible
- Check for Content Security Policy (CSP) issues

### Styling conflicts

- The widget uses isolated CSS classes
- All classes are prefixed with `llm-crafter-`
- Use `!important` if you need to override styles

### API errors

- Verify your API credentials are correct
- Check that your API key has `agents:execute` scope
- Ensure your agent is properly configured

---

## Support

Need help? Contact us:

- 📧 Email: support@llmcrafter.com
- 💬 Discord: https://discord.gg/llmcrafter
- 📚 Docs: https://docs.llmcrafter.com
