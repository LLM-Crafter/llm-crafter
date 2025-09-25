const express = require('express');
const { body } = require('express-validator');
const router = express.Router({ mergeParams: true });
const agentController = require('../controllers/agentController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const orgAuth = require('../middleware/organizationAuth');

// Validation middleware
const createAgentValidation = [
  body('name')
    .trim()
    .notEmpty()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage(
      'Name can only contain letters, numbers, underscores, and hyphens'
    ),
  body('description').optional().isString(),
  body('type')
    .isIn(['chatbot', 'task', 'workflow', 'api'])
    .withMessage('Invalid agent type'),
  body('system_prompt').notEmpty().withMessage('System prompt is required'),
  body('api_key').notEmpty().withMessage('API key is required'),
  body('llm_settings.model').notEmpty().withMessage('Model is required'),
  body('llm_settings.parameters.temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  body('llm_settings.parameters.max_tokens')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max tokens must be a positive integer'),
  body('tools').optional().isArray().withMessage('Tools must be an array'),
  // Question suggestions validation
  body('question_suggestions')
    .optional()
    .isObject()
    .withMessage('Question suggestions must be an object'),
  body('question_suggestions.enabled')
    .optional()
    .isBoolean()
    .withMessage('Question suggestions enabled must be a boolean'),
  body('question_suggestions.count')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Question suggestions count must be between 1 and 5'),
  body('question_suggestions.api_key')
    .optional()
    .isString()
    .withMessage('Question suggestions API key must be a string'),
  body('question_suggestions.model')
    .optional()
    .isString()
    .withMessage('Question suggestions model must be a string'),
  body('question_suggestions.custom_prompt')
    .optional()
    .isString()
    .withMessage('Question suggestions custom prompt must be a string'),
  // Streaming configuration validation
  body('config.enable_streaming')
    .optional()
    .isBoolean()
    .withMessage('Enable streaming must be a boolean'),
];

const updateAgentValidation = [
  body('name')
    .optional()
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage(
      'Name can only contain letters, numbers, underscores, and hyphens'
    ),
  body('description').optional().isString(),
  body('system_prompt').optional().isString(),
  body('api_key').optional().isString(),
  body('llm_settings.model').optional().isString(),
  body('llm_settings.parameters.temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  body('llm_settings.parameters.max_tokens')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max tokens must be a positive integer'),
  body('tools').optional().isArray().withMessage('Tools must be an array'),
  body('is_active').optional().isBoolean(),
  // Question suggestions validation
  body('question_suggestions')
    .optional()
    .isObject()
    .withMessage('Question suggestions must be an object'),
  body('question_suggestions.enabled')
    .optional()
    .isBoolean()
    .withMessage('Question suggestions enabled must be a boolean'),
  body('question_suggestions.count')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Question suggestions count must be between 1 and 5'),
  body('question_suggestions.api_key')
    .optional()
    .isString()
    .withMessage('Question suggestions API key must be a string'),
  body('question_suggestions.model')
    .optional()
    .isString()
    .withMessage('Question suggestions model must be a string'),
  body('question_suggestions.custom_prompt')
    .optional()
    .isString()
    .withMessage('Question suggestions custom prompt must be a string'),
  // Streaming configuration validation
  body('config.enable_streaming')
    .optional()
    .isBoolean()
    .withMessage('Enable streaming must be a boolean'),
];

const chatbotExecutionValidation = [
  body('message').notEmpty().withMessage('Message is required'),
  body('user_identifier').notEmpty().withMessage('User identifier is required'),
  body('conversation_id')
    .optional()
    .custom(value => {
      if (value === null || value === undefined || typeof value === 'string') {
        return true;
      }
      throw new Error('Conversation ID must be a string or null');
    }),
];

const taskExecutionValidation = [
  body('input').notEmpty().withMessage('Input is required'),
  body('user_identifier').optional().isString(),
];

// ===== AGENT MANAGEMENT ROUTES =====

router.post(
  '/',
  auth,
  orgAuth.hasRole('member'),
  createAgentValidation,
  validate,
  agentController.createAgent
);

router.get('/', auth, orgAuth.hasRole('viewer'), agentController.getAgents);

router.get(
  '/:agentId',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getAgent
);

router.put(
  '/:agentId',
  auth,
  orgAuth.hasRole('member'),
  updateAgentValidation,
  validate,
  agentController.updateAgent
);

router.delete(
  '/:agentId',
  auth,
  orgAuth.hasRole('admin'),
  agentController.deleteAgent
);

// ===== AGENT EXECUTION ROUTES =====

router.post(
  '/:agentId/chat',
  auth,
  orgAuth.hasRole('member'),
  chatbotExecutionValidation,
  validate,
  agentController.executeChatbotAgent
);

router.post(
  '/:agentId/chat/stream',
  auth,
  orgAuth.hasRole('member'),
  chatbotExecutionValidation,
  validate,
  agentController.executeChatbotAgentStream
);

router.post(
  '/:agentId/execute',
  auth,
  orgAuth.hasRole('member'),
  taskExecutionValidation,
  validate,
  agentController.executeTaskAgent
);

router.post(
  '/:agentId/execute/stream',
  auth,
  orgAuth.hasRole('member'),
  taskExecutionValidation,
  validate,
  agentController.executeTaskAgentStream
);

// ===== CONVERSATION MANAGEMENT ROUTES =====

router.get(
  '/:agentId/conversations',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getConversations
);

router.get(
  '/:agentId/conversations/:conversationId',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getConversation
);

// ===== EXECUTION HISTORY ROUTES =====

router.get(
  '/:agentId/executions',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getAgentExecutions
);

router.get(
  '/:agentId/executions/:executionId',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getAgentExecution
);

// ===== API ENDPOINTS CONFIGURATION ROUTES =====

const apiEndpointsValidation = [
  body('endpoints')
    .optional()
    .isObject()
    .withMessage('Endpoints must be an object'),
  body('authentication')
    .optional()
    .isObject()
    .withMessage('Authentication must be an object'),
  body('authentication.type')
    .optional()
    .isIn(['bearer_token', 'api_key', 'cookie'])
    .withMessage('Invalid authentication type'),
];

router.post(
  '/:agentId/api-config',
  auth,
  orgAuth.hasRole('member'),
  apiEndpointsValidation,
  validate,
  agentController.configureApiEndpoints
);

router.get(
  '/:agentId/api-config',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getApiEndpoints
);

// ===== FAQ CONFIGURATION ROUTES =====

const faqValidation = [
  body('faqs').optional().isArray().withMessage('FAQs must be an array'),
  body('faqs.*.question')
    .if(body('faqs').exists())
    .notEmpty()
    .withMessage('FAQ question is required'),
  body('faqs.*.answer')
    .if(body('faqs').exists())
    .notEmpty()
    .withMessage('FAQ answer is required'),
  body('faqs.*.category')
    .optional()
    .isString()
    .withMessage('FAQ category must be a string'),
];

router.post(
  '/:agentId/faq-config',
  auth,
  orgAuth.hasRole('member'),
  faqValidation,
  validate,
  agentController.configureFAQs
);

router.get(
  '/:agentId/faq-config',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getFAQs
);

// ===== CONVERSATION SUMMARIZATION ROUTES =====

router.post(
  '/:agentId/conversations/:conversationId/summarize',
  auth,
  orgAuth.hasRole('member'),
  agentController.summarizeConversation
);

router.get(
  '/:agentId/conversations/:conversationId/summary',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getConversationSummary
);

// ===== QUESTION SUGGESTIONS ROUTES =====

const questionSuggestionsValidation = [
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
  body('count')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Count must be between 1 and 5'),
  body('api_key').optional().isString().withMessage('API key must be a string'),
  body('model').optional().isString().withMessage('Model must be a string'),
  body('custom_prompt')
    .optional()
    .isString()
    .withMessage('Custom prompt must be a string'),
];

router.put(
  '/:agentId/question-suggestions',
  auth,
  orgAuth.hasRole('member'),
  questionSuggestionsValidation,
  validate,
  agentController.configureQuestionSuggestions
);

router.get(
  '/:agentId/question-suggestions',
  auth,
  orgAuth.hasRole('viewer'),
  agentController.getQuestionSuggestions
);

module.exports = router;
