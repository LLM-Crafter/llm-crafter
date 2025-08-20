// Complete working example of agent using FAQ tool for customer support

// 1. Create agent with system prompt that explains how to use the FAQ tool
const agentSystemPrompt = `
You are a helpful customer support assistant with access to a comprehensive FAQ database.

When users ask questions:
- Use the "faq" tool to search for relevant answers in the knowledge base
- If a good match is found (confidence >= 0.7), provide the answer from the FAQ
- If no good match is found, provide a helpful response and suggest contacting support
- You can adjust the search_threshold parameter to control matching sensitivity

Example tool usage:
{
  "tool_name": "faq",
  "parameters": {
    "question": "How do I reset my password?",
    "search_threshold": 0.7
  }
}

Always be helpful and friendly, and provide accurate information from the FAQ when available.
`;

// 2. FAQ configuration with common support questions
const customerSupportFAQs = [
  {
    question: "How do I reset my password?",
    answer:
      "To reset your password: 1) Go to the login page 2) Click 'Forgot Password' 3) Enter your email address 4) Check your email for a reset link 5) Follow the instructions in the email. The reset link is valid for 24 hours.",
    category: "account",
  },
  {
    question: "How can I change my email address?",
    answer:
      "To change your email address: 1) Log into your account 2) Go to Settings > Account 3) Click 'Change Email' 4) Enter your new email address 5) Verify the new email through the confirmation link we'll send.",
    category: "account",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, and Google Pay. For enterprise customers, we also accept bank transfers and purchase orders.",
    category: "billing",
  },
  {
    question: "How do I cancel my subscription?",
    answer:
      "To cancel your subscription: 1) Log into your account 2) Go to Settings > Billing 3) Click 'Manage Subscription' 4) Select 'Cancel Subscription' 5) Confirm your cancellation. Your access will continue until the end of your current billing period.",
    category: "billing",
  },
  {
    question: "How can I download my data?",
    answer:
      "To download your data: 1) Go to Settings > Privacy 2) Click 'Export Data' 3) Select the data types you want to export 4) Click 'Request Export' 5) You'll receive an email with download links within 24 hours.",
    category: "data",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes, we take data security very seriously. We use AES-256 encryption for data at rest, TLS 1.3 for data in transit, and follow SOC 2 Type II compliance standards. All data is backed up daily and stored in secure, geographically distributed data centers.",
    category: "security",
  },
  {
    question: "How do I contact customer support?",
    answer:
      "You can contact our customer support team through: 1) Email: support@company.com 2) Live chat (available 9 AM - 6 PM EST) 3) Help center: help.company.com 4) Phone: 1-800-SUPPORT (for premium customers). We typically respond to emails within 2 hours during business hours.",
    category: "support",
  },
  {
    question: "What are your business hours?",
    answer:
      "Our customer support is available Monday through Friday, 9 AM to 6 PM Eastern Standard Time. Live chat and phone support are available during these hours. Email support is monitored 24/7 and we respond within 2 hours during business hours, and within 12 hours on weekends.",
    category: "support",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes, we offer a 30-day money-back guarantee for all new subscriptions. To request a refund: 1) Contact support within 30 days of your initial purchase 2) Provide your account email and reason for refund 3) We'll process your refund within 5-7 business days. Annual subscriptions can be refunded pro-rata after the 30-day period.",
    category: "billing",
  },
  {
    question: "How do I upgrade my plan?",
    answer:
      "To upgrade your plan: 1) Log into your account 2) Go to Settings > Billing 3) Click 'Change Plan' 4) Select your new plan 5) Confirm the upgrade. You'll be charged pro-rata for the remaining billing period, and your new features will be available immediately.",
    category: "billing",
  },
];

// 3. Example user queries and expected agent responses
const userQueries = [
  {
    query: "I forgot my password, how can I get back into my account?",
    expected_faq_match: "How do I reset my password?",
    expected_confidence: "> 0.8",
  },
  {
    query: "What credit cards do you take?",
    expected_faq_match: "What payment methods do you accept?",
    expected_confidence: "> 0.7",
  },
  {
    query: "How secure is my information?",
    expected_faq_match: "Is my data secure?",
    expected_confidence: "> 0.6",
  },
  {
    query: "I want to delete my account",
    expected_faq_match: null, // No direct match
    expected_behavior:
      "Should suggest contacting support or refer to data export/cancellation",
  },
];

// 4. Example API calls to configure FAQ for an agent

const configureAgentFAQ = {
  method: "POST",
  endpoint:
    "/api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config",
  headers: {
    Authorization: "Bearer your-api-token",
    "Content-Type": "application/json",
  },
  body: {
    faqs: customerSupportFAQs,
  },
};

// 5. Example FAQ tool execution
const faqToolExample = {
  user_query: "How can I reset my password?",
  agent_tool_call: {
    tool_name: "faq",
    parameters: {
      question: "How can I reset my password?",
      search_threshold: 0.7,
    },
  },
  expected_response: {
    question: "How can I reset my password?",
    matched_faq: {
      question: "How do I reset my password?",
      answer:
        "To reset your password: 1) Go to the login page 2) Click 'Forgot Password'...",
      category: "account",
      confidence: 0.95,
    },
    all_matches: [
      // Top 5 matches with confidence scores
    ],
    success: true,
    execution_time_ms: 5,
  },
};

// 6. FAQ categories for organization
const faqCategories = [
  "account",
  "billing",
  "data",
  "security",
  "support",
  "technical",
];

module.exports = {
  agentSystemPrompt,
  customerSupportFAQs,
  userQueries,
  configureAgentFAQ,
  faqToolExample,
  faqCategories,
};
