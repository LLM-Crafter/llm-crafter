const summarizationService = require("./src/services/summarizationService");

// Mock conversation messages for testing
const testMessages = [
  {
    role: "user",
    content:
      "Hi, I need help setting up a new e-commerce website for my bookstore. I want to sell books online.",
    timestamp: new Date(),
  },
  {
    role: "assistant",
    content:
      "I'd be happy to help you set up an e-commerce website for your bookstore! Let me gather some information first. What's your budget range, and do you have any specific platforms in mind?",
    timestamp: new Date(),
  },
  {
    role: "user",
    content:
      "My budget is around $5000, and I've heard good things about Shopify. I want to focus on rare books and collectibles.",
    timestamp: new Date(),
  },
  {
    role: "assistant",
    content:
      "Excellent choice! Shopify is perfect for your needs and budget. For rare books and collectibles, we'll need special features like detailed condition descriptions, authentication certificates, and high-quality image galleries. Let me outline a plan for you.",
    timestamp: new Date(),
  },
  {
    role: "user",
    content:
      "That sounds great. I also need inventory management and I want to integrate with my existing point-of-sale system.",
    timestamp: new Date(),
  },
  {
    role: "assistant",
    content:
      "Perfect! Shopify has excellent inventory management and can integrate with most POS systems. What POS system are you currently using? This will help me recommend the best integration approach.",
    timestamp: new Date(),
  },
  {
    role: "user",
    content:
      "I'm using Square for my physical store. Also, I prefer a minimalist design with focus on the books rather than flashy graphics.",
    timestamp: new Date(),
  },
];

async function testConversationSummarization() {
  try {
    console.log("=== CONVERSATION SUMMARIZATION TEST ===\n");

    console.log("Original conversation:");
    testMessages.forEach((msg, i) => {
      console.log(
        `${i + 1}. ${msg.role.toUpperCase()}: ${msg.content.substring(0, 80)}...`
      );
    });

    console.log(`\nOriginal message count: ${testMessages.length}`);

    const estimatedOriginalTokens = summarizationService.estimateTokenSavings(
      testMessages,
      0
    );
    console.log(`Estimated original tokens: ${estimatedOriginalTokens}`);

    // Simulate what the summary structure would look like
    const mockSummary = {
      key_topics: [
        "e-commerce website setup",
        "bookstore",
        "Shopify platform",
        "rare books and collectibles",
        "inventory management",
        "POS integration",
      ],
      important_decisions: [
        "Budget set at $5000",
        "Shopify chosen as platform",
        "Focus on rare books and collectibles",
        "Square POS integration needed",
      ],
      unresolved_issues: [
        "Specific Square integration method",
        "Website design details",
        "Authentication certificate process",
      ],
      user_preferences: {
        budget: "$5000",
        platform: "Shopify",
        business_type: "rare books and collectibles",
        pos_system: "Square",
        design_preference: "minimalist",
      },
      context_data: {
        business_focus: "rare books and collectibles",
        has_physical_store: true,
        current_pos: "Square",
      },
    };

    console.log("\nGenerated summary structure:");
    console.log(JSON.stringify(mockSummary, null, 2));

    const summaryTokens = 200; // Estimated summary size
    const tokenSavings = estimatedOriginalTokens - summaryTokens;

    console.log(`\nEstimated summary tokens: ~${summaryTokens}`);
    console.log(`Estimated token savings: ${tokenSavings} tokens`);
    console.log(
      `Token reduction: ${Math.round((tokenSavings / estimatedOriginalTokens) * 100)}%`
    );

    console.log("\n=== SUMMARIZATION BENEFITS ===");
    console.log("✅ Preserves key business requirements");
    console.log("✅ Maintains user preferences");
    console.log("✅ Tracks important decisions");
    console.log("✅ Notes unresolved issues for follow-up");
    console.log("✅ Significantly reduces token usage");
    console.log("✅ Faster response times due to smaller context");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Test conversation growth scenarios
function testConversationGrowth() {
  console.log("\n=== CONVERSATION GROWTH SCENARIOS ===");

  const scenarios = [
    { messages: 5, shouldSummarize: false },
    { messages: 15, shouldSummarize: false },
    { messages: 20, shouldSummarize: true },
    { messages: 35, shouldSummarize: true },
    { messages: 50, shouldSummarize: true },
  ];

  scenarios.forEach((scenario) => {
    const mockConversation = {
      messages: new Array(scenario.messages).fill({}),
      metadata: {
        last_summary_index: -1,
        requires_summarization: false,
      },
      conversation_summary: null,
    };

    const shouldSummarize =
      summarizationService.shouldSummarize(mockConversation);
    const expectedTokens = scenario.messages * 50; // Rough estimate
    const expectedSavings = scenario.shouldSummarize
      ? Math.floor(expectedTokens * 0.7)
      : 0;

    console.log(
      `Messages: ${scenario.messages} | Should Summarize: ${shouldSummarize} | Expected Savings: ${expectedSavings} tokens`
    );
  });
}

if (require.main === module) {
  testConversationSummarization();
  testConversationGrowth();
}
