const Organization = require('../models/Organization');
const User = require('../models/User');


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

const inviteUserToOrg = async (req, res) => {
    try {
      const { email, role } = req.body;
  
      if (!['admin', 'member', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
  
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      // Check if user is already a member
      const organization = await Organization.findOne({
        _id: req.params.orgId,
        'members.user': user._id
      });
  
      if (organization) {
        return res.status(400).json({ error: 'User is already a member of this organization' });
      }
  
      // Add user to organization
      const updatedOrg = await Organization.findByIdAndUpdate(
        req.params.orgId,
        {
          $push: {
            members: {
              user: user._id,
              role: role
            }
          }
        },
        { new: true }
      ).populate('members.user', 'name email');
  
      res.json({
        message: 'User added successfully',
        member: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name
          },
          role: role
        }
      });
  
    } catch (error) {
      res.status(500).json({ error: 'Failed to add user to organization' });
    }
  };

  const updateMemberRole = async (req, res) => {
    try {
      const { role } = req.body;
  
      if (!['admin', 'member', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
  
      // Prevent self-demotion for last admin
      if (req.params.userId === req.user._id) {
        const org = await Organization.findById(req.params.orgId);
        const adminCount = org.members.filter(m => m.role === 'admin').length;
        if (adminCount === 1 && role !== 'admin') {
          return res.status(400).json({ error: 'Cannot remove the last admin' });
        }
      }
  
      const organization = await Organization.findOneAndUpdate(
        {
          _id: req.params.orgId,
          'members.user': req.params.userId
        },
        {
          $set: {
            'members.$.role': role
          }
        },
        { new: true }
      ).populate('members.user', 'name email');
  
      if (!organization) {
        return res.status(404).json({ error: 'Member not found in organization' });
      }
  
      const updatedMember = organization.members.find(
        m => m.user._id.toString() === req.params.userId
      );
  
      res.json({
        message: 'Member role updated successfully',
        member: {
          user: {
            id: updatedMember.user._id,
            email: updatedMember.user.email,
            name: updatedMember.user.name
          },
          role: updatedMember.role
        }
      });
  
    } catch (error) {
      res.status(500).json({ error: 'Failed to update member role' });
    }
  };
  

  const removeMember = async (req, res) => {
    try {
      // Prevent self-removal for last admin
      if (req.params.userId === req.user._id) {
        const org = await Organization.findById(req.params.orgId);
        const adminCount = org.members.filter(m => m.role === 'admin').length;
        if (adminCount === 1) {
          return res.status(400).json({ error: 'Cannot remove the last admin' });
        }
      }
  
      const organization = await Organization.findByIdAndUpdate(
        req.params.orgId,
        {
          $pull: {
            members: {
              user: req.params.userId
            }
          }
        },
        { new: true }
      );
  
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
  
      res.json({ message: 'Member removed successfully' });
  
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove member' });
    }
  };


module.exports = {
    getOrganization,
    getOrganizations,
    createOrganization,
    inviteUserToOrg,
    updateMemberRole,
    removeMember
};
  