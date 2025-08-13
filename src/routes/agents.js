const express = require("express");
const { body } = require("express-validator");
const router = express.Router({ mergeParams: true });
const agentController = require("../controllers/agentController");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const orgAuth = require("../middleware/organizationAuth");

// Validation middleware
const createAgentValidation = [
  body("name")
    .trim()
    .notEmpty()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage(
      "Name can only contain letters, numbers, underscores, and hyphens"
    ),
  body("description").optional().isString(),
  body("type")
    .isIn(["chatbot", "task", "workflow", "api"])
    .withMessage("Invalid agent type"),
  body("system_prompt").notEmpty().withMessage("System prompt is required"),
  body("api_key").notEmpty().withMessage("API key is required"),
  body("llm_settings.model").notEmpty().withMessage("Model is required"),
  body("llm_settings.parameters.temperature")
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage("Temperature must be between 0 and 2"),
  body("llm_settings.parameters.max_tokens")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Max tokens must be a positive integer"),
  body("tools").optional().isArray().withMessage("Tools must be an array"),
];

const updateAgentValidation = [
  body("name")
    .optional()
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage(
      "Name can only contain letters, numbers, underscores, and hyphens"
    ),
  body("description").optional().isString(),
  body("system_prompt").optional().isString(),
  body("api_key").optional().isString(),
  body("llm_settings.model").optional().isString(),
  body("llm_settings.parameters.temperature")
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage("Temperature must be between 0 and 2"),
  body("llm_settings.parameters.max_tokens")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Max tokens must be a positive integer"),
  body("tools").optional().isArray().withMessage("Tools must be an array"),
  body("is_active").optional().isBoolean(),
];

const chatbotExecutionValidation = [
  body("message").notEmpty().withMessage("Message is required"),
  body("user_identifier").notEmpty().withMessage("User identifier is required"),
  body("conversation_id")
    .optional()
    .custom((value) => {
      if (value === null || value === undefined || typeof value === "string") {
        return true;
      }
      throw new Error("Conversation ID must be a string or null");
    }),
];

const taskExecutionValidation = [
  body("input").notEmpty().withMessage("Input is required"),
  body("user_identifier").optional().isString(),
];

// ===== AGENT MANAGEMENT ROUTES =====

router.post(
  "/",
  auth,
  orgAuth.hasRole("member"),
  createAgentValidation,
  validate,
  agentController.createAgent
);

router.get("/", auth, orgAuth.hasRole("viewer"), agentController.getAgents);

router.get(
  "/:agentId",
  auth,
  orgAuth.hasRole("viewer"),
  agentController.getAgent
);

router.put(
  "/:agentId",
  auth,
  orgAuth.hasRole("member"),
  updateAgentValidation,
  validate,
  agentController.updateAgent
);

router.delete(
  "/:agentId",
  auth,
  orgAuth.hasRole("admin"),
  agentController.deleteAgent
);

// ===== AGENT EXECUTION ROUTES =====

router.post(
  "/:agentId/chat",
  auth,
  orgAuth.hasRole("member"),
  chatbotExecutionValidation,
  validate,
  agentController.executeChatbotAgent
);

router.post(
  "/:agentId/execute",
  auth,
  orgAuth.hasRole("member"),
  taskExecutionValidation,
  validate,
  agentController.executeTaskAgent
);

// ===== CONVERSATION MANAGEMENT ROUTES =====

router.get(
  "/:agentId/conversations",
  auth,
  orgAuth.hasRole("viewer"),
  agentController.getConversations
);

router.get(
  "/:agentId/conversations/:conversationId",
  auth,
  orgAuth.hasRole("viewer"),
  agentController.getConversation
);

// ===== EXECUTION HISTORY ROUTES =====

router.get(
  "/:agentId/executions",
  auth,
  orgAuth.hasRole("viewer"),
  agentController.getAgentExecutions
);

router.get(
  "/:agentId/executions/:executionId",
  auth,
  orgAuth.hasRole("viewer"),
  agentController.getAgentExecution
);

// ===== API ENDPOINTS CONFIGURATION ROUTES =====

const apiEndpointsValidation = [
  body("endpoints")
    .optional()
    .isObject()
    .withMessage("Endpoints must be an object"),
  body("authentication")
    .optional()
    .isObject()
    .withMessage("Authentication must be an object"),
  body("authentication.type")
    .optional()
    .isIn(["bearer_token", "api_key", "cookie"])
    .withMessage("Invalid authentication type"),
];

router.post(
  "/:agentId/api-config",
  auth,
  orgAuth.hasRole("member"),
  apiEndpointsValidation,
  validate,
  agentController.configureApiEndpoints
);

router.get(
  "/:agentId/api-config",
  auth,
  orgAuth.hasRole("viewer"),
  agentController.getApiEndpoints
);

// ===== CONVERSATION SUMMARIZATION ROUTES =====

router.post(
  "/:agentId/conversations/:conversationId/summarize",
  auth,
  orgAuth.hasRole("member"),
  agentController.summarizeConversation
);

router.get(
  "/:agentId/conversations/:conversationId/summary",
  auth,
  orgAuth.hasRole("viewer"),
  agentController.getConversationSummary
);

module.exports = router;
