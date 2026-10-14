const mongoose = require('mongoose');

const DELETED_TOMBSTONE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Registry of client-owned documents indexed for RAG: the source of truth for
 * which chunk vectors exist, so deletes and re-indexes never depend on
 * searching the vector store by metadata.
 *
 * Every write (index or delete) bumps `revision`; index jobs only write while
 * their revision is still current, which keeps a late job from resurrecting a
 * deleted document.
 */
const ragIndexedDocumentSchema = new mongoose.Schema(
  {
    organization_id: { type: String, ref: 'Organization', required: true },
    project_id: { type: String, ref: 'Project', required: true },
    // null = project-wide KB
    knowledge_base_id: { type: String, ref: 'KnowledgeBase', default: null },

    // Client-owned id, also the prefix of every chunk vector id ({document_id}#{i})
    document_id: { type: String, required: true },

    status: {
      type: String,
      enum: ['pending', 'indexing', 'indexed', 'failed', 'deleting', 'deleted'],
      default: 'pending',
    },
    revision: { type: Number, default: 0 },

    // Chunks of the last successfully indexed revision
    chunk_count: { type: Number, default: 0 },
    // High-water mark of chunk indexes that may exist in the vector store,
    // including partial writes, so deletes and shrinking re-indexes cover them
    chunk_capacity: { type: Number, default: 0 },

    // Whether chunks written by the pre-registry ingest path (keyed by random or
    // org-prefixed ids) were purged before this document was first indexed
    legacy_checked: { type: Boolean, default: false },

    content_hash: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    job_id: { type: String, default: null },
    error: { type: String, default: null },
    indexed_at: { type: Date, default: null },
    // Tombstone so a repeated DELETE is a no-op instead of a 404; expires via TTL
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

ragIndexedDocumentSchema.index(
  { organization_id: 1, project_id: 1, knowledge_base_id: 1, document_id: 1 },
  { unique: true }
);
ragIndexedDocumentSchema.index({
  organization_id: 1,
  project_id: 1,
  knowledge_base_id: 1,
  status: 1,
  updatedAt: -1,
});
ragIndexedDocumentSchema.index(
  { deleted_at: 1 },
  { expireAfterSeconds: DELETED_TOMBSTONE_TTL_SECONDS }
);

module.exports = mongoose.model('RagIndexedDocument', ragIndexedDocumentSchema);
