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
      throw new Error("API key and base URL are required");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
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
    const config = {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === "object") {
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

        // Don't retry non-network errors on last attempt
        if (attempt === this.retryAttempts) {
          break;
        }

        // Wait before retrying
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * attempt)
        );
      }
    }

    throw lastError;
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
        method: "POST",
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
    return this._request("/sessions", {
      method: "POST",
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
    return this._request("/sessions");
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
      method: "DELETE",
    });
  }

  /**
   * Revoke all sessions
   * @returns {Promise<Object>} Revocation confirmation
   */
  async revokeAllSessions() {
    return this._request("/sessions", {
      method: "DELETE",
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
   * @returns {Promise<Object>} Agent response
   */
  async chatWithAgent(
    sessionToken,
    message,
    conversationId = null,
    userIdentifier = null,
    dynamicContext = {}
  ) {
    return this._request("/external/agents/chat", {
      method: "POST",
      headers: {
        "X-Session-Token": sessionToken,
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
    return this._request("/external/agents/execute", {
      method: "POST",
      headers: {
        "X-Session-Token": sessionToken,
      },
      body: {
        input,
        context,
      },
    });
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
   * @returns {Promise<Object>} Agent response
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
        method: "POST",
        body: {
          message,
          conversationId,
          userIdentifier,
          dynamicContext,
        },
      }
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
    return this._request("/external/usage/api-key");
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
   * Test API key connectivity
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    try {
      const usage = await this.getUsage();
      return {
        success: true,
        message: "API key is valid and working",
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

// CommonJS fallback
if (typeof module !== "undefined" && module.exports) {
  module.exports = LLMCrafterClient;
  module.exports.LLMCrafterClient = LLMCrafterClient;
  module.exports.default = LLMCrafterClient;
}

export { LLMCrafterClient, LLMCrafterClient as default };
