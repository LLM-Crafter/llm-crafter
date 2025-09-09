const UserApiKey = require('../models/UserApiKey');
const Organization = require('../models/Organization');
const Project = require('../models/Project');

/**
 * Create a new API key for the user
 */
const createApiKey = async (req, res) => {
  try {
    const { name, scopes, restrictions, expires_at, allowed_projects } =
      req.body;

    // Verify organization membership
    const organization = await Organization.findById(req.params.orgId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const membership = organization.members.find(
      member => member.user.toString() === req.user._id.toString()
    );

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if user has reached API key limit
    const existingKeysCount = await UserApiKey.countDocuments({
      user: req.user._id,
      organization: req.params.orgId,
      is_active: true,
    });

    const maxApiKeys = process.env.MAX_API_KEYS_PER_USER || 10;
    if (existingKeysCount >= maxApiKeys) {
      return res.status(400).json({
        error: `Maximum number of API keys reached (${maxApiKeys})`,
        code: 'MAX_API_KEYS_EXCEEDED',
      });
    }

    // Validate scopes
    const validScopes = [
      'prompts:execute',
      'agents:read',
      'agents:execute',
      'agents:chat',
      'projects:read',
      'statistics:read',
    ];

    const invalidScopes = scopes.filter(scope => !validScopes.includes(scope));
    if (invalidScopes.length > 0) {
      return res.status(400).json({
        error: 'Invalid scopes provided',
        invalid_scopes: invalidScopes,
        valid_scopes: validScopes,
      });
    }

    // Validate allowed projects if provided
    if (allowed_projects && allowed_projects.length > 0) {
      const projects = await Project.find({
        _id: { $in: allowed_projects },
        organization: req.params.orgId,
      });

      if (projects.length !== allowed_projects.length) {
        return res.status(400).json({
          error: 'Some projects not found in this organization',
        });
      }
    }

    // Generate API key
    const apiKey = UserApiKey.generateApiKey();
    const keyHash = UserApiKey.hashApiKey(apiKey);

    // Parse expiration date if provided
    let expirationDate = null;
    if (expires_at) {
      expirationDate = new Date(expires_at);
      if (isNaN(expirationDate.getTime())) {
        return res.status(400).json({ error: 'Invalid expiration date' });
      }

      // Check if expiration is in the future
      if (expirationDate <= new Date()) {
        return res
          .status(400)
          .json({ error: 'Expiration date must be in the future' });
      }
    }

    // Create the API key record
    const userApiKey = new UserApiKey({
      name,
      key_hash: keyHash,
      user: req.user._id,
      organization: req.params.orgId,
      scopes: scopes || ['prompts:execute'],
      restrictions: restrictions || {},
      expires_at: expirationDate,
      created_by: req.user._id,
      allowed_projects: allowed_projects || [],
    });

    await userApiKey.save();

    // Return the API key (this is the only time it will be shown)
    res.status(201).json({
      success: true,
      data: {
        id: userApiKey._id,
        name: userApiKey.name,
        api_key: apiKey, // Only shown once!
        scopes: userApiKey.scopes,
        restrictions: userApiKey.restrictions,
        expires_at: userApiKey.expires_at,
        allowed_projects: userApiKey.allowed_projects,
        created_at: userApiKey.createdAt,
      },
      message:
        "API key created successfully. Save this key securely - it won't be shown again.",
    });
  } catch (error) {
    console.error('Create API key error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'API key name already exists' });
    }
    res.status(500).json({ error: 'Failed to create API key' });
  }
};

/**
 * Get all API keys for the user in the organization
 */
const getApiKeys = async (req, res) => {
  try {
    const apiKeys = await UserApiKey.find({
      user: req.user._id,
      organization: req.params.orgId,
    })
      .populate('allowed_projects', 'name')
      .select('-key_hash') // Never return the hash
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: apiKeys.map(key => ({
        ...key.toJSON(),
        // Add computed fields
        is_expired: key.isExpired(),
        masked_key: `ak_${'*'.repeat(32)}${key._id.slice(-8)}`,
      })),
    });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
};

/**
 * Get a specific API key
 */
const getApiKey = async (req, res) => {
  try {
    const apiKey = await UserApiKey.findOne({
      _id: req.params.keyId,
      user: req.user._id,
      organization: req.params.orgId,
    }).populate('allowed_projects', 'name');

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({
      success: true,
      data: {
        ...apiKey.toJSON(),
        is_expired: apiKey.isExpired(),
        masked_key: `ak_${'*'.repeat(32)}${apiKey._id.slice(-8)}`,
      },
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({ error: 'Failed to fetch API key' });
  }
};

/**
 * Update an API key (scopes, restrictions, expiration)
 */
const updateApiKey = async (req, res) => {
  try {
    const { name, scopes, restrictions, expires_at, allowed_projects } =
      req.body;

    const apiKey = await UserApiKey.findOne({
      _id: req.params.keyId,
      user: req.user._id,
      organization: req.params.orgId,
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Validate scopes if provided
    if (scopes) {
      const validScopes = [
        'prompts:execute',
        'agents:read',
        'agents:execute',
        'agents:chat',
        'projects:read',
        'statistics:read',
      ];

      const invalidScopes = scopes.filter(
        scope => !validScopes.includes(scope)
      );
      if (invalidScopes.length > 0) {
        return res.status(400).json({
          error: 'Invalid scopes provided',
          invalid_scopes: invalidScopes,
          valid_scopes: validScopes,
        });
      }
      apiKey.scopes = scopes;
    }

    // Validate allowed projects if provided
    if (allowed_projects) {
      if (allowed_projects.length > 0) {
        const projects = await Project.find({
          _id: { $in: allowed_projects },
          organization: req.params.orgId,
        });

        if (projects.length !== allowed_projects.length) {
          return res.status(400).json({
            error: 'Some projects not found in this organization',
          });
        }
      }
      apiKey.allowed_projects = allowed_projects;
    }

    // Update other fields
    if (name !== undefined) {
      apiKey.name = name;
    }
    if (restrictions !== undefined) {
      apiKey.restrictions = restrictions;
    }

    if (expires_at !== undefined) {
      if (expires_at === null) {
        apiKey.expires_at = null;
      } else {
        const expirationDate = new Date(expires_at);
        if (isNaN(expirationDate.getTime())) {
          return res.status(400).json({ error: 'Invalid expiration date' });
        }
        if (expirationDate <= new Date()) {
          return res
            .status(400)
            .json({ error: 'Expiration date must be in the future' });
        }
        apiKey.expires_at = expirationDate;
      }
    }

    await apiKey.save();

    res.json({
      success: true,
      data: {
        ...apiKey.toJSON(),
        is_expired: apiKey.isExpired(),
        masked_key: `ak_${'*'.repeat(32)}${apiKey._id.slice(-8)}`,
      },
      message: 'API key updated successfully',
    });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
};

/**
 * Rotate an API key (generate new key, invalidate old one)
 */
const rotateApiKey = async (req, res) => {
  try {
    const apiKey = await UserApiKey.findOne({
      _id: req.params.keyId,
      user: req.user._id,
      organization: req.params.orgId,
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Generate new API key
    const newApiKey = UserApiKey.generateApiKey();
    const newKeyHash = UserApiKey.hashApiKey(newApiKey);

    // Update the record
    apiKey.key_hash = newKeyHash;
    apiKey.last_rotated_at = new Date();
    // Reset usage stats
    apiKey.usage = {
      total_requests: 0,
      executions_today: 0,
      last_reset_date: new Date(),
    };

    await apiKey.save();

    res.json({
      success: true,
      data: {
        id: apiKey._id,
        name: apiKey.name,
        api_key: newApiKey, // Only shown once!
        rotated_at: apiKey.last_rotated_at,
      },
      message:
        "API key rotated successfully. Save the new key securely - it won't be shown again.",
    });
  } catch (error) {
    console.error('Rotate API key error:', error);
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
};

/**
 * Revoke (deactivate) an API key
 */
const revokeApiKey = async (req, res) => {
  try {
    const apiKey = await UserApiKey.findOne({
      _id: req.params.keyId,
      user: req.user._id,
      organization: req.params.orgId,
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    apiKey.is_active = false;
    await apiKey.save();

    res.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
};

/**
 * Get API key usage statistics
 */
const getApiKeyUsage = async (req, res) => {
  try {
    const apiKey = await UserApiKey.findOne({
      _id: req.params.keyId,
      user: req.user._id,
      organization: req.params.orgId,
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({
      success: true,
      data: {
        api_key_id: apiKey._id,
        name: apiKey.name,
        usage: apiKey.usage,
        restrictions: apiKey.restrictions,
        daily_limit_remaining: apiKey.restrictions.max_executions_per_day
          ? Math.max(
              0,
              apiKey.restrictions.max_executions_per_day -
                apiKey.usage.executions_today
            )
          : null,
        is_within_daily_limit: apiKey.isWithinDailyLimit(),
      },
    });
  } catch (error) {
    console.error('Get API key usage error:', error);
    res.status(500).json({ error: 'Failed to fetch API key usage' });
  }
};

module.exports = {
  createApiKey,
  getApiKeys,
  getApiKey,
  updateApiKey,
  rotateApiKey,
  revokeApiKey,
  getApiKeyUsage,
};
