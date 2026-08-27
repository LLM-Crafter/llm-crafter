# File Uploads & Media Storage

This document describes how to upload files to attach to chat messages and how to configure S3 storage for your organization.

---

## Table of Contents

1. [Configuring S3 Media Storage](#configuring-s3-media-storage)
2. [Uploading Files](#uploading-files)
3. [Sending Messages with Attachments](#sending-messages-with-attachments)
4. [Complete Flow Example](#complete-flow-example)

---

## Configuring S3 Media Storage

Before files can be uploaded, the organization must have S3 credentials configured. This is set on the Organization document.

### Update Organization Media Storage

```http
PUT /api/v1/organizations/{orgId}
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "media_storage": {
    "enabled": true,
    "credentials": {
      "access_key_id": "AKIAIOSFODNN7EXAMPLE",
      "secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "region": "eu-west-1",
      "bucket": "my-org-media-bucket",
      "endpoint": null
    },
    "base_path": "media",
    "max_file_size_mb": 10,
    "allowed_mime_types": [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "audio/ogg",
      "audio/mpeg",
      "video/mp4"
    ]
  }
}
```

**Fields:**

| Field                           | Type     | Required | Description                                                                   |
| ------------------------------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `enabled`                       | boolean  | Yes      | Enable/disable media storage                                                  |
| `credentials.access_key_id`     | string   | Yes      | AWS (or S3-compatible) access key ID                                          |
| `credentials.secret_access_key` | string   | Yes      | AWS secret access key (encrypted at rest)                                     |
| `credentials.region`            | string   | No       | AWS region (default: `us-east-1`)                                             |
| `credentials.bucket`            | string   | Yes      | S3 bucket name                                                                |
| `credentials.endpoint`          | string   | No       | Custom endpoint for S3-compatible services (MinIO, DigitalOcean Spaces, etc.) |
| `base_path`                     | string   | No       | Prefix inside the bucket (default: empty)                                     |
| `max_file_size_mb`              | number   | No       | Max file size in MB (default: `10`)                                           |
| `allowed_mime_types`            | string[] | No       | Allowed MIME types (supports wildcards like `image/*`)                        |

**S3-Compatible Providers:**

For non-AWS providers, set the `endpoint` field:

```json
{
  "credentials": {
    "endpoint": "https://nyc3.digitaloceanspaces.com",
    "region": "nyc3",
    "bucket": "my-space-name",
    "access_key_id": "...",
    "secret_access_key": "..."
  }
}
```

Works with: AWS S3, DigitalOcean Spaces, MinIO, Backblaze B2, Cloudflare R2.

---

## Uploading Files

Upload one or more files to get file IDs that can be referenced in a chat message.

### Endpoint

```http
POST /api/v1/external/agents/upload
X-Session-Token: <session-token>
Content-Type: multipart/form-data
```

### Request

Send files using the `files` form field. Up to **5 files** per request.

```bash
curl -X POST https://your-api.com/api/v1/external/agents/upload \
  -H "X-Session-Token: st_abc123..." \
  -F "files=@photo.jpg" \
  -F "files=@receipt.pdf"
```

### Response (200 OK)

```json
{
  "files": [
    {
      "file_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "original_name": "photo.jpg",
      "type": "image",
      "mime_type": "image/jpeg",
      "file_size": 245760,
      "stored": true
    },
    {
      "file_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "original_name": "receipt.pdf",
      "type": "document",
      "mime_type": "application/pdf",
      "file_size": 102400,
      "stored": true
    }
  ],
  "uploaded": 2,
  "total": 2
}
```

### Error Cases

**No S3 configured (400):**

```json
{
  "error": "File uploads are not configured for this organization",
  "code": "MEDIA_STORAGE_NOT_CONFIGURED"
}
```

**File too large or wrong type (partial success):**

```json
{
  "files": [
    {
      "file_id": "f47ac10b-...",
      "original_name": "photo.jpg",
      "stored": true
    },
    {
      "original_name": "video.avi",
      "error": "File type video/x-msvideo is not allowed",
      "code": "MIME_TYPE_NOT_ALLOWED"
    }
  ],
  "uploaded": 1,
  "total": 2
}
```

### Limits

| Limit                 | Value                                 |
| --------------------- | ------------------------------------- |
| Max files per request | 5                                     |
| Max file size         | Configured per org (default 10 MB)    |
| File expiration       | 24 hours if not attached to a message |

---

## Sending Messages with Attachments

After uploading, reference the file IDs in your chat message.

### Non-Streaming Chat

```http
POST /api/v1/external/agents/chat
X-Session-Token: <session-token>
Content-Type: application/json
```

```json
{
  "message": "Here is my receipt for the refund request",
  "conversationId": "conv_456",
  "files": ["f47ac10b-58cc-4372-a567-0e02b2c3d479"]
}
```

### Streaming Chat

```http
POST /api/v1/external/agents/chat/stream
X-Session-Token: <session-token>
Content-Type: application/json
```

```json
{
  "message": "Can you check this document?",
  "files": ["9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"]
}
```

### API Key Chat

```http
POST /api/v1/external/organizations/{orgId}/projects/{projectId}/agents/{agentId}/chat
X-API-Key: <api-key>
Content-Type: application/json
```

```json
{
  "message": "Attached the screenshot",
  "userIdentifier": "user_123",
  "files": ["f47ac10b-58cc-4372-a567-0e02b2c3d479"]
}
```

### How Attachments Appear in Conversations

Files are stored in the message's `channel_info.media` field:

```json
{
  "role": "user",
  "content": "Here is my receipt for the refund request",
  "channel_info": {
    "channel": "website",
    "media": [
      {
        "type": "image",
        "url": "media/org_123/agent_456/uploads/f47ac10b.jpg",
        "mime_type": "image/jpeg",
        "file_size": 245760,
        "filename": "photo.jpg",
        "stored": true
      }
    ]
  }
}
```

The `url` field is an **S3 key** — not a direct URL. Use the presigned URL endpoint to get a temporary viewable link (useful for operator dashboards).

Attachment media also includes one-time interpretation fields:

```json
{
  "file_id": "f47ac10b-...",
  "description": "Invoice 2026-104 for EUR 42, due September 15.",
  "interpretation_status": "completed",
  "interpretation_model": "gpt-4.1-mini",
  "interpreted_at": "2026-08-27T12:00:00.000Z"
}
```

PDF and DOCX text is extracted locally and summarized by a model once. The
summary is persisted as the attachment description, while bounded extracted
text remains on the file record for audit or future reprocessing. Only the
stored summary is added to agent context on later turns; the full document and
binary are not resent to the model. Images can similarly be described once by
a configured vision-capable model.

Configure this on the agent:

```json
{
  "config": {
    "attachment_processing": {
      "enabled": true,
      "extract_documents": true,
      "summarize_documents": true,
      "document_model": "gpt-4.1-mini",
      "interpret_images": true,
      "image_model": "gpt-4.1-mini",
      "max_extracted_chars": 20000,
      "max_description_chars": 4000
    }
  }
}
```

`document_model` and `image_model` must be available from the same provider/API
key selected for the agent. When `document_model` is omitted, document summaries
use the agent's normal `llm_settings.model`. Set `summarize_documents` to `false`
to use a bounded text excerpt instead, or `interpret_images` to `false` to store
images without invoking a model.

---

## Complete Flow Example

### JavaScript (Browser)

```javascript
const sessionToken = 'st_abc123...';
const apiUrl = 'https://your-api.com/api/v1/external';

// Step 1: Upload the file
const formData = new FormData();
formData.append('files', fileInput.files[0]);

const uploadResponse = await fetch(`${apiUrl}/agents/upload`, {
  method: 'POST',
  headers: { 'X-Session-Token': sessionToken },
  body: formData,
});

const { files } = await uploadResponse.json();
const fileIds = files.filter(f => f.stored).map(f => f.file_id);

// Step 2: Send message with file references
const chatResponse = await fetch(`${apiUrl}/agents/chat`, {
  method: 'POST',
  headers: {
    'X-Session-Token': sessionToken,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'Here is the document you asked for',
    files: fileIds,
  }),
});

const result = await chatResponse.json();
console.log(result.response);
```

---

## Notes

- **Backward compatible**: The `files` field is optional. Existing clients that don't send it continue to work unchanged.
- **Agent vision**: Image interpretation is opt-in and runs once when a file is attached. Later turns use the persisted description.
- **Human operators**: When viewing conversations via the handoff API, operators see the full `channel_info.media` array with S3 keys. Generate presigned URLs to render images in your operator dashboard.
- **WhatsApp/Telegram**: Media from these channels is handled automatically by the channel orchestrator — no client-side upload needed.
