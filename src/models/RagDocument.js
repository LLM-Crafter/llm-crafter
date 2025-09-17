const mongoose = require('mongoose');

const ragDocumentSchema = new mongoose.Schema({
  organization_id: {
    type: String,
    ref: 'Organization',
    required: true,
    index: true
  },
  
  project_id: {
    type: String,
    ref: 'Project',
    required: true,
    index: true
  },
  
  document_id: {
    type: String,
    required: true,
    unique: true
  },
  
  title: {
    type: String,
    required: true
  },
  
  url: {
    type: String,
    required: false
  },
  
  content_type: {
    type: String,
    enum: ['main_content', 'pros_cons', 'technical_specs', 'summary'],
    required: true
  },
  
  content: {
    type: String,
    required: true
  },
  
  metadata: {
    brand: String,
    model: String,
    year: String,
    author: String,
    date_published: String,
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral']
    },
    themes: [String],
    rating: String,
    pros: [String],
    cons: [String],
    technical_specs: {
      engine: String,
      power: String,
      fuel_consumption: String,
      price: String,
      transmission: String
    },
    price_info: String
  },
  
  embedding_vector: {
    type: [Number],
    required: true
  },
  
  vector_model: {
    type: String,
    default: 'text-embedding-ada-002'
  },
  
  indexed_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  indexed_by: {
    type: String,
    ref: 'User',
    required: true
  },
  
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },
  
  usage_stats: {
    search_count: {
      type: Number,
      default: 0
    },
    last_searched: {
      type: Date
    },
    relevance_scores: [{
      query: String,
      score: Number,
      timestamp: Date
    }]
  }
}, {
  timestamps: true,
  collection: 'rag_documents'
});

// Compound indexes for efficient queries
ragDocumentSchema.index({ organization_id: 1, project_id: 1 });
ragDocumentSchema.index({ organization_id: 1, project_id: 1, content_type: 1 });
ragDocumentSchema.index({ organization_id: 1, project_id: 1, 'metadata.brand': 1 });
ragDocumentSchema.index({ organization_id: 1, project_id: 1, 'metadata.themes': 1 });
ragDocumentSchema.index({ organization_id: 1, project_id: 1, is_active: 1 });

// Text index for keyword search
ragDocumentSchema.index({
  title: 'text',
  content: 'text',
  'metadata.brand': 'text',
  'metadata.model': 'text'
});

// Methods
ragDocumentSchema.methods.recordSearch = function(query, relevanceScore) {
  this.usage_stats.search_count += 1;
  this.usage_stats.last_searched = new Date();
  
  // Keep only last 10 relevance scores to avoid unbounded growth
  this.usage_stats.relevance_scores.push({
    query,
    score: relevanceScore,
    timestamp: new Date()
  });
  
  if (this.usage_stats.relevance_scores.length > 10) {
    this.usage_stats.relevance_scores = this.usage_stats.relevance_scores.slice(-10);
  }
  
  return this.save();
};

// Static methods
ragDocumentSchema.statics.findByOrganizationAndProject = function(organizationId, projectId, filters = {}) {
  const query = {
    organization_id: organizationId,
    project_id: projectId,
    is_active: true,
    ...filters
  };
  
  return this.find(query);
};

ragDocumentSchema.statics.searchByKeywords = function(organizationId, projectId, keywords, options = {}) {
  const { limit = 10, skip = 0 } = options;
  
  return this.find({
    organization_id: organizationId,
    project_id: projectId,
    is_active: true,
    $text: { $search: keywords }
  }, {
    score: { $meta: 'textScore' }
  })
  .sort({ score: { $meta: 'textScore' } })
  .limit(limit)
  .skip(skip);
};

ragDocumentSchema.statics.getStats = function(organizationId, projectId) {
  return this.aggregate([
    {
      $match: {
        organization_id: organizationId,
        project_id: projectId,
        is_active: true
      }
    },
    {
      $group: {
        _id: null,
        total_documents: { $sum: 1 },
        content_types: { $addToSet: '$content_type' },
        brands: { $addToSet: '$metadata.brand' },
        models: { $addToSet: '$metadata.model' },
        themes: { $addToSet: '$metadata.themes' },
        total_searches: { $sum: '$usage_stats.search_count' },
        oldest_indexed: { $min: '$indexed_at' },
        newest_indexed: { $max: '$indexed_at' }
      }
    },
    {
      $project: {
        _id: 0,
        total_documents: 1,
        content_types: 1,
        brands: { $filter: { input: '$brands', as: 'brand', cond: { $ne: ['$$brand', null] } } },
        models: { $filter: { input: '$models', as: 'model', cond: { $ne: ['$$model', null] } } },
        themes: {
          $reduce: {
            input: '$themes',
            initialValue: [],
            in: { $setUnion: ['$$value', '$$this'] }
          }
        },
        total_searches: 1,
        indexed_range: {
          oldest: '$oldest_indexed',
          newest: '$newest_indexed'
        }
      }
    }
  ]).then(results => results[0] || {
    total_documents: 0,
    content_types: [],
    brands: [],
    models: [],
    themes: [],
    total_searches: 0,
    indexed_range: { oldest: null, newest: null }
  });
};

module.exports = mongoose.model('RagDocument', ragDocumentSchema);
