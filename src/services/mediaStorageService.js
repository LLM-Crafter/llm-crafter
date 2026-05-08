/**
 * Media Storage Service
 * Downloads media from channel providers and uploads to the organization's S3 bucket.
 * If the organization has no S3 config, media references are kept but not persisted.
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');
const encryption = require('../utils/encryption');
const Organization = require('../models/Organization');

class MediaStorageService {
  constructor() {
    // Cache S3 clients per org to avoid re-creating on every request
    this._clients = new Map();
  }

  /**
   * Get or create an S3 client for an organization
   * @param {Object} mediaStorage - Organization.media_storage config
   * @returns {S3Client}
   */
  _getClient(mediaStorage) {
    const creds = mediaStorage.credentials;
    const cacheKey = `${creds.bucket}_${creds.region}_${creds.endpoint || ''}`;

    if (this._clients.has(cacheKey)) {
      return this._clients.get(cacheKey);
    }

    const accessKeyId = encryption.isEncrypted(creds.access_key_id)
      ? encryption.decrypt(creds.access_key_id)
      : creds.access_key_id;

    const secretAccessKey = encryption.isEncrypted(creds.secret_access_key)
      ? encryption.decrypt(creds.secret_access_key)
      : creds.secret_access_key;

    const clientConfig = {
      region: creds.region || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    if (creds.endpoint) {
      clientConfig.endpoint = creds.endpoint;
      clientConfig.forcePathStyle = true; // Required for MinIO / S3-compatible
    }

    const client = new S3Client(clientConfig);
    this._clients.set(cacheKey, client);
    return client;
  }

  /**
   * Build the S3 object key for a media file
   * @param {Object} mediaStorage - Organization.media_storage config
   * @param {string} orgId - Organization ID
   * @param {string} agentId - Agent ID
   * @param {string} conversationId - Conversation ID
   * @param {string} originalFilename - Original filename or generated name
   * @returns {string}
   */
  _buildKey(mediaStorage, orgId, agentId, conversationId, originalFilename) {
    const parts = [
      mediaStorage.base_path,
      orgId,
      agentId,
      conversationId,
      originalFilename,
    ].filter(Boolean);

    return parts.join('/');
  }

  /**
   * Determine a safe filename from media metadata
   * @param {Object} mediaItem - Normalized media item { type, url, mime_type, filename }
   * @returns {string}
   */
  _generateFilename(mediaItem) {
    if (mediaItem.filename) {
      return mediaItem.filename;
    }

    const ext = this._mimeToExtension(mediaItem.mime_type) || 'bin';
    return `${uuidv4()}.${ext}`;
  }

  /**
   * Map common MIME types to file extensions
   */
  _mimeToExtension(mimeType) {
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'video/mp4': 'mp4',
      'application/pdf': 'pdf',
    };
    return map[mimeType] || null;
  }

  /**
   * Download media from a WhatsApp provider and upload to S3.
   *
   * @param {Object} params
   * @param {string} params.orgId           - Organization ID
   * @param {string} params.agentId         - Agent ID
   * @param {string} params.conversationId  - Conversation ID
   * @param {Array}  params.mediaItems      - Normalized media array from channel service
   * @param {Object} params.channelService  - The WhatsApp channel service instance (for credentials)
   * @param {string} params.channel         - Channel name (e.g. 'whatsapp')
   * @returns {Promise<Array>} - Array of stored media objects with S3 keys, or original items if no S3
   */
  async processAndStore({ orgId, agentId, conversationId, mediaItems, channelService, channel }) {
    if (!mediaItems || mediaItems.length === 0) return [];

    // Load org's media storage config
    const org = await Organization.findById(orgId).select('media_storage').lean();
    const mediaStorage = org?.media_storage;

    if (!mediaStorage?.enabled || !mediaStorage?.credentials?.bucket) {
      console.log(`[MediaStorage] No S3 config for org ${orgId} — skipping upload`);
      // Return the items as-is (URL will be the provider's temporary URL/ID)
      return mediaItems.map(item => ({
        type: item.type,
        url: null, // Not stored — provider URL is ephemeral
        mime_type: item.mime_type,
        file_size: item.file_size || null,
        filename: item.filename || null,
        stored: false,
      }));
    }

    // Validate file types
    const allowedTypes = mediaStorage.allowed_mime_types || [];
    const maxSizeBytes = (mediaStorage.max_file_size_mb || 10) * 1024 * 1024;

    const client = this._getClient(mediaStorage);
    const results = [];

    for (const item of mediaItems) {
      try {
        // Validate MIME type
        if (allowedTypes.length > 0 && !this._isMimeAllowed(item.mime_type, allowedTypes)) {
          console.warn(`[MediaStorage] MIME type ${item.mime_type} not allowed for org ${orgId}`);
          results.push({
            type: item.type,
            url: null,
            mime_type: item.mime_type,
            file_size: item.file_size || null,
            filename: item.filename || null,
            stored: false,
            error: 'mime_type_not_allowed',
          });
          continue;
        }

        // Download the media binary from the provider
        const mediaBuffer = await this._downloadFromProvider(item, channelService, channel);

        if (!mediaBuffer) {
          console.warn(`[MediaStorage] Failed to download media from provider`);
          results.push({
            type: item.type,
            url: null,
            mime_type: item.mime_type,
            file_size: item.file_size || null,
            filename: item.filename || null,
            stored: false,
            error: 'download_failed',
          });
          continue;
        }

        // Validate file size
        if (mediaBuffer.length > maxSizeBytes) {
          console.warn(`[MediaStorage] File too large: ${mediaBuffer.length} bytes (max ${maxSizeBytes})`);
          results.push({
            type: item.type,
            url: null,
            mime_type: item.mime_type,
            file_size: mediaBuffer.length,
            filename: item.filename || null,
            stored: false,
            error: 'file_too_large',
          });
          continue;
        }

        // Upload to S3
        const filename = this._generateFilename(item);
        const key = this._buildKey(mediaStorage, orgId, agentId, conversationId, filename);

        await client.send(new PutObjectCommand({
          Bucket: mediaStorage.credentials.bucket,
          Key: key,
          Body: mediaBuffer,
          ContentType: item.mime_type,
        }));

        console.log(`[MediaStorage] Uploaded ${key} to S3 (${mediaBuffer.length} bytes)`);

        results.push({
          type: item.type,
          url: key, // S3 key — we generate presigned URLs on read
          mime_type: item.mime_type,
          file_size: mediaBuffer.length,
          filename: filename,
          stored: true,
        });
      } catch (err) {
        console.error(`[MediaStorage] Error processing media item:`, err.message);
        results.push({
          type: item.type,
          url: null,
          mime_type: item.mime_type,
          file_size: item.file_size || null,
          filename: item.filename || null,
          stored: false,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Generate a presigned URL for a stored media file
   * @param {string} orgId - Organization ID
   * @param {string} s3Key - The S3 object key
   * @param {number} expiresIn - URL expiration in seconds (default 1 hour)
   * @returns {Promise<string|null>} - Presigned URL or null if no S3 config
   */
  async getPresignedUrl(orgId, s3Key, expiresIn = 3600) {
    const org = await Organization.findById(orgId).select('media_storage').lean();
    const mediaStorage = org?.media_storage;

    if (!mediaStorage?.enabled || !mediaStorage?.credentials?.bucket) {
      return null;
    }

    const client = this._getClient(mediaStorage);

    const command = new GetObjectCommand({
      Bucket: mediaStorage.credentials.bucket,
      Key: s3Key,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  /**
   * Download media binary from a channel provider
   * @param {Object} mediaItem - { type, url (media ID or URL), mime_type }
   * @param {Object} channelService - Channel service instance
   * @param {string} channel - Channel name
   * @returns {Promise<Buffer|null>}
   */
  async _downloadFromProvider(mediaItem, channelService, channel) {
    if (channel === 'whatsapp') {
      return this._downloadWhatsAppMedia(mediaItem, channelService);
    }
    // Other channels can be added here
    return null;
  }

  /**
   * Download media from WhatsApp (Meta or Twilio)
   * @param {Object} mediaItem - Normalized media item
   * @param {Object} channelService - WhatsApp service instance
   * @returns {Promise<Buffer|null>}
   */
  async _downloadWhatsAppMedia(mediaItem, channelService) {
    const provider = channelService.whatsappConfig.provider;

    if (provider === 'meta') {
      return this._downloadMetaMedia(mediaItem, channelService);
    } else if (provider === 'twilio') {
      return this._downloadTwilioMedia(mediaItem, channelService);
    }

    return null;
  }

  /**
   * Download media from Meta's Graph API
   * Meta gives a media ID. We first GET the media URL, then download the binary.
   */
  async _downloadMetaMedia(mediaItem, channelService) {
    const accessToken = channelService.safeDecrypt(
      channelService.whatsappConfig.credentials.access_token
    );

    // Step 1: Get the download URL from the media ID
    const metaResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaItem.url}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const downloadUrl = metaResponse.data.url;
    if (!downloadUrl) return null;

    // Step 2: Download the binary
    const fileResponse = await axios.get(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
    });

    return Buffer.from(fileResponse.data);
  }

  /**
   * Download media from Twilio
   * Twilio gives a direct URL behind Basic auth.
   */
  async _downloadTwilioMedia(mediaItem, channelService) {
    const authToken = channelService.safeDecrypt(
      channelService.whatsappConfig.credentials.auth_token
    );

    const response = await axios.get(mediaItem.url, {
      auth: {
        username: channelService.whatsappConfig.credentials.account_sid,
        password: authToken,
      },
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
  }

  /**
   * Check if a MIME type is in the allowed list (supports wildcards like 'image/*')
   */
  _isMimeAllowed(mimeType, allowedList) {
    if (!mimeType) return false;
    return allowedList.some(allowed => {
      if (allowed === mimeType) return true;
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, -2);
        return mimeType.startsWith(prefix + '/');
      }
      return false;
    });
  }

  /**
   * Clear cached S3 clients (useful after credential rotation)
   */
  clearClientCache() {
    this._clients.clear();
  }
}

module.exports = new MediaStorageService();
