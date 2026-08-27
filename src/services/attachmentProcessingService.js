'use strict';

const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const FileUpload = require('../models/FileUpload');
const OpenAIService = require('./openaiService');
const mediaStorageService = require('./mediaStorageService');

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function mediaType(mimeType) {
  if (mimeType?.startsWith('image/')) {return 'image';}
  if (mimeType?.startsWith('audio/')) {return 'audio';}
  if (mimeType?.startsWith('video/')) {return 'video';}
  if ([PDF, DOCX].includes(mimeType)) {return 'document';}
  return 'other';
}

function cleanText(value) {
  return String(value || '')
    .split('\u0000')
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

class AttachmentProcessingService {
  async storeAndInterpret({ agent, conversationId, attachments, source = 'email' }) {
    const config = agent.config?.attachment_processing || {};
    const results = [];
    for (const attachment of attachments || []) {
      const mimeType = attachment.contentType || attachment.mime_type ||
        'application/octet-stream';
      const filename = attachment.filename || 'attachment';
      const base = {
        type: mediaType(mimeType),
        mime_type: mimeType,
        file_size: attachment.size || attachment.content?.length || 0,
        filename,
        content_disposition: attachment.contentDisposition || null,
        cid: attachment.cid || null,
        stored: false,
        interpretation_status: 'pending'
      };
      try {
        const stored = await mediaStorageService.storeBuffer({
          orgId: agent.organization,
          agentId: agent._id,
          conversationId,
          buffer: attachment.content,
          filename,
          mimeType
        });
        const file = await FileUpload.create({
          organization: agent.organization,
          agent: agent._id,
          uploaded_by: source,
          original_name: filename,
          stored_name: stored.storedName,
          s3_key: stored.key,
          mime_type: mimeType,
          file_size: base.file_size,
          type: base.type,
          stored: true,
          conversation: conversationId,
          source,
          expires_at: null
        });
        let interpretation;
        try {
          interpretation = config.enabled === false
            ? { interpretation_status: 'unsupported' }
            : attachment.contentDisposition === 'inline' && base.type === 'image'
              ? { interpretation_status: 'unsupported' }
              : await this.interpretBuffer(agent, attachment.content, base);
        } catch (error) {
          interpretation = {
            interpretation_status: 'failed',
            interpretation_error: error.message
          };
        }
        Object.assign(file, interpretation);
        await file.save();
        results.push({
          ...this.toMedia(file),
          content_disposition: base.content_disposition,
          cid: base.cid
        });
      } catch (error) {
        results.push({
          ...base,
          interpretation_status: 'failed',
          interpretation_error: error.message
        });
      }
    }
    return results;
  }

  async interpretStoredFiles(agent, mediaItems) {
    const results = [];
    for (const item of mediaItems || []) {
      const file = item.file_id ? await FileUpload.findOne({
        _id: item.file_id,
        agent: agent._id
      }) : null;
      if (!file || file.interpretation_status !== 'pending') {
        results.push(file ? this.toMedia(file) : item);
        continue;
      }
      try {
        const buffer = await mediaStorageService.getBuffer(agent.organization, file.s3_key);
        const interpretation = await this.interpretBuffer(agent, buffer, {
          type: file.type,
          mime_type: file.mime_type,
          filename: file.original_name
        });
        Object.assign(file, interpretation, { expires_at: null });
        await file.save();
      } catch (error) {
        file.interpretation_status = 'failed';
        file.interpretation_error = error.message;
        await file.save();
      }
      results.push(this.toMedia(file));
    }
    return results;
  }

  async interpretBuffer(agent, buffer, item) {
    const config = agent.config?.attachment_processing || {};
    const maxExtracted = config.max_extracted_chars || 20_000;
    const maxDescription = config.max_description_chars || 4_000;
    let extractedText = '';
    if (config.extract_documents !== false && item.mime_type === PDF) {
      extractedText = cleanText((await pdfParse(buffer)).text);
    } else if (config.extract_documents !== false && item.mime_type === DOCX) {
      extractedText = cleanText((await mammoth.extractRawText({ buffer })).value);
    } else if (
      item.mime_type?.startsWith('image/') &&
      config.interpret_images === true &&
      config.image_model
    ) {
      return this.describeImage(agent, buffer, item, maxDescription);
    } else {
      return { interpretation_status: 'unsupported' };
    }
    const boundedText = extractedText.slice(0, maxExtracted);
    const parser = item.mime_type === PDF ? 'pdf-parse' : 'mammoth';
    if (!boundedText) {
      return {
        description: 'No extractable text was found in this document.',
        extracted_text: '',
        interpretation_status: 'completed',
        interpreted_at: new Date(),
        interpretation_model: parser
      };
    }
    if (config.summarize_documents !== false) {
      return this.summarizeDocument(agent, boundedText, item, maxDescription);
    }
    return {
      description: boundedText.slice(0, maxDescription),
      extracted_text: boundedText,
      interpretation_status: 'completed',
      interpreted_at: new Date(),
      interpretation_model: parser
    };
  }

  async summarizeDocument(agent, extractedText, item, maxDescription) {
    const model = agent.config.attachment_processing.document_model ||
      agent.llm_settings?.model;
    if (!model) {
      throw new Error('No document summary model is configured');
    }
    const client = new OpenAIService(
      agent.api_key.getDecryptedKey(),
      agent.api_key.provider.name
    );
    const response = await client.generateCompletion(
      model,
      `Summarize the attached document for a customer-support agent. Preserve names, dates, amounts, identifiers, decisions, requests, deadlines, and other actionable details. Be factual and do not add information.\n\nFilename: ${item.filename || 'document'}\n\nDocument text:\n${extractedText}`,
      { max_tokens: 1000, temperature: 1 }
    );
    return {
      description: cleanText(response.content).slice(0, maxDescription),
      extracted_text: extractedText,
      interpretation_status: 'completed',
      interpreted_at: new Date(),
      interpretation_model: model
    };
  }

  async describeImage(agent, buffer, item, maxDescription) {
    const model = agent.config.attachment_processing.image_model;
    const client = new OpenAIService(
      agent.api_key.getDecryptedKey(),
      agent.api_key.provider.name
    );
    const response = await client.generateCompletion(
      model,
      [
        {
          type: 'text',
          text: 'Describe this image factually for a customer-support agent. Include visible text and relevant details. Do not speculate.'
        },
        {
          type: 'image_url',
          image_url: { url: `data:${item.mime_type};base64,${buffer.toString('base64')}` }
        }
      ],
      { max_tokens: 800, temperature: 1 }
    );
    return {
      description: cleanText(response.content).slice(0, maxDescription),
      interpretation_status: 'completed',
      interpreted_at: new Date(),
      interpretation_model: model
    };
  }

  toMedia(file) {
    return {
      file_id: file._id,
      type: file.type,
      url: file.s3_key,
      mime_type: file.mime_type,
      file_size: file.file_size,
      filename: file.original_name,
      stored: file.stored,
      description: file.description,
      interpretation_status: file.interpretation_status,
      interpretation_error: file.interpretation_error,
      interpreted_at: file.interpreted_at,
      interpretation_model: file.interpretation_model
    };
  }
}

module.exports = new AttachmentProcessingService();