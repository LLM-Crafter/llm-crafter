const Organization = require('../models/Organization');

const createOrganization = async (req, res) => {
  try {
    const organization = new Organization({
      name: req.body.name,
      description: req.body.description,
      owner: req.user._id,
      members: [{ user: req.user._id, role: 'admin' }]
    });

    await organization.save();
    res.status(201).json(organization);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
};

const getOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find({
      'members.user': req.user._id
    }).populate('owner', 'name email');
    
    res.json(organizations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
};

const getOrganization = async (req, res) => {
  try {
    const organization = await Organization.findOne({
      _id: req.params.orgId,
      'members.user': req.user._id
    }).populate('members.user', 'name email');

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(organization);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
};


module.exports = {
    getOrganization,
    getOrganizations,
    createOrganization,
};
  