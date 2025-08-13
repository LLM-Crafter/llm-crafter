# API Integration Examples

This page provides comprehensive examples of integrating with the LLM Crafter API for various use cases.

## Authentication Setup

Before making API calls, you need to authenticate using either JWT tokens or API keys.

### Using JWT Tokens

```javascript
// Login to get JWT token
const loginResponse = await fetch('https://api.llmcrafter.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { data } = await loginResponse.json();
const token = data.token;

// Use token in subsequent requests
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

### Using API Keys

```javascript
// Use API key for service-to-service integration
const headers = {
  'X-API-Key': 'ak_1234567890abcdef...',
  'Content-Type': 'application/json'
};
```

## Complete Workflow Examples

### Example 1: Customer Support Bot Setup

This example shows how to set up a complete customer support bot from scratch.

```javascript
class CustomerSupportBot {
  constructor(apiKey, baseUrl = 'https://api.llmcrafter.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.headers = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async createOrganization(name, description) {
    const response = await fetch(`${this.baseUrl}/api/organizations`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ name, description })
    });
    return response.json();
  }

  async createProject(orgId, projectData) {
    const response = await fetch(`${this.baseUrl}/api/organizations/${orgId}/projects`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(projectData)
    });
    return response.json();
  }

  async configureProvider(orgId, providerConfig) {
    const response = await fetch(`${this.baseUrl}/api/organizations/${orgId}/providers`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(providerConfig)
    });
    return response.json();
  }

  async createAgent(orgId, projectId, agentConfig) {
    const response = await fetch(`${this.baseUrl}/api/organizations/${orgId}/projects/${projectId}/agents`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(agentConfig)
    });
    return response.json();
  }

  async executeAgent(orgId, projectId, agentId, prompt, context = {}) {
    const response = await fetch(`${this.baseUrl}/api/organizations/${orgId}/projects/${projectId}/agents/${agentId}/execute`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ prompt, context })
    });
    return response.json();
  }

  async setupComplete() {
    try {
      // 1. Create organization
      const orgResult = await this.createOrganization(
        'Customer Support',
        'Organization for customer support operations'
      );
      const orgId = orgResult.data.organization.id;
      console.log('✓ Organization created:', orgId);

      // 2. Create project
      const projectResult = await this.createProject(orgId, {
        name: 'support-bot',
        display_name: 'Customer Support Bot',
        description: 'AI-powered customer support system'
      });
      const projectId = projectResult.data.project.id;
      console.log('✓ Project created:', projectId);

      // 3. Configure OpenAI provider
      const providerResult = await this.configureProvider(orgId, {
        name: 'openai',
        configuration: {
          api_key: process.env.OPENAI_API_KEY
        },
        enabled: true,
        default: true
      });
      console.log('✓ Provider configured');

      // 4. Create support agent
      const agentResult = await this.createAgent(orgId, projectId, {
        name: 'customer-support-agent',
        description: 'Main customer support chatbot',
        type: 'chatbot',
        system_prompt: `You are a helpful customer support agent for our company. 
        You should be polite, professional, and helpful. 
        If you cannot answer a question, direct the customer to human support.`,
        api_key: providerResult.data.provider.id,
        llm_settings: {
          model: 'gpt-3.5-turbo',
          parameters: {
            temperature: 0.7,
            max_tokens: 500
          }
        },
        tools: [
          {
            name: 'web_search',
            description: 'Search for product information',
            enabled: true
          }
        ]
      });
      const agentId = agentResult.data.agent.id;
      console.log('✓ Agent created:', agentId);

      return { orgId, projectId, agentId };
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }
}

// Usage
const bot = new CustomerSupportBot(process.env.LLM_CRAFTER_API_KEY);
const { orgId, projectId, agentId } = await bot.setupComplete();

// Test the agent
const response = await bot.executeAgent(
  orgId,
  projectId,
  agentId,
  'How do I reset my password?',
  { user_id: 'user_123', channel: 'web' }
);

console.log('Agent response:', response.data.execution.response);
```

### Example 2: Content Analysis Pipeline

This example demonstrates a content analysis workflow using multiple agents.

```javascript
class ContentAnalysisPipeline {
  constructor(apiKey, orgId, projectId) {
    this.apiKey = apiKey;
    this.orgId = orgId;
    this.projectId = projectId;
    this.baseUrl = 'https://api.llmcrafter.com';
    this.headers = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async createAnalysisAgents() {
    // Sentiment analysis agent
    const sentimentAgent = await this.createAgent({
      name: 'sentiment-analyzer',
      description: 'Analyzes sentiment of content',
      type: 'task',
      system_prompt: `You are a sentiment analysis expert. 
      Analyze the given text and return sentiment as positive, negative, or neutral.
      Also provide a confidence score from 0-100 and brief reasoning.
      
      Format your response as JSON:
      {
        "sentiment": "positive|negative|neutral",
        "confidence": 85,
        "reasoning": "Brief explanation"
      }`,
      llm_settings: {
        model: 'gpt-3.5-turbo',
        parameters: { temperature: 0.3 }
      }
    });

    // Topic classification agent
    const topicAgent = await this.createAgent({
      name: 'topic-classifier',
      description: 'Classifies content by topic',
      type: 'task',
      system_prompt: `You are a topic classification expert.
      Classify the given text into one of these categories:
      - Technology
      - Business
      - Sports
      - Entertainment
      - Politics
      - Health
      - Science
      - Other
      
      Also provide 2-3 specific tags and a confidence score.
      
      Format your response as JSON:
      {
        "category": "Technology",
        "tags": ["AI", "machine learning"],
        "confidence": 90
      }`,
      llm_settings: {
        model: 'gpt-3.5-turbo',
        parameters: { temperature: 0.2 }
      }
    });

    // Quality assessment agent
    const qualityAgent = await this.createAgent({
      name: 'quality-assessor',
      description: 'Assesses content quality',
      type: 'task',
      system_prompt: `You are a content quality expert.
      Assess the given text for:
      - Clarity (1-10)
      - Grammar (1-10)
      - Informativeness (1-10)
      - Overall quality (1-10)
      
      Provide specific feedback for improvement.
      
      Format your response as JSON:
      {
        "scores": {
          "clarity": 8,
          "grammar": 9,
          "informativeness": 7,
          "overall": 8
        },
        "feedback": "Specific improvement suggestions"
      }`,
      llm_settings: {
        model: 'gpt-4',
        parameters: { temperature: 0.3 }
      }
    });

    return {
      sentimentId: sentimentAgent.data.agent.id,
      topicId: topicAgent.data.agent.id,
      qualityId: qualityAgent.data.agent.id
    };
  }

  async createAgent(config) {
    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.orgId}/projects/${this.projectId}/agents`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(config)
      }
    );
    return response.json();
  }

  async executeAgent(agentId, prompt) {
    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.orgId}/projects/${this.projectId}/agents/${agentId}/execute`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ prompt })
      }
    );
    const result = await response.json();
    return JSON.parse(result.data.execution.response);
  }

  async analyzeContent(content) {
    const agents = await this.createAnalysisAgents();
    
    // Run all analyses in parallel
    const [sentiment, topic, quality] = await Promise.all([
      this.executeAgent(agents.sentimentId, content),
      this.executeAgent(agents.topicId, content),
      this.executeAgent(agents.qualityId, content)
    ]);

    return {
      content,
      analysis: {
        sentiment,
        topic,
        quality
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Usage
const pipeline = new ContentAnalysisPipeline(
  process.env.LLM_CRAFTER_API_KEY,
  'org_123456',
  'proj_789012'
);

const content = `
Artificial Intelligence is revolutionizing the way we work and live. 
Machine learning algorithms are becoming more sophisticated, 
enabling applications we could only dream of a few years ago.
`;

const analysis = await pipeline.analyzeContent(content);
console.log('Content Analysis:', JSON.stringify(analysis, null, 2));
```

### Example 3: Real-time Chat Integration

This example shows how to integrate LLM Crafter with a real-time chat system.

```javascript
const WebSocket = require('ws');

class ChatIntegration {
  constructor(apiKey, orgId, projectId, agentId) {
    this.apiKey = apiKey;
    this.orgId = orgId;
    this.projectId = projectId;
    this.agentId = agentId;
    this.baseUrl = 'https://api.llmcrafter.com';
    this.headers = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    };
    this.conversations = new Map(); // Store conversation context
  }

  async executeAgent(prompt, sessionId) {
    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.orgId}/projects/${this.projectId}/agents/${this.agentId}/execute`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          prompt,
          context: {
            session_id: sessionId,
            timestamp: new Date().toISOString()
          }
        })
      }
    );
    return response.json();
  }

  startWebSocketServer(port = 8080) {
    const wss = new WebSocket.Server({ port });
    console.log(`WebSocket server started on port ${port}`);

    wss.on('connection', (ws) => {
      const sessionId = this.generateSessionId();
      console.log(`New connection: ${sessionId}`);

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
          if (data.type === 'chat_message') {
            // Execute agent with user message
            const result = await this.executeAgent(data.content, sessionId);
            
            // Send response back to client
            ws.send(JSON.stringify({
              type: 'agent_response',
              content: result.data.execution.response,
              metadata: {
                tokens_used: result.data.execution.metadata.tokens_used,
                response_time: result.data.execution.metadata.response_time_ms
              }
            }));
          }
        } catch (error) {
          console.error('Error processing message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message'
          }));
        }
      });

      ws.on('close', () => {
        console.log(`Connection closed: ${sessionId}`);
        this.conversations.delete(sessionId);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'system',
        message: 'Connected to LLM Crafter Chat'
      }));
    });
  }

  generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9);
  }
}

// Usage
const chat = new ChatIntegration(
  process.env.LLM_CRAFTER_API_KEY,
  'org_123456',
  'proj_789012',
  'agent_345678'
);

chat.startWebSocketServer(8080);
```

### Example 4: Batch Processing System

This example demonstrates how to process multiple items in batches.

```javascript
class BatchProcessor {
  constructor(apiKey, orgId, projectId, agentId) {
    this.apiKey = apiKey;
    this.orgId = orgId;
    this.projectId = projectId;
    this.agentId = agentId;
    this.baseUrl = 'https://api.llmcrafter.com';
    this.headers = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async processItem(item) {
    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.orgId}/projects/${this.projectId}/agents/${this.agentId}/execute`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          prompt: item.content,
          context: { item_id: item.id }
        })
      }
    );
    return response.json();
  }

  async processBatch(items, concurrency = 5) {
    const results = [];
    const chunks = this.chunkArray(items, concurrency);

    for (const chunk of chunks) {
      console.log(`Processing batch of ${chunk.length} items...`);
      
      const batchResults = await Promise.allSettled(
        chunk.map(async (item) => {
          try {
            const result = await this.processItem(item);
            return {
              id: item.id,
              success: true,
              result: result.data.execution.response,
              tokens: result.data.execution.metadata.tokens_used
            };
          } catch (error) {
            return {
              id: item.id,
              success: false,
              error: error.message
            };
          }
        })
      );

      results.push(...batchResults.map(r => r.value || r.reason));
      
      // Rate limiting delay
      await this.delay(1000);
    }

    return results;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateReport(results) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalTokens = successful.reduce((sum, r) => sum + (r.tokens?.total || 0), 0);

    return {
      total_items: results.length,
      successful: successful.length,
      failed: failed.length,
      success_rate: (successful.length / results.length * 100).toFixed(2) + '%',
      total_tokens: totalTokens,
      failed_items: failed.map(f => ({ id: f.id, error: f.error }))
    };
  }
}

// Usage
const processor = new BatchProcessor(
  process.env.LLM_CRAFTER_API_KEY,
  'org_123456',
  'proj_789012',
  'agent_345678'
);

const items = [
  { id: 1, content: 'Analyze this product review: Great product, highly recommended!' },
  { id: 2, content: 'Analyze this product review: Poor quality, would not buy again.' },
  { id: 3, content: 'Analyze this product review: Average product, nothing special.' }
  // ... more items
];

const results = await processor.processBatch(items, 3);
const report = processor.generateReport(results);

console.log('Processing Report:', JSON.stringify(report, null, 2));
```

## Error Handling Best Practices

```javascript
class APIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.llmcrafter.com';
    this.retryAttempts = 3;
    this.retryDelay = 1000;
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, config);
        
        if (!response.ok) {
          const error = await response.json();
          
          // Handle specific error codes
          switch (response.status) {
            case 401:
              throw new Error('Authentication failed. Please check your API key.');
            case 403:
              throw new Error('Access denied. Insufficient permissions.');
            case 404:
              throw new Error('Resource not found.');
            case 429:
              // Rate limited - wait and retry
              if (attempt < this.retryAttempts) {
                await this.delay(this.retryDelay * attempt);
                continue;
              }
              throw new Error('Rate limit exceeded. Please try again later.');
            case 500:
              throw new Error('Server error. Please try again later.');
            default:
              throw new Error(error.error || 'Unknown error occurred');
          }
        }

        return await response.json();
      } catch (error) {
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        // Exponential backoff for retries
        await this.delay(this.retryDelay * Math.pow(2, attempt - 1));
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Testing Integration

```javascript
// Jest test example
describe('LLM Crafter API Integration', () => {
  let client;
  let orgId, projectId, agentId;

  beforeAll(async () => {
    client = new APIClient(process.env.TEST_API_KEY);
    
    // Setup test organization and agent
    const org = await client.makeRequest('/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Organization',
        description: 'Test organization for API integration'
      })
    });
    orgId = org.data.organization.id;

    const project = await client.makeRequest(`/api/organizations/${orgId}/projects`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-project',
        description: 'Test project'
      })
    });
    projectId = project.data.project.id;

    const agent = await client.makeRequest(`/api/organizations/${orgId}/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-agent',
        type: 'task',
        system_prompt: 'You are a test agent.',
        api_key: 'test-key',
        llm_settings: {
          model: 'gpt-3.5-turbo',
          parameters: { temperature: 0.5 }
        }
      })
    });
    agentId = agent.data.agent.id;
  });

  test('should execute agent successfully', async () => {
    const result = await client.makeRequest(
      `/api/organizations/${orgId}/projects/${projectId}/agents/${agentId}/execute`,
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Hello, this is a test message.'
        })
      }
    );

    expect(result.success).toBe(true);
    expect(result.data.execution.response).toBeDefined();
    expect(result.data.execution.metadata.tokens_used).toBeDefined();
  });

  afterAll(async () => {
    // Cleanup test data
    await client.makeRequest(`/api/organizations/${orgId}`, {
      method: 'DELETE'
    });
  });
});
```

This comprehensive guide provides practical examples for integrating with the LLM Crafter API across different use cases and programming scenarios.
