const Prompt = require('../models/Prompt');
const Project = require('../models/Project');
const ApiKey = require('../models/ApiKey');

const createPrompt = async (req, res) => {
    try {
      // Verify project exists and belongs to the organization
      const project = await Project.findOne({
        _id: req.params.projectId,
        organization: req.params.orgId
      });
  
      if (!project) {
        return res.status(404).json({ error: 'Project not found in this organization' });
      }
  
      // Create prompt with just the name
      const prompt = new Prompt({
        name: req.body.name.toLowerCase(),
        project: req.params.projectId
      });
  
      await prompt.save();
  
      res.status(201).json(prompt);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Prompt name already exists in this project' });
      }
      res.status(500).json({ error: 'Failed to create prompt' });
    }
  };
  

  const updatePrompt = async (req, res) => {
    try {
      const prompt = await Prompt.findOne({
        _id: req.params.promptId,
        project: req.params.projectId
      });
  
      if (!prompt) {
        return res.status(404).json({ error: 'Prompt not found' });
      }
  
      // If updating API key, verify it exists and belongs to the project
      if (req.body.api_key) {
        const apiKey = await ApiKey.findOne({
          _id: req.body.api_key,
          project: req.params.projectId
        }).populate('provider');
  
        if (!apiKey) {
          return res.status(404).json({ error: 'API key not found in this project' });
        }
  
        // Verify the model belongs to the provider
        if (req.body.llm_settings?.model && 
            !apiKey.provider.models.includes(req.body.llm_settings.model)) {
          return res.status(400).json({ error: 'Invalid model for selected provider' });
        }
  
        prompt.api_key = apiKey._id;
      }
  
      // Update other fields if provided
      if (req.body.description !== undefined) prompt.description = req.body.description;
      if (req.body.content !== undefined) {
        prompt.content = req.body.content;
        prompt.version += 1;
      }
      if (req.body.llm_settings) {
        prompt.llm_settings = {
          ...prompt.llm_settings,
          ...req.body.llm_settings
        };
      }
      console.log(prompt.llm_settings)
  
      await prompt.save();
  
      // Fetch updated prompt with populated fields
      const updatedPrompt = await Prompt.findById(prompt._id)
        .populate({
          path: 'api_key',
          select: 'name provider',
          populate: {
            path: 'provider',
            select: 'name models'
          }
        });
  
      res.json(updatedPrompt);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update prompt' });
    }
  };

const deletePrompt = async (req, res) => {
  try {
    const prompt = await Prompt.findOneAndDelete({
      _id: req.params.promptId,
      project: req.params.projectId
    });

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json({ message: 'Prompt deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
};

const getPrompt = async (req, res) => {
  try {
    const prompt = await Prompt.findOne({
      _id: req.params.promptId,
      project: req.params.projectId
    });

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(prompt);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prompt' });
  }
};

module.exports = {
  createPrompt,
  updatePrompt,
  deletePrompt,
  getPrompt
};
