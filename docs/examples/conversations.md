# Conversation Management Examples

This guide demonstrates how to effectively manage conversations using LLM Crafter, including conversation tracking, context management, and advanced conversation features.

## Understanding Conversations

Conversations in LLM Crafter are sequences of interactions between users and agents. They maintain context, history, and state across multiple exchanges, enabling more natural and coherent interactions.

### Key Concepts

- **Session Management**: Tracking conversation sessions
- **Context Preservation**: Maintaining conversation context
- **Turn Management**: Handling conversation turns
- **Memory Management**: Storing and retrieving conversation history

## Basic Conversation Management

### Creating and Managing Conversations

```javascript
class ConversationManager {
  constructor(apiKey, organizationId, projectId, agentId) {
    this.apiKey = apiKey;
    this.organizationId = organizationId;
    this.projectId = projectId;
    this.agentId = agentId;
    this.baseUrl = 'https://api.llmcrafter.com';
    this.headers = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    };
    this.conversations = new Map(); // Local conversation store
  }

  generateConversationId() {
    return 'conv_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  async startConversation(userId, metadata = {}) {
    const conversationId = this.generateConversationId();
    
    const conversation = {
      id: conversationId,
      userId,
      agentId: this.agentId,
      startTime: new Date().toISOString(),
      metadata,
      messages: [],
      context: {
        user_preferences: {},
        conversation_state: 'active',
        custom_data: {}
      }
    };

    this.conversations.set(conversationId, conversation);
    
    // Send welcome message if configured
    if (metadata.sendWelcome) {
      await this.sendMessage(conversationId, 'system', 'Hello! How can I help you today?');
    }

    return conversation;
  }

  async sendMessage(conversationId, role, content, executeAgent = true) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const message = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      role, // 'user', 'assistant', 'system'
      content,
      timestamp: new Date().toISOString(),
      metadata: {}
    };

    conversation.messages.push(message);

    // If it's a user message and executeAgent is true, get agent response
    if (role === 'user' && executeAgent) {
      const agentResponse = await this.executeAgent(conversationId, content);
      
      const responseMessage = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: agentResponse.response,
        timestamp: new Date().toISOString(),
        metadata: {
          execution_id: agentResponse.execution_id,
          tokens_used: agentResponse.tokens_used,
          response_time_ms: agentResponse.response_time_ms,
          tools_used: agentResponse.tools_used
        }
      };

      conversation.messages.push(responseMessage);
      return responseMessage;
    }

    return message;
  }

  async executeAgent(conversationId, prompt) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Build conversation context
    const conversationHistory = conversation.messages
      .slice(-10) // Last 10 messages for context
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const context = {
      conversation_id: conversationId,
      user_id: conversation.userId,
      conversation_history: conversationHistory,
      conversation_metadata: conversation.metadata,
      message_count: conversation.messages.length
    };

    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.organizationId}/projects/${this.projectId}/agents/${this.agentId}/execute`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          prompt,
          context
        })
      }
    );

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Agent execution failed');
    }

    return {
      response: result.data.execution.response,
      execution_id: result.data.execution.id,
      tokens_used: result.data.execution.metadata.tokens_used,
      response_time_ms: result.data.execution.metadata.response_time_ms,
      tools_used: result.data.execution.metadata.tools_used || []
    };
  }

  getConversation(conversationId) {
    return this.conversations.get(conversationId);
  }

  getConversationHistory(conversationId, limit = 50) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return conversation.messages.slice(-limit);
  }

  updateConversationContext(conversationId, contextUpdates) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.context = {
      ...conversation.context,
      ...contextUpdates
    };

    return conversation;
  }

  endConversation(conversationId, reason = 'user_ended') {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.endTime = new Date().toISOString();
    conversation.context.conversation_state = 'ended';
    conversation.metadata.end_reason = reason;

    return conversation;
  }
}

// Usage Example
const conversationManager = new ConversationManager(
  process.env.LLM_CRAFTER_API_KEY,
  'org_123456',
  'proj_789012',
  'agent_345678'
);

// Start a conversation
const conversation = await conversationManager.startConversation('user_123', {
  channel: 'web',
  source: 'support_chat',
  sendWelcome: true
});

console.log('Started conversation:', conversation.id);

// Send user message and get response
const response = await conversationManager.sendMessage(
  conversation.id,
  'user',
  'I need help with my account'
);

console.log('Agent response:', response.content);
```

## Advanced Conversation Features

### Multi-Turn Conversation with Context

```javascript
class AdvancedConversationManager extends ConversationManager {
  constructor(apiKey, organizationId, projectId, agentId) {
    super(apiKey, organizationId, projectId, agentId);
    this.contextStrategies = {
      'customer_support': this.buildSupportContext.bind(this),
      'sales': this.buildSalesContext.bind(this),
      'general': this.buildGeneralContext.bind(this)
    };
  }

  async startConversation(userId, metadata = {}) {
    const conversation = await super.startConversation(userId, metadata);
    
    // Initialize conversation-specific context based on type
    const conversationType = metadata.type || 'general';
    conversation.context.conversation_type = conversationType;
    
    // Load user profile if available
    if (metadata.loadUserProfile) {
      conversation.context.user_profile = await this.loadUserProfile(userId);
    }

    return conversation;
  }

  buildSupportContext(conversation) {
    const recentMessages = conversation.messages.slice(-6);
    const userIssues = recentMessages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content);

    return {
      conversation_type: 'customer_support',
      user_id: conversation.userId,
      recent_issues: userIssues,
      conversation_length: conversation.messages.length,
      user_sentiment: this.analyzeSentiment(recentMessages),
      escalation_level: this.calculateEscalationLevel(conversation)
    };
  }

  buildSalesContext(conversation) {
    return {
      conversation_type: 'sales',
      user_id: conversation.userId,
      lead_score: conversation.context.user_profile?.lead_score || 0,
      products_discussed: this.extractProductsMentioned(conversation),
      conversation_stage: this.determineSalesStage(conversation),
      budget_indicators: this.extractBudgetIndicators(conversation)
    };
  }

  buildGeneralContext(conversation) {
    return {
      conversation_type: 'general',
      user_id: conversation.userId,
      topics_discussed: this.extractTopics(conversation),
      conversation_mood: this.analyzeMood(conversation)
    };
  }

  async executeAgent(conversationId, prompt) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Use appropriate context strategy
    const conversationType = conversation.context.conversation_type || 'general';
    const contextStrategy = this.contextStrategies[conversationType];
    const enhancedContext = contextStrategy(conversation);

    const response = await fetch(
      `${this.baseUrl}/api/organizations/${this.organizationId}/projects/${this.projectId}/agents/${this.agentId}/execute`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          prompt,
          context: enhancedContext
        })
      }
    );

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Agent execution failed');
    }

    // Update conversation context based on response
    await this.updateContextFromResponse(conversationId, result.data.execution);

    return {
      response: result.data.execution.response,
      execution_id: result.data.execution.id,
      tokens_used: result.data.execution.metadata.tokens_used,
      response_time_ms: result.data.execution.metadata.response_time_ms,
      tools_used: result.data.execution.metadata.tools_used || []
    };
  }

  analyzeSentiment(messages) {
    // Simple sentiment analysis - in practice, you'd use a proper sentiment analysis tool
    const userMessages = messages.filter(msg => msg.role === 'user');
    const negativeWords = ['angry', 'frustrated', 'upset', 'disappointed', 'terrible', 'awful'];
    const positiveWords = ['great', 'awesome', 'excellent', 'perfect', 'wonderful', 'amazing'];
    
    let sentiment = 'neutral';
    let negativeCount = 0;
    let positiveCount = 0;

    userMessages.forEach(msg => {
      const content = msg.content.toLowerCase();
      negativeCount += negativeWords.filter(word => content.includes(word)).length;
      positiveCount += positiveWords.filter(word => content.includes(word)).length;
    });

    if (negativeCount > positiveCount) sentiment = 'negative';
    else if (positiveCount > negativeCount) sentiment = 'positive';

    return { sentiment, confidence: Math.abs(positiveCount - negativeCount) / userMessages.length };
  }

  calculateEscalationLevel(conversation) {
    const factors = [
      conversation.messages.length > 20 ? 1 : 0, // Long conversation
      this.analyzeSentiment(conversation.messages).sentiment === 'negative' ? 2 : 0,
      conversation.messages.filter(msg => 
        msg.content.toLowerCase().includes('manager') || 
        msg.content.toLowerCase().includes('supervisor')
      ).length > 0 ? 3 : 0
    ];

    return Math.max(...factors);
  }

  extractProductsMentioned(conversation) {
    // Extract product names from conversation
    const products = ['pro plan', 'basic plan', 'enterprise', 'premium'];
    const mentioned = new Set();

    conversation.messages.forEach(msg => {
      products.forEach(product => {
        if (msg.content.toLowerCase().includes(product.toLowerCase())) {
          mentioned.add(product);
        }
      });
    });

    return Array.from(mentioned);
  }

  determineSalesStage(conversation) {
    const messageCount = conversation.messages.length;
    const hasDiscussedPrice = conversation.messages.some(msg => 
      msg.content.toLowerCase().includes('price') || 
      msg.content.toLowerCase().includes('cost')
    );
    const hasDiscussedFeatures = conversation.messages.some(msg =>
      msg.content.toLowerCase().includes('feature') ||
      msg.content.toLowerCase().includes('plan')
    );

    if (messageCount < 5) return 'discovery';
    if (hasDiscussedFeatures && !hasDiscussedPrice) return 'presentation';
    if (hasDiscussedPrice) return 'negotiation';
    return 'discovery';
  }

  async updateContextFromResponse(conversationId, execution) {
    const conversation = this.conversations.get(conversationId);
    
    // Update context based on tools used or response content
    if (execution.metadata.tools_used) {
      conversation.context.tools_used = [
        ...(conversation.context.tools_used || []),
        ...execution.metadata.tools_used
      ];
    }

    // Extract any follow-up actions or next steps
    const response = execution.response.toLowerCase();
    if (response.includes('transfer') || response.includes('escalate')) {
      conversation.context.needs_escalation = true;
    }
    
    if (response.includes('follow up') || response.includes('call back')) {
      conversation.context.needs_followup = true;
    }
  }

  async loadUserProfile(userId) {
    // In a real implementation, this would fetch from your user database
    return {
      id: userId,
      name: 'John Doe',
      email: 'john@example.com',
      tier: 'premium',
      join_date: '2023-01-15',
      previous_interactions: 5,
      satisfaction_score: 4.2,
      lead_score: 85
    };
  }

  extractTopics(conversation) {
    // Simple topic extraction - in practice, use NLP libraries
    const topicKeywords = {
      'technical': ['api', 'integration', 'code', 'error', 'bug'],
      'billing': ['payment', 'invoice', 'subscription', 'plan', 'cost'],
      'account': ['profile', 'settings', 'password', 'login', 'access'],
      'product': ['feature', 'functionality', 'how to', 'tutorial']
    };

    const topics = new Set();
    const allContent = conversation.messages
      .map(msg => msg.content.toLowerCase())
      .join(' ');

    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => allContent.includes(keyword))) {
        topics.add(topic);
      }
    });

    return Array.from(topics);
  }

  analyzeMood(conversation) {
    // Analyze overall conversation mood
    const recentMessages = conversation.messages.slice(-5);
    const sentiment = this.analyzeSentiment(recentMessages);
    
    return {
      overall_sentiment: sentiment.sentiment,
      energy_level: recentMessages.length > 3 ? 'high' : 'low',
      engagement: conversation.messages.length > 10 ? 'engaged' : 'casual'
    };
  }
}
```

## Conversation Persistence

### Database Integration

```javascript
class PersistentConversationManager extends AdvancedConversationManager {
  constructor(apiKey, organizationId, projectId, agentId, dbConnection) {
    super(apiKey, organizationId, projectId, agentId);
    this.db = dbConnection;
  }

  async startConversation(userId, metadata = {}) {
    const conversation = await super.startConversation(userId, metadata);
    
    // Save to database
    await this.saveConversationToDb(conversation);
    
    return conversation;
  }

  async sendMessage(conversationId, role, content, executeAgent = true) {
    const message = await super.sendMessage(conversationId, role, content, executeAgent);
    
    // Save message to database
    await this.saveMessageToDb(conversationId, message);
    
    return message;
  }

  async loadConversation(conversationId) {
    // Load from database if not in memory
    if (!this.conversations.has(conversationId)) {
      const conversation = await this.loadConversationFromDb(conversationId);
      if (conversation) {
        this.conversations.set(conversationId, conversation);
      }
    }
    
    return this.conversations.get(conversationId);
  }

  async saveConversationToDb(conversation) {
    // Example using a SQL database
    const query = `
      INSERT INTO conversations (id, user_id, agent_id, start_time, metadata, context)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      metadata = VALUES(metadata),
      context = VALUES(context)
    `;
    
    await this.db.execute(query, [
      conversation.id,
      conversation.userId,
      conversation.agentId,
      conversation.startTime,
      JSON.stringify(conversation.metadata),
      JSON.stringify(conversation.context)
    ]);
  }

  async saveMessageToDb(conversationId, message) {
    const query = `
      INSERT INTO messages (id, conversation_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.execute(query, [
      message.id,
      conversationId,
      message.role,
      message.content,
      message.timestamp,
      JSON.stringify(message.metadata)
    ]);
  }

  async loadConversationFromDb(conversationId) {
    const conversationQuery = `
      SELECT * FROM conversations WHERE id = ?
    `;
    
    const messagesQuery = `
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC
    `;
    
    const [conversationRows] = await this.db.execute(conversationQuery, [conversationId]);
    const [messageRows] = await this.db.execute(messagesQuery, [conversationId]);
    
    if (conversationRows.length === 0) {
      return null;
    }
    
    const conversationData = conversationRows[0];
    
    return {
      id: conversationData.id,
      userId: conversationData.user_id,
      agentId: conversationData.agent_id,
      startTime: conversationData.start_time,
      endTime: conversationData.end_time,
      metadata: JSON.parse(conversationData.metadata || '{}'),
      context: JSON.parse(conversationData.context || '{}'),
      messages: messageRows.map(row => ({
        id: row.id,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        metadata: JSON.parse(row.metadata || '{}')
      }))
    };
  }

  async getConversationHistory(userId, limit = 10) {
    const query = `
      SELECT id, start_time, end_time, metadata
      FROM conversations
      WHERE user_id = ?
      ORDER BY start_time DESC
      LIMIT ?
    `;
    
    const [rows] = await this.db.execute(query, [userId, limit]);
    
    return rows.map(row => ({
      id: row.id,
      startTime: row.start_time,
      endTime: row.end_time,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }
}
```

## Real-time Conversation Updates

### WebSocket Implementation

```javascript
const WebSocket = require('ws');

class RealTimeConversationManager extends PersistentConversationManager {
  constructor(apiKey, organizationId, projectId, agentId, dbConnection) {
    super(apiKey, organizationId, projectId, agentId, dbConnection);
    this.wsClients = new Map(); // Map conversation IDs to WebSocket clients
  }

  startWebSocketServer(port = 8080) {
    const wss = new WebSocket.Server({ port });
    console.log(`Conversation WebSocket server started on port ${port}`);

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const conversationId = url.searchParams.get('conversation_id');
      const userId = url.searchParams.get('user_id');

      if (!conversationId || !userId) {
        ws.close(1000, 'Missing conversation_id or user_id');
        return;
      }

      // Store client connection
      this.wsClients.set(conversationId, {
        ws,
        userId,
        conversationId,
        joinTime: new Date()
      });

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(data, conversationId, userId);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message'
          }));
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(conversationId);
        console.log(`Client disconnected from conversation ${conversationId}`);
      });

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        conversationId,
        timestamp: new Date().toISOString()
      }));
    });
  }

  async handleWebSocketMessage(data, conversationId, userId) {
    const client = this.wsClients.get(conversationId);
    if (!client) return;

    switch (data.type) {
      case 'send_message':
        await this.handleSendMessage(data, conversationId, userId);
        break;
      
      case 'typing_start':
        await this.broadcastTypingStatus(conversationId, userId, true);
        break;
      
      case 'typing_stop':
        await this.broadcastTypingStatus(conversationId, userId, false);
        break;
      
      case 'get_history':
        await this.sendConversationHistory(conversationId);
        break;
    }
  }

  async handleSendMessage(data, conversationId, userId) {
    // Ensure conversation exists or load it
    let conversation = await this.loadConversation(conversationId);
    
    if (!conversation) {
      conversation = await this.startConversation(userId, {
        channel: 'websocket',
        realtime: true
      });
    }

    // Send user message and get agent response
    const response = await this.sendMessage(
      conversationId,
      'user',
      data.content,
      true
    );

    // Broadcast message to all clients in this conversation
    this.broadcastToConversation(conversationId, {
      type: 'new_message',
      message: {
        role: 'user',
        content: data.content,
        timestamp: new Date().toISOString()
      }
    });

    // Broadcast agent response
    this.broadcastToConversation(conversationId, {
      type: 'new_message',
      message: response
    });
  }

  async broadcastTypingStatus(conversationId, userId, isTyping) {
    this.broadcastToConversation(conversationId, {
      type: 'typing_status',
      userId,
      isTyping,
      timestamp: new Date().toISOString()
    });
  }

  async sendConversationHistory(conversationId) {
    const conversation = await this.loadConversation(conversationId);
    const client = this.wsClients.get(conversationId);
    
    if (conversation && client) {
      client.ws.send(JSON.stringify({
        type: 'conversation_history',
        messages: conversation.messages,
        context: conversation.context
      }));
    }
  }

  broadcastToConversation(conversationId, message) {
    const client = this.wsClients.get(conversationId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

// Usage
const rtConversationManager = new RealTimeConversationManager(
  process.env.LLM_CRAFTER_API_KEY,
  'org_123456',
  'proj_789012',
  'agent_345678',
  dbConnection
);

rtConversationManager.startWebSocketServer(8080);
```

## Conversation Analytics

### Analytics and Insights

```javascript
class ConversationAnalytics {
  constructor(dbConnection) {
    this.db = dbConnection;
  }

  async getConversationMetrics(organizationId, period = '30d') {
    const query = `
      SELECT 
        COUNT(*) as total_conversations,
        AVG(message_count) as avg_messages_per_conversation,
        AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as avg_duration_minutes,
        COUNT(CASE WHEN context->>'$.needs_escalation' = 'true' THEN 1 END) as escalated_conversations,
        COUNT(CASE WHEN end_time IS NOT NULL THEN 1 END) as completed_conversations
      FROM conversations c
      JOIN agents a ON c.agent_id = a.id
      JOIN projects p ON a.project = p.id
      WHERE p.organization = ? 
        AND c.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const [rows] = await this.db.execute(query, [organizationId, periodDays]);
    
    return rows[0];
  }

  async getTopics(organizationId, period = '30d') {
    const query = `
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(context, '$.topics_discussed')) as topics,
        COUNT(*) as frequency
      FROM conversations c
      JOIN agents a ON c.agent_id = a.id
      JOIN projects p ON a.project = p.id
      WHERE p.organization = ? 
        AND c.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND JSON_EXTRACT(context, '$.topics_discussed') IS NOT NULL
      GROUP BY topics
      ORDER BY frequency DESC
      LIMIT 10
    `;
    
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const [rows] = await this.db.execute(query, [organizationId, periodDays]);
    
    return rows;
  }

  async getSentimentAnalysis(organizationId, period = '30d') {
    const query = `
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(context, '$.user_sentiment.sentiment')) as sentiment,
        COUNT(*) as count,
        AVG(JSON_EXTRACT(context, '$.user_sentiment.confidence')) as avg_confidence
      FROM conversations c
      JOIN agents a ON c.agent_id = a.id
      JOIN projects p ON a.project = p.id
      WHERE p.organization = ? 
        AND c.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND JSON_EXTRACT(context, '$.user_sentiment') IS NOT NULL
      GROUP BY sentiment
    `;
    
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const [rows] = await this.db.execute(query, [organizationId, periodDays]);
    
    return rows;
  }

  async getAgentPerformance(organizationId, period = '30d') {
    const query = `
      SELECT 
        a.id as agent_id,
        a.name as agent_name,
        COUNT(c.id) as total_conversations,
        AVG(c.message_count) as avg_messages,
        AVG(TIMESTAMPDIFF(MINUTE, c.start_time, c.end_time)) as avg_duration,
        COUNT(CASE WHEN c.context->>'$.user_sentiment.sentiment' = 'positive' THEN 1 END) as positive_conversations,
        COUNT(CASE WHEN c.context->>'$.needs_escalation' = 'true' THEN 1 END) as escalated_conversations
      FROM agents a
      JOIN projects p ON a.project = p.id
      LEFT JOIN conversations c ON a.id = c.agent_id 
        AND c.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
      WHERE p.organization = ?
      GROUP BY a.id, a.name
      ORDER BY total_conversations DESC
    `;
    
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const [rows] = await this.db.execute(query, [periodDays, organizationId]);
    
    return rows;
  }
}

// Usage
const analytics = new ConversationAnalytics(dbConnection);

const metrics = await analytics.getConversationMetrics('org_123456', '30d');
const topics = await analytics.getTopics('org_123456', '30d');
const sentiment = await analytics.getSentimentAnalysis('org_123456', '30d');
const performance = await analytics.getAgentPerformance('org_123456', '30d');

console.log('Conversation Analytics:', {
  metrics,
  topics,
  sentiment,
  performance
});
```

This comprehensive guide provides practical examples for managing conversations in LLM Crafter, from basic conversation handling to advanced features like real-time updates and analytics. These patterns can be adapted to various use cases and scaled according to your needs.
