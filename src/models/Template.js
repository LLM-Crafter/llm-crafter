const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const templateComponentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'],
      required: true,
    },
    // For HEADER: TEXT, IMAGE, VIDEO, DOCUMENT
    format: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'],
    },
    text: String, // Template text with {{1}}, {{2}} placeholders
    // Button definitions (for BUTTONS component)
    buttons: [
      {
        type: {
          type: String,
          enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'],
        },
        text: String,
        url: String,
        phone_number: String,
      },
    ],
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    agent: {
      type: String,
      ref: 'Agent',
      required: true,
    },
    organization: {
      type: String,
      ref: 'Organization',
      required: true,
    },
    // The template name as registered with Meta
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // ISO 639-1 language code (e.g. "en", "pt_BR", "es")
    language: {
      type: String,
      required: true,
      trim: true,
    },
    // Meta template category
    category: {
      type: String,
      enum: ['UTILITY', 'MARKETING', 'AUTHENTICATION'],
      default: 'UTILITY',
    },
    // Template components (header, body, footer, buttons)
    components: [templateComponentSchema],
    // Channel this template is for
    channel: {
      type: String,
      enum: ['whatsapp'],
      default: 'whatsapp',
    },
    // Human-readable label for the UI
    label: {
      type: String,
      trim: true,
    },
    // Meta approval status — synced from Meta after submission
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    // Meta-assigned template ID (returned after creation)
    meta_template_id: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique per agent + name + language
templateSchema.index(
  { agent: 1, name: 1, language: 1 },
  { unique: true }
);
templateSchema.index({ agent: 1 });
templateSchema.index({ organization: 1 });

module.exports = mongoose.model('Template', templateSchema);
