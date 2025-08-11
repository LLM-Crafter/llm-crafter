const express = require("express");
const router = express.Router();
const proxyController = require("../controllers/proxyController");
const auth = require("../middleware/auth");

router.post(
  "/organizations/:orgId/projects/:projectId/execute/:promptName",
  auth,
  proxyController.executePrompt
);

router.post("/test-prompt", auth, proxyController.testPrompt);

router.get(
  "/organizations/:orgId/projects/:projectId/prompts/:promptId/executions",
  auth,
  proxyController.getPromptExecutions
);

module.exports = router;
