const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const toolController = require("../controllers/toolController");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  generalLimiter,
  proxyLimiter,
  generalSlowDown,
} = require("../middleware/rateLimiting");

// Validation middleware
const createToolValidation = [
  body("name")
    .trim()
    .notEmpty()
    .matches(/^[a-z0-9_]+$/)
    .withMessage(
      "Name can only contain lowercase letters, numbers, and underscores"
    ),
  body("display_name")
    .trim()
    .notEmpty()
    .withMessage("Display name is required"),
  body("description").trim().notEmpty().withMessage("Description is required"),
  body("category")
    .isIn([
      "web",
      "computation",
      "data",
      "communication",
      "utility",
      "llm",
      "custom",
    ])
    .withMessage("Invalid category"),
  body("parameters_schema")
    .isObject()
    .withMessage("Parameters schema must be an object"),
  body("parameters_schema.type")
    .equals("object")
    .withMessage("Parameters schema type must be object"),
  body("parameters_schema.properties")
    .isObject()
    .withMessage("Parameters schema properties must be an object"),
  body("implementation")
    .isObject()
    .withMessage("Implementation must be an object"),
  body("implementation.type")
    .isIn(["internal", "external_api", "webhook", "code"])
    .withMessage("Invalid implementation type"),
  body("implementation.handler")
    .notEmpty()
    .withMessage("Implementation handler is required"),
];

const updateToolValidation = [
  body("display_name").optional().trim().notEmpty(),
  body("description").optional().trim().notEmpty(),
  body("category")
    .optional()
    .isIn([
      "web",
      "computation",
      "data",
      "communication",
      "utility",
      "llm",
      "custom",
    ]),
  body("parameters_schema").optional().isObject(),
  body("implementation").optional().isObject(),
  body("is_active").optional().isBoolean(),
];

const executeToolValidation = [
  body("parameters")
    .optional()
    .isObject()
    .withMessage("Parameters must be an object"),
];

// ===== PUBLIC TOOL ROUTES =====

// Get all available tools
router.get(
  "/",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  toolController.getTools
);

// Get tool categories
router.get(
  "/categories",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  toolController.getToolCategories
);

// Get specific tool
router.get(
  "/:toolName",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  toolController.getTool
);

// Get tool usage statistics
router.get(
  "/:toolName/stats",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  toolController.getToolUsageStats
);

// Execute a tool (for testing)
router.post(
  "/:toolName/execute",
  proxyLimiter, // Rate limit: 60 requests per minute (tool execution)
  generalSlowDown, // Progressive delays
  auth,
  executeToolValidation,
  validate,
  toolController.executeTool
);

// ===== ADMIN TOOL MANAGEMENT ROUTES =====

// Create custom tool (admin only)
router.post(
  "/",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  generalSlowDown, // Progressive delays
  auth,
  createToolValidation,
  validate,
  toolController.createTool
);

// Update custom tool (admin only)
router.put(
  "/:toolName",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  generalSlowDown, // Progressive delays
  auth,
  updateToolValidation,
  validate,
  toolController.updateTool
);

// Delete custom tool (admin only)
router.delete(
  "/:toolName",
  generalLimiter, // Rate limit: 100 requests per 15 minutes
  auth,
  toolController.deleteTool
);

module.exports = router;
