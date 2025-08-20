# FAQ Tool

The FAQ Tool is a specialized system tool that enables agents to answer questions using pre-configured frequently asked questions and answers. It provides a structured way to create knowledge bases and deliver consistent, accurate responses to common user queries.

## Overview

The FAQ tool allows agents to:

- Search through configured FAQ entries
- Find the best matching FAQ for user questions
- Return structured answers with confidence scores
- Support categorized FAQ organization
- Provide fallback responses when no good match is found

## Features

- **Intelligent Matching**: Uses text similarity algorithms to find relevant FAQ entries
- **Confidence Scoring**: Returns confidence scores for all matches to help agents decide response quality
- **Category Support**: Organize FAQs by categories (e.g., billing, support, technical)
- **Threshold Control**: Configurable similarity thresholds for match quality
- **Multiple Matches**: Returns top matching FAQs, not just the best one
- **Partial Matching**: Supports partial text matching for better user experience

## Configuration

### Enabling FAQ Tool for an Agent

When creating or updating an agent, include the FAQ tool in the tools array:

```json
{
  "name": "support_agent",
  "type": "chatbot",
  "tools": ["faq", "web_search"],
  "system_prompt": "You are a customer support agent with access to FAQ database..."
}
```

### Configuring FAQ Entries

Configure FAQ entries using the FAQ configuration endpoint:

```bash
POST /api/organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

**Request Body:**

```json
{
  "faqs": [
    {
      "question": "How do I reset my password?",
      "answer": "To reset your password: 1) Go to the login page 2) Click 'Forgot Password' 3) Enter your email address...",
      "category": "account"
    },
    {
      "question": "What payment methods do you accept?",
      "answer": "We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, and Google Pay...",
      "category": "billing"
    }
  ]
}
```

**FAQ Entry Structure:**

- `question` (required): The FAQ question text
- `answer` (required): The complete answer text
- `category` (optional): Category for organizing FAQs (e.g., "billing", "support", "technical")

## Parameters

When agents call the FAQ tool, they can use these parameters:

```json
{
  "tool_name": "faq",
  "parameters": {
    "question": "How do I change my password?",
    "search_threshold": 0.7
  }
}
```

### Parameter Details

- **question** (required): The user's question to search for in the FAQ database
- **search_threshold** (optional): Minimum similarity threshold for FAQ matching (0-1, default: 0.7)
  - Higher values (0.8-1.0): More strict matching, fewer but more accurate results
  - Lower values (0.5-0.7): More lenient matching, more results but potentially less accurate

## Response Format

The FAQ tool returns a structured response:

```json
{
  "question": "How do I change my password?",
  "matched_faq": {
    "question": "How do I reset my password?",
    "answer": "To reset your password: 1) Go to the login page...",
    "category": "account",
    "confidence": 0.85
  },
  "all_matches": [
    {
      "question": "How do I reset my password?",
      "answer": "To reset your password...",
      "category": "account",
      "confidence": 0.85
    },
    {
      "question": "How can I change my email address?",
      "answer": "To change your email address...",
      "category": "account",
      "confidence": 0.72
    }
  ],
  "success": true,
  "execution_time_ms": 5
}
```

### Response Fields

- **question**: The original user question
- **matched_faq**: The best matching FAQ entry (null if no match above threshold)
- **all_matches**: Array of all FAQ entries above the threshold (up to 5 results)
- **success**: Boolean indicating if a match was found
- **execution_time_ms**: Execution time in milliseconds

## Error Handling

The FAQ tool handles various error scenarios:

- **No FAQs Configured**: Returns success: false with appropriate message
- **Invalid Question**: Throws error for missing or invalid question parameter
- **No Matches Found**: Returns success: false with empty matched_faq

## Use Cases

### Customer Support

```json
{
  "system_prompt": "You are a customer support agent. Use the FAQ tool to find answers to user questions. If you find a good match (confidence > 0.7), provide the FAQ answer. Otherwise, suggest contacting support.",
  "tools": ["faq"]
}
```

### Product Information

```json
{
  "faqs": [
    {
      "question": "What are the system requirements?",
      "answer": "Minimum requirements: 4GB RAM, 2GB storage...",
      "category": "technical"
    }
  ]
}
```

### Billing and Policies

```json
{
  "faqs": [
    {
      "question": "What is your refund policy?",
      "answer": "We offer a 30-day money-back guarantee...",
      "category": "billing"
    }
  ]
}
```

## Best Practices

### Writing Effective FAQs

1. **Clear Questions**: Write questions as users would ask them
2. **Complete Answers**: Provide step-by-step instructions when applicable
3. **Consistent Format**: Use consistent formatting across all FAQs
4. **Regular Updates**: Keep FAQs current with product changes

### Organizing FAQs

1. **Use Categories**: Group related FAQs by category
2. **Logical Structure**: Order FAQs from most to least common
3. **Avoid Duplication**: Ensure each FAQ covers a unique topic
4. **Test Matching**: Test various ways users might ask the same question

### Agent Configuration

1. **Set Appropriate Thresholds**: Balance accuracy vs coverage
2. **Fallback Responses**: Configure agents to handle no-match scenarios
3. **Combine Tools**: Use FAQ with other tools for comprehensive support

## API Endpoints

### Configure FAQs

```
POST /organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

### Get FAQ Configuration

```
GET /organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

## Security Features

- **Project Isolation**: FAQs are scoped to specific projects and organizations
- **Access Control**: Requires appropriate permissions to configure FAQs
- **Data Validation**: All FAQ entries are validated before storage

## Performance Optimization

- **Efficient Matching**: Uses optimized text similarity algorithms
- **Result Limiting**: Returns maximum 5 matches to prevent large responses
- **Fast Execution**: Typical execution time under 10ms

The FAQ tool provides a powerful way to create intelligent, self-service customer support experiences while maintaining consistency and accuracy in responses.
