/**
 * File Upload Controller
 * Handles file uploads for the web chat and other API consumers.
 * Files are stored in the organization's S3 bucket and referenced by ID
 * when sending chat messages.
 */

const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const FileUpload = require('../models/FileUpload');
const Organization = require('../models/Organization');
const mediaStorageService = require('../services/mediaStorageService');

// Multer config: store in memory (we immediately push to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB default, further validated against org config
    files: 5,                    // Max 5 files per request
  },
});

/**
 * Middleware: accept up to 5 files on the "files" field.
 * Wraps multer to catch MulterError and return JSON instead of HTML.
 */
const uploadMiddleware = (req, res, next) => {
  const multerHandler = upload.array('files', 5);
  multerHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const messages = {
          LIMIT_FILE_SIZE: 'File too large. Maximum size is 10 MB.',
          LIMIT_FILE_COUNT: 'Too many files. Maximum is 5 per request.',
          LIMIT_UNEXPECTED_FILE: 'Unexpected field name. Use "files" as the form field.',
        };
        return res.status(400).json({
          error: messages[err.code] || err.message,
          code: err.code,
        });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

/**
 * Map MIME type to a simple type category
 */
function mimeToType(mimeType) {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation')
  ) {
    return 'document';
  }
  return 'other';
}

/**
 * POST /api/v1/external/agents/upload
 * Upload files to the org's S3 bucket. Returns file IDs to attach to a chat message.
 */
const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const orgId = req.organization?._id || req.organization;
    const agentId = req.agent?._id || req.agent;
    const uploadedBy = req.sessionToken?._id || req.apiKey?._id || 'anonymous';

    // Load org media storage config
    const org = await Organization.findById(orgId).select('media_storage').lean();
    const mediaStorage = org?.media_storage;

    if (!mediaStorage?.enabled || !mediaStorage?.credentials?.bucket) {
      return res.status(400).json({
        error: 'File uploads are not configured for this organization',
        code: 'MEDIA_STORAGE_NOT_CONFIGURED',
      });
    }

    const allowedTypes = mediaStorage.allowed_mime_types || [];
    const maxSizeBytes = (mediaStorage.max_file_size_mb || 10) * 1024 * 1024;

    const results = [];

    for (const file of req.files) {
      // Validate MIME type
      if (allowedTypes.length > 0 && !isMimeAllowed(file.mimetype, allowedTypes)) {
        results.push({
          original_name: file.originalname,
          error: `File type ${file.mimetype} is not allowed`,
          code: 'MIME_TYPE_NOT_ALLOWED',
        });
        continue;
      }

      // Validate file size against org config
      if (file.size > maxSizeBytes) {
        results.push({
          original_name: file.originalname,
          error: `File exceeds maximum size of ${mediaStorage.max_file_size_mb || 10} MB`,
          code: 'FILE_TOO_LARGE',
        });
        continue;
      }

      const ext = extFromMime(file.mimetype) || extFromOriginal(file.originalname) || 'bin';
      const storedName = `${uuidv4()}.${ext}`;
      const fileType = mimeToType(file.mimetype);

      // Build S3 key: base_path/orgId/agentId/uploads/storedName
      const keyParts = [
        mediaStorage.base_path,
        orgId,
        agentId,
        'uploads',
        storedName,
      ].filter(Boolean);
      const s3Key = keyParts.join('/');

      try {
        // Upload to S3 using the low-level client from mediaStorageService
        const client = mediaStorageService._getClient(mediaStorage);
        const { PutObjectCommand } = require('@aws-sdk/client-s3');

        await client.send(new PutObjectCommand({
          Bucket: mediaStorage.credentials.bucket,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }));

        // Create FileUpload record
        const fileUpload = await FileUpload.create({
          organization: orgId,
          agent: agentId,
          uploaded_by: uploadedBy,
          original_name: file.originalname,
          stored_name: storedName,
          s3_key: s3Key,
          mime_type: file.mimetype,
          file_size: file.size,
          type: fileType,
          stored: true,
        });

        results.push({
          file_id: fileUpload._id,
          original_name: file.originalname,
          type: fileType,
          mime_type: file.mimetype,
          file_size: file.size,
          stored: true,
        });

        console.log(`[Upload] Stored ${file.originalname} as ${s3Key} (${file.size} bytes)`);
      } catch (uploadErr) {
        console.error(`[Upload] Failed to upload ${file.originalname}:`, uploadErr.message);
        results.push({
          original_name: file.originalname,
          error: 'Failed to store file',
          code: 'UPLOAD_FAILED',
        });
      }
    }

    const successCount = results.filter(r => r.file_id).length;

    res.status(successCount > 0 ? 200 : 400).json({
      files: results,
      uploaded: successCount,
      total: req.files.length,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({
      error: 'File upload failed',
      code: 'UPLOAD_ERROR',
    });
  }
};

// --- Helpers ---

function isMimeAllowed(mimeType, allowedList) {
  if (!mimeType) return false;
  return allowedList.some(allowed => {
    if (allowed === mimeType) return true;
    if (allowed.endsWith('/*')) {
      return mimeType.startsWith(allowed.slice(0, -2) + '/');
    }
    return false;
  });
}

function extFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/gif': 'gif', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
    'video/mp4': 'mp4', 'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  return map[mimeType] || null;
}

function extFromOriginal(originalName) {
  if (!originalName) return null;
  const parts = originalName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
}

module.exports = {
  uploadMiddleware,
  uploadFiles,
};
