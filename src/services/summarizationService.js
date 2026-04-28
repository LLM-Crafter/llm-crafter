const OpenAIService = require('./openaiService');
const APIKey = require('../models/ApiKey');

class SummarizationService {
  /**
   * Summarize a conversation to extract key information
   */
  async summarizeConversation(messages, agent, existingSummary = null) {
    try {
      // Use the agent's API key for summarization
      console.log(agent);
      const apiKey = await APIKey.findById(agent.api_key._id).populate(
        'provider'
      );
      let decryptedKey;
      try {
        decryptedKey = apiKey.getDecryptedKey();
      } catch (error) {
        console.error('Failed to decrypt API key:', error);
      }

      const openai = new OpenAIService(decryptedKey, apiKey.provider.name);

      // Select a fast, cost-effective model for summarization
      const summaryModel = this.selectSummaryModel(agent.llm_settings.model);

      const prompt = this.buildSummarizationPrompt(messages, existingSummary);
      const systemPrompt = this.buildSummarizationSystemPrompt();

      // Use lower temperature for more consistent summaries
      const summaryParams = {
        temperature: 0.3,
        max_tokens: 6000, // Limit summary length
        top_p: 0.9,
      };

      const response = await openai.generateCompletion(
        summaryModel,
        prompt,
        summaryParams,
        systemPrompt,
        null, // no responseFormat
        { prompt_cache_key: `agent_${agent._id}_summary` } // Improve cache hit rate
      );

      // Parse the structured summary from the response
      const summaryData = this.parseSummaryResponse(response.content);

      return {
        summary: summaryData,
        token_usage: response.usage,
        model_used: summaryModel,
      };
    } catch (error) {
      console.error('Summarization error:', error);
      throw new Error(`Failed to summarize conversation: ${error.message}`);
    }
  }

  /**
   * Select the most appropriate model for summarization
   */
  selectSummaryModel(agentModel) {
    // Map to faster/cheaper models for summarization
    const summaryModelMap = {
      'gpt-4o': 'gpt-4o-mini',
      'gpt-5': 'gpt-5-mini',
      'gpt-5-chat-latest': 'gpt-5-mini',
      'gpt-4-turbo': 'gpt-4o-mini',
      o3: 'o3-mini',
      'o3-pro': 'o3-mini',
      o1: 'o1-mini',
      'deepseek-chat': 'deepseek-chat', // Already efficient
      'deepseek-reasoner': 'deepseek-chat',
    };

    return summaryModelMap[agentModel] || 'gpt-4o-mini'; // Default to efficient model
  }

  /**
   * Build the summarization prompt
   */
  buildSummarizationPrompt(messages, existingSummary = null) {
    // Filter out system messages and focus on user-assistant exchanges
    const conversationMessages = messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    );

    let prompt =
      'Please analyze the following conversation and provide a structured summary:\n\n';

    // Add existing summary context if available
    if (existingSummary) {
      prompt += 'EXISTING SUMMARY TO UPDATE:\n';
      prompt += `Key Topics: ${existingSummary.key_topics?.join(', ') || 'None'}\n`;
      prompt += `Important Decisions: ${existingSummary.important_decisions?.join('; ') || 'None'}\n`;
      prompt += `Unresolved Issues: ${existingSummary.unresolved_issues?.join('; ') || 'None'}\n`;
      prompt += `User Preferences: ${JSON.stringify(existingSummary.user_preferences || {})}\n\n`;
      prompt += 'NEW CONVERSATION TO ADD TO SUMMARY:\n\n';
    }

    // Add conversation messages
    conversationMessages.forEach((msg, index) => {
      const role = msg.role.toUpperCase();
      let content = msg.content;

      // Truncate very long messages
      if (content.length > 500) {
        content = `${content.substring(0, 497)}...`;
      }

      prompt += `${role}: ${content}\n\n`;

      // Include detailed tool usage information (parameters and results)
      if (msg.tools_used && msg.tools_used.length > 0) {
        msg.tools_used.forEach(t => {
          prompt += `[Tool: ${t.tool_name}`;
          if (t.parameters) {
            prompt += `, Parameters: ${JSON.stringify(t.parameters)}`;
          }
          if (t.success) {
            const resultStr = JSON.stringify(t.result);
            // Truncate very long tool results
            prompt += `, Result: ${resultStr.length > 500 ? resultStr.substring(0, 497) + '...' : resultStr}`;
          } else if (t.error) {
            prompt += `, Error: ${t.error}`;
          }
          prompt += `]\n`;
        });
        prompt += `\n`;
      }
    });

    prompt += '\nProvide your analysis in this exact JSON format:\n';
    prompt += `{
  "key_topics": ["topic1", "topic2", "topic3"],
  "important_decisions": ["decision1", "decision2"],
  "unresolved_issues": ["issue1", "issue2"],
  "user_preferences": {"preference_type": "value"},
  "context_data": {"important_key": "important_value"},
  "tool_results": [{"tool": "tool_name", "key_data": "important data returned by the tool"}]
}`;

    return prompt;
  }

  /**
   * Build the system prompt for summarization
   */
  buildSummarizationSystemPrompt() {
    return `You are a conversation summarization expert. Your task is to analyze conversations and extract the most important information for future context.

Focus on:
1. KEY TOPICS: Main subjects discussed (max 5 topics)
2. IMPORTANT DECISIONS: Concrete decisions made or agreed upon
3. UNRESOLVED ISSUES: Questions or problems that need follow-up
4. USER PREFERENCES: User's stated preferences, constraints, or requirements
5. CONTEXT DATA: Important facts, numbers, names, or references that should be remembered
6. TOOL RESULTS: Key data returned by tool executions (API responses, lookups, search results) - preserve specific values like IDs, statuses, names, dates, and numbers

Guidelines:
- Be concise but comprehensive
- Focus on actionable information
- Preserve important details that affect future conversations
- Merge with existing summary information when provided
- Use clear, specific language
- CRITICAL: Preserve specific factual data from tool results (order numbers, account details, statuses, dates, etc.)
- Return ONLY valid JSON in the exact format requested`;
  }

  /**
   * Parse the summary response from the LLM
   */
  parseSummaryResponse(responseContent) {
    try {
      // Extract JSON from the response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const summaryData = JSON.parse(jsonMatch[0]);

      // Validate required fields and provide defaults
      return {
        key_topics: Array.isArray(summaryData.key_topics)
          ? summaryData.key_topics
          : [],
        important_decisions: Array.isArray(summaryData.important_decisions)
          ? summaryData.important_decisions
          : [],
        unresolved_issues: Array.isArray(summaryData.unresolved_issues)
          ? summaryData.unresolved_issues
          : [],
        user_preferences:
          typeof summaryData.user_preferences === 'object'
            ? summaryData.user_preferences
            : {},
        context_data:
          typeof summaryData.context_data === 'object'
            ? summaryData.context_data
            : {},
        tool_results: Array.isArray(summaryData.tool_results)
          ? summaryData.tool_results.map(tr => ({
              ...tr,
              key_data:
                tr.key_data !== null && tr.key_data !== undefined
                  ? typeof tr.key_data === 'string'
                    ? tr.key_data
                    : JSON.stringify(tr.key_data)
                  : '',
            }))
          : [],
      };
    } catch (error) {
      console.error('Failed to parse summary response:', error);
      console.error('Response content:', responseContent);

      // Return empty summary structure if parsing fails
      return {
        key_topics: [],
        important_decisions: [],
        unresolved_issues: [],
        user_preferences: {},
        context_data: {},
        tool_results: [],
      };
    }
  }

  /**
   * Check if a conversation should be summarized based on various criteria
   */
  shouldSummarize(conversation) {
    // Primary trigger: metadata flag
    if (conversation.metadata.requires_summarization) {
      return true;
    }

    // Fallback checks
    const messageCount = conversation.messages.length;
    const messagesSinceLastSummary =
      messageCount - (conversation.metadata.last_summary_index + 1);

    // Trigger if we have many messages since last summary
    if (messagesSinceLastSummary >= 15) {
      return true;
    }

    // Trigger if total messages is high and no summary exists
    if (messageCount >= 20 && !conversation.conversation_summary) {
      return true;
    }

    return false;
  }

  /**
   * Get messages that need to be summarized
   */
  getMessagesToSummarize(conversation) {
    const lastSummaryIndex = conversation.metadata.last_summary_index;

    // Use getDecryptedMessages() so content is plaintext when passed to the LLM
    const decryptedMessages = conversation.getDecryptedMessages();

    if (lastSummaryIndex >= 0) {
      // Summarize messages after the last summary
      return decryptedMessages.slice(lastSummaryIndex + 1);
    } else {
      // No previous summary, summarize all but keep recent messages
      const totalMessages = decryptedMessages.length;
      if (totalMessages <= 10) {
        return []; // Too few messages to summarize
      }

      // Summarize all but the last 5 messages
      return decryptedMessages.slice(0, -5);
    }
  }

  /**
   * Translate a text into multiple languages in a single LLM call.
   * Returns an array of { lang, text } objects for each requested language.
   *
   * @param {string} text            - The source text (in English) to translate
   * @param {string[]} languages     - ISO 639-1 language codes, e.g. ["nl", "fr", "de"]
   * @param {Object} agent           - Populated Agent document (needs api_key populated)
   * @returns {Promise<Array<{lang: string, text: string}>>}
   */
  async generateTranslations(text, languages, agent) {
    if (!languages || languages.length === 0) return { translations: [], usage: null };

    try {
      const apiKey = await APIKey.findById(agent.api_key._id).populate('provider');
      const decryptedKey = apiKey.getDecryptedKey();
      const openai = new OpenAIService(decryptedKey, apiKey.provider.name);

      const model = this.selectSummaryModel(agent.llm_settings.model);

      const langList = languages.join(', ');
      const prompt = `Translate the following text into these languages: ${langList}.\nReturn a JSON object where each key is an ISO 639-1 language code and the value is the translated text.\nOnly return the JSON object, no other text.\n\nText to translate:\n${text}`;

      const response = await openai.generateCompletion(
        model,
        prompt,
        { temperature: 0.3, max_tokens: 1000 },
        'You are a professional translator. Translate accurately and naturally. Return only valid JSON.'
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { translations: [], usage: response.usage };

      const parsed = JSON.parse(jsonMatch[0]);
      const translations = Object.entries(parsed)
        .filter(([lang]) => languages.includes(lang))
        .map(([lang, text]) => ({ lang, text: String(text) }));

      return { translations, usage: response.usage };
    } catch (error) {
      console.error('Translation failed:', error);
      return { translations: [], usage: null };
    }
  }

  /**
   * Estimate token savings from summarization
   */
  estimateTokenSavings(originalMessages, summaryLength = 200) {
    // Rough estimate: 1 token ≈ 4 characters
    const originalTokens = originalMessages.reduce((total, msg) => {
      return total + Math.ceil(msg.content.length / 4);
    }, 0);

    const summaryTokens = Math.ceil(summaryLength / 4);
    return Math.max(0, originalTokens - summaryTokens);
  }
}

module.exports = new SummarizationService();
