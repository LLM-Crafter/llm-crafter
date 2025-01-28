const APIKey = require('../models/ApiKey');
const Project = require('../models/Project');
const Provider = require('../models/Provider');

const createApiKey = async (req, res) => {
  try {
    // Verify project exists
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify provider exists
    const provider = await Provider.findById(req.body.provider);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Check if API key already exists for this project and provider
    const existingKey = await APIKey.findOne({
      project: req.params.projectId,
      key: req.body.key
    });

    if (existingKey) {
      return res.status(400).json({ error: 'API key already exists in this project' });
    }

    const apiKey = new APIKey({
      name: req.body.name,
      key: req.body.key,
      provider: req.body.provider,
      project: req.params.projectId,
      is_active: true
    });

    await apiKey.save();

    res.status(201).json({
      id: apiKey._id,
      name: apiKey.name,
      provider: apiKey.provider,
      project: req.params.projectId,
      created_at: apiKey.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
};
const deleteApiKey = async (req, res) => {
    try {
      // Verify project exists and belongs to the organization
      const project = await Project.findOne({
        _id: req.params.projectId,
        organization: req.params.orgId
      });
  
      if (!project) {
        return res.status(404).json({ error: 'Project not found in this organization' });
      }
  
      // Find and delete the API key
      const apiKey = await APIKey.findOneAndDelete({
        _id: req.params.apiKeyId,
        project: req.params.projectId
      });
  
      if (!apiKey) {
        return res.status(404).json({ error: 'API key not found in this project' });
      }
  
      res.json({ message: 'API key deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  };
  
  module.exports = {
    createApiKey,
    deleteApiKey
  };
  