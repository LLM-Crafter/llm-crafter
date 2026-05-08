const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const organizationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    owner: {
      type: String,
      ref: 'User',
      required: true,
    },
    members: [
      {
        user: {
          type: String,
          ref: 'User',
        },
        role: {
          type: String,
          enum: ['admin', 'member', 'viewer'],
          default: 'member',
        },
      },
    ],
    // S3-compatible media storage configuration (per-organization)
    media_storage: {
      enabled: {
        type: Boolean,
        default: false,
      },
      credentials: {
        access_key_id: String,     // encrypted at rest
        secret_access_key: String, // encrypted at rest
        region: { type: String, default: 'us-east-1' },
        bucket: String,
        endpoint: String,          // for S3-compatible providers (MinIO, DigitalOcean Spaces, etc.)
      },
      base_path: {
        type: String,
        default: '',               // optional prefix inside the bucket
      },
      max_file_size_mb: {
        type: Number,
        default: 10,
      },
      allowed_mime_types: {
        type: [String],
        default: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'audio/ogg', 'audio/mpeg', 'video/mp4'],
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

module.exports = mongoose.model('Organization', organizationSchema);
