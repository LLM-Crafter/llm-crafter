const IndexingJob = require('../models/IndexingJob');
const ragService = require('./ragService');
const { v4: uuidv4 } = require('uuid');

class IndexingJobProcessor {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
    this.jobs = new Map(); // In-memory job tracking
    
    // Configuration
    this.config = {
      pollInterval: 5000, // Check for new jobs every 5 seconds
      maxConcurrentJobs: 3, // Process up to 3 jobs simultaneously
      maxConcurrentDocuments: 10, // Process up to 10 documents simultaneously within a job
      retryAttempts: 3,
      retryDelay: 30000 // 30 seconds
    };
    
    this.startProcessor();
  }
  
  /**
   * Start the background job processor
   */
  startProcessor() {
    if (this.processingInterval) {
      return;
    }
    
    console.log('🚀 Starting IndexingJobProcessor...');
    this.processingInterval = setInterval(() => {
      this.processJobs().catch(error => {
        console.error('❌ Error in job processor:', error);
      });
    }, this.config.pollInterval);
    
    // Process any pending jobs immediately
    this.processJobs().catch(error => {
      console.error('❌ Error in initial job processing:', error);
    });
  }
  
  /**
   * Stop the background job processor
   */
  stopProcessor() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('🛑 IndexingJobProcessor stopped');
    }
  }
  
  /**
   * Create and queue a new indexing job
   */
  async queueIndexingJob(documents, organizationId, projectId, apiKeyId, options = {}) {
    const jobId = uuidv4();
    const jobType = options.type || 'single';
    
    console.log(`📋 Queuing indexing job ${jobId} (${jobType})`);
    
    const job = new IndexingJob({
      job_id: jobId,
      organization_id: organizationId,
      project_id: projectId,
      type: jobType,
      api_key_id: apiKeyId,
      documents: documents,
      progress: {
        total_documents: Array.isArray(documents) ? documents.length : 1,
        processed_documents: 0,
        successful_documents: 0,
        failed_documents: 0,
        indexed_chunks: 0
      },
      metadata: {
        batch_size: Array.isArray(documents) ? documents.length : 1,
        user_agent: options.userAgent,
        ip_address: options.ipAddress
      }
    });
    
    await job.save();
    
    return {
      job_id: jobId,
      status: 'pending',
      estimated_time: this.estimateProcessingTime(documents),
      message: `Job queued for background processing. You can check the status using the job ID: ${jobId}`
    };
  }
  
  /**
   * Process pending jobs
   */
  async processJobs() {
    if (this.isProcessing) {
      return;
    }
    
    const activeJobs = this.jobs.size;
    if (activeJobs >= this.config.maxConcurrentJobs) {
      return;
    }
    
    const availableSlots = this.config.maxConcurrentJobs - activeJobs;
    const pendingJobs = await IndexingJob.findPendingJobs(availableSlots);
    
    if (pendingJobs.length === 0) {
      return;
    }
    
    console.log(`📋 Processing ${pendingJobs.length} pending indexing jobs...`);
    
    for (const job of pendingJobs) {
      this.processJob(job).catch(error => {
        console.error(`❌ Error processing job ${job.job_id}:`, error);
      });
    }
  }
  
  /**
   * Process a single indexing job
   */
  async processJob(job) {
    const jobId = job.job_id;
    
    // Mark job as being processed
    this.jobs.set(jobId, job);
    
    try {
      console.log(`🔄 Starting indexing job ${jobId}...`);
      await job.start();
      
      const results = {
        indexed_ids: [],
        errors: [],
        total_processed: 0,
        total_successful: 0,
        total_failed: 0,
        total_chunks: 0
      };
      
      // Process documents based on job type
      if (job.type === 'batch' && Array.isArray(job.documents)) {
        await this.processBatchDocuments(job, results);
      } else {
        await this.processSingleDocument(job, results);
      }
      
      // Complete the job
      await job.complete({
        indexed_ids: results.indexed_ids,
        errors: results.errors
      });
      
      await job.updateProgress({
        processed_documents: results.total_processed,
        successful_documents: results.total_successful,
        failed_documents: results.total_failed,
        indexed_chunks: results.total_chunks
      });
      
      console.log(`✅ Completed indexing job ${jobId}: ${results.total_chunks} chunks indexed`);
      
    } catch (error) {
      console.error(`❌ Failed indexing job ${jobId}:`, error);
      await job.fail(error);
    } finally {
      // Remove from active jobs
      this.jobs.delete(jobId);
    }
  }
  
  /**
   * Process batch documents with concurrency
   */
  async processBatchDocuments(job, results) {
    const documentBatches = job.documents;
    const batchSize = Math.min(this.config.maxConcurrentDocuments, documentBatches.length);
    
    console.log(`📦 Processing ${documentBatches.length} batches with concurrency: ${batchSize}`);
    
    // Process batches in chunks with concurrency
    for (let i = 0; i < documentBatches.length; i += batchSize) {
      const chunk = documentBatches.slice(i, i + batchSize);
      
      // Process chunk concurrently
      const chunkPromises = chunk.map(async (batch, chunkIndex) => {
        const globalIndex = i + chunkIndex;
        try {
          console.log(`📄 Processing batch ${globalIndex + 1}/${documentBatches.length}...`);
          
          const indexedIds = await ragService.indexJsonDocuments(
            batch.documents || batch,
            job.organization_id,
            job.project_id,
            job.api_key_id
          );
          
          console.log(`✅ Batch ${globalIndex + 1} completed: ${indexedIds.length} chunks`);
          
          return {
            success: true,
            index: globalIndex,
            indexedIds: indexedIds
          };
          
        } catch (error) {
          console.error(`❌ Error processing batch ${globalIndex + 1}:`, error);
          return {
            success: false,
            index: globalIndex,
            error: error.message
          };
        }
      });
      
      // Wait for chunk to complete
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      // Process results
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          const batchResult = result.value;
          
          if (batchResult.success) {
            results.indexed_ids.push(...batchResult.indexedIds);
            results.total_successful++;
            results.total_chunks += batchResult.indexedIds.length;
          } else {
            results.errors.push({
              document_index: batchResult.index,
              error: batchResult.error,
              timestamp: new Date()
            });
            results.total_failed++;
          }
        } else {
          // Promise was rejected
          results.errors.push({
            document_index: i,
            error: result.reason?.message || 'Unknown error',
            timestamp: new Date()
          });
          results.total_failed++;
        }
        
        results.total_processed++;
      }
      
      // Update progress after each chunk
      await job.updateProgress({
        processed_documents: results.total_processed,
        successful_documents: results.total_successful,
        failed_documents: results.total_failed,
        indexed_chunks: results.total_chunks
      });
      
      console.log(`📊 Progress: ${results.total_processed}/${documentBatches.length} batches, ${results.total_chunks} chunks indexed`);
    }
  }
  
  /**
   * Process single document or document array with concurrency
   */
  async processSingleDocument(job, results) {
    try {
      const documents = Array.isArray(job.documents) ? job.documents : [job.documents];
      console.log(`📄 Processing ${documents.length} documents with concurrency...`);
      
      // If we have multiple documents, process them with limited concurrency
      if (documents.length > 1) {
        const batchSize = Math.min(this.config.maxConcurrentDocuments, documents.length);
        const allIndexedIds = [];
        
        // Process documents in chunks
        for (let i = 0; i < documents.length; i += batchSize) {
          const chunk = documents.slice(i, i + batchSize);
          
          // Process chunk concurrently
          const chunkPromises = chunk.map(async (doc, chunkIndex) => {
            const globalIndex = i + chunkIndex;
            console.log(`📄 Processing document ${globalIndex + 1}/${documents.length}...`);
            
            const indexedIds = await ragService.indexJsonDocuments(
              [doc],
              job.organization_id,
              job.project_id,
              job.api_key_id
            );
            
            console.log(`✅ Document ${globalIndex + 1} completed: ${indexedIds.length} chunks`);
            return indexedIds;
          });
          
          const chunkResults = await Promise.allSettled(chunkPromises);
          
          // Collect successful results
          for (const result of chunkResults) {
            if (result.status === 'fulfilled') {
              allIndexedIds.push(...result.value);
            }
          }
          
          // Update progress after each chunk
          const processedSoFar = Math.min(i + batchSize, documents.length);
          await job.updateProgress({
            processed_documents: processedSoFar,
            successful_documents: processedSoFar,
            failed_documents: 0,
            indexed_chunks: allIndexedIds.length
          });
          
          console.log(`📊 Progress: ${processedSoFar}/${documents.length} documents, ${allIndexedIds.length} chunks indexed`);
        }
        
        results.indexed_ids = allIndexedIds;
        results.total_processed = 1;
        results.total_successful = 1;
        results.total_chunks = allIndexedIds.length;
        
      } else {
        // Single document processing
        const indexedIds = await ragService.indexJsonDocuments(
          documents,
          job.organization_id,
          job.project_id,
          job.api_key_id
        );
        
        results.indexed_ids = indexedIds;
        results.total_processed = 1;
        results.total_successful = 1;
        results.total_chunks = indexedIds.length;
        
        // Update progress for single document
        await job.updateProgress({
          processed_documents: 1,
          successful_documents: 1,
          failed_documents: 0,
          indexed_chunks: indexedIds.length
        });
      }
      
      console.log(`📄 Single document job completed: ${results.total_chunks} chunks`);
      
    } catch (error) {
      console.error('❌ Error processing single document:', error);
      results.errors.push({
        document_index: 0,
        error: error.message,
        timestamp: new Date()
      });
      results.total_processed = 1;
      results.total_failed = 1;
    }
  }
  
  /**
   * Get job status by ID
   */
  async getJobStatus(jobId) {
    const job = await IndexingJob.findOne({ job_id: jobId })
      .select('job_id type status progress started_at completed_at processing_time_ms error results createdAt');
    
    if (!job) {
      return null;
    }

    const response = {
      job_id: job.job_id,
      type: job.type,
      status: job.status,
      progress: {
        ...job.progress,
        // Calculate percentage completion
        completion_percentage: job.progress.total_documents > 0 
          ? Math.round((job.progress.processed_documents / job.progress.total_documents) * 100)
          : 0
      },
      created_at: job.createdAt,
      started_at: job.started_at,
      completed_at: job.completed_at,
      processing_time_ms: job.processing_time_ms,
      is_active: this.jobs.has(jobId) // Check if job is currently being processed
    };
    
    // Add estimated completion time for running jobs
    if (job.status === 'processing' && job.started_at) {
      const elapsedMs = Date.now() - new Date(job.started_at).getTime();
      const progressRatio = job.progress.processed_documents / job.progress.total_documents;
      
      if (progressRatio > 0) {
        const estimatedTotalMs = elapsedMs / progressRatio;
        const remainingMs = estimatedTotalMs - elapsedMs;
        response.estimated_completion_time = remainingMs > 0 ? Math.round(remainingMs / 1000) + ' seconds' : 'Soon';
      }
    }
    
    if (job.status === 'completed') {
      response.results = {
        indexed_count: job.results?.indexed_ids?.length || 0,
        indexed_ids: job.results?.indexed_ids || [],
        errors: job.results?.errors || []
      };
    }
    
    if (job.status === 'failed') {
      response.error = job.error;
    }
    
    return response;
  }
  
  /**
   * Get jobs for an organization/project
   */
  async getJobsForProject(organizationId, projectId, limit = 50) {
    return await IndexingJob.findJobsByOrganization(organizationId, projectId, limit);
  }
  
  /**
   * Get job statistics
   */
  async getJobStats(organizationId, projectId) {
    return await IndexingJob.getJobStats(organizationId, projectId);
  }
  
  /**
   * Estimate processing time based on document size
   */
  estimateProcessingTime(documents) {
    const docCount = Array.isArray(documents) ? documents.length : 1;
    const estimatedSecondsPerDoc = 2; // Rough estimate
    const estimatedSeconds = docCount * estimatedSecondsPerDoc;
    
    if (estimatedSeconds < 60) {
      return `~${estimatedSeconds} seconds`;
    } else if (estimatedSeconds < 3600) {
      return `~${Math.ceil(estimatedSeconds / 60)} minutes`;
    } else {
      return `~${Math.ceil(estimatedSeconds / 3600)} hours`;
    }
  }
  
  /**
   * Cancel a job (if still pending)
   */
  async cancelJob(jobId) {
    const job = await IndexingJob.findOne({ job_id: jobId, status: 'pending' });
    if (!job) {
      return false;
    }
    
    job.status = 'failed';
    job.error = 'Job cancelled by user';
    job.completed_at = new Date();
    await job.save();
    
    return true;
  }
}

// Create singleton instance
const indexingJobProcessor = new IndexingJobProcessor();

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down indexing job processor...');
  indexingJobProcessor.stopProcessor();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down indexing job processor...');
  indexingJobProcessor.stopProcessor();
  process.exit(0);
});

module.exports = indexingJobProcessor;
