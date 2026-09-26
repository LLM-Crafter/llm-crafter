const express = require('express');
const router = express.Router({ mergeParams: true });
const { body, param } = require('express-validator');
const knowledgeBaseController = require('../controllers/knowledgeBaseController');
const auth = require('../middleware/auth');
const orgAuth = require('../middleware/organizationAuth');
const validate = require('../middleware/validate');

const createValidation = [
  body('name').trim().notEmpty().isLength({ max: 200 }).withMessage('Name is required (max 200 chars)'),
  body('description').optional().isString().isLength({ max: 2000 }),
];

const updateValidation = [
  body('name').optional().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 2000 }),
];

const kbIdValidation = param('kbId').isString().notEmpty();

router.get('/', auth, orgAuth.hasRole('viewer'), knowledgeBaseController.listKnowledgeBases);

router.post(
  '/',
  auth,
  orgAuth.hasRole('member'),
  createValidation,
  validate,
  knowledgeBaseController.createKnowledgeBase
);

router.get(
  '/:kbId',
  auth,
  orgAuth.hasRole('viewer'),
  kbIdValidation,
  validate,
  knowledgeBaseController.getKnowledgeBase
);

router.put(
  '/:kbId',
  auth,
  orgAuth.hasRole('member'),
  kbIdValidation,
  updateValidation,
  validate,
  knowledgeBaseController.updateKnowledgeBase
);

// Deletes all indexed vectors of the KB, same privilege as clearing the project KB
router.delete(
  '/:kbId',
  auth,
  orgAuth.hasRole('admin'),
  kbIdValidation,
  validate,
  knowledgeBaseController.deleteKnowledgeBase
);

module.exports = router;
