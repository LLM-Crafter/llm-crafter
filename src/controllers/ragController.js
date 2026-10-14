const ragService = require('../services/ragService');
const ragDocumentService = require('../services/ragDocumentService');
const indexingJobProcessor = require('../services/indexingJobProcessor');
const KnowledgeBase = require('../models/KnowledgeBase');
const { validationResult } = require('express-validator');

// Returns null for the project-wide KB, or a verified KB id scoped to the route's org/project.
async function resolveKnowledgeBaseId(req) {
  const raw = req.body?.knowledge_base_id ?? req.query?.knowledge_base_id;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const kbId = String(raw);
  const exists = await KnowledgeBase.exists({
    _id: kbId,
    organization_id: req.params.orgId,
    project_id: req.params.projectId,
  });
  if (!exists) {
    const error = new Error('Knowledge base not found');
    error.status = 404;
    throw error;
  }
  return kbId;
}

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

      const knowledgeBaseId = await resolveKnowledgeBaseId(req);
      const embeddingApiKeyId = await ragService.resolveEmbeddingApiKeyId(
        api_key_id,
        knowledgeBaseId
      );

      if (!embeddingApiKeyId) {
        return res.status(400).json({
          success: false,
          error: 'API key ID is required',
        });
      }

      // Chunks that name their document (metadata.document_id) are indexed as
      // registry-tracked documents, so DELETE /rag/documents/:id removes them
      const clientDocuments = ragDocumentService.groupPreChunkedItems(documents);
      if (clientDocuments) {
        const { jobInfo, outcomes } = await this.indexClientDocuments(
          req,
          clientDocuments,
          {
            apiKeyId: embeddingApiKeyId,
            knowledgeBaseId,
            background: process_in_background,
            // Callers of this endpoint always expect a job to poll
            skipUnchanged: false,
          }
        );
        const documentIds = clientDocuments.map(d => d.document_id);

        if (jobInfo) {
          return res.json({
            success: true,
            background_processing: true,
            job_id: jobInfo.job_id,
            knowledge_base_id: knowledgeBaseId,
            estimated_time: jobInfo.estimated_time,
            message: `Documents queued for background indexing. Use job ID ${jobInfo.job_id} to check status.`,
            document_count: documents.length,
            document_ids: documentIds,
            status_endpoint: `/api/v1/organizations/${orgId}/projects/${projectId}/rag/jobs/${jobInfo.job_id}`,
          });
        }

        const indexedIds = outcomes.flatMap(o => o.vector_ids);
        return res.json({
          success: true,
          background_processing: false,
          knowledge_base_id: knowledgeBaseId,
          indexed_count: indexedIds.length,
          indexed_ids: indexedIds,
          document_ids: documentIds,
          message: `Successfully indexed ${indexedIds.length} document chunks`,
        });
      }

      // Check if background processing is requested (default: true)
      if (process_in_background) {
        console.log(`📋 Queuing ${documents.length} documents for background indexing...`);
        
        const jobInfo = await indexingJobProcessor.queueIndexingJob(
          documents,
          orgId,
          projectId,
          embeddingApiKeyId,
          {
            type: 'single',
            knowledgeBaseId,
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip
          }
        );

        res.json({
          success: true,
          background_processing: true,
          job_id: jobInfo.job_id,
          knowledge_base_id: knowledgeBaseId,
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
          embeddingApiKeyId,
          knowledgeBaseId
        );

        res.json({
          success: true,
          background_processing: false,
          knowledge_base_id: knowledgeBaseId,
          indexed_count: indexedIds.length,
          indexed_ids: indexedIds,
          message: `Successfully indexed ${indexedIds.length} document chunks`,
        });
      }
    } catch (error) {
      console.error('RAG indexing error:', error);
      res.status(error.status || 500).json({
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

      const { orgId: organizationId, projectId } = req.params;
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

      const knowledgeBaseId = await resolveKnowledgeBaseId(req);
      const embeddingApiKeyId = await ragService.resolveEmbeddingApiKeyId(
        api_key_id,
        knowledgeBaseId
      );

      if (!embeddingApiKeyId) {
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
            embeddingApiKeyId,
            {
              limit,
              brands,
              models,
              themes,
              sentiment,
              knowledgeBaseId,
            }
          );
          break;

        case 'keyword': {
          const keywordResults = await ragService.keywordSearch(
            query,
            organizationId,
            projectId,
            { brands, models, themes, sentiment, knowledgeBaseId }
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
        }

        default: // semantic
          results = await ragService.searchSimilar(
            query,
            organizationId,
            projectId,
            embeddingApiKeyId,
            {
              limit,
              threshold,
              filters: { brands, models, themes, sentiment },
              includeMetadata: include_metadata,
              knowledgeBaseId,
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
      res.status(error.status || 500).json({
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
      const knowledgeBaseId = await resolveKnowledgeBaseId(req);

      const stats = await ragService.getStats(orgId, projectId, knowledgeBaseId);

      res.json({
        success: true,
        knowledge_base_id: knowledgeBaseId,
        stats,
      });
    } catch (error) {
      console.error('RAG stats error:', error);
      res.status(error.status || 500).json({
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
      const knowledgeBaseId = await resolveKnowledgeBaseId(req);

      const result = await ragService.clearIndex(orgId, projectId, knowledgeBaseId);

      res.json({
        success: true,
        knowledge_base_id: knowledgeBaseId,
        message: `Cleared ${result.deleted_count} documents from knowledge base`,
        deleted_count: result.deleted_count,
      });
    } catch (error) {
      console.error('RAG clear error:', error);
      res.status(error.status || 500).json({
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

      const knowledgeBaseId = await resolveKnowledgeBaseId(req);
      const embeddingApiKeyId = await ragService.resolveEmbeddingApiKeyId(
        api_key_id,
        knowledgeBaseId
      );

      if (!embeddingApiKeyId) {
        return res.status(400).json({
          success: false,
          error: 'API key ID is required',
        });
      }

      // Check if background processing is requested (default: true for batch operations)
      if (process_in_background) {
        console.log(`📋 Queuing ${document_batches.length} document batches for background indexing...`);
        
        const jobInfo = await indexingJobProcessor.queueIndexingJob(
          document_batches,
          orgId,
          projectId,
          embeddingApiKeyId,
          {
            type: 'batch',
            knowledgeBaseId,
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip
          }
        );

        res.json({
          success: true,
          background_processing: true,
          job_id: jobInfo.job_id,
          knowledge_base_id: knowledgeBaseId,
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
              embeddingApiKeyId,
              knowledgeBaseId
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
      res.status(error.status || 500).json({
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

  /**
   * Register new revisions of client-owned documents and index them, either
   * through a queued job or inline. Returns { jobInfo, registered, outcomes }.
   */
  async indexClientDocuments(
    req,
    documents,
    { apiKeyId, knowledgeBaseId, background, skipUnchanged }
  ) {
    const { orgId, projectId } = req.params;
    const scope = { organizationId: orgId, projectId, knowledgeBaseId };

    const registered = [];
    for (const document of documents) {
      const { row, unchanged } = await ragDocumentService.registerRevision(
        scope,
        document,
        { skipUnchanged }
      );
      registered.push({
        document,
        revision: row.revision,
        chunk_count: row.chunk_count,
        unchanged,
      });
    }

    const toIndex = registered.filter(r => !r.unchanged);
    const revisions = toIndex.map(r => ({
      document_id: r.document.document_id,
      revision: r.revision,
    }));

    if (background) {
      let jobInfo = null;
      if (toIndex.length > 0) {
        try {
          jobInfo = await indexingJobProcessor.queueIndexingJob(
            toIndex.map(r => ({ ...r.document, revision: r.revision })),
            orgId,
            projectId,
            apiKeyId,
            {
              type: 'document',
              knowledgeBaseId,
              userAgent: req.get('User-Agent'),
              ipAddress: req.ip,
            }
          );
        } catch (error) {
          await ragDocumentService.failRevisions(scope, revisions, error.message);
          throw error;
        }
        await ragDocumentService.attachJob(scope, revisions, jobInfo.job_id);
      }
      return { jobInfo, registered, outcomes: [] };
    }

    const outcomes = [];
    for (const r of toIndex) {
      outcomes.push(
        await ragDocumentService.indexRevision({
          organizationId: orgId,
          projectId,
          knowledgeBaseId,
          apiKeyId,
          document: r.document,
          revision: r.revision,
        })
      );
    }
    return { jobInfo: null, registered, outcomes };
  }

  /**
   * Index or replace a client-owned document from pre-chunked content
   * PUT /api/v1/organizations/:organizationId/projects/:projectId/rag/documents/:documentId
   */
  async upsertDocument(req, res) {
    try {
      const { orgId, projectId, documentId } = req.params;
      const {
        chunks,
        metadata,
        api_key_id,
        process_in_background = true,
      } = req.body;

      const knowledgeBaseId = await resolveKnowledgeBaseId(req);
      const embeddingApiKeyId = await ragService.resolveEmbeddingApiKeyId(
        api_key_id,
        knowledgeBaseId
      );
      if (!embeddingApiKeyId) {
        return res.status(400).json({
          success: false,
          error: 'API key ID is required',
        });
      }

      const document = ragDocumentService.normalizeDocument(documentId, {
        chunks,
        metadata,
      });
      const { jobInfo, registered, outcomes } =
        await this.indexClientDocuments(req, [document], {
          apiKeyId: embeddingApiKeyId,
          knowledgeBaseId,
          background: process_in_background,
          skipUnchanged: true,
        });
      const [{ revision, chunk_count, unchanged }] = registered;
      const base = {
        success: true,
        document_id: document.document_id,
        knowledge_base_id: knowledgeBaseId,
        revision,
      };

      if (unchanged) {
        return res.json({
          ...base,
          status: 'indexed',
          unchanged: true,
          chunk_count,
          message: 'Document content is unchanged; nothing to re-index',
        });
      }

      if (jobInfo) {
        return res.status(202).json({
          ...base,
          status: 'pending',
          background_processing: true,
          job_id: jobInfo.job_id,
          status_endpoint: `/api/v1/organizations/${orgId}/projects/${projectId}/rag/documents/${encodeURIComponent(document.document_id)}`,
        });
      }

      const [outcome] = outcomes;
      res.json({
        ...base,
        status: outcome.status,
        background_processing: false,
        chunk_count: outcome.chunk_count,
        vector_ids: outcome.vector_ids,
      });
    } catch (error) {
      console.error('RAG document upsert error:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get a client-owned document's indexing state
   * GET /api/v1/organizations/:organizationId/projects/:projectId/rag/documents/:documentId
   */
  async getDocument(req, res) {
    try {
      const { orgId, projectId, documentId } = req.params;
      const knowledgeBaseId = await resolveKnowledgeBaseId(req);

      const document = await ragDocumentService.getDocument({
        organizationId: orgId,
        projectId,
        knowledgeBaseId,
        documentId,
      });
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }

      res.json({ success: true, document });
    } catch (error) {
      console.error('RAG document fetch error:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * List client-owned documents in the project KB or a knowledge base
   * GET /api/v1/organizations/:organizationId/projects/:projectId/rag/documents
   */
  async listDocuments(req, res) {
    try {
      const { orgId, projectId } = req.params;
      const { status, limit = 50, skip = 0 } = req.query;
      const knowledgeBaseId = await resolveKnowledgeBaseId(req);

      const { documents, total } = await ragDocumentService.listDocuments(
        { organizationId: orgId, projectId, knowledgeBaseId },
        {
          status,
          limit: parseInt(limit, 10),
          skip: parseInt(skip, 10),
        }
      );

      res.json({ success: true, documents, total });
    } catch (error) {
      console.error('RAG document list error:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Delete all chunks of a document
   * DELETE /api/v1/organizations/:organizationId/projects/:projectId/rag/documents/:documentId
   */
  async deleteByDocumentId(req, res) {
    try {
      const { orgId, projectId, documentId } = req.params;
      const knowledgeBaseId = await resolveKnowledgeBaseId(req);

      const result = await ragDocumentService.deleteDocument({
        organizationId: orgId,
        projectId,
        knowledgeBaseId,
        documentId,
      });

      if (!result.found) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
          document_id: documentId,
          knowledge_base_id: knowledgeBaseId,
        });
      }

      let message;
      if (result.already_deleted) {
        message = 'Document was already deleted';
      } else if (result.deleted_count === null) {
        message = 'Document chunks deleted (count unavailable for legacy documents)';
      } else {
        message = `Deleted ${result.deleted_count} document chunks`;
      }

      res.json({
        success: true,
        message,
        deleted_count: result.deleted_count,
        document_id: documentId,
        knowledge_base_id: knowledgeBaseId,
      });
    } catch (error) {
      console.error('RAG document deletion error:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

const ragController = new RAGController();

// Bind methods to maintain 'this' context
ragController.indexDocuments = ragController.indexDocuments.bind(ragController);
ragController.upsertDocument = ragController.upsertDocument.bind(ragController);
ragController.getDocument = ragController.getDocument.bind(ragController);
ragController.listDocuments = ragController.listDocuments.bind(ragController);
ragController.searchDocuments =
  ragController.searchDocuments.bind(ragController);
ragController.batchIndexDocuments =
  ragController.batchIndexDocuments.bind(ragController);
ragController.getJobStatus = ragController.getJobStatus.bind(ragController);
ragController.getJobs = ragController.getJobs.bind(ragController);
ragController.getJobStats = ragController.getJobStats.bind(ragController);
ragController.cancelJob = ragController.cancelJob.bind(ragController);
ragController.deleteByDocumentId = ragController.deleteByDocumentId.bind(ragController);

module.exports = ragController;
