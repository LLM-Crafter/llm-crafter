const ExternalOperator = require('../models/ExternalOperator');

/**
 * Register or update an external operator
 */
const upsertOperator = async (req, res) => {
  try {
    const { orgId, projectId } = req.params;
    const { external_id, name, email, avatar_url, skills, status, metadata } = req.body;

    if (!external_id || !name) {
      return res
        .status(400)
        .json({ error: 'external_id and name are required' });
    }

    const operator = await ExternalOperator.findOneAndUpdate(
      { project: projectId, external_id },
      {
        external_id,
        name,
        email,
        avatar_url,
        skills,
        status,
        metadata,
        organization: orgId,
        project: projectId,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, operator });
  } catch (error) {
    console.error('Error upserting external operator:', error);
    res.status(500).json({ error: 'Failed to upsert external operator' });
  }
};

/**
 * List external operators for a project
 */
const listOperators = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, skill } = req.query;

    const filter = { project: projectId };
    if (status) filter.status = status;
    if (skill) filter.skills = skill;

    const operators = await ExternalOperator.find(filter).sort({
      updated_at: -1,
    });

    res.json({ success: true, operators });
  } catch (error) {
    console.error('Error listing external operators:', error);
    res.status(500).json({ error: 'Failed to list operators' });
  }
};

/**
 * Get a single external operator by external_id
 */
const getOperator = async (req, res) => {
  try {
    const { projectId, externalId } = req.params;

    const operator = await ExternalOperator.findOne({
      project: projectId,
      external_id: externalId,
    });

    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    res.json({ success: true, operator });
  } catch (error) {
    console.error('Error getting external operator:', error);
    res.status(500).json({ error: 'Failed to get operator' });
  }
};

/**
 * Update operator status (online/offline/busy)
 */
const updateOperatorStatus = async (req, res) => {
  try {
    const { projectId, externalId } = req.params;
    const { status } = req.body;

    if (!['online', 'offline', 'busy'].includes(status)) {
      return res
        .status(400)
        .json({ error: 'Status must be online, offline, or busy' });
    }

    const operator = await ExternalOperator.findOneAndUpdate(
      { project: projectId, external_id: externalId },
      { status },
      { new: true }
    );

    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    res.json({ success: true, operator });
  } catch (error) {
    console.error('Error updating operator status:', error);
    res.status(500).json({ error: 'Failed to update operator status' });
  }
};

/**
 * Delete an external operator
 */
const deleteOperator = async (req, res) => {
  try {
    const { projectId, externalId } = req.params;

    const operator = await ExternalOperator.findOneAndDelete({
      project: projectId,
      external_id: externalId,
    });

    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    res.json({ success: true, message: 'Operator deleted' });
  } catch (error) {
    console.error('Error deleting external operator:', error);
    res.status(500).json({ error: 'Failed to delete operator' });
  }
};

/**
 * Bulk update operator statuses (e.g. set all to offline)
 */
const bulkUpdateStatus = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { operator_ids, status } = req.body;

    if (!['online', 'offline', 'busy'].includes(status)) {
      return res
        .status(400)
        .json({ error: 'Status must be online, offline, or busy' });
    }

    const filter = { project: projectId };
    if (operator_ids && operator_ids.length > 0) {
      filter.external_id = { $in: operator_ids };
    }

    const result = await ExternalOperator.updateMany(filter, { status });

    res.json({
      success: true,
      modified_count: result.modifiedCount,
    });
  } catch (error) {
    console.error('Error bulk updating operator statuses:', error);
    res.status(500).json({ error: 'Failed to bulk update statuses' });
  }
};

module.exports = {
  upsertOperator,
  listOperators,
  getOperator,
  updateOperatorStatus,
  deleteOperator,
  bulkUpdateStatus,
};
