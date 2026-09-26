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
