import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'LLM Crafter',
  description: 'A collaborative platform for managing and executing LLM prompts',
  
  themeConfig: {
    logo: '/logo.svg',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/getting-started' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Examples', link: '/examples/' }
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is LLM Crafter?', link: '/introduction' },
            { text: 'Getting Started', link: '/getting-started' },
            { text: 'Installation', link: '/installation' },
            { text: 'Configuration', link: '/configuration' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Organizations & Projects', link: '/concepts/organizations' },
            { text: 'Agents', link: '/concepts/agents' },
            { text: 'Tools', link: '/concepts/tools' },
            { text: 'Conversations', link: '/concepts/conversations' },
            { text: 'API Keys & Providers', link: '/concepts/api-keys' }
          ]
        },
        {
          text: 'Features',
          items: [
            { text: 'Agent Types', link: '/features/agent-types' },
            { text: 'System Tools', link: '/features/system-tools' },
            { text: 'API Caller Tool', link: '/features/api-caller' },
            { text: 'Conversation Summarization', link: '/features/summarization' },
            { text: 'Authentication', link: '/features/authentication' }
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Authentication', link: '/api/auth' },
            { text: 'Organizations', link: '/api/organizations' },
            { text: 'Projects', link: '/api/projects' },
            { text: 'Agents', link: '/api/agents' },
            { text: 'Tools', link: '/api/tools' },
            { text: 'Providers', link: '/api/providers' }
          ]
        },
        {
          text: 'Examples',
          items: [
            { text: 'Weather Agent', link: '/examples/weather-agent' },
            { text: 'API Integration', link: '/examples/api-integration' },
            { text: 'Custom Tools', link: '/examples/custom-tools' },
            { text: 'Conversation Management', link: '/examples/conversations' }
          ]
        },
        {
          text: 'Development',
          items: [
            { text: 'Architecture', link: '/development/architecture' },
            { text: 'Database Schema', link: '/development/database' },
            { text: 'Contributing', link: '/development/contributing' },
            { text: 'Deployment', link: '/development/deployment' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-username/llm-crafter' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present LLM Crafter'
    },

    search: {
      provider: 'local'
    }
  },

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ]
})
