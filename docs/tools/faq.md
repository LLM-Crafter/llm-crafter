# FAQ Tool

Answer questions using pre-configured frequently asked questions with intelligent matching and multi-language support.

## Overview

The FAQ tool enables agents to search through configured FAQ entries and find relevant answers with confidence scoring. It supports semantic similarity matching, language detection, and categorized organization.

## Configuration

**Category:** Knowledge  
**Tool Name:** `faq`

## Parameters

| Parameter          | Type   | Required | Default | Description                        |
| ------------------ | ------ | -------- | ------- | ---------------------------------- |
| `question`         | string | Yes      | -       | The user's question to search for  |
| `search_threshold` | number | No       | 0.7     | Minimum similarity threshold (0-1) |
| `language`         | string | No       | `auto`  | Language code for processing       |

### Supported Languages

- `auto` - Auto-detect language
- `en` - English
- `es` - Spanish
- `pt` - Portuguese
- `fr` - French
- `de` - German
- `it` - Italian
- `zh` - Chinese
- `ar` - Arabic
- `ru` - Russian
- `ja` - Japanese
- `he` - Hebrew

## Setup

Configure FAQ entries for an agent:

```bash
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

**Request Body:**

```json
{
  "faqs": [
    {
      "question": "How do I reset my password?",
      "answer": "To reset your password:\n1. Go to the login page\n2. Click 'Forgot Password'\n3. Enter your email\n4. Check your email for reset link",
      "category": "account"
    },
    {
      "question": "What payment methods do you accept?",
      "answer": "We accept Visa, MasterCard, American Express, PayPal, Apple Pay, and Google Pay.",
      "category": "billing"
    },
    {
      "question": "How do I cancel my subscription?",
      "answer": "To cancel: Go to Settings > Billing > Cancel Subscription. Your access continues until the end of the billing period.",
      "category": "billing"
    }
  ]
}
```

**Response:**

```json
{
  "message": "FAQ configuration updated successfully",
  "faqs": [
    /* array of FAQs */
  ],
  "count": 3
}
```

Get the configuration:

```bash
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

**Response:**

```json
{
  "faqs": [
    /* array of FAQs */
  ],
  "enable_partial_matching": true,
  "search_threshold": 0.7,
  "max_results": 3
}
```

## Usage Example

```json
{
  "tool_name": "faq",
  "parameters": {
    "question": "How can I change my password?",
    "search_threshold": 0.7,
    "language": "auto"
  }
}
```

## Response Format

```json
{
  "question": "How can I change my password?",
  "detected_language": "en",
  "matched_faq": {
    "question": "How do I reset my password?",
    "answer": "To reset your password:\n1. Go to the login page...",
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
      "question": "How do I update my profile?",
      "answer": "To update your profile...",
      "category": "account",
      "confidence": 0.72
    }
  ],
  "success": true,
  "execution_time_ms": 5
}
```

## Matching Algorithm

The FAQ tool uses multiple matching strategies:

1. **Semantic Similarity**: Uses embeddings for meaning-based matching (when API key available)
2. **Keyword Matching**: Matches based on shared keywords
3. **Partial Matching**: Supports fuzzy matching for typos and variations
4. **Language Detection**: Auto-detects question language for better matching

## Confidence Scores

- **0.9-1.0**: Excellent match - very likely the correct answer
- **0.8-0.9**: Good match - probably the correct answer
- **0.7-0.8**: Fair match - likely relevant but verify
- **0.5-0.7**: Weak match - may not be the best answer
- **< 0.5**: Poor match - not returned by default

## Common Use Cases

- **Customer Support**: Answer common questions automatically
- **Product Information**: Provide instant product details
- **Troubleshooting**: Guide users through common issues
- **Policy Questions**: Deliver consistent policy information
- **Onboarding**: Help new users get started

## Configuration in Agents

```json
{
  "name": "support_bot",
  "type": "chatbot",
  "tools": ["faq", "web_search"],
  "system_prompt": "You are a customer support agent. Use the FAQ tool to find answers to common questions. If confidence > 0.8, use the FAQ answer directly. If no good match, offer to escalate."
}
```

## Best Practices

### Writing Effective FAQs

- **Clear Questions**: Write as users would ask
- **Complete Answers**: Provide step-by-step instructions
- **Consistent Format**: Use same structure across FAQs
- **Include Keywords**: Use terms users commonly search for
- **Avoid Jargon**: Use plain language

### Organizing FAQs

- **Use Categories**: Group related FAQs (billing, technical, account)
- **Prioritize Common Questions**: Put frequent questions first
- **Avoid Duplication**: One FAQ per topic
- **Test Variations**: Test different ways users might ask

### Threshold Settings

- **0.8+**: Strict - fewer but more accurate matches
- **0.7**: Balanced - good accuracy with coverage
- **0.6**: Lenient - more matches, may include less relevant

## Advanced Configuration

### Enable Semantic Matching

For better matching quality, the FAQ tool uses agent's API key for embedding-based similarity:

```json
{
  "name": "support_bot",
  "api_key": "key_with_embeddings_access",
  "tools": ["faq"]
}
```

### Partial Matching

Enable fuzzy matching for typos and variations:

```json
{
  "enable_partial_matching": true,
  "default_threshold": 0.7
}
```

## Error Handling

- **No FAQs Configured**: Returns success: false
- **No Matches Found**: Returns success: false with empty matched_faq
- **Invalid Question**: Returns error for missing question
- **Language Detection Failed**: Falls back to default language

## API Endpoints

### Configure FAQs

```
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

### Get FAQ Configuration

```
GET /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

### Update FAQ Configuration

```
PUT /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/faq-config
```

## Performance

- Typical execution time: < 10ms
- Supports thousands of FAQ entries
- Efficient caching and indexing
- Returns maximum 5 matches to optimize response size

## Related Tools

- [RAG Search](/tools/rag-search) - For larger knowledge bases
- [Web Search](/tools/web-search) - For information not in FAQs
- [LLM Prompt](/tools/llm-prompt) - For generating FAQ answers dynamically
