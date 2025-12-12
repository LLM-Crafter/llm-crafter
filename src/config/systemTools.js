const Tool = require('../models/Tool');

const systemTools = [
  {
    name: 'web_search',
    display_name: 'Web Search',
    description:
      'Search the web for information using a search engine (Brave Search or Tavily)',
    category: 'web',
    parameters_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 5,
          minimum: 1,
          maximum: 20,
        },
        provider: {
          type: 'string',
          description: 'Search provider to use (brave or tavily)',
          enum: ['brave', 'tavily'],
          default: 'brave',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        provider: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
            },
          },
        },
        total_results: { type: 'number' },
        search_time_ms: { type: 'number' },
        error: { type: 'string' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'webSearchHandler',
      config: {
        search_provider: 'brave',
      },
    },
    is_system_tool: true,
  },
  {
    name: 'webpage_scraper',
    display_name: 'Webpage Scraper',
    description:
      'Scrape content from web pages using local scraper or Tavily extract API',
    category: 'web',
    parameters_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the webpage to scrape',
        },
        provider: {
          type: 'string',
          description: 'Scraper provider to use (local or tavily)',
          enum: ['local', 'tavily'],
          default: 'local',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        provider: { type: 'string' },
        content: { type: 'string' },
        title: { type: 'string' },
        success: { type: 'boolean' },
        error: { type: 'string' },
        scrape_time_ms: { type: 'number' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'webpageScraperHandler',
      config: {
        provider: 'local',
      },
    },
    is_system_tool: true,
  },
  {
    name: 'calculator',
    display_name: 'Calculator',
    description: 'Perform mathematical calculations and evaluate expressions',
    category: 'computation',
    parameters_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description:
            'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(30)")',
        },
      },
      required: ['expression'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        expression: { type: 'string' },
        result: { type: 'number' },
        type: { type: 'string' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'calculatorHandler',
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: 'llm_prompt',
    display_name: 'LLM Prompt',
    description:
      'Execute a prompt using an LLM provider (integrates with existing proxy system)',
    category: 'llm',
    parameters_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to send to the LLM',
        },
        system_prompt: {
          type: 'string',
          description: 'Optional system prompt',
        },
        model: {
          type: 'string',
          description: 'Model to use',
          default: 'gpt-4o-mini',
        },
        temperature: {
          type: 'number',
          description: 'Temperature for response generation',
          default: 0.7,
          minimum: 0,
          maximum: 2,
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum tokens in response',
          default: 1000,
          minimum: 1,
        },
        api_key_id: {
          type: 'string',
          description: 'API key ID to use for the request',
        },
      },
      required: ['prompt', 'api_key_id'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        response: { type: 'string' },
        model: { type: 'string' },
        usage: {
          type: 'object',
          properties: {
            prompt_tokens: { type: 'number' },
            completion_tokens: { type: 'number' },
            total_tokens: { type: 'number' },
            cost: { type: 'number' },
          },
        },
        finish_reason: { type: 'string' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'llmPromptHandler',
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: 'current_time',
    display_name: 'Current Time',
    description:
      'Get the current date and time. Returns current_date field in YYYY-MM-DD format for easy use in other tools. Call this ONCE at the start of calendar operations, then use the returned date for calculations.',
    category: 'utility',
    parameters_schema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., "UTC", "America/New_York")',
          default: 'UTC',
        },
        format: {
          type: 'string',
          description: 'Output format: iso, unix, human',
          enum: ['iso', 'unix', 'human'],
          default: 'iso',
        },
      },
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      description:
        'Current date and time information. Use current_date field (YYYY-MM-DD format) for date calculations.',
      properties: {
        success: {
          type: 'boolean',
          description: 'Always true - operation completed successfully',
        },
        current_date: {
          type: 'string',
          description:
            'Current date in YYYY-MM-DD format (e.g., "2025-10-28"). Use this for date calculations.',
        },
        current_time: {
          type: 'string',
          description: 'Formatted current time based on format parameter',
        },
        timestamp: { type: 'string' },
        timezone: { type: 'string' },
        format: { type: 'string' },
        unix_timestamp: { type: 'number' },
        iso_string: { type: 'string' },
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        message: { type: 'string' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'currentTimeHandler',
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: 'json_processor',
    display_name: 'JSON Processor',
    description: 'Parse, validate, and manipulate JSON data',
    category: 'data',
    parameters_schema: {
      type: 'object',
      properties: {
        data: {
          description: 'The JSON data to process (string or object)',
        },
        operation: {
          type: 'string',
          description: 'Operation to perform',
          enum: ['parse', 'stringify', 'extract', 'validate'],
          default: 'parse',
        },
        path: {
          type: 'string',
          description:
            'Dot notation path for extract operation (e.g., "user.name")',
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string' },
        result: {},
        success: { type: 'boolean' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'jsonProcessorHandler',
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: 'api_caller',
    display_name: 'API Caller',
    description:
      'Make HTTP requests to pre-configured API endpoints with authentication',
    category: 'communication',
    parameters_schema: {
      type: 'object',
      properties: {
        endpoint_name: {
          type: 'string',
          description: 'Name of the pre-configured endpoint to call',
        },
        method: {
          type: 'string',
          description: 'HTTP method to use',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          default: 'GET',
        },
        path_params: {
          type: 'object',
          description:
            "Path parameters to replace in URL (e.g., {id} -> path_params: {id: '123'})",
          default: {},
        },
        query_params: {
          type: 'object',
          description: 'Query parameters to append to URL',
          default: {},
        },
        body_data: {
          description: 'Request body data (for POST/PUT/PATCH requests)',
        },
        headers: {
          type: 'object',
          description: 'Additional headers to include in request',
          default: {},
        },
      },
      required: ['endpoint_name'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        endpoint_name: { type: 'string' },
        url: { type: 'string' },
        method: { type: 'string' },
        status_code: { type: 'number' },
        status_text: { type: 'string' },
        success: { type: 'boolean' },
        headers: { type: 'object' },
        data: {},
        execution_time_ms: { type: 'number' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'apiCallerHandler',
      config: {
        endpoints: {},
        authentication: {},
        timeout: 30000,
      },
    },
    is_system_tool: true,
  },
  {
    name: 'faq',
    display_name: 'FAQ',
    description:
      'Answer questions using pre-configured frequently asked questions and answers',
    category: 'knowledge',
    parameters_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: "The user's question to search for in the FAQ",
        },
        search_threshold: {
          type: 'number',
          description: 'Minimum similarity threshold for FAQ matching (0-1)',
          default: 0.7,
          minimum: 0,
          maximum: 1,
        },
        language: {
          type: 'string',
          description:
            'Language code for language-specific processing (auto-detects if not specified)',
          enum: [
            'auto',
            'en',
            'es',
            'pt',
            'fr',
            'de',
            'it',
            'zh',
            'ar',
            'ru',
            'ja',
            'he',
          ],
          default: 'auto',
        },
      },
      required: ['question'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        detected_language: { type: 'string' },
        matched_faq: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
            category: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
        all_matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              answer: { type: 'string' },
              category: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        },
        success: { type: 'boolean' },
        execution_time_ms: { type: 'number' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'faqHandler',
      config: {
        faqs: [],
        enable_partial_matching: true,
        default_threshold: 0.7,
      },
    },
    is_system_tool: true,
  },
  {
    name: 'rag_search',
    display_name: 'RAG Search',
    description:
      'Search through indexed knowledge base using semantic similarity and keyword matching',
    category: 'knowledge',
    parameters_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant information',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 10,
          minimum: 1,
          maximum: 20,
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity threshold for results (0-1)',
          default: 0.7,
          minimum: 0,
          maximum: 1,
        },
        search_type: {
          type: 'string',
          description: 'Type of search to perform',
          enum: ['semantic', 'hybrid', 'keyword'],
          default: 'semantic',
        },
        brands: {
          type: 'array',
          description: 'Filter results by specific brands',
          items: { type: 'string' },
          default: [],
        },
        models: {
          type: 'array',
          description: 'Filter results by specific models',
          items: { type: 'string' },
          default: [],
        },
        themes: {
          type: 'array',
          description: 'Filter results by specific themes/topics',
          items: { type: 'string' },
          default: [],
        },
        sentiment: {
          type: 'string',
          description: 'Filter results by sentiment',
          enum: ['positive', 'negative', 'neutral'],
        },
        include_metadata: {
          type: 'boolean',
          description: 'Include metadata in search results',
          default: true,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
              similarity: { type: 'number' },
              metadata: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  url: { type: 'string' },
                  title: { type: 'string' },
                  brand: { type: 'string' },
                  model: { type: 'string' },
                  author: { type: 'string' },
                  themes: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  pros: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  cons: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        total_results: { type: 'number' },
        search_method: { type: 'string' },
        execution_time_ms: { type: 'number' },
        success: { type: 'boolean' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'ragSearchHandler',
      config: {
        semantic_weight: 0.7,
        keyword_weight: 0.3,
        include_stats: false,
      },
    },
    is_system_tool: true,
  },
  {
    name: 'request_human_handoff',
    display_name: 'Request Human Handoff',
    description:
      'Tool to request a human operator to take over the conversation. Call this tool (ACTION: use_tool, TOOL: request_human_handoff) when you cannot adequately help the user due to complex issues, frustrated users, or requests requiring human judgment. Do NOT use this as a direct action.',
    category: 'communication',
    parameters_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'Detailed explanation of why human intervention is needed (e.g., "Customer requested to speak with a human", "Issue too complex for automated resolution")',
        },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level for the handoff request',
          default: 'medium',
        },
        context_summary: {
          type: 'string',
          description:
            'Brief summary of the conversation and current situation for the human operator (e.g., "User asked to speak with a human without providing additional context")',
        },
        handoff_message: {
          type: 'string',
          description:
            'Custom message to display to the user when handing off to a human agent. This message should be in the same language as the conversation and provide specific context about why the handoff is happening. If not provided, a default English message will be used. Example: "Since you\'ve requested to negotiate the price, our human agent will intervene. Please wait patiently and someone will reply in this conversation."',
        },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        result: { type: 'string' },
        handoff_requested: { type: 'boolean' },
        conversation_status: { type: 'string' },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'humanHandoffHandler',
      config: {},
    },
    is_system_tool: true,
  },
  {
    name: 'google_calendar',
    display_name: 'Google Calendar',
    description:
      "Manage Google Calendar events. IMPORTANT: Use current_time tool first to get today's date before any calendar operations. All parameters must be at ROOT level (flat structure), NOT nested in objects. For updates/deletes, get event_id from list_events first - event IDs are long strings without spaces.",
    category: 'communication',
    parameters_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description:
            'The calendar action to perform. For updates/deletes, you must first use list_events to get the event_id.',
          enum: [
            'create_event',
            'list_events',
            'get_event',
            'update_event',
            'delete_event',
            'find_free_slots',
          ],
        },
        calendar_id: {
          type: 'string',
          description:
            'Calendar ID to use. Use "primary" for the user\'s main calendar.',
          default: 'primary',
        },
        // Event creation/update parameters
        summary: {
          type: 'string',
          description:
            'Event title/summary (NOT "title"). Required for create_event. Example: "Team Meeting" or "Doctor Appointment"',
        },
        description: {
          type: 'string',
          description:
            'Event description with additional details. Example: "Discuss Q4 planning and budget"',
        },
        location: {
          type: 'string',
          description:
            'Event location. Can be physical address or virtual meeting link. Example: "Conference Room A" or "https://zoom.us/j/123"',
        },
        start_time: {
          type: 'string',
          description:
            'Event start time in ISO 8601 format with timezone: "YYYY-MM-DDTHH:mm:ss±HH:mm". Required for create_event. Examples: "2025-10-28T14:00:00+01:00" (Lisbon), "2025-10-28T09:00:00-07:00" (Pacific). ALWAYS include the current year (2025).',
        },
        end_time: {
          type: 'string',
          description:
            'Event end time in ISO 8601 format with timezone: "YYYY-MM-DDTHH:mm:ss±HH:mm". Required for create_event. Must be after start_time. Examples: "2025-10-28T15:00:00+01:00". Typical meetings are 30min-2hrs.',
        },
        timezone: {
          type: 'string',
          description:
            'IANA timezone for the event. Examples: "Europe/Lisbon", "America/New_York", "America/Los_Angeles", "UTC". Default is UTC.',
          default: 'UTC',
        },
        attendees: {
          type: 'array',
          description:
            'Array of attendee email addresses as strings. Example: ["john@example.com", "jane@example.com"]. Attendees will receive email invitations.',
          items: { type: 'string' },
        },
        // List/query parameters
        time_min: {
          type: 'string',
          description:
            'Start of time range for listing events (ISO 8601). Example: "2025-10-28T00:00:00Z" for start of day. If omitted, defaults to current time.',
        },
        time_max: {
          type: 'string',
          description:
            'End of time range for listing events (ISO 8601). Example: "2025-10-28T23:59:59Z" for end of day. Use with time_min to query specific date ranges.',
        },
        max_results: {
          type: 'number',
          description:
            'Maximum number of events to return from list_events. Default is 10. Range: 1-250.',
          default: 10,
          minimum: 1,
          maximum: 250,
        },
        // Event ID for get/update/delete
        event_id: {
          type: 'string',
          description:
            'Event ID from Google Calendar. CRITICAL: Must be the complete ID from list_events response, typically long strings like "abc123def456ghi789@google.com". NO SPACES allowed. If update/delete fails, re-query with list_events to get correct ID. Do NOT manually type or truncate event IDs.',
        },
        // Find free slots parameters
        duration_minutes: {
          type: 'number',
          description:
            'Duration in minutes for finding available time slots. Minimum 15 minutes. Example: 30 for 30-minute slots, 60 for 1-hour slots.',
          minimum: 15,
        },
        // Authentication
        access_token: {
          type: 'string',
          description:
            'Google OAuth2 access token. Usually provided automatically from agent configuration. Only include if explicitly required.',
        },
        refresh_token: {
          type: 'string',
          description:
            'Google OAuth2 refresh token for renewing access. Usually provided automatically from agent configuration.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    return_schema: {
      type: 'object',
      description:
        'Response from calendar operations. Check "success" field first. If false, check "error" field for details.',
      properties: {
        success: {
          type: 'boolean',
          description:
            'Whether the operation succeeded. Always check this first.',
        },
        action: {
          type: 'string',
          description: 'The action that was performed',
        },
        event: {
          type: 'object',
          description:
            'Single event details (for create_event, get_event, update_event). The "id" field is the event_id needed for updates/deletes.',
          properties: {
            id: {
              type: 'string',
              description:
                'Event ID - use this exact value for update_event or delete_event operations. Never modify or truncate this ID.',
            },
            summary: {
              type: 'string',
              description: 'Event title',
            },
            description: {
              type: 'string',
              description: 'Event description',
            },
            location: {
              type: 'string',
              description: 'Event location',
            },
            start: {
              type: 'string',
              description: 'Event start time in ISO 8601 format',
            },
            end: {
              type: 'string',
              description: 'Event end time in ISO 8601 format',
            },
            attendees: {
              type: 'array',
              description:
                'List of attendees with their email and response status',
            },
            htmlLink: {
              type: 'string',
              description: 'Link to view/edit the event in Google Calendar',
            },
          },
        },
        events: {
          type: 'array',
          description:
            'Array of events (for list_events). Each event has an "id" field that must be used for updates/deletes. If empty array, no events found in the specified time range.',
        },
        free_slots: {
          type: 'array',
          description:
            'Available time slots (for find_free_slots). Each slot has start, end, and duration_minutes.',
        },
        calendar_id: {
          type: 'string',
          description: 'Calendar ID that was used',
        },
        execution_time_ms: {
          type: 'number',
          description: 'How long the operation took in milliseconds',
        },
        error: {
          type: 'string',
          description:
            'Error message if success is false. Common errors: "Not Found" (invalid event_id), "Event summary (title) is required", "Invalid event_id format" (has spaces or truncated).',
        },
        message: {
          type: 'string',
          description: 'Human-readable message about the operation result',
        },
      },
    },
    implementation: {
      type: 'internal',
      handler: 'googleCalendarHandler',
      config: {
        calendar_id: 'primary',
        timezone: 'UTC',
      },
    },
    is_system_tool: true,
  },
];

async function initializeSystemTools() {
  console.log('Initializing system tools...');

  for (const toolData of systemTools) {
    try {
      // Check if tool already exists
      const existingTool = await Tool.findOne({ name: toolData.name });

      if (existingTool) {
        // Update existing tool if it's a system tool
        if (existingTool.is_system_tool) {
          await Tool.findOneAndUpdate(
            { name: toolData.name },
            { ...toolData, updatedAt: new Date() },
            { new: true }
          );
          console.log(`Updated system tool: ${toolData.name}`);
        } else {
          console.log(`Skipped non-system tool: ${toolData.name}`);
        }
      } else {
        // Create new tool
        const tool = new Tool(toolData);
        await tool.save();
        console.log(`Created system tool: ${toolData.name}`);
      }
    } catch (error) {
      console.error(`Error initializing tool ${toolData.name}:`, error.message);
    }
  }

  console.log('System tools initialization completed');
}

module.exports = {
  initializeSystemTools,
  systemTools,
};
