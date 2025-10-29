import './styles.css';

/**
 * LLM Crafter Chat Widget
 * Embeddable AI chat widget for websites
 */
class LLMCrafterChatWidget {
  constructor(config) {
    this.config = {
      apiKey: config.apiKey,
      agentId: config.agentId,
      organizationId: config.organizationId,
      projectId: config.projectId,
      apiUrl: config.apiUrl || 'https://api.llmcrafter.com',

      // Customization options
      title: config.title || 'AI Assistant',
      subtitle: config.subtitle || 'Online • Typically replies instantly',
      placeholder: config.placeholder || 'Type your message...',
      avatarText: config.avatarText || 'AI',
      userAvatarText: config.userAvatarText || 'U',
      humanAvatarText: config.humanAvatarText || '👤',
      botName: config.botName || 'AI', // Name shown for bot messages
      humanOperatorName: config.humanOperatorName || 'Human', // Name shown for human operator messages
      welcomeMessage:
        config.welcomeMessage || 'Hello! 👋 How can I help you today?',

      // Colors
      primaryColor: config.primaryColor || '#4a90e2',
      secondaryColor: config.secondaryColor || '#357abd',
      backgroundColor: config.backgroundColor || '#f5f7fa',
      textColor: config.textColor || '#333333',

      // Behavior
      position: config.position || 'bottom-right', // bottom-right, bottom-left
      autoOpen: config.autoOpen || false,
      showPoweredBy: config.showPoweredBy !== false,
      poweredByUrl: config.poweredByUrl || '#',
      userIdentifier: config.userIdentifier || null,
      enableStreaming: config.enableStreaming !== false,
      pollingInterval: config.pollingInterval || 3000, // Poll for new messages every 3 seconds

      // Advanced
      onMessageSent: config.onMessageSent || null,
      onMessageReceived: config.onMessageReceived || null,
      onError: config.onError || null,
      onHumanTakeover: config.onHumanTakeover || null,
    };

    this.conversationId = null;
    this.sessionToken = null;
    this.messages = [];
    this.isOpen = false;
    this.isTyping = false;
    this.pollingIntervalId = null;
    this.lastPollTimestamp = null;
    this.isHumanControlled = false;

    this.init();
  }

  init() {
    this.createWidget();
    this.attachEventListeners();
    this.applyCustomStyles();

    if (this.config.welcomeMessage) {
      this.addMessage(this.config.welcomeMessage, false);
    }

    if (this.config.autoOpen) {
      this.open();
    }

    // Initialize session
    this.initializeSession();
  }

  createWidget() {
    // Create container
    const container = document.createElement('div');
    container.className = 'llm-crafter-widget-container';
    container.setAttribute('data-widget-id', 'llm-crafter-chat');

    // Create floating button
    const button = document.createElement('button');
    button.className = 'llm-crafter-widget-button open';
    button.innerHTML = `
      <svg class="icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    `;

    // Create chat window
    const chatWindow = document.createElement('div');
    chatWindow.className = 'llm-crafter-chat-window';
    chatWindow.innerHTML = `
      <div class="llm-crafter-chat-header">
        <div class="llm-crafter-avatar">${this.config.avatarText}</div>
        <div class="llm-crafter-header-info">
          <h3>${this.config.title}</h3>
          <p>${this.config.subtitle}</p>
        </div>
        <button class="llm-crafter-close-btn" title="Close chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="llm-crafter-chat-messages"></div>
      <div class="llm-crafter-chat-input">
        <input type="text" placeholder="${this.config.placeholder}" />
        <button class="llm-crafter-send-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
      ${this.config.showPoweredBy ? `<div class="llm-crafter-powered-by">Powered by <a href="${this.config.poweredByUrl}" target="_blank">LLM Crafter</a></div>` : ''}
    `;

    container.appendChild(button);
    container.appendChild(chatWindow);
    document.body.appendChild(container);

    // Store references
    this.elements = {
      container,
      button,
      chatWindow,
      closeBtn: chatWindow.querySelector('.llm-crafter-close-btn'),
      messagesContainer: chatWindow.querySelector('.llm-crafter-chat-messages'),
      input: chatWindow.querySelector('.llm-crafter-chat-input input'),
      sendBtn: chatWindow.querySelector('.llm-crafter-send-btn'),
    };
  }

  attachEventListeners() {
    // Toggle chat window
    this.elements.button.addEventListener('click', () => this.toggle());
    this.elements.closeBtn.addEventListener('click', () => this.close());

    // Send message
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    this.elements.input.addEventListener('keypress', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  applyCustomStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .llm-crafter-widget-container {
        --primary-color: ${this.config.primaryColor};
        --secondary-color: ${this.config.secondaryColor};
        --background-color: ${this.config.backgroundColor};
        --text-color: ${this.config.textColor};
      }
    `;

    // Position
    if (this.config.position === 'bottom-left') {
      style.textContent += `
        .llm-crafter-widget-container {
          left: 20px;
          right: auto;
        }
        .llm-crafter-chat-window {
          left: 20px;
          right: auto;
        }
        @media (max-width: 480px) {
          .llm-crafter-widget-container {
            left: 10px;
          }
          .llm-crafter-chat-window {
            left: 10px;
          }
        }
      `;
    }

    document.head.appendChild(style);
  }

  async initializeSession() {
    try {
      // Create a session using the API key
      const response = await fetch(`${this.config.apiUrl}/api/v1/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          agentId: this.config.agentId,
          userIdentifier: this.config.userIdentifier,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initialize session');
      }

      const result = await response.json();
      const data = result.data || result;
      this.sessionToken = data.session_token || data.token;
      this.conversationId = data.conversationId;
    } catch (error) {
      console.error('LLM Crafter Widget: Failed to initialize session', error);
      this.handleError('Failed to initialize chat session');
    }
  }

  async sendMessage() {
    const message = this.elements.input.value.trim();
    if (!message || this.isTyping) return;

    // Add user message
    this.addMessage(message, true);
    this.elements.input.value = '';

    // Disable input while processing
    this.setInputState(false);

    // Show typing indicator
    this.showTypingIndicator();

    try {
      // Call onMessageSent callback
      if (this.config.onMessageSent) {
        this.config.onMessageSent(message);
      }

      // Choose streaming or non-streaming based on config
      if (this.config.enableStreaming) {
        await this.sendMessageStreaming(message);
      } else {
        await this.sendMessageNonStreaming(message);
      }
    } catch (error) {
      console.error('LLM Crafter Widget: Error sending message', error);
      this.hideTypingIndicator();
      this.handleError(
        error.message || 'Failed to send message. Please try again.'
      );
    } finally {
      this.setInputState(true);
    }
  }

  async sendMessageNonStreaming(message) {
    // Send to API (non-streaming)
    const requestBody = {
      message,
      userIdentifier: this.config.userIdentifier || 'anonymous',
    };

    // Include conversationId if we have one to continue the conversation
    if (this.conversationId) {
      requestBody.conversationId = this.conversationId;
    }

    const response = await fetch(
      `${this.config.apiUrl}/api/v1/external/agents/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': this.sessionToken,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to send message');
    }

    const data = await response.json();

    // Remove typing indicator
    this.hideTypingIndicator();

    // Add bot response only if there's content and not human controlled
    const botMessage = data.response || data.message || '';

    // Only show bot message if:
    // 1. There's actual content
    // 2. Conversation is not human controlled (human will respond via polling)
    if (botMessage && !this.isHumanControlled) {
      this.addMessage(botMessage, false, this.config.botName);

      // Call onMessageReceived callback
      if (this.config.onMessageReceived) {
        this.config.onMessageReceived(botMessage, data);
      }
    }

    // Update conversation ID from response
    if (data.conversation_id) {
      this.conversationId = data.conversation_id;

      // Start polling if not already polling and we have a conversation
      if (!this.pollingIntervalId && this.conversationId) {
        this.startPolling();
      }
    }
  }

  async sendMessageStreaming(message) {
    const requestBody = {
      message,
      userIdentifier: this.config.userIdentifier || 'anonymous',
    };

    // Include conversationId if we have one to continue the conversation
    if (this.conversationId) {
      requestBody.conversationId = this.conversationId;
    }

    const response = await fetch(
      `${this.config.apiUrl}/api/v1/external/agents/chat/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': this.sessionToken,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to send message');
    }

    // Remove typing indicator before streaming starts
    this.hideTypingIndicator();

    // Don't show streaming response if human controlled - they will respond via polling
    if (this.isHumanControlled) {
      // Still need to consume the stream and get conversation ID
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let conversationId = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data.trim()) {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'complete') {
                    conversationId = parsed.conversation_id;
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Update conversation ID
      if (conversationId) {
        this.conversationId = conversationId;
        if (!this.pollingIntervalId && this.conversationId) {
          this.startPolling();
        }
      }

      return;
    }

    // Create a message bubble for streaming response
    const messageDiv = document.createElement('div');
    messageDiv.className = 'llm-crafter-message bot';
    messageDiv.innerHTML = `
      <div class="llm-crafter-message-avatar">${this.config.avatarText}</div>
      <div class="llm-crafter-message-content">
        ${this.config.botName ? `<div class="llm-crafter-message-sender">${this.escapeHtml(this.config.botName)}</div>` : ''}
        <div class="llm-crafter-message-bubble"></div>
      </div>
    `;
    this.elements.messagesContainer.appendChild(messageDiv);
    const bubbleElement = messageDiv.querySelector(
      '.llm-crafter-message-bubble'
    );

    let fullResponse = '';
    let conversationId = null;

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix

            if (data.trim()) {
              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'response_chunk') {
                  fullResponse += parsed.content;
                  bubbleElement.textContent = fullResponse;
                  this.scrollToBottom();
                } else if (parsed.type === 'complete') {
                  conversationId = parsed.conversation_id;
                }
              } catch (e) {
                // Skip invalid JSON
                console.warn('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Store the complete message with sender name
    this.messages.push({
      text: fullResponse,
      isUser: false,
      senderName: this.config.botName,
      timestamp: new Date(),
    });

    // Update conversation ID
    if (conversationId) {
      this.conversationId = conversationId;

      // Start polling if not already polling
      if (!this.pollingIntervalId && this.conversationId) {
        this.startPolling();
      }
    }

    // Call onMessageReceived callback
    if (this.config.onMessageReceived) {
      this.config.onMessageReceived(fullResponse, {
        conversation_id: conversationId,
      });
    }
  }

  addMessage(text, isUser = false, senderName = null, isHumanOperator = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `llm-crafter-message ${isUser ? 'user' : 'bot'}`;

    // Determine avatar text based on sender type
    let avatarText;
    if (isUser) {
      avatarText = this.config.userAvatarText;
    } else if (isHumanOperator) {
      avatarText = this.config.humanAvatarText;
    } else {
      avatarText = this.config.avatarText;
    }

    // Determine the sender name to display
    const displayName = senderName || (isUser ? null : this.config.botName);

    messageDiv.innerHTML = `
      <div class="llm-crafter-message-avatar">${this.escapeHtml(avatarText)}</div>
      <div class="llm-crafter-message-content">
        ${displayName ? `<div class="llm-crafter-message-sender">${this.escapeHtml(displayName)}</div>` : ''}
        <div class="llm-crafter-message-bubble">${this.escapeHtml(text)}</div>
      </div>
    `;

    this.elements.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();

    // Store message
    this.messages.push({
      text,
      isUser,
      senderName,
      isHumanOperator,
      timestamp: new Date(),
    });
  }

  showTypingIndicator() {
    if (this.isTyping) return;

    this.isTyping = true;
    const typingDiv = document.createElement('div');
    typingDiv.className = 'llm-crafter-message bot';
    typingDiv.id = 'llm-crafter-typing';
    typingDiv.innerHTML = `
      <div class="llm-crafter-message-avatar">${this.config.avatarText}</div>
      <div class="llm-crafter-message-content">
        <div class="llm-crafter-typing-indicator">
          <div class="llm-crafter-typing-dot"></div>
          <div class="llm-crafter-typing-dot"></div>
          <div class="llm-crafter-typing-dot"></div>
        </div>
      </div>
    `;

    this.elements.messagesContainer.appendChild(typingDiv);
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    this.isTyping = false;
    const typing = document.getElementById('llm-crafter-typing');
    if (typing) {
      typing.remove();
    }
  }

  handleError(message) {
    this.addMessage(`⚠️ ${message}`, false);

    if (this.config.onError) {
      this.config.onError(message);
    }
  }

  setInputState(enabled) {
    this.elements.input.disabled = !enabled;
    this.elements.sendBtn.disabled = !enabled;
  }

  scrollToBottom() {
    this.elements.messagesContainer.scrollTop =
      this.elements.messagesContainer.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  open() {
    this.isOpen = true;
    this.elements.chatWindow.classList.add('open');
    this.elements.button.classList.remove('open');
    this.elements.button.classList.add('close');
    this.elements.input.focus();
  }

  close() {
    this.isOpen = false;
    this.elements.chatWindow.classList.remove('open');
    this.elements.button.classList.remove('close');
    this.elements.button.classList.add('open');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  startPolling() {
    if (this.pollingIntervalId || !this.conversationId) {
      return;
    }

    // Set initial timestamp to now
    this.lastPollTimestamp = new Date().toISOString();

    // Poll for new messages at configured interval
    this.pollingIntervalId = setInterval(() => {
      this.pollForNewMessages();
    }, this.config.pollingInterval);
  }

  stopPolling() {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }

  async pollForNewMessages() {
    if (!this.conversationId || !this.sessionToken) {
      return;
    }

    try {
      const url = new URL(
        `${this.config.apiUrl}/api/v1/external/conversations/${this.conversationId}/messages/latest`
      );

      // Send the last poll timestamp to get only new messages
      if (this.lastPollTimestamp) {
        url.searchParams.append('since', this.lastPollTimestamp);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-Session-Token': this.sessionToken,
        },
      });

      if (!response.ok) {
        console.warn('Failed to poll for new messages:', response.status);
        return;
      }

      const data = await response.json();

      // Update last poll timestamp
      if (data.last_poll) {
        this.lastPollTimestamp = data.last_poll;
      }

      // Check if human has taken over
      if (data.handoff_active && !this.isHumanControlled) {
        this.isHumanControlled = true;

        // Update subtitle to show human operator
        const headerInfo = this.elements.chatWindow.querySelector(
          '.llm-crafter-header-info p'
        );
        if (headerInfo) {
          headerInfo.textContent = '👤 Human operator';
        }

        // Call onHumanTakeover callback
        if (this.config.onHumanTakeover) {
          this.config.onHumanTakeover(data);
        }
      } else if (!data.handoff_active && this.isHumanControlled) {
        // Human handed back to agent
        this.isHumanControlled = false;

        const headerInfo = this.elements.chatWindow.querySelector(
          '.llm-crafter-header-info p'
        );
        if (headerInfo) {
          headerInfo.textContent = this.config.subtitle;
        }
      }

      // Add any new messages from human operators
      if (data.new_messages && data.new_messages.length > 0) {
        for (const msg of data.new_messages) {
          // Only show messages from assistant (bot) or human operators
          // Skip user messages as they're already displayed when sent
          if (
            msg.role === 'assistant' ||
            msg.role === 'human' ||
            msg.role === 'human_operator'
          ) {
            // Determine sender name and avatar based on role
            const isHumanOperator =
              msg.role === 'human' || msg.role === 'human_operator';
            const senderName = isHumanOperator
              ? this.config.humanOperatorName
              : this.config.botName;

            this.addMessage(msg.content, false, senderName, isHumanOperator);

            // Call onMessageReceived callback for human messages
            if (this.config.onMessageReceived) {
              this.config.onMessageReceived(msg.content, {
                role: msg.role,
                from_human: isHumanOperator,
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error polling for new messages:', error);
      // Don't show error to user for polling failures
      // Just log and continue polling
    }
  }

  // Public API methods
  destroy() {
    this.stopPolling();
    if (this.elements.container) {
      this.elements.container.remove();
    }
  }

  clearMessages() {
    this.messages = [];
    this.conversationId = null;
    this.lastPollTimestamp = null;
    this.isHumanControlled = false;
    this.stopPolling();
    this.elements.messagesContainer.innerHTML = '';

    // Reset subtitle to original
    const headerInfo = this.elements.chatWindow.querySelector(
      '.llm-crafter-header-info p'
    );
    if (headerInfo) {
      headerInfo.textContent = this.config.subtitle;
    }

    if (this.config.welcomeMessage) {
      this.addMessage(this.config.welcomeMessage, false);
    }
  }

  setUserIdentifier(identifier) {
    this.config.userIdentifier = identifier;
  }
}

// Auto-initialize if config is provided via script tag
(function () {
  const script =
    document.currentScript ||
    document.querySelector('script[data-llm-crafter]');

  if (script) {
    const config = {
      apiKey: script.getAttribute('data-api-key'),
      agentId: script.getAttribute('data-agent-id'),
      organizationId: script.getAttribute('data-organization-id'),
      projectId: script.getAttribute('data-project-id'),
      apiUrl: script.getAttribute('data-api-url'),
      title: script.getAttribute('data-title'),
      subtitle: script.getAttribute('data-subtitle'),
      placeholder: script.getAttribute('data-placeholder'),
      avatarText: script.getAttribute('data-avatar-text'),
      userAvatarText: script.getAttribute('data-user-avatar-text'),
      humanAvatarText: script.getAttribute('data-human-avatar-text'),
      botName: script.getAttribute('data-bot-name'),
      humanOperatorName: script.getAttribute('data-human-operator-name'),
      welcomeMessage: script.getAttribute('data-welcome-message'),
      primaryColor: script.getAttribute('data-primary-color'),
      secondaryColor: script.getAttribute('data-secondary-color'),
      position: script.getAttribute('data-position'),
      autoOpen: script.getAttribute('data-auto-open') === 'true',
      showPoweredBy: script.getAttribute('data-show-powered-by') !== 'false',
      poweredByUrl: script.getAttribute('data-powered-by-url'),
      enableStreaming: script.getAttribute('data-enable-streaming') !== 'false',
      pollingInterval:
        parseInt(script.getAttribute('data-polling-interval')) || 3000,
    };

    // Remove null/undefined values
    Object.keys(config).forEach(key => {
      if (config[key] === null || config[key] === undefined) {
        delete config[key];
      }
    });

    // Auto-initialize if apiKey is provided
    if (config.apiKey) {
      window.llmCrafterWidget = new LLMCrafterChatWidget(config);
    }
  }
})();

// Export for module usage
export default LLMCrafterChatWidget;

// Also expose globally for script tag usage
if (typeof window !== 'undefined') {
  window.LLMCrafterChatWidget = LLMCrafterChatWidget;
}
