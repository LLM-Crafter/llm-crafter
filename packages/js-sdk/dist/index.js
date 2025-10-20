/**
 * LLM Crafter JavaScript SDK
 *
 * A simple client library for interacting with the LLM Crafter API using API keys.
 *
 * @example
 * ```javascript
 * import { LLMCrafterClient } from '@llm-crafter/sdk';
 *
 * const client = new LLMCrafterClient('your-api-key', 'https://your-domain.com/api/v1');
 *
 * // Execute a prompt
 * const promptResult = await client.executePrompt('org_123', 'proj_456', 'greeting', {
 *   name: 'John'
 * });
 *
 * // Create agent session and chat
 * const session = await client.createAgentSession('agent_789');
 * const chatResult = await client.chatWithAgent(session.session_token, 'Hello!');
 * 
 * // chatResult contains:
 * // {
 * //   conversation_id: "uuid",
 * //   response: "Agent's response text",
 * //   suggestions: ["suggestion1", "suggestion2"],
 * //   handoff_requested: false, // true if human handoff requested
 * //   handoff_info: null, // handoff details if requested
 * //   session_info: { session_id: "id", remaining_interactions: 99 }
 * // }
 * 
 * console.log(chatResult.response); // Agent's text response
 * console.log(chatResult.suggestions); // Suggested follow-up questions
 * 
 * // Check for human handoff
 * if (chatResult.handoff_requested) {
 *   console.log('Human handoff requested:', chatResult.handoff_info.reason);
 *   // Start polling for human responses
 *   const pollForHuman = setInterval(async () => {
 *     const messages = await client.getLatestMessages(
 *       session.session_token, 
 *       chatResult.conversation_id,
 *       new Date().toISOString()
 *     );
 *     // Handle human operator messages
 *   }, 2000);
 * }
 *
 * // Streaming chat with session token
 * await client.chatWithAgentStream(
 *   session.session_token,
 *   'Tell me a story',
 *   null, // conversationId
 *   null, // userIdentifier
 *   {}, // dynamicContext
 *   (chunk) => process.stdout.write(chunk), // onChunk
 *   (data) => console.log('\n✓ Complete:', data), // onComplete
 *   (error) => console.error('❌ Error:', error) // onError
 * );
 *
 * // Streaming task execution
 * await client.executeTaskAgentStream(
 *   session.session_token,
 *   'Analyze this data: [1,2,3,4,5]',
 *   {}, // context
 *   (chunk) => process.stdout.write(chunk), // onChunk
 *   (data) => console.log('\n✓ Task Complete:', data), // onComplete
 *   (error) => console.error('❌ Error:', error) // onError
 * );
 * ```
 */

// Polyfill fetch for Node.js environments
const fetch = (() => {
  if (typeof globalThis !== 'undefined' && globalThis.fetch) {
    return globalThis.fetch;
  }
  if (typeof window !== 'undefined' && window.fetch) {
    return window.fetch;
  }
  // For Node.js, require node-fetch if available
  try {
    return require('node-fetch');
  } catch {
    throw new Error(
      'fetch is not available. Please install node-fetch: npm install node-fetch'
    );
  }
})();

/**
 * LLM Crafter API Client
 */
class LLMCrafterClient {
  /**
   * Create a new LLM Crafter client
   * @param {string} apiKey - Your API key
   * @param {string} baseUrl - Base URL for the API (e.g., 'https://api.llmcrafter.com/api/v1')
   * @param {Object} options - Additional options
   * @param {number} [options.timeout=30000] - Request timeout in milliseconds
   * @param {number} [options.retryAttempts=3] - Number of retry attempts
   * @param {number} [options.retryDelay=1000] - Delay between retries in milliseconds
   */
  constructor(apiKey, baseUrl, options = {}) {
    if (!apiKey || !baseUrl) {
      throw new Error('API key and base URL are required');
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = options.timeout || 30000; // 30 second default timeout
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  /**
   * Make an authenticated HTTP request
   * @private
   */
  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Separate headers from other options to prevent overriding
    const { headers: optionHeaders = {}, ...otherOptions } = options;
    
    const config = {
      method: 'GET',
      ...otherOptions, // Spread other options first
      headers: {
        'X-API-Key': this.apiKey,
        ...optionHeaders,
        'Content-Type': 'application/json', // Ensure this is always set
      },
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    let lastError;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, config);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData.error || `HTTP ${response.status}`);
          error.status = response.status;
          error.code = errorData.code;
          error.response = errorData;

          // Don't retry client errors (4xx) except 429 (rate limit)
          if (
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429
          ) {
            throw error;
          }

          lastError = error;
        } else {
          return await response.json();
        }
      } catch (error) {
        lastError = error;

        if (
          typeof error.status === 'number' &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          throw error;
        }

        // Don't retry non-network errors on last attempt
        if (attempt === this.retryAttempts) {
          break;
        }

        // Wait before retrying
        await new Promise(resolve =>
          setTimeout(resolve, this.retryDelay * attempt)
        );
      }
    }

    throw lastError;
  }

  /**
   * Make a streaming request to the API
   * @private
   */
  async _streamRequest(endpoint, options = {}, onChunk, onComplete, onError) {
    const url = `${this.baseUrl}${endpoint}`;
    const { headers: optionHeaders = {}, body: optionBody, ...otherOptions } =
      options;

    const config = {
      method: 'GET',
      ...otherOptions,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        ...optionHeaders,
      },
    };

    if (typeof optionBody !== 'undefined') {
      config.body = JSON.stringify(optionBody);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = errorData.code;
        error.response = errorData;
        onError(error);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'response_chunk') {
                  onChunk(data.content);
                } else if (data.type === 'complete') {
                  onComplete(data);
                } else if (data.type === 'error') {
                  const error = new Error(data.error || 'Streaming error');
                  error.code = data.code;
                  onError(error);
                }
              } catch (parseError) {
                // Ignore malformed JSON lines
                console.warn('Failed to parse SSE data:', line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      onError(error);
    }
  }

  // ===== PROMPT EXECUTION =====

  /**
   * Execute a prompt
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @param {string} promptName - Name of the prompt to execute
   * @param {Object} variables - Variables to substitute in the prompt
   * @returns {Promise<Object>} Execution result
   */
  async executePrompt(orgId, projectId, promptName, variables = {}) {
    return this._request(
      `/external/organizations/${orgId}/projects/${projectId}/prompts/${promptName}/execute`,
      {
        method: 'POST',
        body: { variables },
      }
    );
  }

  // ===== AGENT SESSION MANAGEMENT =====

  /**
   * Create a session token for agent execution
   * @param {string} agentId - Agent ID
   * @param {Object} options - Session options
   * @param {number} options.maxInteractions - Maximum interactions (default: 100)
   * @param {number} options.expiresIn - Session duration in seconds (default: 3600)
   * @returns {Promise<Object>} Session information including token
   */
  async createAgentSession(agentId, options = {}) {
    return this._request('/sessions', {
      method: 'POST',
      body: {
        agentId,
        maxInteractions: options.maxInteractions || 100,
        expiresIn: options.expiresIn || 3600,
      },
    });
  }

  /**
   * Get all active sessions
   * @returns {Promise<Object>} List of active sessions
   */
  async getSessions() {
    return this._request('/sessions');
  }

  /**
   * Get session information
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session information
   */
  async getSession(sessionId) {
    return this._request(`/sessions/${sessionId}`);
  }

  /**
   * Revoke a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Revocation confirmation
   */
  async revokeSession(sessionId) {
    return this._request(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Revoke all sessions
   * @returns {Promise<Object>} Revocation confirmation
   */
  async revokeAllSessions() {
    return this._request('/sessions', {
      method: 'DELETE',
    });
  }

  // ===== AGENT EXECUTION =====

  /**
   * Chat with an agent using a session token
   * @param {string} sessionToken - Session token from createAgentSession
   * @param {string} message - Message to send to the agent
   * @param {string} conversationId - Optional conversation ID to continue
   * @param {string} userIdentifier - Optional user identifier
   * @param {Object} dynamicContext - Optional dynamic context
   * @returns {Promise<Object>} Agent response with handoff information
   * @example
   * Response format includes handoff information:
   * ```javascript
   * {
   *   conversation_id: "uuid",
   *   response: "Agent's response text",
   *   suggestions: ["suggestion1", "suggestion2"],
   *   handoff_requested: false, // true if agent requested human handoff
   *   handoff_info: { // Present if handoff_requested is true
   *     reason: "User needs complex technical support",
   *     urgency: "medium", // "low" | "medium" | "high"
   *     context_summary: "Brief summary for human operator",
   *     status: "handoff_requested",
   *     requested_at: "2024-01-01T12:00:00Z"
   *   },
   *   session_info: {
   *     session_id: "session_id",
   *     remaining_interactions: 99,
   *     expires_at: "2024-01-01T13:00:00Z"
   *   }
   * }
   * ```
   */
  async chatWithAgent(
    sessionToken,
    message,
    conversationId = null,
    userIdentifier = null,
    dynamicContext = {}
  ) {
    return this._request('/external/agents/chat', {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
      },
      body: {
        message,
        conversationId,
        userIdentifier,
        dynamicContext,
      },
    });
  }

  /**
   * Execute a task agent using a session token
   * @param {string} sessionToken - Session token from createAgentSession
   * @param {string} input - Input for the task agent
   * @param {Object} context - Optional context
   * @returns {Promise<Object>} Agent response
   */
  async executeTaskAgent(sessionToken, input, context = {}) {
    return this._request('/external/agents/execute', {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
      },
      body: {
        input,
        context,
      },
    });
  }

  /**
   * Chat with an agent using streaming (session token)
   * @param {string} sessionToken - Session token from createAgentSession
   * @param {string} message - Message to send to the agent
   * @param {string} conversationId - Optional conversation ID
   * @param {string} userIdentifier - Optional user identifier
   * @param {Object} dynamicContext - Optional dynamic context
   * @param {Function} onChunk - Callback function for each chunk: (chunk: string) => void
   * @param {Function} onComplete - Callback function when complete with handoff info: (data: Object) => void
   * @param {Function} onError - Callback function for errors: (error: Error) => void
   * @returns {Promise<void>} Promise that resolves when streaming starts
   * @example
   * The onComplete callback receives an object with handoff information:
   * ```javascript
   * {
   *   conversation_id: "uuid",
   *   suggestions: ["suggestion1", "suggestion2"],
   *   handoff_requested: false, // true if agent requested human handoff
   *   handoff_info: { // Present if handoff_requested is true
   *     reason: "User needs complex technical support",
   *     urgency: "medium",
   *     context_summary: "Brief summary for human operator",
   *     status: "handoff_requested",
   *     requested_at: "2024-01-01T12:00:00Z"
   *   },
   *   session_info: {
   *     session_id: "session_id",
   *     remaining_interactions: 99,
   *     expires_at: "2024-01-01T13:00:00Z"
   *   }
   * }
   * ```
   */
  async chatWithAgentStream(
    sessionToken,
    message,
    conversationId = null,
    userIdentifier = null,
    dynamicContext = {},
    onChunk = () => {},
    onComplete = () => {},
    onError = () => {}
  ) {
    return this._streamRequest('/external/agents/chat/stream', {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
      },
      body: {
        message,
        conversationId,
        userIdentifier,
        dynamicContext,
      },
    }, onChunk, onComplete, onError);
  }

  /**
   * Execute a task agent using streaming (session token)
   * @param {string} sessionToken - Session token from createAgentSession
   * @param {string} input - Input for the task agent
   * @param {Object} context - Optional context
   * @param {Function} onChunk - Callback function for each chunk: (chunk: string) => void
   * @param {Function} onComplete - Callback function when complete: (data: Object) => void
   * @param {Function} onError - Callback function for errors: (error: Error) => void
   * @returns {Promise<void>} Promise that resolves when streaming starts
   */
  async executeTaskAgentStream(
    sessionToken,
    input,
    context = {},
    onChunk = () => {},
    onComplete = () => {},
    onError = () => {}
  ) {
    return this._streamRequest('/external/agents/execute/stream', {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
      },
      body: {
        input,
        context,
      },
    }, onChunk, onComplete, onError);
  }

  /**
   * Chat with an agent using API key (simpler but less secure)
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @param {string} agentId - Agent ID
   * @param {string} message - Message to send
   * @param {string} conversationId - Optional conversation ID
   * @param {string} userIdentifier - Optional user identifier
   * @param {Object} dynamicContext - Optional dynamic context
   * @returns {Promise<Object>} Agent response with handoff information
   * @example
   * Response includes handoff detection:
   * ```javascript
   * {
   *   conversation_id: "uuid", 
   *   response: "Agent's response text",
   *   handoff_requested: false, // true if agent requested human handoff
   *   handoff_info: { // Present if handoff_requested is true
   *     reason: "User needs complex technical support",
   *     urgency: "medium",
   *     context_summary: "Brief summary for human operator"
   *   },
   *   api_key_info: {
   *     api_key_id: "key_id",
   *     daily_limit_remaining: 995
   *   }
   * }
   * ```
   */
  async chatWithAgentDirect(
    orgId,
    projectId,
    agentId,
    message,
    conversationId = null,
    userIdentifier = null,
    dynamicContext = {}
  ) {
    return this._request(
      `/external/organizations/${orgId}/projects/${projectId}/agents/${agentId}/chat`,
      {
        method: 'POST',
        body: {
          message,
          conversationId,
          userIdentifier,
          dynamicContext,
        },
      }
    );
  }

  /**
   * Chat with an agent using streaming (API key-based)
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID 
   * @param {string} agentId - Agent ID
   * @param {string} message - Message to send to the agent
   * @param {string} conversationId - Optional conversation ID
   * @param {string} userIdentifier - Optional user identifier
   * @param {Object} dynamicContext - Optional dynamic context
   * @param {Function} onChunk - Callback function for each chunk: (chunk: string) => void
   * @param {Function} onComplete - Callback function when complete: (data: Object) => void
   * @param {Function} onError - Callback function for errors: (error: Error) => void
   * @returns {Promise<void>} Promise that resolves when streaming starts
   */
  async chatWithAgentDirectStream(
    orgId,
    projectId,
    agentId,
    message,
    conversationId = null,
    userIdentifier = null,
    dynamicContext = {},
    onChunk = () => {},
    onComplete = () => {},
    onError = () => {}
  ) {
    return this._streamRequest(
      `/organizations/${orgId}/projects/${projectId}/agents/${agentId}/chat/stream`,
      {
        method: 'POST',
        body: {
          message,
          conversationId,
          userIdentifier,
          dynamicContext,
        },
      },
      onChunk,
      onComplete,
      onError
    );
  }

  /**
   * Execute a task agent using streaming (API key-based)
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @param {string} agentId - Agent ID
   * @param {string} input - Input for the task agent
   * @param {Object} context - Optional context
   * @param {Function} onChunk - Callback function for each chunk: (chunk: string) => void
   * @param {Function} onComplete - Callback function when complete: (data: Object) => void
   * @param {Function} onError - Callback function for errors: (error: Error) => void
   * @returns {Promise<void>} Promise that resolves when streaming starts
   */
  async executeTaskAgentDirectStream(
    orgId,
    projectId,
    agentId,
    input,
    context = {},
    onChunk = () => {},
    onComplete = () => {},
    onError = () => {}
  ) {
    return this._streamRequest(
      `/organizations/${orgId}/projects/${projectId}/agents/${agentId}/execute/stream`,
      {
        method: 'POST',
        body: {
          input,
          context,
        },
      },
      onChunk,
      onComplete,
      onError
    );
  }

  // ===== INFORMATION RETRIEVAL =====

  /**
   * Get agent information
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Agent information
   */
  async getAgent(orgId, projectId, agentId) {
    return this._request(
      `/external/organizations/${orgId}/projects/${projectId}/agents/${agentId}`
    );
  }

  /**
   * List agents in a project
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} List of agents
   */
  async getAgents(orgId, projectId) {
    return this._request(
      `/external/organizations/${orgId}/projects/${projectId}/agents`
    );
  }

  /**
   * Get project information
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Project information
   */
  async getProject(orgId, projectId) {
    return this._request(
      `/external/organizations/${orgId}/projects/${projectId}`
    );
  }

  /**
   * List accessible projects
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} List of projects
   */
  async getProjects(orgId) {
    return this._request(`/external/organizations/${orgId}/projects`);
  }

  /**
   * Get API key usage statistics
   * @returns {Promise<Object>} Usage statistics
   */
  async getUsage() {
    return this._request('/external/usage/api-key');
  }

  // ===== CONVERSATION POLLING METHODS =====

  /**
   * Get latest messages from a conversation (session-based)
   * Useful for polling for human operator responses during handoff
   * @param {string} sessionToken - Session token from createAgentSession
   * @param {string} conversationId - Conversation ID to poll
   * @param {string} since - ISO timestamp to get messages since (optional)
   * @param {boolean} includeSystem - Whether to include system messages (default: true)
   * @returns {Promise<Object>} Latest messages and conversation info
   * @example
   * ```javascript
   * // Poll for new messages every 2 seconds during handoff
   * const pollForMessages = async (sessionToken, conversationId, lastCheck) => {
   *   const result = await client.getLatestMessages(sessionToken, conversationId, lastCheck);
   *   
   *   if (result.data.messages.length > 0) {
   *     result.data.messages.forEach(msg => {
   *       if (msg.role === 'human_operator') {
   *         console.log('Human operator:', msg.content);
   *       }
   *     });
   *     return new Date().toISOString(); // Update last check time
   *   }
   *   return lastCheck;
   * };
   * ```
   */
  async getLatestMessages(sessionToken, conversationId, since = null, includeSystem = true) {
    const params = new URLSearchParams();
    if (since) params.append('since', since);
    if (includeSystem !== undefined) params.append('include_system', includeSystem.toString());
    
    const url = `/external/conversations/${conversationId}/messages/latest${params.toString() ? '?' + params.toString() : ''}`;
    
    return this._request(url, {
      method: 'GET',
      headers: {
        'X-Session-Token': sessionToken,
      },
    });
  }

  /**
   * Get latest messages from a conversation (API key-based)
   * Alternative to session-based polling using direct API key authentication
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID 
   * @param {string} conversationId - Conversation ID to poll
   * @param {string} since - ISO timestamp to get messages since (optional)
   * @param {boolean} includeSystem - Whether to include system messages (default: true)
   * @returns {Promise<Object>} Latest messages and conversation info
   */
  async getLatestMessagesDirect(orgId, projectId, conversationId, since = null, includeSystem = true) {
    const params = new URLSearchParams();
    if (since) params.append('since', since);
    if (includeSystem !== undefined) params.append('include_system', includeSystem.toString());
    
    const url = `/external/organizations/${orgId}/projects/${projectId}/conversations/${conversationId}/messages/latest${params.toString() ? '?' + params.toString() : ''}`;
    
    return this._request(url);
  }

  // ===== CONVENIENCE METHODS =====

  /**
   * Create a session and immediately start chatting
   * @param {string} agentId - Agent ID
   * @param {string} message - First message
   * @param {Object} sessionOptions - Session options
   * @returns {Promise<Object>} Object containing session info and first response
   */
  async startAgentChat(agentId, message, sessionOptions = {}) {
    const session = await this.createAgentSession(agentId, sessionOptions);
    const response = await this.chatWithAgent(
      session.data.session_token,
      message
    );

    return {
      session: session.data,
      response: response,
    };
  }

  /**
   * Start polling for human operator messages during handoff
   * Convenience method that handles the polling loop automatically
   * @param {string} sessionToken - Session token from createAgentSession
   * @param {string} conversationId - Conversation ID to poll
   * @param {Function} onHumanMessage - Callback for human messages: (message) => void
   * @param {Function} onHandback - Callback when handed back to agent: () => void
   * @param {Object} options - Polling options
   * @param {number} [options.interval=2000] - Polling interval in milliseconds
   * @param {number} [options.maxRetries=50] - Max polling attempts
   * @returns {Promise<Function>} Stop function to cancel polling
   * @example
   * ```javascript
   * const stopPolling = await client.pollForHumanMessages(
   *   sessionToken,
   *   conversationId,
   *   (message) => {
   *     console.log('Human operator:', message.content);
   *   },
   *   () => {
   *     console.log('Conversation handed back to AI');
   *   },
   *   { interval: 2000 }
   * );
   * 
   * // Stop polling when needed
   * // stopPolling();
   * ```
   */
  async pollForHumanMessages(sessionToken, conversationId, onHumanMessage, onHandback, options = {}) {
    const { interval = 2000, maxRetries = 50 } = options;
    let retryCount = 0;
    let lastTimestamp = new Date().toISOString();
    let isActive = true;

    const poll = async () => {
      if (!isActive || retryCount >= maxRetries) return;

      try {
        const result = await this.getLatestMessages(sessionToken, conversationId, lastTimestamp);
        
        if (result.data && result.data.messages) {
          result.data.messages.forEach(message => {
            if (message.role === 'human_operator' && onHumanMessage) {
              onHumanMessage(message);
            }
            if (message.role === 'system' && message.content.includes('handed back to agent') && onHandback) {
              onHandback();
              isActive = false;
              return;
            }
          });

          if (result.data.messages.length > 0) {
            lastTimestamp = new Date().toISOString();
          }
        }

        retryCount++;
        if (isActive) {
          setTimeout(poll, interval);
        }
      } catch (error) {
        console.error('Polling error:', error);
        retryCount++;
        if (isActive && retryCount < maxRetries) {
          setTimeout(poll, interval);
        }
      }
    };

    // Start polling
    setTimeout(poll, interval);

    // Return stop function
    return () => {
      isActive = false;
    };
  }

  /**
   * Test API key connectivity
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    try {
      const usage = await this.getUsage();
      return {
        success: true,
        message: 'API key is valid and working',
        usage: usage.data,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error,
      };
    }
  }
}

export { LLMCrafterClient, LLMCrafterClient as default };
