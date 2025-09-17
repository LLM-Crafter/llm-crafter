const VectorDatabaseConfig = require('../models/VectorDatabaseConfig');
const { validationResult } = require('express-validator');
const { createVectorDatabase } = require('../services/vectorDatabaseService');

class VectorDatabaseController {
  /**
   * Get all vector database configurations for a project
   * GET /api/v1/organizations/:organizationId/projects/:projectId/vector-databases
   */
  async getConfigurations(req, res) {
    try {
      const { orgId, projectId } = req.params;

      // Use direct find to avoid schema casting issues
      const configs = await VectorDatabaseConfig.find({
        organization_id: orgId,
        project_id: projectId,
        is_active: true
      }).sort({ is_default: -1, name: 1 }).populate('created_by', 'name email');

      // Remove sensitive data from response
      const sanitizedConfigs = configs.map(config => {
        const configObj = config.toObject();

        // Hide API keys in response
        if (configObj.config.weaviate?.apiKey) {
          configObj.config.weaviate.apiKey = '***';
        }
        if (configObj.config.pinecone?.apiKey) {
          configObj.config.pinecone.apiKey = '***';
        }

        return configObj;
      });

      res.json({
        success: true,
        configurations: sanitizedConfigs,
      });
    } catch (error) {
      console.error('Error getting vector database configurations:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Create a new vector database configuration
   * POST /api/v1/organizations/:organizationId/projects/:projectId/vector-databases
   */
  async createConfiguration(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { orgId, projectId } = req.params;
      const { name, description, provider, config, is_default } = req.body;

      // Create new configuration
      const vectorConfig = new VectorDatabaseConfig({
        organization_id: orgId,
        project_id: projectId,
        name,
        description,
        provider,
        config: {
          [provider]: config,
        },
        is_default: is_default || false,
        created_by: req.user.id,
      });

      // If this is set as default, unset other defaults
      if (is_default) {
        await VectorDatabaseConfig.updateMany(
          {
            organization_id: orgId,
            project_id: projectId,
            is_default: true,
          },
          { is_default: false }
        );
      }

      await vectorConfig.save();

      // Test the connection
      const testResult = await vectorConfig.testConnection();

      res.status(201).json({
        success: true,
        configuration: {
          ...vectorConfig.toObject(),
          config: vectorConfig.getConnectionConfig(), // Sanitized config
        },
        connection_test: testResult,
      });
    } catch (error) {
      console.error('Error creating vector database configuration:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update vector database configuration
   * PUT /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId
   */
  async updateConfiguration(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { orgId, projectId, configId } = req.params;
      const { name, description, provider, config, is_active, is_default } =
        req.body;

      const vectorConfig = await VectorDatabaseConfig.findOne({
        _id: configId,
        organization_id: orgId,
        project_id: projectId,
      });

      if (!vectorConfig) {
        return res.status(404).json({
          success: false,
          error: 'Vector database configuration not found',
        });
      }

      // Update fields
      if (name !== undefined) vectorConfig.name = name;
      if (description !== undefined) vectorConfig.description = description;
      if (provider !== undefined) vectorConfig.provider = provider;
      if (config !== undefined) {
        vectorConfig.config = {
          [provider || vectorConfig.provider]: config,
        };
      }
      if (is_active !== undefined) vectorConfig.is_active = is_active;

      // Handle default setting
      if (is_default && !vectorConfig.is_default) {
        await VectorDatabaseConfig.updateMany(
          {
            organization_id: orgId,
            project_id: projectId,
            is_default: true,
          },
          { is_default: false }
        );
        vectorConfig.is_default = true;
      } else if (is_default === false) {
        vectorConfig.is_default = false;
      }

      await vectorConfig.save();

      // Test connection if config changed
      let testResult = null;
      if (config !== undefined) {
        testResult = await vectorConfig.testConnection();
      }

      res.json({
        success: true,
        configuration: {
          ...vectorConfig.toObject(),
          config: vectorConfig.getConnectionConfig(),
        },
        connection_test: testResult,
      });
    } catch (error) {
      console.error('Error updating vector database configuration:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Delete vector database configuration
   * DELETE /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId
   */
  async deleteConfiguration(req, res) {
    try {
      const { orgId, projectId, configId } = req.params;

      const vectorConfig = await VectorDatabaseConfig.findOne({
        _id: configId,
        organization_id: orgId,
        project_id: projectId,
      });

      if (!vectorConfig) {
        return res.status(404).json({
          success: false,
          error: 'Vector database configuration not found',
        });
      }

      // Don't allow deletion of the default configuration if it's the only one
      if (vectorConfig.is_default) {
        const otherConfigs = await VectorDatabaseConfig.countDocuments({
          organization_id: orgId,
          project_id: projectId,
          _id: { $ne: configId },
          is_active: true,
        });

        if (otherConfigs === 0) {
          return res.status(400).json({
            success: false,
            error:
              'Cannot delete the only active vector database configuration',
          });
        }
      }

      await VectorDatabaseConfig.findByIdAndDelete(configId);

      res.json({
        success: true,
        message: 'Vector database configuration deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting vector database configuration:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Test vector database connection
   * POST /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId/test
   */
  async testConnection(req, res) {
    try {
      const { orgId, projectId, configId } = req.params;

      const vectorConfig = await VectorDatabaseConfig.findOne({
        _id: configId,
        organization_id: orgId,
        project_id: projectId,
      });

      if (!vectorConfig) {
        return res.status(404).json({
          success: false,
          error: 'Vector database configuration not found',
        });
      }

      const testResult = await vectorConfig.testConnection();

      res.json({
        success: true,
        test_result: testResult,
      });
    } catch (error) {
      console.error('Error testing vector database connection:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Set configuration as default
   * PUT /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId/default
   */
  async setDefault(req, res) {
    try {
      const { orgId, projectId, configId } = req.params;

      const vectorConfig = await VectorDatabaseConfig.setDefault(
        configId,
        orgId,
        projectId
      );

      if (!vectorConfig) {
        return res.status(404).json({
          success: false,
          error: 'Vector database configuration not found',
        });
      }

      res.json({
        success: true,
        message: 'Default vector database configuration updated',
        configuration: {
          ...vectorConfig.toObject(),
          config: vectorConfig.getConnectionConfig(),
        },
      });
    } catch (error) {
      console.error('Error setting default vector database:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get vector database statistics
   * GET /api/v1/organizations/:organizationId/projects/:projectId/vector-databases/:configId/stats
   */
  async getStats(req, res) {
    try {
      const { orgId, projectId, configId } = req.params;

      const vectorConfig = await VectorDatabaseConfig.findOne({
        _id: configId,
        organization_id: orgId,
        project_id: projectId,
      });

      if (!vectorConfig) {
        return res.status(404).json({
          success: false,
          error: 'Vector database configuration not found',
        });
      }

      // Get stats from vector database
      let vectorStats = {};
      try {
        const ragService = require('../services/ragService');
        vectorStats = await ragService.getStats(orgId, projectId);
      } catch (error) {
        console.error('Error getting vector database stats:', error);
        vectorStats = {
          error: 'Failed to retrieve vector database statistics',
        };
      }

      res.json({
        success: true,
        configuration_stats: {
          usage_stats: vectorConfig.usage_stats,
          performance_metrics: vectorConfig.performance_metrics,
          connection_status: vectorConfig.connection_status,
        },
        vector_database_stats: vectorStats,
      });
    } catch (error) {
      console.error('Error getting vector database stats:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get supported vector database providers
   * GET /api/v1/vector-databases/providers
   */
  async getProviders(req, res) {
    try {
      const providers = [
        {
          id: 'memory',
          name: 'In-Memory Storage',
          description: 'Simple in-memory vector storage (development only)',
          config_schema: {
            maxDocuments: {
              type: 'number',
              description: 'Maximum number of documents to store',
              default: 10000,
            },
          },
          features: ['development', 'testing'],
          limitations: ['not persistent', 'memory limited', 'single instance'],
        },
        {
          id: 'weaviate',
          name: 'Weaviate',
          description: 'Open-source vector database with GraphQL API',
          config_schema: {
            endpoint: {
              type: 'string',
              required: true,
              description:
                'Weaviate endpoint URL (e.g., https://my-cluster.weaviate.network)',
            },
            apiKey: {
              type: 'string',
              required: false,
              description: 'API key for authentication (if required)',
            },
            scheme: {
              type: 'string',
              enum: ['http', 'https'],
              default: 'https',
              description: 'Protocol scheme',
            },
            className: {
              type: 'string',
              default: 'LLMCrafterDocument',
              description: 'Weaviate class name for documents',
            },
          },
          features: [
            'production',
            'scalable',
            'graphql',
            'filtering',
            'hybrid_search',
          ],
          limitations: [],
        },
        {
          id: 'pinecone',
          name: 'Pinecone',
          description: 'Managed vector database service',
          config_schema: {
            apiKey: {
              type: 'string',
              required: true,
              description: 'Pinecone API key',
            },
            environment: {
              type: 'string',
              required: true,
              description: 'Pinecone environment (e.g., us-east1-gcp)',
            },
            indexName: {
              type: 'string',
              required: true,
              description: 'Name of the Pinecone index',
            },
          },
          features: ['production', 'managed', 'scalable', 'filtering'],
          limitations: ['no aggregation', 'cost based on usage'],
        },
      ];

      res.json({
        success: true,
        providers,
      });
    } catch (error) {
      console.error('Error getting vector database providers:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new VectorDatabaseController();
