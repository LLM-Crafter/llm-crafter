const express = require("express");
const { body } = require("express-validator");
const router = express.Router({ mergeParams: true });
const apiKeyController = require("../controllers/apiKeyController");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const orgAuth = require("../middleware/organizationAuth");
const { apiKeyLimiter } = require("../middleware/rateLimiting");

const apiKeyValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("key").trim().notEmpty().withMessage("API key is required"),
  body("provider").notEmpty().withMessage("Provider is required"),
];

router.post(
  "/",
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.hasRole("member"),
  apiKeyValidation,
  validate,
  apiKeyController.createApiKey
);

router.delete(
  "/:apiKeyId",
  apiKeyLimiter, // Rate limit: 20 requests per 15 minutes (sensitive operation)
  auth,
  orgAuth.hasRole("admin"),
  apiKeyController.deleteApiKey
);

module.exports = router;
