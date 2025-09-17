const mongoose = require('mongoose');

const indexingJobSchema = new mongoose.Schema({
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
  
  job_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  type: {
    type: String,
    enum: ['single', 'batch'],
    required: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  api_key_id: {
    type: String,
    ref: 'ApiKey',
    required: true
  },
  
  // Job data
  documents: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Progress tracking
  progress: {
    total_documents: { type: Number, default: 0 },
    processed_documents: { type: Number, default: 0 },
    successful_documents: { type: Number, default: 0 },
    failed_documents: { type: Number, default: 0 },
    indexed_chunks: { type: Number, default: 0 }
  },
  
  // Results
  results: {
    indexed_ids: [String],
    errors: [{
      document_index: Number,
      error: String,
      timestamp: { type: Date, default: Date.now }
    }]
  },
  
  // Timing information
  started_at: Date,
  completed_at: Date,
  processing_time_ms: Number,
  
  // Error information
  error: String,
  
  // Metadata
  metadata: {
    user_agent: String,
    ip_address: String,
    batch_size: Number
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
indexingJobSchema.index({ organization_id: 1, project_id: 1, status: 1 });
indexingJobSchema.index({ status: 1, createdAt: 1 });
indexingJobSchema.index({ job_id: 1 }, { unique: true });

// Methods
indexingJobSchema.methods.start = function() {
  this.status = 'processing';
  this.started_at = new Date();
  return this.save();
};

indexingJobSchema.methods.complete = function(results) {
  this.status = 'completed';
  this.completed_at = new Date();
  this.processing_time_ms = this.completed_at - this.started_at;
  this.results = results;
  return this.save();
};

indexingJobSchema.methods.fail = function(error) {
  this.status = 'failed';
  this.completed_at = new Date();
  this.processing_time_ms = this.completed_at - this.started_at;
  this.error = error.message || error;
  return this.save();
};

indexingJobSchema.methods.updateProgress = function(progress) {
  this.progress = { ...this.progress, ...progress };
  return this.save();
};

// Static methods for querying
indexingJobSchema.statics.findPendingJobs = function(limit = 10) {
  return this.find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(limit);
};

indexingJobSchema.statics.findJobsByOrganization = function(organizationId, projectId, limit = 50) {
  const filter = { organization_id: organizationId };
  if (projectId) {
    filter.project_id = projectId;
  }
  
  return this.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('job_id type status progress started_at completed_at processing_time_ms error createdAt');
};

indexingJobSchema.statics.getJobStats = function(organizationId, projectId) {
  const filter = { organization_id: organizationId };
  if (projectId) {
    filter.project_id = projectId;
  }
  
  return this.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        total_processing_time: { 
          $sum: { $ifNull: ['$processing_time_ms', 0] }
        },
        total_chunks_indexed: { 
          $sum: { $ifNull: ['$progress.indexed_chunks', 0] }
        }
      }
    }
  ]);
};

const IndexingJob = mongoose.model('IndexingJob', indexingJobSchema);

module.exports = IndexingJob;
