const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Optional isolated RAG knowledge base. Agents without one use the project-wide KB.
const knowledgeBaseSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
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
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    // Used for indexing and query embeddings instead of the caller's/agent's key,
    // so agents on providers without an embeddings API can still search this KB
    embedding_api_key_id: {
      type: String,
      ref: 'ApiKey',
      default: null,
    },
    created_by: {
      type: String,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'knowledge_bases',
  }
);

knowledgeBaseSchema.index({ organization_id: 1, project_id: 1, name: 1 });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
