const OpenAIService = require('./openaiService');

class SummarizationService {
  /**
   * Summarize a conversation to extract key information
   */
  async summarizeConversation(messages, agent, existingSummary = null) {
    try {
      // Use the agent's API key for summarization
      const openai = new OpenAIService(
        agent.api_key.key,
        agent.api_key.provider.name
      );

      // Select a fast, cost-effective model for summarization
      const summaryModel = this.selectSummaryModel(agent.llm_settings.model);

      const prompt = this.buildSummarizationPrompt(messages, existingSummary);
      const systemPrompt = this.buildSummarizationSystemPrompt();

      // Use lower temperature for more consistent summaries
      const summaryParams = {
        temperature: 0.3,
        max_tokens: 800, // Limit summary length
        top_p: 0.9
      };

      const response = await openai.generateCompletion(
        summaryModel,
        prompt,
        summaryParams,
        systemPrompt
      );

      // Parse the structured summary from the response
      const summaryData = this.parseSummaryResponse(response.content);

      return {
        summary: summaryData,
        token_usage: response.usage,
        model_used: summaryModel
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
      'deepseek-reasoner': 'deepseek-chat'
    };

    return summaryModelMap[agentModel] || 'gpt-4o-mini'; // Default to efficient model
  }

  /**
   * Build the summarization prompt
   */
  buildSummarizationPrompt(messages, existingSummary = null) {
    // Filter out system messages and focus on user-assistant exchanges
    const conversationMessages = messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
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
        content = `${content.substring(0, 497)  }...`;
      }

      prompt += `${role}: ${content}\n\n`;

      // Include key tool usage information
      if (msg.tools_used && msg.tools_used.length > 0) {
        const toolNames = msg.tools_used.map((t) => t.tool_name).join(', ');
        prompt += `[Tools used: ${toolNames}]\n\n`;
      }
    });

    prompt += '\nProvide your analysis in this exact JSON format:\n';
    prompt += `{
  "key_topics": ["topic1", "topic2", "topic3"],
  "important_decisions": ["decision1", "decision2"],
  "unresolved_issues": ["issue1", "issue2"],
  "user_preferences": {"preference_type": "value"},
  "context_data": {"important_key": "important_value"}
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

Guidelines:
- Be concise but comprehensive
- Focus on actionable information
- Preserve important details that affect future conversations
- Merge with existing summary information when provided
- Use clear, specific language
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
            : {}
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
        context_data: {}
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

    if (lastSummaryIndex >= 0) {
      // Summarize messages after the last summary
      return conversation.messages.slice(lastSummaryIndex + 1);
    } else {
      // No previous summary, summarize all but keep recent messages
      const totalMessages = conversation.messages.length;
      if (totalMessages <= 10) {
        return []; // Too few messages to summarize
      }

      // Summarize all but the last 5 messages
      return conversation.messages.slice(0, -5);
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
