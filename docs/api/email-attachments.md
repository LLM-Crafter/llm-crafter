# Outbound Email Attachments

Outbound email attachments use a two-step workflow:

1. Upload the files to the mail account and collect their `file_id` values.
2. Pass those IDs as `attachment_file_ids` when composing or sending an email.

The API stores file binaries in the organization's S3-compatible media storage. Outbound email records contain immutable file metadata, not the binary data itself.

## Requirements

All endpoints in this document:

- Are mounted under `/api/v1`.
- Require `Authorization: Bearer <jwt>`.
- Require at least the organization `member` role.
- Require media storage to be enabled and configured for the organization.
- Accept at most five attachments per email.
- Require every attachment to belong to the same organization and agent as the mail account.

The upload middleware accepts at most five files per request and has a hard limit of 10 MB per file. The organization's `media_storage.max_file_size_mb` and `allowed_mime_types` settings may impose stricter limits.

## Upload Attachments

```http
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts/{accountId}/attachments
Authorization: Bearer <jwt>
Content-Type: multipart/form-data
```

Add each file using the multipart field name `files`.

### cURL example

```bash
curl -X POST \
  "$API/api/v1/organizations/$ORG/projects/$PROJECT/agents/$AGENT/mail-accounts/$ACCOUNT/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@./invoice.pdf" \
  -F "files=@./terms.docx"
```

### JavaScript example

```js
const formData = new FormData();
formData.append('files', invoiceFile);
formData.append('files', termsFile);

const response = await fetch(
  `${api}/api/v1/organizations/${orgId}/projects/${projectId}` +
    `/agents/${agentId}/mail-accounts/${accountId}/attachments`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }
);

const result = await response.json();
const attachmentFileIds = result.files
  .filter(file => file.file_id)
  .map(file => file.file_id);
```

Do not set the multipart `Content-Type` header manually in browser code. The browser adds the required boundary.

### Successful response

```json
{
  "files": [
    {
      "file_id": "ec916a43-2d9e-45b9-b18a-833247e5ca77",
      "original_name": "invoice.pdf",
      "type": "document",
      "mime_type": "application/pdf",
      "file_size": 48219,
      "stored": true
    }
  ],
  "uploaded": 1,
  "total": 1
}
```

An HTTP `200` means at least one file was uploaded. When uploading multiple files, inspect every entry in `files`: rejected files appear in the same array with `error` and `code` instead of `file_id`.

Common error codes include:

| Code                           | Meaning                                               |
| ------------------------------ | ----------------------------------------------------- |
| `MEDIA_STORAGE_NOT_CONFIGURED` | Organization media storage is disabled or incomplete. |
| `MIME_TYPE_NOT_ALLOWED`        | The organization does not allow this MIME type.       |
| `FILE_TOO_LARGE`               | The file exceeds the organization limit.              |
| `UPLOAD_FAILED`                | Storage failed for this file.                         |

## Send a Manual Email With Attachments

Manual email composition is scoped to an existing email conversation:

```http
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts/{accountId}/threads/{conversationId}/send
Content-Type: application/json
```

Upload the files first, then include their IDs:

```json
{
  "text": "Hi Alice, the requested documents are attached.",
  "html": "<p>Hi Alice, the requested documents are attached.</p>",
  "attachment_file_ids": [
    "ec916a43-2d9e-45b9-b18a-833247e5ca77",
    "725d962d-e7bb-4390-9fe7-61f6a4e55361"
  ],
  "send": true
}
```

Set `send` to:

- `true` to create the outbound email in `queued` state for delivery.
- `false`, or omit it, to create an editable draft in `drafted` state.

Other supported fields are `subject`, `to`, `cc`, `bcc`, and `add_to_conversation`. The `text` field is required. When `to` is omitted, the API replies to the conversation's sender.

The response is the created outbound email. Its `attachments` array contains the durable attachment metadata:

```json
{
  "state": "queued",
  "attachments": [
    {
      "file_id": "ec916a43-2d9e-45b9-b18a-833247e5ca77",
      "s3_key": "media/org-id/agent-id/uploads/file.pdf",
      "filename": "invoice.pdf",
      "mime_type": "application/pdf",
      "file_size": 48219
    }
  ]
}
```

## Add or Replace Attachments on a Draft

Update a draft with:

```http
PUT /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts/{accountId}/outbound/{outboundId}
Content-Type: application/json
```

```json
{
  "text": "Updated message text.",
  "attachment_file_ids": ["ec916a43-2d9e-45b9-b18a-833247e5ca77"]
}
```

Attachment update semantics are:

| Request value             | Result                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| Field omitted             | Keep the draft's current attachments.                                          |
| `attachment_file_ids: []` | Remove all attachments.                                                        |
| Non-empty array           | Replace all current attachments with the listed files, preserving their order. |

For Gmail and Outlook accounts, updating the draft also synchronizes its provider-native draft. The matching conversation message is updated with the same attachment metadata.

Only outbound emails in `drafted` state can be updated.

## Send a Draft With Attachments

A draft can receive its final attachment selection at send time:

```http
POST /api/v1/organizations/{orgId}/projects/{projectId}/agents/{agentId}/mail-accounts/{accountId}/outbound/{outboundId}/send
Content-Type: application/json
```

```json
{
  "attachment_file_ids": ["ec916a43-2d9e-45b9-b18a-833247e5ca77"]
}
```

The same replacement semantics apply:

- Omit `attachment_file_ids` to send the attachments already stored on the draft.
- Send an empty array to remove all attachments before sending.
- Send a non-empty array to replace the current attachments before sending.

The send operation atomically changes the outbound state from `drafted` to `queued`. Optional `cc` and `bcc` values can be included in the same request.

### Complete draft workflow

```js
const uploadResult = await uploadEmailAttachments(files);
const attachmentFileIds = uploadResult.files
  .filter(file => file.file_id)
  .map(file => file.file_id);

await fetch(`${outboundUrl}/${outboundId}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'The requested documents are attached.',
    attachment_file_ids: attachmentFileIds,
  }),
});

await fetch(`${outboundUrl}/${outboundId}/send`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
});
```

The second request omits `attachment_file_ids`, so it retains the files assigned by the preceding update.

## Delivery Behavior

Attachments work with Gmail API delivery, Microsoft Graph, SMTP, and IMAP-backed drafts.

The delivery pipeline resolves each stored file immediately before constructing or uploading the provider message. If a requested file cannot be read or uploaded, delivery fails rather than sending an incomplete email without its attachments.

Uploaded files become permanent when assigned to an outbound email. Removing a file from a later draft revision does not immediately delete the stored upload.
