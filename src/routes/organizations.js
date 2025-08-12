const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const organizationController = require("../controllers/organizationController");
const projectController = require("../controllers/projectController");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const orgAuth = require("../middleware/organizationAuth");

const promptRoutes = require("./prompts");
const apiKeyRoutes = require("./apiKeys");
const agentRoutes = require("./agents");
router.use("/:orgId/projects/:projectId/api-keys", apiKeyRoutes);
router.use("/:orgId/projects/:projectId/agents", agentRoutes);

// Organization validation
const organizationValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("description").optional().trim(),
];

// Project validation
const projectValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("description").optional().trim(),
  body("llm_configurations").optional().isArray(),
];

router.use("/:orgId/projects/:projectId/prompts", promptRoutes);

// Organization routes
router.post(
  "/",
  auth,
  organizationValidation,
  validate,
  organizationController.createOrganization
);

router.get("/", auth, organizationController.getOrganizations);

router.get(
  "/:orgId",
  auth,
  orgAuth.isMember,
  organizationController.getOrganization
);

// Project routes (nested under organizations)
router.post(
  "/:orgId/projects",
  auth,
  orgAuth.isMember,
  projectValidation,
  validate,
  projectController.createProject
);

router.get(
  "/:orgId/projects",
  auth,
  orgAuth.isMember,
  projectController.getProjects
);

router.get(
  "/:orgId/projects/:projectId",
  auth,
  orgAuth.isMember,
  projectController.getProject
);

router.post(
  "/:orgId/members",
  auth,
  orgAuth.isAdmin,
  [
    body("email").isEmail().normalizeEmail(),
    body("role").isIn(["admin", "member", "viewer"]),
  ],
  validate,
  organizationController.inviteUserToOrg
);

router.put(
  "/:orgId/members/:userId",
  auth,
  orgAuth.isAdmin,
  [body("role").isIn(["admin", "member", "viewer"])],
  validate,
  organizationController.updateMemberRole
);

router.delete(
  "/:orgId/members/:userId",
  auth,
  orgAuth.isAdmin,
  organizationController.removeMember
);

module.exports = router;
