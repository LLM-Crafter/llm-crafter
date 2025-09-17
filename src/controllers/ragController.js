const ragService = require('../services/ragService');
const indexingJobProcessor = require('../services/indexingJobProcessor');
const { validationResult } = require('express-validator');

class RAGController {
  /**
   * Index JSON documents for RAG search
   * POST /api/v1/organizations/:organizationId/projects/:projectId/rag/index
   */
  async indexDocuments(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { orgId, projectId } = req.params;
      const { documents, api_key_id, process_in_background = true } = req.body;

      if (!documents || !Array.isArray(documents)) {
        return res.status(400).json({
          success: false,
          error: 'Documents array is required',
        });
      }

      if (!api_key_id) {
        return res.status(400).json({
          success: false,
          error: 'API key ID is required',
        });
      }

      // Check if background processing is requested (default: true)
      if (process_in_background) {
        console.log(`📋 Queuing ${documents.length} documents for background indexing...`);
        
        const jobInfo = await indexingJobProcessor.queueIndexingJob(
          documents,
          orgId,
          projectId,
          api_key_id,
          {
            type: 'single',
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip
          }
        );

        res.json({
          success: true,
          background_processing: true,
          job_id: jobInfo.job_id,
          estimated_time: jobInfo.estimated_time,
          message: `Documents queued for background indexing. Use job ID ${jobInfo.job_id} to check status.`,
          document_count: documents.length,
          status_endpoint: `/api/v1/organizations/${orgId}/projects/${projectId}/rag/jobs/${jobInfo.job_id}`
        });
      } else {
        // Process synchronously (for smaller documents or when immediate results are needed)
        console.log(`🔄 Processing ${documents.length} documents synchronously...`);
        
        const indexedIds = await ragService.indexJsonDocuments(
          documents,
          orgId,
          projectId,
          api_key_id
        );

        res.json({
          success: true,
          background_processing: false,
          indexed_count: indexedIds.length,
          indexed_ids: indexedIds,
          message: `Successfully indexed ${indexedIds.length} document chunks`,
        });
      }
    } catch (error) {
      console.error('RAG indexing error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Search indexed documents
   * POST /api/v1/organizations/:organizationId/projects/:projectId/rag/search
   */
  async searchDocuments(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { organizationId, projectId } = req.params;
      const {
        query,
        limit = 5,
        threshold = 0.7,
        search_type = 'semantic',
        brands = [],
        models = [],
        themes = [],
        sentiment = null,
        include_metadata = true,
        api_key_id,
      } = req.body;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query is required',
        });
      }

      if (!api_key_id) {
        return res.status(400).json({
          success: false,
          error: 'API key ID is required',
        });
      }

      let results;

      switch (search_type) {
        case 'hybrid':
          results = await ragService.hybridSearch(
            query,
            organizationId,
            projectId,
            api_key_id,
            {
              limit,
              brands,
              models,
              themes,
              sentiment,
            }
          );
          break;

        case 'keyword':
          const keywordResults = ragService.keywordSearch(
            query,
            organizationId,
            projectId,
            { brands, models, themes, sentiment }
          );

          results = {
            query,
            results: keywordResults.slice(0, limit).map(result => ({
              id: result.id,
              content: result.content,
              similarity: result.similarity,
              metadata: include_metadata ? result.metadata : undefined,
            })),
            total_results: keywordResults.length,
            search_method: 'keyword',
          };
          break;

        default: // semantic
          results = await ragService.searchSimilar(
            query,
            organizationId,
            projectId,
            api_key_id,
            {
              limit,
              threshold,
              filters: { brands, models, themes, sentiment },
              includeMetadata: include_metadata,
            }
          );
          break;
      }

      res.json({
        success: true,
        ...results,
      });
    } catch (error) {
      console.error('RAG search error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get knowledge base statistics
   * GET /api/v1/organizations/:organizationId/projects/:projectId/rag/stats
   */
  async getStats(req, res) {
    try {
      const { orgId, projectId } = req.params;

      const stats = ragService.getStats(orgId, projectId);

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('RAG stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Clear knowledge base
   * DELETE /api/v1/organizations/:organizationId/projects/:projectId/rag
   */
  async clearKnowledgeBase(req, res) {
    try {
      const { orgId, projectId } = req.params;

      const result = ragService.clearIndex(orgId, projectId);

      res.json({
        success: true,
        message: `Cleared ${result.deleted_count} documents from knowledge base`,
        deleted_count: result.deleted_count,
      });
    } catch (error) {
      console.error('RAG clear error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Batch index multiple JSON files
   * POST /api/v1/organizations/:organizationId/projects/:projectId/rag/batch-index
   */
  async batchIndexDocuments(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { orgId, projectId } = req.params;
      const { document_batches, api_key_id, process_in_background = true } = req.body;

      if (!document_batches || !Array.isArray(document_batches)) {
        return res.status(400).json({
          success: false,
          error: 'Document batches array is required',
        });
      }

      // Check if background processing is requested (default: true for batch operations)
      if (process_in_background) {
        console.log(`📋 Queuing ${document_batches.length} document batches for background indexing...`);
        
        const jobInfo = await indexingJobProcessor.queueIndexingJob(
          document_batches,
          orgId,
          projectId,
          api_key_id,
          {
            type: 'batch',
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip
          }
        );

        res.json({
          success: true,
          background_processing: true,
          job_id: jobInfo.job_id,
          estimated_time: jobInfo.estimated_time,
          message: `Document batches queued for background indexing. Use job ID ${jobInfo.job_id} to check status.`,
          batch_count: document_batches.length,
          status_endpoint: `/api/v1/organizations/${orgId}/projects/${projectId}/rag/jobs/${jobInfo.job_id}`
        });
      } else {
        // Process synchronously (legacy behavior)
        console.log(`🔄 Processing ${document_batches.length} document batches synchronously...`);
        
        const results = {
          total_batches: document_batches.length,
          successful_batches: 0,
          failed_batches: 0,
          total_indexed: 0,
          errors: [],
        };

        for (let i = 0; i < document_batches.length; i++) {
          try {
            const batch = document_batches[i];
            const indexedIds = await ragService.indexJsonDocuments(
              batch.documents,
              orgId,
              projectId,
              api_key_id
            );

            results.successful_batches++;
            results.total_indexed += indexedIds.length;
          } catch (error) {
            results.failed_batches++;
            results.errors.push({
              batch_index: i,
              error: error.message,
            });
          }
        }

        res.json({
          success: results.failed_batches === 0,
          background_processing: false,
          results,
          message: `Processed ${results.total_batches} batches, indexed ${results.total_indexed} document chunks`,
        });
      }
    } catch (error) {
      console.error('RAG batch indexing error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get indexing job status
   * GET /api/v1/organizations/:organizationId/projects/:projectId/rag/jobs/:jobId
   */
  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;

      const jobStatus = await indexingJobProcessor.getJobStatus(jobId);

      if (!jobStatus) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      res.json({
        success: true,
        job: jobStatus,
      });
    } catch (error) {
      console.error('RAG job status error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get indexing jobs for a project
   * GET /api/v1/organizations/:organizationId/projects/:projectId/rag/jobs
   */
  async getJobs(req, res) {
    try {
      const { orgId, projectId } = req.params;
      const { limit = 50 } = req.query;

      const jobs = await indexingJobProcessor.getJobsForProject(
        orgId, 
        projectId, 
        parseInt(limit)
      );

      res.json({
        success: true,
        jobs,
        total: jobs.length,
      });
    } catch (error) {
      console.error('RAG jobs fetch error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get indexing job statistics
   * GET /api/v1/organizations/:organizationId/projects/:projectId/rag/jobs/stats
   */
  async getJobStats(req, res) {
    try {
      const { orgId, projectId } = req.params;

      const stats = await indexingJobProcessor.getJobStats(orgId, projectId);

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('RAG job stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Cancel a pending indexing job
   * DELETE /api/v1/organizations/:organizationId/projects/:projectId/rag/jobs/:jobId
   */
  async cancelJob(req, res) {
    try {
      const { jobId } = req.params;

      const cancelled = await indexingJobProcessor.cancelJob(jobId);

      if (!cancelled) {
        return res.status(404).json({
          success: false,
          error: 'Job not found or cannot be cancelled',
        });
      }

      res.json({
        success: true,
        message: 'Job cancelled successfully',
      });
    } catch (error) {
      console.error('RAG job cancellation error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

const ragController = new RAGController();

// Bind methods to maintain 'this' context
ragController.indexDocuments = ragController.indexDocuments.bind(ragController);
ragController.searchDocuments =
  ragController.searchDocuments.bind(ragController);
ragController.batchIndexDocuments =
  ragController.batchIndexDocuments.bind(ragController);
ragController.getJobStatus = ragController.getJobStatus.bind(ragController);
ragController.getJobs = ragController.getJobs.bind(ragController);
ragController.getJobStats = ragController.getJobStats.bind(ragController);
ragController.cancelJob = ragController.cancelJob.bind(ragController);

module.exports = ragController;
