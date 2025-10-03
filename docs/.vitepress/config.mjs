import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'LLM Crafter',
  description:
    'A collaborative platform for managing and executing LLM prompts',

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/getting-started' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is LLM Crafter?', link: '/introduction' },
            { text: 'Getting Started', link: '/getting-started' },
            { text: 'Configuration', link: '/configuration' },
            { text: 'Providers Overview', link: '/providers-overview' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            {
              text: 'Organizations & Projects',
              link: '/concepts/organizations',
            },
            { text: 'Agents', link: '/concepts/agents' },
            { text: 'Conversations', link: '/concepts/conversations' },
            { text: 'API Keys & Providers', link: '/concepts/api-keys' },
          ],
        },
        {
          text: 'Tools',
          collapsed: false,
          items: [
            { text: 'Web Search', link: '/tools/web-search' },
            { text: 'Webpage Scraper', link: '/tools/webpage-scraper' },
            { text: 'Calculator', link: '/tools/calculator' },
            { text: 'Current Time', link: '/tools/current-time' },
            { text: 'JSON Processor', link: '/tools/json-processor' },
            { text: 'LLM Prompt', link: '/tools/llm-prompt' },
            { text: 'API Caller', link: '/tools/api-caller' },
            { text: 'FAQ', link: '/tools/faq' },
            { text: 'RAG Search', link: '/tools/rag-search' },
            {
              text: 'Request Human Handoff',
              link: '/tools/request-human-handoff',
            },
          ],
        },
        {
          text: 'Features',
          collapsed: false,
          items: [
            { text: 'Authentication', link: '/features/authentication' },
            { text: 'OAuth Authentication', link: '/features/oauth' },
            { text: 'Multi-Channel Support', link: '/features/multi-channel' },
            {
              text: 'RAG (Retrieval-Augmented Generation)',
              link: '/features/rag',
            },
            {
              text: 'Conversation Summarization',
              link: '/features/summarization',
            },
          ],
        },
        {
          text: 'Guides',
          items: [
            { text: 'Internet Search Setup', link: '/guides/internet-search' },
          ],
        },
        {
          text: 'API Reference',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Authentication', link: '/api/auth' },
            { text: 'Organizations', link: '/api/organizations' },
            { text: 'Projects', link: '/api/projects' },
            { text: 'Agents', link: '/api/agents' },
            { text: 'Tools', link: '/api/tools' },
            { text: 'Providers', link: '/api/providers' },
            { text: 'API Keys', link: '/api/api-keys' },
            { text: 'Statistics', link: '/api/statistics' },
            { text: 'Human Handoff', link: '/api/human-handoff-endpoints' },
          ],
        },
        {
          text: 'Examples',
          items: [
            { text: 'Weather Agent', link: '/examples/weather-agent' },
            { text: 'API Integration', link: '/examples/api-integration' },
            { text: 'Custom Tools', link: '/examples/custom-tools' },
            {
              text: 'Conversation Management',
              link: '/examples/conversations',
            },
          ],
        },
        {
          text: 'Security',
          items: [
            {
              text: 'API Key Encryption',
              link: '/security/api-key-encryption',
            },
            { text: 'Password Policy', link: '/security/password-policy' },
            { text: 'Rate Limiting', link: '/security/rate-limiting' },
          ],
        },
        {
          text: 'Development',
          items: [
            { text: 'Architecture', link: '/development/architecture' },
            { text: 'Database Schema', link: '/development/database' },
            { text: 'Contributing', link: '/development/contributing' },
            { text: 'Deployment', link: '/development/deployment' },
            { text: 'ESLint Setup', link: '/development/eslint-setup' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/LLM-Crafter/llm-crafter' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present LLM Crafter',
    },

    search: {
      provider: 'local',
    },
  },

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
});
