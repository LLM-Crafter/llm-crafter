const crypto = require('crypto');
const RagIndexedDocument = require('../models/RagIndexedDocument');
const ragService = require('./ragService');

const MAX_DOCUMENT_ID_LENGTH = 256;
const MAX_CHUNKS_PER_DOCUMENT = 5000;
// Revision is re-checked between batches, so this bounds how much a superseded job can write
const UPSERT_BATCH_SIZE = 50;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inBatches(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Lifecycle of client-owned, pre-chunked documents. The RagIndexedDocument
 * registry is the source of truth: deletes and re-indexes address chunk
 * vectors by {document_id}#{i} instead of searching the store by metadata.
 *
 * Concurrency: every index or delete bumps the row's revision. An index job
 * only writes while its revision is current, and chunk_capacity tracks the
 * highest chunk index that may have been written, so a delete or a shorter
 * re-index always covers every chunk that could exist.
 */
class RagDocumentService {
  registryKey(organizationId, projectId, knowledgeBaseId, documentId) {
    return {
      organization_id: organizationId,
      project_id: projectId,
      knowledge_base_id: knowledgeBaseId || null,
      document_id: documentId,
    };
  }

  /**
   * Validate a { metadata, chunks: [{ content, embed_text?, metadata? }] } payload
   */
  normalizeDocument(documentId, { metadata = {}, chunks } = {}) {
    const id =
      documentId === undefined || documentId === null ? '' : String(documentId);
    if (!id || id.length > MAX_DOCUMENT_ID_LENGTH) {
      throw badRequest(
        `document_id must be 1-${MAX_DOCUMENT_ID_LENGTH} characters`
      );
    }
    if (!isPlainObject(metadata)) {
      throw badRequest('metadata must be an object');
    }
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw badRequest('chunks must be a non-empty array');
    }
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      throw badRequest(
        `A document can have at most ${MAX_CHUNKS_PER_DOCUMENT} chunks`
      );
    }

    return {
      document_id: id,
      metadata,
      chunks: chunks.map((chunk, i) => {
        if (typeof chunk?.content !== 'string' || !chunk.content.trim()) {
          throw badRequest(`chunks[${i}].content must be a non-empty string`);
        }
        if (
          chunk.embed_text !== undefined &&
          typeof chunk.embed_text !== 'string'
        ) {
          throw badRequest(`chunks[${i}].embed_text must be a string`);
        }
        if (chunk.metadata !== undefined && !isPlainObject(chunk.metadata)) {
          throw badRequest(`chunks[${i}].metadata must be an object`);
        }
        return {
          content: chunk.content,
          embed_text: chunk.embed_text || null,
          metadata: chunk.metadata || {},
        };
      }),
    };
  }

  /**
   * POST /rag/index items that name their document in metadata.document_id are
   * chunks of that document. Grouping them lets the document be indexed,
   * replaced and deleted as one unit. Returns null for any other payload, which
   * keeps the generic JSON ingest path.
   */
  groupPreChunkedItems(items) {
    const isPreChunked = item =>
      isPlainObject(item) &&
      typeof item.content === 'string' &&
      item.content.trim() !== '' &&
      ['string', 'number'].includes(typeof item.metadata?.document_id) &&
      String(item.metadata.document_id) !== '';

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      !items.every(isPreChunked)
    ) {
      return null;
    }

    const groups = new Map();
    for (const item of items) {
      const documentId = String(item.metadata.document_id);
      // eslint-disable-next-line no-unused-vars
      const { document_id, chunk_context, ...chunkMetadata } = item.metadata;

      // Clients that prepend generated context also send it as chunk_context:
      // embed with it, but return only the chunk text from search
      let content = item.content;
      if (
        typeof chunk_context === 'string' &&
        chunk_context &&
        content.startsWith(chunk_context) &&
        content.slice(chunk_context.length).trim()
      ) {
        content = content.slice(chunk_context.length).trimStart();
      }

      if (!groups.has(documentId)) {
        groups.set(documentId, { document_id: documentId, chunks: [] });
      }
      groups.get(documentId).chunks.push({
        content,
        embed_text: item.content,
        metadata: chunkMetadata,
      });
    }

    return [...groups.values()].map(group =>
      this.normalizeDocument(group.document_id, {
        metadata: this.sharedMetadata(group.chunks),
        chunks: group.chunks,
      })
    );
  }

  // Scalar fields identical across every chunk (file_name, type, ...) describe the document
  sharedMetadata(chunks) {
    const [first, ...rest] = chunks.map(c => c.metadata || {});
    const shared = {};
    for (const [key, value] of Object.entries(first || {})) {
      const isScalar = ['string', 'number', 'boolean'].includes(typeof value);
      if (isScalar && rest.every(m => m[key] === value)) {
        shared[key] = value;
      }
    }
    return shared;
  }

  contentHash(document) {
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({ metadata: document.metadata, chunks: document.chunks })
      )
      .digest('hex');
  }

  /**
   * Record a new revision of a document as pending. With skipUnchanged, an
   * already-indexed document with identical content is left alone.
   */
  async registerRevision(
    { organizationId, projectId, knowledgeBaseId },
    document,
    { skipUnchanged = true } = {}
  ) {
    const key = this.registryKey(
      organizationId,
      projectId,
      knowledgeBaseId,
      document.document_id
    );
    const contentHash = this.contentHash(document);

    const existing = await RagIndexedDocument.findOne(key).lean();
    if (
      skipUnchanged &&
      existing?.status === 'indexed' &&
      existing.content_hash === contentHash
    ) {
      return { row: existing, unchanged: true };
    }

    const update = {
      $inc: { revision: 1 },
      $set: {
        status: 'pending',
        content_hash: contentHash,
        metadata: document.metadata,
        job_id: null,
        error: null,
        deleted_at: null,
      },
    };
    let row;
    try {
      row = await RagIndexedDocument.findOneAndUpdate(key, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }).lean();
    } catch (error) {
      // Two first-time writes raced on the unique key; the loser updates instead
      if (error.code !== 11000) {
        throw error;
      }
      row = await RagIndexedDocument.findOneAndUpdate(key, update, {
        new: true,
      }).lean();
    }
    return { row, unchanged: false };
  }

  async attachJob(scope, revisions, jobId) {
    await Promise.all(
      revisions.map(({ document_id, revision }) =>
        RagIndexedDocument.updateOne(
          {
            ...this.registryKey(
              scope.organizationId,
              scope.projectId,
              scope.knowledgeBaseId,
              document_id
            ),
            revision,
          },
          { $set: { job_id: jobId } }
        )
      )
    );
  }

  async failRevisions(scope, revisions, message) {
    await Promise.all(
      revisions.map(({ document_id, revision }) =>
        RagIndexedDocument.updateOne(
          {
            ...this.registryKey(
              scope.organizationId,
              scope.projectId,
              scope.knowledgeBaseId,
              document_id
            ),
            revision,
            status: 'pending',
          },
          { $set: { status: 'failed', error: message } }
        )
      )
    );
  }

  async isCurrent(key, revision) {
    return Boolean(
      await RagIndexedDocument.exists({ ...key, revision, status: 'indexing' })
    );
  }

  /**
   * Embed and write one revision of a document. Returns
   * { status: 'indexed' | 'superseded', vector_ids, chunk_count }.
   */
  async indexRevision({
    organizationId,
    projectId,
    knowledgeBaseId,
    apiKeyId,
    document,
    revision,
  }) {
    const documentId = document.document_id;
    const key = this.registryKey(
      organizationId,
      projectId,
      knowledgeBaseId,
      documentId
    );
    const scope = ragService.buildScope(
      organizationId,
      projectId,
      knowledgeBaseId
    );
    const chunkCount = document.chunks.length;

    const claimed = await RagIndexedDocument.findOneAndUpdate(
      { ...key, revision, status: 'pending' },
      { $set: { status: 'indexing' }, $max: { chunk_capacity: chunkCount } },
      { new: true }
    ).lean();
    if (!claimed) {
      return { status: 'superseded', vector_ids: [], chunk_count: 0 };
    }

    const vectorDB = await ragService.getVectorDatabase(
      organizationId,
      projectId
    );
    const written = [];
    try {
      const embeddingApiKeyId = await ragService.resolveEmbeddingApiKeyId(
        apiKeyId,
        knowledgeBaseId
      );
      const embeddings = await ragService.generateEmbeddings(
        document.chunks.map(chunk => ({
          content: chunk.embed_text || chunk.content,
        })),
        embeddingApiKeyId
      );

      if (!claimed.legacy_checked) {
        await this.purgeLegacyChunks(vectorDB, documentId, scope);
        await RagIndexedDocument.updateOne(
          { ...key, revision },
          { $set: { legacy_checked: true } }
        );
      }

      const chunks = document.chunks.map((chunk, i) => {
        const metadata = { ...document.metadata, ...chunk.metadata };
        return {
          document_id: documentId,
          chunk_index: i,
          content: chunk.content,
          title: metadata.title || metadata.file_name || '',
          source: metadata.source || '',
          metadata,
          embedding: embeddings[i],
        };
      });

      for (const batch of inBatches(chunks, UPSERT_BATCH_SIZE)) {
        if (!(await this.isCurrent(key, revision))) {
          return this.abandonRevision(vectorDB, key, scope, written.length);
        }
        written.push(...(await vectorDB.upsertChunks(batch, scope)));
      }

      // A previous, longer revision (or a partial write) left chunks past the new end
      if (claimed.chunk_capacity > chunkCount) {
        await vectorDB.deleteChunkRange(
          documentId,
          scope,
          chunkCount,
          claimed.chunk_capacity
        );
      }

      const finished = await RagIndexedDocument.findOneAndUpdate(
        { ...key, revision, status: 'indexing' },
        {
          $set: {
            status: 'indexed',
            chunk_count: chunkCount,
            chunk_capacity: chunkCount,
            indexed_at: new Date(),
            error: null,
          },
        },
        { new: true }
      ).lean();
      if (!finished) {
        return this.abandonRevision(vectorDB, key, scope, written.length);
      }

      return {
        status: 'indexed',
        vector_ids: written,
        chunk_count: chunkCount,
      };
    } catch (error) {
      await RagIndexedDocument.updateOne(
        { ...key, revision, status: 'indexing' },
        { $set: { status: 'failed', error: error.message } }
      );
      throw error;
    }
  }

  /**
   * Called when a newer revision or a delete overtook a running job
   */
  async abandonRevision(vectorDB, key, scope, writtenCount) {
    const row = await RagIndexedDocument.findOneAndUpdate(
      key,
      { $max: { chunk_capacity: writtenCount } },
      { new: true }
    ).lean();

    if (!row || ['deleting', 'deleted'].includes(row.status)) {
      // The delete may have run before this job's last write landed
      await vectorDB.deleteChunkRange(key.document_id, scope, 0, writtenCount);
      if (row?.status === 'deleted') {
        await RagIndexedDocument.updateOne(
          { ...key, revision: row.revision },
          { $set: { chunk_capacity: 0 } }
        );
      }
    } else if (row.status === 'indexed' && writtenCount > row.chunk_count) {
      // A newer, shorter revision already finished; drop what we wrote past its end
      await vectorDB.deleteChunkRange(
        key.document_id,
        scope,
        row.chunk_count,
        writtenCount
      );
    }
    // A newer revision still in progress overwrites these ids and trims via chunk_capacity
    return { status: 'superseded', vector_ids: [], chunk_count: 0 };
  }

  // Chunks from the pre-registry ingest path share the document_id but not the id scheme
  async purgeLegacyChunks(vectorDB, documentId, scope) {
    try {
      await vectorDB.deleteDocument(documentId, scope);
    } catch (error) {
      // Some Pinecone indexes reject metadata-filtered deletes; new chunks are unaffected
      console.warn(
        `Could not purge legacy chunks for document ${documentId}: ${error.message}`
      );
    }
  }

  /**
   * Delete every chunk of a document. Returns
   * { found, deleted_count, already_deleted?, legacy? }.
   */
  async deleteDocument({
    organizationId,
    projectId,
    knowledgeBaseId,
    documentId,
  }) {
    const key = this.registryKey(
      organizationId,
      projectId,
      knowledgeBaseId,
      documentId
    );
    const scope = ragService.buildScope(
      organizationId,
      projectId,
      knowledgeBaseId
    );
    const vectorDB = await ragService.getVectorDatabase(
      organizationId,
      projectId
    );

    // Bumping the revision stops any index job for this document from writing
    const row = await RagIndexedDocument.findOneAndUpdate(
      { ...key, status: { $ne: 'deleted' } },
      { $set: { status: 'deleting' }, $inc: { revision: 1 } },
      { new: true }
    ).lean();

    if (!row) {
      if (await RagIndexedDocument.exists(key)) {
        return { found: true, deleted_count: 0, already_deleted: true };
      }
      return this.deleteUnregistered(vectorDB, documentId, scope);
    }

    const { deleted_count } = await vectorDB.deleteDocumentChunks(
      documentId,
      scope,
      { knownCount: row.chunk_capacity }
    );

    await RagIndexedDocument.updateOne(
      { ...key, revision: row.revision },
      {
        $set: {
          status: 'deleted',
          chunk_count: 0,
          chunk_capacity: 0,
          job_id: null,
          error: null,
          deleted_at: new Date(),
        },
      }
    );

    return { found: true, deleted_count };
  }

  // Documents indexed before the registry existed can only be found by metadata.
  // Pinecone cannot count those deletes, so a null count is reported as found.
  async deleteUnregistered(vectorDB, documentId, scope) {
    const { deleted_count = null } =
      (await vectorDB.deleteDocument(documentId, scope)) || {};
    return { found: deleted_count !== 0, deleted_count, legacy: true };
  }

  async getDocument({
    organizationId,
    projectId,
    knowledgeBaseId,
    documentId,
  }) {
    const row = await RagIndexedDocument.findOne(
      this.registryKey(organizationId, projectId, knowledgeBaseId, documentId)
    ).lean();
    return row && row.status !== 'deleted' ? this.formatDocument(row) : null;
  }

  async listDocuments(
    { organizationId, projectId, knowledgeBaseId },
    { status, limit = 50, skip = 0 } = {}
  ) {
    const filter = {
      organization_id: organizationId,
      project_id: projectId,
      knowledge_base_id: knowledgeBaseId || null,
      status: status || { $ne: 'deleted' },
    };
    const [rows, total] = await Promise.all([
      RagIndexedDocument.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RagIndexedDocument.countDocuments(filter),
    ]);
    return { documents: rows.map(row => this.formatDocument(row)), total };
  }

  formatDocument(row) {
    return {
      document_id: row.document_id,
      knowledge_base_id: row.knowledge_base_id || null,
      status: row.status,
      revision: row.revision,
      chunk_count: row.chunk_count,
      metadata: row.metadata || {},
      job_id: row.job_id || null,
      error: row.error || null,
      indexed_at: row.indexed_at || null,
      updated_at: row.updatedAt || null,
    };
  }
}

module.exports = new RagDocumentService();
