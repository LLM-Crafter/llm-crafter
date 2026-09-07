'use strict';

const FileUpload = require('../../models/FileUpload');
const mediaStorageService = require('../mediaStorageService');

const MAX_ATTACHMENTS = 5;

class OutboundAttachmentService {
  async resolve(fileIds, { organizationId, agentId, conversationId = null }) {
    const uniqueIds = [...new Set(fileIds || [])];
    if (uniqueIds.length > MAX_ATTACHMENTS) {
      throw new Error(`A maximum of ${MAX_ATTACHMENTS} attachments is allowed`);
    }
    if (uniqueIds.length === 0) {
      return [];
    }

    const files = await FileUpload.find({
      _id: { $in: uniqueIds },
      organization: organizationId,
      agent: agentId,
      stored: true,
    });
    const filesById = new Map(files.map(file => [String(file._id), file]));
    const missingIds = uniqueIds.filter(fileId => !filesById.has(String(fileId)));
    if (missingIds.length > 0) {
      throw new Error(`Attachment not found or not authorized: ${missingIds.join(', ')}`);
    }

    for (const file of files) {
      file.expires_at = null;
      if (conversationId) {
        file.conversation = conversationId;
      }
      await file.save();
    }

    return uniqueIds.map(fileId => {
      const file = filesById.get(String(fileId));
      return {
        file_id: file._id,
        s3_key: file.s3_key,
        filename: file.original_name,
        mime_type: file.mime_type,
        file_size: file.file_size,
      };
    });
  }

  toConversationMedia(attachments) {
    return (attachments || []).map(attachment => ({
      file_id: attachment.file_id,
      type: this.mediaType(attachment.mime_type),
      url: attachment.s3_key,
      mime_type: attachment.mime_type,
      file_size: attachment.file_size,
      filename: attachment.filename,
      stored: true,
      interpretation_status: 'unsupported',
    }));
  }

  async materialize(organizationId, attachments) {
    return Promise.all((attachments || []).map(async attachment => ({
      filename: attachment.filename,
      contentType: attachment.mime_type,
      content: await mediaStorageService.getBuffer(
        organizationId,
        attachment.s3_key
      ),
    })));
  }

  mediaType(mimeType) {
    if (mimeType?.startsWith('image/')) {
      return 'image';
    }
    if (mimeType?.startsWith('audio/')) {
      return 'audio';
    }
    if (mimeType?.startsWith('video/')) {
      return 'video';
    }
    if (mimeType === 'application/pdf' || mimeType?.includes('document')) {
      return 'document';
    }
    return 'other';
  }
}

module.exports = new OutboundAttachmentService();