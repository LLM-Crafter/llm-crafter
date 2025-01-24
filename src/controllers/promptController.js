const Prompt = require('../models/Prompt');
const Project = require('../models/Project');

const createPrompt = async (req, res) => {
  try {
    // Verify project exists and user has access
    const project = await Project.findOne({
      _id: req.params.projectId
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const prompt = new Prompt({
      name: req.body.name,
      description: req.body.description,
      content: req.body.content,
      project: req.params.projectId,
      default_llm: req.body.default_llm
    });

    await prompt.save();
    res.status(201).json(prompt);
  } catch (error) {
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

    // Increment version if content is being updated
    if (req.body.content && req.body.content !== prompt.content) {
      prompt.version += 1;
    }

    // Update fields
    const updates = ['name', 'description', 'content', 'default_llm'];
    updates.forEach(field => {
      if (req.body[field] !== undefined) {
        prompt[field] = req.body[field];
      }
    });

    await prompt.save();
    res.json(prompt);
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
