const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const fileUploadSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    organization: {
      type: String,
      ref: 'Organization',
      required: true,
    },
    agent: {
      type: String,
      ref: 'Agent',
      required: true,
    },
    // Who uploaded the file
    uploaded_by: {
      type: String, // session ID, user identifier, or API key ID
      required: true,
    },
    // Original filename from the client
    original_name: {
      type: String,
      required: true,
    },
    // Stored filename (UUID-based)
    stored_name: {
      type: String,
      required: true,
    },
    // S3 object key
    s3_key: {
      type: String,
      default: null,
    },
    // File metadata
    mime_type: {
      type: String,
      required: true,
    },
    file_size: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ['image', 'document', 'audio', 'video', 'other'],
      required: true,
    },
    // Whether the file was successfully stored in S3
    stored: {
      type: Boolean,
      default: false,
    },
    conversation: {
      type: String,
      ref: 'Conversation',
      default: null,
    },
    source: {
      type: String,
      enum: ['website', 'email', 'channel'],
      default: 'website',
    },
    description: { type: String, default: null },
    extracted_text: { type: String, default: null },
    interpretation_status: {
      type: String,
      enum: ['pending', 'completed', 'unsupported', 'failed'],
      default: 'pending',
    },
    interpretation_error: { type: String, default: null },
    interpreted_at: { type: Date, default: null },
    interpretation_model: { type: String, default: null },
    // Files expire after 24 hours if not attached to a message
    expires_at: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  {
    timestamps: true,
  }
);

// Index for cleanup of expired uploads
fileUploadSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
// Index for lookups by agent + uploader
fileUploadSchema.index({ agent: 1, uploaded_by: 1 });

module.exports = mongoose.model('FileUpload', fileUploadSchema);
