const OpenAIService = require("./openaiService");
const ApiKey = require("../models/ApiKey");

class SuggestionService {
  /**
   * Generate question suggestions based on conversation context
   * @param {Object} agent - The agent with suggestion configuration
   * @param {Array} conversationHistory - Last 5 messages from conversation
   * @returns {Object|null} - Suggestions and usage info, or null if failed
   */
  async generateQuestionSuggestions(agent, conversationHistory) {
    try {
      // Check if suggestions are enabled
      if (!agent.question_suggestions?.enabled) {
        return null;
      }

      // Validate API key
      const apiKey = await ApiKey.findById(
        agent.question_suggestions.api_key
      ).populate("provider");
      if (!apiKey) {
        console.error("Suggestion API key not found");
        return null;
      }

      // Validate model
      if (!agent.question_suggestions.model) {
        console.error("Suggestion model not configured");
        return null;
      }

      if (!apiKey.provider.models.includes(agent.question_suggestions.model)) {
        console.error("Invalid suggestion model for provider");
        return null;
      }

      // Extract clean conversation context (last 5 messages, role + content only)
      const contextMessages =
        this.extractConversationContext(conversationHistory);

      // Build the suggestion prompt
      const systemPrompt = this.buildSuggestionSystemPrompt(
        agent.question_suggestions.count,
        agent.question_suggestions.custom_prompt
      );

      const userPrompt = this.buildSuggestionUserPrompt(contextMessages);

      // Initialize OpenAI service with suggestion API key
      const decryptedApiKey = apiKey.getDecryptedKey();
      const openai = new OpenAIService(decryptedApiKey, apiKey.provider.name);

      // Generate suggestions
      const startTime = Date.now();
      const response = await openai.generateCompletion(
        agent.question_suggestions.model,
        userPrompt,
        {
          temperature: 1,
          max_tokens: 1000,
        },
        systemPrompt
      );
      console.log("Suggestion response:", response);
      const executionTime = Date.now() - startTime;

      // Parse the response
      const suggestions = this.parseSuggestionResponse(
        response.content,
        agent.question_suggestions.count
      );

      if (!suggestions || suggestions.length === 0) {
        console.error("Failed to parse suggestion response");
        return null;
      }

      return {
        suggestions,
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
          cost: response.usage.cost,
          model: agent.question_suggestions.model,
          execution_time_ms: executionTime,
        },
      };
    } catch (error) {
      console.error("Error generating question suggestions:", error);
      return null;
    }
  }

  /**
   * Extract clean conversation context from messages
   * @param {Array} messages - Conversation messages
   * @returns {Array} - Clean context messages
   */
  extractConversationContext(messages) {
    if (!messages || messages.length === 0) {
      return [];
    }

    // Get last 5 messages, but only include role and content
    return messages
      .slice(-5)
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
      .filter((msg) => msg.content && msg.content.trim().length > 0);
  }

  /**
   * Build the system prompt for suggestion generation
   * @param {number} count - Number of suggestions to generate
   * @param {string} customPrompt - Optional custom prompt override
   * @returns {string} - System prompt
   */
  buildSuggestionSystemPrompt(count, customPrompt) {
    if (customPrompt) {
      return customPrompt.replace("{count}", count);
    }

    return `You are a question suggestion generator. Based on the conversation context, generate exactly ${count} relevant follow-up questions that a user might want to ask.

Rules:
1. Generate exactly ${count} questions
2. Questions should be natural and conversational
3. Questions should relate to the conversation context and flow naturally
4. Keep questions concise (under 15 words each)
5. Make questions actionable and specific
6. Return only JSON format: {"suggestions": ["question1", "question2", "question3"]}
7. Do not include explanations, only the JSON response

Generate ${count} relevant follow-up questions:`;
  }

  /**
   * Build the user prompt with conversation context
   * @param {Array} contextMessages - Clean conversation messages
   * @returns {string} - User prompt
   */
  buildSuggestionUserPrompt(contextMessages) {
    if (contextMessages.length === 0) {
      return "This is the start of a new conversation. Generate general helpful questions a user might ask.";
    }

    const conversationText = contextMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    return `Based on this conversation context, generate relevant follow-up questions:

${conversationText}

Generate follow-up questions that would naturally continue this conversation:`;
  }

  /**
   * Parse the suggestion response from the LLM
   * @param {string} responseContent - Raw LLM response
   * @param {number} expectedCount - Expected number of suggestions
   * @returns {Array|null} - Array of suggestion strings or null if failed
   */
  parseSuggestionResponse(responseContent, expectedCount) {
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(responseContent);

      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        // Validate and clean suggestions
        const validSuggestions = parsed.suggestions
          .filter(
            (suggestion) =>
              typeof suggestion === "string" && suggestion.trim().length > 0
          )
          .map((suggestion) => suggestion.trim())
          .slice(0, expectedCount); // Ensure we don't exceed expected count

        return validSuggestions.length > 0 ? validSuggestions : null;
      }

      return null;
    } catch (error) {
      // If JSON parsing fails, try to extract suggestions from text
      console.warn("Failed to parse JSON response, attempting text extraction");
      return this.extractSuggestionsFromText(responseContent, expectedCount);
    }
  }

  /**
   * Fallback method to extract suggestions from non-JSON text
   * @param {string} text - Raw text response
   * @param {number} expectedCount - Expected number of suggestions
   * @returns {Array|null} - Array of suggestion strings or null if failed
   */
  extractSuggestionsFromText(text, expectedCount) {
    try {
      // Look for lines that seem like questions
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const questions = [];

      for (const line of lines) {
        // Look for lines that end with question marks or look like questions
        if (
          line.endsWith("?") ||
          line.toLowerCase().includes("how") ||
          line.toLowerCase().includes("what") ||
          line.toLowerCase().includes("can")
        ) {
          // Clean up the line (remove numbers, quotes, etc.)
          const cleaned = line
            .replace(/^\d+\.?\s*/, "") // Remove leading numbers
            .replace(/^["'\-\*]\s*/, "") // Remove leading quotes/dashes
            .replace(/["']$/, "") // Remove trailing quotes
            .trim();

          if (cleaned.length > 5 && cleaned.length < 100) {
            questions.push(cleaned);
            if (questions.length >= expectedCount) break;
          }
        }
      }

      return questions.length > 0 ? questions : null;
    } catch (error) {
      console.error("Failed to extract suggestions from text:", error);
      return null;
    }
  }
}

module.exports = new SuggestionService();
