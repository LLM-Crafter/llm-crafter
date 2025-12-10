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

      // Customization options (can be string or array of {lang, text} objects)
      title: config.title || 'AI Assistant',
      subtitle: config.subtitle || 'Online • Typically replies instantly',
      placeholder: config.placeholder || 'Type your message...',
      welcomeMessage:
        config.welcomeMessage || 'Hello! 👋 How can I help you today?',

      avatarText: config.avatarText || 'AI',
      userAvatarText: config.userAvatarText || 'U',
      humanAvatarText: config.humanAvatarText || '👤',
      botAvatarUrl: config.botAvatarUrl || null, // URL for bot avatar image
      humanAvatarUrl: config.humanAvatarUrl || null, // URL for human operator avatar image
      botName: config.botName || 'AI', // Name shown for bot messages
      humanOperatorName: config.humanOperatorName || 'Human', // Name shown for human operator messages

      // Colors
      primaryColor: config.primaryColor || '#4a90e2',
      secondaryColor: config.secondaryColor || '#357abd',
      backgroundColor: config.backgroundColor || '#f5f7fa',
      textColor: config.textColor || '#333333',

      // Behavior
      position: config.position || 'bottom-right', // bottom-right, bottom-left
      autoOpen: config.autoOpen || false,
      autoOpenDelay: config.autoOpenDelay || null, // Delay in milliseconds before auto-opening (e.g., 30000 for 30 seconds)
      showPoweredBy: config.showPoweredBy !== false,
      poweredByUrl: config.poweredByUrl || '#',
      poweredByText: config.poweredByText || 'LLM Crafter',
      userIdentifier: config.userIdentifier || null,
      enableStreaming: config.enableStreaming !== false,
      pollingInterval: config.pollingInterval || 3000, // Poll for new messages every 3 seconds
      conversationExpiryTime: config.conversationExpiryTime || 86400000, // 24 hours in milliseconds

      // Advanced
      onMessageSent: config.onMessageSent || null,
      onMessageReceived: config.onMessageReceived || null,
      onError: config.onError || null,
      onHumanTakeover: config.onHumanTakeover || null,
      messageTransformer: config.messageTransformer || null, // Function to transform messages before display
      dynamicContext: config.dynamicContext || null, // Additional context to send with messages (can be function or object)
    };

    this.conversationId = null;
    this.sessionToken = null;
    this.messages = [];
    this.isOpen = false;
    this.isFirstOpen = true; // Track if this is the first time opening the chat
    this.isTyping = false;
    this.pollingIntervalId = null;
    this.lastPollTimestamp = null;
    this.isHumanControlled = false;
    this.displayedMessageIds = new Set(); // Track message IDs to prevent duplicates
    this.displayedMessageTimestamps = new Map(); // Track when messages were displayed
    this.localStorageKey = `llm-crafter-conversation-${this.config.agentId}`; // Unique key per agent
    this.lastMessageSender = null; // Track last message sender for bundling

    this.init();
  }

  init() {
    this.createWidget();
    this.attachEventListeners();
    this.applyCustomStyles();

    // Try to restore previous conversation from localStorage
    const restoredConversation = this.restoreConversation();

    // Don't show welcome message immediately - wait until first open (unless restoring)

    if (this.config.autoOpen) {
      this.open();
    } else if (this.config.autoOpenDelay && !restoredConversation) {
      // Only set auto-open timer if not restoring a conversation
      setTimeout(() => {
        if (!this.isOpen) {
          this.open();
        }
      }, this.config.autoOpenDelay);
    }

    // Initialize session
    this.initializeSession(restoredConversation);
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

    // Get localized text for UI elements
    const localizedTitle = this.getLocalizedText(this.config.title);
    const localizedSubtitle = this.getLocalizedText(this.config.subtitle);
    const localizedPlaceholder = this.getLocalizedText(this.config.placeholder);

    chatWindow.innerHTML = `
      <div class="llm-crafter-chat-header">
        <div class="llm-crafter-avatar">${this.config.botAvatarUrl ? `<img src="${this.config.botAvatarUrl}" alt="Bot" />` : this.config.avatarText}</div>
        <div class="llm-crafter-header-info">
          <h3>${localizedTitle}</h3>
          <p>${localizedSubtitle}</p>
        </div>
        <button class="llm-crafter-reset-btn" title="Reset conversation">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
        </button>
        <button class="llm-crafter-close-btn" title="Close chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="llm-crafter-chat-messages"></div>
      <div class="llm-crafter-chat-input">
        <input type="text" placeholder="${localizedPlaceholder}" />
        <button class="llm-crafter-send-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
      ${this.config.showPoweredBy ? `<div class="llm-crafter-powered-by">Powered by <a href="${this.config.poweredByUrl}" target="_blank">${this.config.poweredByText}</a></div>` : ''}
    `;

    container.appendChild(button);
    container.appendChild(chatWindow);
    document.body.appendChild(container);

    // Store localized subtitle for resetting later
    this.localizedSubtitle = localizedSubtitle;

    // Store references
    this.elements = {
      container,
      button,
      chatWindow,
      resetBtn: chatWindow.querySelector('.llm-crafter-reset-btn'),
      closeBtn: chatWindow.querySelector('.llm-crafter-close-btn'),
      messagesContainer: chatWindow.querySelector('.llm-crafter-chat-messages'),
      input: chatWindow.querySelector('.llm-crafter-chat-input input'),
      sendBtn: chatWindow.querySelector('.llm-crafter-send-btn'),
    };
  }

  attachEventListeners() {
    // Toggle chat window
    this.elements.button.addEventListener('click', () => this.toggle());
    this.elements.resetBtn.addEventListener('click', () =>
      this.resetConversation()
    );
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

  getLocalizedText(configValue) {
    // If it's a simple string, return it directly (backwards compatibility)
    if (typeof configValue === 'string') {
      return configValue;
    }

    // If it's an array of language objects
    if (Array.isArray(configValue) && configValue.length > 0) {
      // Get user's language (e.g., 'en-US' or 'en')
      const userLang = navigator.language || navigator.userLanguage || 'en';
      const userLangShort = userLang.split('-')[0].toLowerCase(); // e.g., 'en' from 'en-US'

      // Try to find exact match first (e.g., 'en-US')
      let match = configValue.find(
        item => item.lang && item.lang.toLowerCase() === userLang.toLowerCase()
      );

      // If no exact match, try short language code (e.g., 'en')
      if (!match) {
        match = configValue.find(
          item => item.lang && item.lang.toLowerCase() === userLangShort
        );
      }

      // If match found, return the text
      if (match && match.text) {
        return match.text;
      }

      // Default to first language in array
      if (configValue[0] && configValue[0].text) {
        return configValue[0].text;
      }
    }

    // Fallback to empty string
    return '';
  }

  buildDynamicContext() {
    // Start with default context
    const context = {
      url: window.location.href,
      language: navigator.language || navigator.userLanguage,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    // If dynamicContext is a function, call it to get additional context
    if (typeof this.config.dynamicContext === 'function') {
      try {
        const customContext = this.config.dynamicContext();
        return { ...context, ...customContext };
      } catch (error) {
        console.warn('Error calling dynamicContext function:', error);
        return context;
      }
    }

    // If dynamicContext is an object, merge it with default context
    if (
      this.config.dynamicContext &&
      typeof this.config.dynamicContext === 'object'
    ) {
      return { ...context, ...this.config.dynamicContext };
    }

    return context;
  }

  saveConversation() {
    if (!this.conversationId) return;

    try {
      const expiryTime = Date.now() + this.config.conversationExpiryTime;
      const conversationData = {
        conversationId: this.conversationId,
        expiryTime: expiryTime,
        lastPollTimestamp: this.lastPollTimestamp,
      };
      localStorage.setItem(
        this.localStorageKey,
        JSON.stringify(conversationData)
      );
    } catch (error) {
      console.warn('Failed to save conversation to localStorage:', error);
    }
  }

  restoreConversation() {
    try {
      const stored = localStorage.getItem(this.localStorageKey);
      if (!stored) return false;

      const conversationData = JSON.parse(stored);
      const now = Date.now();

      // Check if conversation has expired
      if (conversationData.expiryTime && conversationData.expiryTime < now) {
        // Conversation expired, clear it
        localStorage.removeItem(this.localStorageKey);
        return false;
      }

      // Restore conversation state
      this.conversationId = conversationData.conversationId;
      this.lastPollTimestamp = conversationData.lastPollTimestamp;
      this.isFirstOpen = false; // Don't show welcome message for restored conversations

      return true;
    } catch (error) {
      console.warn('Failed to restore conversation from localStorage:', error);
      return false;
    }
  }

  clearStoredConversation() {
    try {
      localStorage.removeItem(this.localStorageKey);
    } catch (error) {
      console.warn('Failed to clear stored conversation:', error);
    }
  }

  async initializeSession(hasRestoredConversation = false) {
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

      // Only update conversationId if we didn't restore one
      if (!hasRestoredConversation && data.conversationId) {
        this.conversationId = data.conversationId;
      }

      // If we restored a conversation, load previous messages and start polling
      if (hasRestoredConversation && this.conversationId) {
        await this.loadPreviousMessages();
        this.startPolling();
      }
    } catch (error) {
      console.error('LLM Crafter Widget: Failed to initialize session', error);
      this.handleError('Failed to initialize chat session');
    }
  }

  async loadPreviousMessages() {
    if (!this.conversationId || !this.sessionToken) return;

    try {
      // Use messages/latest endpoint with a timestamp older than the conversation expiry
      // This ensures we get all messages from the conversation
      const oldTimestamp = new Date(
        Date.now() - this.config.conversationExpiryTime - 1000
      ).toISOString();

      const url = new URL(
        `${this.config.apiUrl}/api/v1/external/conversations/${this.conversationId}/messages/latest`
      );
      url.searchParams.append('since', oldTimestamp);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-Session-Token': this.sessionToken,
        },
      });

      if (!response.ok) {
        console.warn('Failed to load previous messages:', response.status);
        return;
      }

      const data = await response.json();
      const messages = data.new_messages || [];

      // Display previous messages (skip system messages)
      for (const msg of messages) {
        // Skip system messages
        if (msg.role === 'system') {
          continue;
        }

        if (msg.role === 'user') {
          this.addMessage(msg.content, true);
          if (msg._id) {
            this.displayedMessageIds.add(msg._id);
          }
          // Don't track content hash for user messages - they can send same message multiple times
        } else if (
          msg.role === 'assistant' ||
          msg.role === 'human' ||
          msg.role === 'human_operator'
        ) {
          const isHumanOperator =
            msg.role === 'human' || msg.role === 'human_operator';

          // For human operators, try to get name from handler_info
          let senderName;
          if (
            isHumanOperator &&
            msg.handler_info &&
            msg.handler_info.human_operator &&
            msg.handler_info.human_operator.name
          ) {
            senderName = msg.handler_info.human_operator.name;
          } else if (isHumanOperator) {
            senderName = this.config.humanOperatorName;
          } else {
            senderName = this.config.botName;
          }

          this.addMessage(msg.content, false, senderName, isHumanOperator);
          if (msg._id) {
            this.displayedMessageIds.add(msg._id);
          }
          // Only track content hash for AI messages (not human operators)
          if (!isHumanOperator) {
            this.displayedMessageIds.add(this.createMessageKey(msg.content));
          }
        }
      }

      // Update last poll timestamp from response
      if (data.last_poll) {
        this.lastPollTimestamp = data.last_poll;
      }

      // Check if conversation is currently in human handoff mode
      if (data.handoff_active) {
        this.isHumanControlled = true;
        const headerInfo = this.elements.chatWindow.querySelector(
          '.llm-crafter-header-info p'
        );
        if (headerInfo) {
          headerInfo.textContent = '👤 Human operator';
        }
      }
    } catch (error) {
      console.warn('Error loading previous messages:', error);
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
      dynamicContext: this.buildDynamicContext(),
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

      // Track the message to prevent duplicate from polling
      // Use message_id if available, otherwise create a tracking key from content
      if (data.message_id) {
        this.displayedMessageIds.add(data.message_id);
      }
      // Also track by content hash as fallback
      this.displayedMessageIds.add(this.createMessageKey(botMessage));

      // Call onMessageReceived callback
      if (this.config.onMessageReceived) {
        this.config.onMessageReceived(botMessage, data);
      }
    }

    // Update conversation ID from response
    if (data.conversation_id) {
      this.conversationId = data.conversation_id;
      this.saveConversation(); // Save to localStorage

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
      dynamicContext: this.buildDynamicContext(),
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
        this.saveConversation(); // Save to localStorage
        if (!this.pollingIntervalId && this.conversationId) {
          this.startPolling();
        }
      }

      return;
    }

    // Create a message bubble for streaming response
    const messageDiv = document.createElement('div');
    messageDiv.className = 'llm-crafter-message bot';

    const avatarContent = this.config.botAvatarUrl
      ? `<div class="llm-crafter-message-avatar"><img src="${this.escapeHtml(this.config.botAvatarUrl)}" alt="Bot" /></div>`
      : `<div class="llm-crafter-message-avatar">${this.config.avatarText}</div>`;

    messageDiv.innerHTML = `
      ${avatarContent}
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
    let messageId = null;

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
                  // Apply transformation to the accumulated response
                  const transformedText = this.transformMessage(fullResponse);
                  bubbleElement.innerHTML = transformedText;
                  this.scrollToBottom();
                } else if (parsed.type === 'complete') {
                  conversationId = parsed.conversation_id;
                  messageId = parsed.message_id;
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

    // Track the message to prevent duplicate from polling
    if (messageId) {
      this.displayedMessageIds.add(messageId);
    }
    // Also track by content hash as fallback (for streaming responses without message_id)
    this.displayedMessageIds.add(this.createMessageKey(fullResponse));

    // Update conversation ID
    if (conversationId) {
      this.conversationId = conversationId;
      this.saveConversation(); // Save to localStorage

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

  createMessageKey(content) {
    // Create a simple hash of the message content for tracking
    // Normalize the content by trimming and removing extra whitespace
    const normalized = content.trim().replace(/\s+/g, ' ');
    // Use a simple string hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `content_${hash}`;
  }

  transformMessage(text) {
    // Apply custom transformer if provided
    if (
      this.config.messageTransformer &&
      typeof this.config.messageTransformer === 'function'
    ) {
      try {
        return this.config.messageTransformer(text);
      } catch (error) {
        console.warn('Message transformer error:', error);
        // Fallback to escaped HTML if transformer fails
        return this.escapeHtml(text);
      }
    }

    // Default: escape HTML
    return this.escapeHtml(text);
  }

  addSystemMessage(text) {
    // Reset sender tracking when system message is added
    this.lastMessageSender = null;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'llm-crafter-system-message';
    messageDiv.innerHTML = `
      <div class="llm-crafter-system-message-content">
        <span>${this.escapeHtml(text)}</span>
      </div>
    `;

    this.elements.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  addMessage(text, isUser = false, senderName = null, isHumanOperator = false) {
    // Determine the sender name to display
    const displayName = senderName || (isUser ? null : this.config.botName);

    // Create a unique sender identifier for bundling
    // Important: user messages should always have 'user' identifier regardless of other state
    const senderIdentifier = isUser
      ? 'user'
      : isHumanOperator
        ? `human_${displayName}`
        : `bot_${displayName}`;

    // Check if this message is from the same sender as the last message
    // Only bundle if lastMessageSender is not null and matches
    const isSameSender =
      this.lastMessageSender !== null &&
      this.lastMessageSender === senderIdentifier;

    // Transform the message if a transformer function is provided
    const transformedText = this.transformMessage(text);

    if (isSameSender) {
      // Bundle with previous message - just add a new bubble
      const lastMessage = this.elements.messagesContainer.lastElementChild;
      if (
        lastMessage &&
        lastMessage.classList.contains('llm-crafter-message') &&
        !lastMessage.id // Exclude typing indicator which has id='llm-crafter-typing'
      ) {
        // Verify the last message matches the expected sender type
        const isLastMessageUser = lastMessage.classList.contains('user');
        const shouldBeUser = isUser;

        if (isLastMessageUser === shouldBeUser) {
          const contentDiv = lastMessage.querySelector(
            '.llm-crafter-message-content'
          );
          if (contentDiv) {
            const newBubble = document.createElement('div');
            newBubble.className = 'llm-crafter-message-bubble';
            newBubble.innerHTML = transformedText;
            contentDiv.appendChild(newBubble);
            this.scrollToBottom();

            // Store message
            this.messages.push({
              text,
              isUser,
              senderName,
              isHumanOperator,
              timestamp: new Date(),
            });
            return;
          }
        }
      }
    }

    // Not same sender or no previous message - create new message group
    this.lastMessageSender = senderIdentifier;

    const messageDiv = document.createElement('div');
    messageDiv.className = `llm-crafter-message ${isUser ? 'user' : 'bot'}`;

    // Determine avatar content based on sender type
    let avatarContent;
    if (isUser) {
      avatarContent = `<div class="llm-crafter-message-avatar">${this.escapeHtml(this.config.userAvatarText)}</div>`;
    } else if (isHumanOperator) {
      // Use human avatar URL if available, otherwise use text
      if (this.config.humanAvatarUrl) {
        avatarContent = `<div class="llm-crafter-message-avatar"><img src="${this.escapeHtml(this.config.humanAvatarUrl)}" alt="Human" /></div>`;
      } else {
        avatarContent = `<div class="llm-crafter-message-avatar">${this.escapeHtml(this.config.humanAvatarText)}</div>`;
      }
    } else {
      // Use bot avatar URL if available, otherwise use text
      if (this.config.botAvatarUrl) {
        avatarContent = `<div class="llm-crafter-message-avatar"><img src="${this.escapeHtml(this.config.botAvatarUrl)}" alt="Bot" /></div>`;
      } else {
        avatarContent = `<div class="llm-crafter-message-avatar">${this.escapeHtml(this.config.avatarText)}</div>`;
      }
    }

    messageDiv.innerHTML = `
      ${avatarContent}
      <div class="llm-crafter-message-content">
        ${displayName ? `<div class="llm-crafter-message-sender">${this.escapeHtml(displayName)}</div>` : ''}
        <div class="llm-crafter-message-bubble">${transformedText}</div>
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

    const avatarContent = this.config.botAvatarUrl
      ? `<div class="llm-crafter-message-avatar"><img src="${this.escapeHtml(this.config.botAvatarUrl)}" alt="Bot" /></div>`
      : `<div class="llm-crafter-message-avatar">${this.config.avatarText}</div>`;

    typingDiv.innerHTML = `
      ${avatarContent}
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

  showAnimatedWelcomeMessage() {
    // Show typing indicator
    this.showTypingIndicator();

    // Wait a bit to simulate typing, then show welcome message
    setTimeout(() => {
      this.hideTypingIndicator();
      const localizedWelcome = this.getLocalizedWelcomeMessage();
      this.addMessage(localizedWelcome, false);
    }, 1000); // 1 second delay to simulate typing
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

    // Show welcome message with typing animation on first open
    if (this.isFirstOpen && this.config.welcomeMessage) {
      this.isFirstOpen = false;
      this.showAnimatedWelcomeMessage();
    }
  }

  getLocalizedWelcomeMessage() {
    return this.getLocalizedText(this.config.welcomeMessage);
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

    // Set initial timestamp to now only if not already set
    // (it may have been set by loadPreviousMessages when restoring a conversation)
    if (!this.lastPollTimestamp) {
      this.lastPollTimestamp = new Date().toISOString();
    }

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

      // Check if human has taken over and add system message BEFORE processing messages
      if (data.handoff_active && !this.isHumanControlled) {
        this.isHumanControlled = true;

        // Add hardcoded system message to timeline
        this.addSystemMessage('Human joined chat');

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

        // Add hardcoded system message for handback
        this.addSystemMessage('AI assistant joined chat');

        const headerInfo = this.elements.chatWindow.querySelector(
          '.llm-crafter-header-info p'
        );
        if (headerInfo) {
          headerInfo.textContent = this.localizedSubtitle;
        }
      }

      // Process new messages (skip system messages, they're internal)
      if (data.new_messages && data.new_messages.length > 0) {
        for (const msg of data.new_messages) {
          // Skip system messages - they are internal and not meant for users
          if (msg.role === 'system') {
            continue;
          }

          // Skip if we've already displayed this message (prevent duplicates)
          // For human operators and users, only check message ID (they can send similar messages)
          // For AI/assistant, check both ID and content hash to prevent duplicate responses
          const isHumanMessage =
            msg.role === 'user' ||
            msg.role === 'human' ||
            msg.role === 'human_operator';
          const contentKey = this.createMessageKey(msg.content);
          const hasMsgId = msg._id && this.displayedMessageIds.has(msg._id);
          const hasContentKey =
            !isHumanMessage && this.displayedMessageIds.has(contentKey);
          const isDuplicate = hasMsgId || hasContentKey;

          if (isDuplicate) {
            continue;
          }

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

            // For human operators, try to get name from handler_info, otherwise use default
            let senderName;
            if (
              isHumanOperator &&
              msg.handler_info &&
              msg.handler_info.human_operator &&
              msg.handler_info.human_operator.name
            ) {
              senderName = msg.handler_info.human_operator.name;
            } else if (isHumanOperator) {
              senderName = this.config.humanOperatorName;
            } else {
              senderName = this.config.botName;
            }

            this.addMessage(msg.content, false, senderName, isHumanOperator);

            // Track this message ID to prevent duplicates
            if (msg._id) {
              this.displayedMessageIds.add(msg._id);
            }
            // Only track content hash for AI messages (not human operators)
            // Human operators should be able to send similar/identical messages
            if (!isHumanOperator) {
              this.displayedMessageIds.add(contentKey);
            }

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

  resetConversation() {
    // Stop polling
    this.stopPolling();

    // Clear localStorage
    this.clearStoredConversation();

    // Reset all state
    this.conversationId = null;
    this.lastPollTimestamp = null;
    this.isHumanControlled = false;
    this.displayedMessageIds.clear();
    this.isFirstOpen = true;
    this.messages = [];
    this.lastMessageSender = null;

    // Clear UI
    this.elements.messagesContainer.innerHTML = '';

    // Reset subtitle to original
    const headerInfo = this.elements.chatWindow.querySelector(
      '.llm-crafter-header-info p'
    );
    if (headerInfo) {
      headerInfo.textContent = this.localizedSubtitle;
    }

    // Show welcome message with animation
    if (this.config.welcomeMessage) {
      this.showAnimatedWelcomeMessage();
      this.isFirstOpen = false; // Mark as shown
    }

    // Reinitialize session
    this.initializeSession(false);
  }

  clearMessages() {
    this.messages = [];
    this.conversationId = null;
    this.lastPollTimestamp = null;
    this.isHumanControlled = false;
    this.displayedMessageIds.clear(); // Clear tracked message IDs
    this.isFirstOpen = true; // Reset first open flag
    this.lastMessageSender = null; // Reset sender tracking
    this.stopPolling();
    this.clearStoredConversation(); // Clear from localStorage
    this.elements.messagesContainer.innerHTML = '';

    // Reset subtitle to original
    const headerInfo = this.elements.chatWindow.querySelector(
      '.llm-crafter-header-info p'
    );
    if (headerInfo) {
      headerInfo.textContent = this.localizedSubtitle;
    }

    // Welcome message will show again on next open
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
      autoOpenDelay:
        parseInt(script.getAttribute('data-auto-open-delay')) || null,
      showPoweredBy: script.getAttribute('data-show-powered-by') !== 'false',
      poweredByUrl: script.getAttribute('data-powered-by-url'),
      poweredByText: script.getAttribute('data-powered-by-text'),
      enableStreaming: script.getAttribute('data-enable-streaming') !== 'false',
      pollingInterval:
        parseInt(script.getAttribute('data-polling-interval')) || 3000,
      conversationExpiryTime:
        parseInt(script.getAttribute('data-conversation-expiry-time')) ||
        86400000,
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
