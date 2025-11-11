const mongoose = require('mongoose');

const vectorDatabaseConfigSchema = new mongoose.Schema(
  {
    organization_id: {
      type: String,
      ref: 'Organization',
      required: true,
      index: true,
    },

    project_id: {
      type: String,
      ref: 'Project',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    provider: {
      type: String,
      required: true,
      enum: ['weaviate', 'pinecone', 'qdrant', 'memory'],
      default: 'memory',
    },

    config: {
      // Weaviate configuration
      weaviate: {
        endpoint: {
          type: String,
          required: function () {
            return this.provider === 'weaviate';
          },
        },
        apiKey: {
          type: String,
          required: function () {
            return (
              this.provider === 'weaviate' && this.config.weaviate?.requiresAuth
            );
          },
        },
        scheme: {
          type: String,
          enum: ['http', 'https'],
          default: 'https',
        },
        className: {
          type: String,
          default: 'LLMCrafterDocument',
        },
        headers: {
          type: Map,
          of: String,
          default: new Map(),
        },
        requiresAuth: {
          type: Boolean,
          default: false,
        },
      },

      // Pinecone configuration
      pinecone: {
        apiKey: {
          type: String,
          required: function () {
            return this.provider === 'pinecone';
          },
        },
        indexName: {
          type: String,
          required: function () {
            return this.provider === 'pinecone';
          },
        },
      },

      // Qdrant configuration (future)
      qdrant: {
        endpoint: String,
        apiKey: String,
        collectionName: String,
      },

      // Memory configuration (default)
      memory: {
        maxDocuments: {
          type: Number,
          default: 10000,
        },
      },
    },

    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    is_default: {
      type: Boolean,
      default: false,
    },

    created_by: {
      type: String,
      ref: 'User',
      required: true,
    },

    // Connection status and health
    connection_status: {
      status: {
        type: String,
        enum: ['connected', 'disconnected', 'error', 'testing'],
        default: 'disconnected',
      },
      last_tested: {
        type: Date,
      },
      last_error: {
        type: String,
      },
      response_time_ms: {
        type: Number,
      },
    },

    // Usage statistics
    usage_stats: {
      total_documents: {
        type: Number,
        default: 0,
      },
      total_searches: {
        type: Number,
        default: 0,
      },
      last_indexed: {
        type: Date,
      },
      last_searched: {
        type: Date,
      },
      storage_size_bytes: {
        type: Number,
        default: 0,
      },
    },

    // Performance metrics
    performance_metrics: {
      avg_index_time_ms: {
        type: Number,
        default: 0,
      },
      avg_search_time_ms: {
        type: Number,
        default: 0,
      },
      success_rate: {
        type: Number,
        default: 0,
        min: 0,
        max: 1,
      },
    },
  },
  {
    timestamps: true,
    collection: 'vector_database_configs',
  }
);

// Indexes
vectorDatabaseConfigSchema.index({ organization_id: 1, project_id: 1 });
vectorDatabaseConfigSchema.index({
  organization_id: 1,
  project_id: 1,
  is_default: 1,
});
vectorDatabaseConfigSchema.index({
  organization_id: 1,
  project_id: 1,
  is_active: 1,
});

// Ensure only one default config per project
vectorDatabaseConfigSchema.index(
  { organization_id: 1, project_id: 1, is_default: 1 },
  { unique: true, partialFilterExpression: { is_default: true } }
);

// Methods
vectorDatabaseConfigSchema.methods.testConnection = async function () {
  const { createVectorDatabase } = require('../services/vectorDatabaseService');

  this.connection_status.status = 'testing';
  this.connection_status.last_tested = new Date();

  const startTime = Date.now();

  try {
    // Create the config object properly for the vector database
    const vectorDbConfig = {
      provider: this.provider,
      ...this.config[this.provider],
    };

    const vectorDB = createVectorDatabase(vectorDbConfig);

    await vectorDB.connect();
    await vectorDB.disconnect();

    const responseTime = Date.now() - startTime;

    this.connection_status.status = 'connected';
    this.connection_status.response_time_ms = responseTime;
    this.connection_status.last_error = undefined;

    await this.save();

    return {
      success: true,
      response_time_ms: responseTime,
      message: 'Connection successful',
    };
  } catch (error) {
    console.error('Vector DB connection test failed:', error);
    const responseTime = Date.now() - startTime;

    this.connection_status.status = 'error';
    this.connection_status.response_time_ms = responseTime;
    this.connection_status.last_error = error.message;

    await this.save();

    return {
      success: false,
      response_time_ms: responseTime,
      error: error.message,
    };
  }
};

vectorDatabaseConfigSchema.methods.updateUsageStats = function (
  operation,
  metrics = {}
) {
  const now = new Date();

  switch (operation) {
    case 'index':
      this.usage_stats.total_documents += metrics.documents_count || 1;
      this.usage_stats.last_indexed = now;
      if (metrics.index_time_ms) {
        // Update average index time (simple moving average)
        const currentAvg = this.performance_metrics.avg_index_time_ms || 0;
        const totalOps = this.usage_stats.total_documents;
        this.performance_metrics.avg_index_time_ms =
          (currentAvg * (totalOps - 1) + metrics.index_time_ms) / totalOps;
      }
      break;

    case 'search':
      this.usage_stats.total_searches += 1;
      this.usage_stats.last_searched = now;
      if (metrics.search_time_ms) {
        // Update average search time
        const currentAvg = this.performance_metrics.avg_search_time_ms || 0;
        const totalSearches = this.usage_stats.total_searches;
        this.performance_metrics.avg_search_time_ms =
          (currentAvg * (totalSearches - 1) + metrics.search_time_ms) /
          totalSearches;
      }
      break;
  }

  // Update success rate if provided
  if (metrics.success !== undefined) {
    const totalOps =
      this.usage_stats.total_searches + this.usage_stats.total_documents;
    const currentRate = this.performance_metrics.success_rate || 0;
    const newRate = metrics.success ? 1 : 0;

    if (totalOps > 0) {
      this.performance_metrics.success_rate =
        (currentRate * (totalOps - 1) + newRate) / totalOps;
    }
  }
};

vectorDatabaseConfigSchema.methods.getConnectionConfig = function () {
  const config = {
    provider: this.provider,
    ...this.config[this.provider],
  };

  // Remove sensitive information for logging
  if (config.apiKey) {
    config.apiKey = config.apiKey.substring(0, 4) + '***';
  }

  return config;
};

// Static methods
vectorDatabaseConfigSchema.statics.findDefault = function (
  organizationId,
  projectId
) {
  return this.findOne({
    organization_id: organizationId,
    project_id: projectId,
    is_default: true,
    is_active: true,
  });
};

vectorDatabaseConfigSchema.statics.findByProject = function (
  organizationId,
  projectId,
  activeOnly = true
) {
  const query = {
    organization_id: organizationId,
    project_id: projectId,
  };

  if (activeOnly) {
    query.is_active = true;
  }

  return this.find(query).sort({ is_default: -1, name: 1 });
};

vectorDatabaseConfigSchema.statics.setDefault = async function (
  configId,
  organizationId,
  projectId
) {
  // First, unset any existing default
  await this.updateMany(
    {
      organization_id: organizationId,
      project_id: projectId,
      is_default: true,
    },
    { is_default: false }
  );

  // Set the new default
  return await this.findByIdAndUpdate(
    configId,
    { is_default: true },
    { new: true }
  );
};

// Pre-save middleware
vectorDatabaseConfigSchema.pre('save', function (next) {
  // Validate provider-specific configuration
  if (this.provider === 'weaviate') {
    if (!this.config.weaviate?.endpoint) {
      return next(new Error('Weaviate endpoint is required'));
    }
  } else if (this.provider === 'pinecone') {
    if (!this.config.pinecone?.apiKey || !this.config.pinecone?.indexName) {
      return next(new Error('Pinecone apiKey and indexName are required'));
    }
  }

  next();
});

module.exports = mongoose.model(
  'VectorDatabaseConfig',
  vectorDatabaseConfigSchema
);
