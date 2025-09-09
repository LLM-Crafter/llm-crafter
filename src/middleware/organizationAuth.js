const Organization = require('../models/Organization');

const organizationAuth = {
  // Check if user is a member of the organization
  isMember: async (req, res, next) => {
    try {
      const organization = await Organization.findOne({
        _id: req.params.orgId,
        'members.user': req.user._id,
      });

      if (!organization) {
        return res
          .status(403)
          .json({ error: 'Access denied: Not a member of this organization' });
      }

      // Add member role to request for future use
      req.userRole = organization.members.find(
        m => m.user === req.user._id
      ).role;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Authorization check failed' });
    }
  },

  // Check if user is an admin of the organization
  isAdmin: async (req, res, next) => {
    try {
      const organization = await Organization.findOne({
        _id: req.params.orgId,
        'members.user': req.user._id,
        'members.role': 'admin',
      });

      if (!organization) {
        return res
          .status(403)
          .json({ error: 'Access denied: Admin rights required' });
      }

      req.userRole = 'admin';
      next();
    } catch (error) {
      res.status(500).json({ error: 'Authorization check failed' });
    }
  },

  // Check if user has at least member role
  hasRole: minimumRole => {
    const roleHierarchy = {
      admin: 3,
      member: 2,
      viewer: 1,
    };

    return async (req, res, next) => {
      try {
        const organization = await Organization.findOne({
          _id: req.params.orgId,
          'members.user': req.user._id,
        });

        if (!organization) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const userRole = organization.members.find(
          m => m.user === req.user._id
        ).role;

        if (roleHierarchy[userRole] >= roleHierarchy[minimumRole]) {
          req.userRole = userRole;
          next();
        } else {
          res
            .status(403)
            .json({ error: `Access denied: ${minimumRole} role required` });
        }
      } catch (error) {
        res.status(500).json({ error: 'Authorization check failed' });
      }
    };
  },
};

module.exports = organizationAuth;
