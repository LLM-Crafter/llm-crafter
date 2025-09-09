const Project = require('../models/Project');
const Organization = require('../models/Organization');

const createProject = async (req, res) => {
  try {
    // Check if user is member of organization
    const organization = await Organization.findOne({
      _id: req.params.orgId,
      'members.user': req.user._id,
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const project = new Project({
      name: req.body.name,
      description: req.body.description,
      organization: req.params.orgId,
      llm_configurations: req.body.llm_configurations || [],
    });

    await project.save();
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
};

const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({
      organization: req.params.orgId,
    });

    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.projectId,
      organization: req.params.orgId,
    }).populate([
      {
        path: 'apiKeys',
        select: '-key',
        populate: {
          path: 'provider',
          select: 'name models',
        },
      },
      {
        path: 'prompts',
        select: 'name description createdAt updatedAt',
      },
    ]);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProject,
};
