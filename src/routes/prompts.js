const express = require("express");
const { body } = require("express-validator");
const router = express.Router({ mergeParams: true }); // Important for nested routes
const promptController = require("../controllers/promptController");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const orgAuth = require("../middleware/organizationAuth");

// Validation middleware
const createPromptValidation = [
  body("name")
    .trim()
    .notEmpty()
    .matches(/^[a-z0-9_]+$/)
    .withMessage(
      "Name can only contain lowercase letters, numbers, and underscores"
    ),
  body("description").optional().isString(),
  body("content").optional().isString(),
  body("system_prompt").optional().isString(),
];

const updatePromptValidation = [
  body("api_key").optional().isString(),
  body("description").optional().isString(),
  body("content").optional().isString(),
  body("system_prompt").optional().isString(),
  body("llm_settings.model").optional().isString(),
  body("llm_settings.parameters").optional().isObject(),
  body("llm_settings.parameters.temperature")
    .optional()
    .isFloat({ min: 0, max: 1 }),
  body("llm_settings.parameters.max_tokens").optional().isInt({ min: 1 }),
];

// Routes
router.post(
  "/",
  auth,
  orgAuth.hasRole("member"),
  createPromptValidation,
  validate,
  promptController.createPrompt
);

router.put(
  "/:promptId",
  auth,
  orgAuth.hasRole("member"),
  updatePromptValidation,
  validate,
  promptController.updatePrompt
);

router.delete(
  "/:promptId",
  auth,
  orgAuth.hasRole("admin"),
  promptController.deletePrompt
);

router.get(
  "/:promptId",
  auth,
  orgAuth.hasRole("viewer"),
  promptController.getPrompt
);

module.exports = router;
