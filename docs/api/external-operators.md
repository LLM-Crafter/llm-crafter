# External Operator API

All endpoints require authentication (`Authorization: Bearer <token>`) and the caller must be a member of the specified organization.

---

## PUT `/organizations/:orgId/projects/:projectId/operators`

Register a new external operator or update an existing one (matched by `external_id` within the project).

### Request

**Path parameters**

| Parameter   | Description     |
| ----------- | --------------- |
| `orgId`     | Organization ID |
| `projectId` | Project ID      |

**Body**

| Field         | Type     | Required | Description                                                  |
| ------------- | -------- | -------- | ------------------------------------------------------------ |
| `external_id` | string   | yes      | Your system's unique identifier for this operator            |
| `name`        | string   | yes      | Display name                                                 |
| `email`       | string   | no       | Operator email address                                       |
| `avatar_url`  | string   | no       | URL to the operator's avatar image                           |
| `skills`      | string[] | no       | Routing tags (e.g. `["billing", "technical"]`)               |
| `status`      | string   | no       | `"online"` \| `"offline"` \| `"busy"` (default: `"offline"`) |
| `metadata`    | object   | no       | Arbitrary key/value data from your system                    |

```json
{
  "external_id": "op-42",
  "name": "Alice Martin",
  "email": "alice@example.com",
  "avatar_url": "https://cdn.example.com/avatars/alice.png",
  "skills": ["billing", "technical"],
  "status": "online",
  "metadata": { "department": "support", "tier": 2 }
}
```

### Response

**200 OK**

```json
{
  "success": true,
  "operator": {
    "_id": "550e8400-e29b-41d4-a716-446655440000",
    "external_id": "op-42",
    "name": "Alice Martin",
    "email": "alice@example.com",
    "avatar_url": "https://cdn.example.com/avatars/alice.png",
    "organization": "org_abc123",
    "project": "proj_xyz789",
    "skills": ["billing", "technical"],
    "status": "online",
    "metadata": { "department": "support", "tier": 2 },
    "created_at": "2026-05-01T10:00:00.000Z",
    "updated_at": "2026-05-01T10:00:00.000Z"
  }
}
```

**400 Bad Request** — `external_id` or `name` missing

```json
{ "error": "external_id and name are required" }
```

**500 Internal Server Error**

```json
{ "error": "Failed to upsert external operator" }
```

---

## GET `/organizations/:orgId/projects/:projectId/operators`

List all external operators registered for a project, optionally filtered by status or skill.

### Request

**Path parameters**

| Parameter   | Description     |
| ----------- | --------------- |
| `orgId`     | Organization ID |
| `projectId` | Project ID      |

**Query parameters**

| Parameter | Type   | Description                                      |
| --------- | ------ | ------------------------------------------------ |
| `status`  | string | Filter by status: `online`, `offline`, or `busy` |
| `skill`   | string | Filter to operators who have this skill tag      |

```
GET /organizations/org_abc123/projects/proj_xyz789/operators?status=online&skill=billing
```

### Response

**200 OK** — results are sorted by `updated_at` descending

```json
{
  "success": true,
  "operators": [
    {
      "_id": "550e8400-e29b-41d4-a716-446655440000",
      "external_id": "op-42",
      "name": "Alice Martin",
      "email": "alice@example.com",
      "avatar_url": "https://cdn.example.com/avatars/alice.png",
      "organization": "org_abc123",
      "project": "proj_xyz789",
      "skills": ["billing", "technical"],
      "status": "online",
      "metadata": { "department": "support", "tier": 2 },
      "created_at": "2026-05-01T10:00:00.000Z",
      "updated_at": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

**500 Internal Server Error**

```json
{ "error": "Failed to list operators" }
```

---

## PATCH `/organizations/:orgId/projects/:projectId/operators/:externalId/status`

Update the availability status of a single external operator.

### Request

**Path parameters**

| Parameter    | Description                                   |
| ------------ | --------------------------------------------- |
| `orgId`      | Organization ID                               |
| `projectId`  | Project ID                                    |
| `externalId` | The operator's `external_id` (your system ID) |

**Body**

| Field    | Type   | Required | Description                           |
| -------- | ------ | -------- | ------------------------------------- |
| `status` | string | yes      | `"online"` \| `"offline"` \| `"busy"` |

```json
{ "status": "busy" }
```

### Response

**200 OK**

```json
{
  "success": true,
  "operator": {
    "_id": "550e8400-e29b-41d4-a716-446655440000",
    "external_id": "op-42",
    "name": "Alice Martin",
    "email": "alice@example.com",
    "avatar_url": "https://cdn.example.com/avatars/alice.png",
    "organization": "org_abc123",
    "project": "proj_xyz789",
    "skills": ["billing", "technical"],
    "status": "busy",
    "metadata": { "department": "support", "tier": 2 },
    "created_at": "2026-05-01T10:00:00.000Z",
    "updated_at": "2026-05-01T10:05:00.000Z"
  }
}
```

**400 Bad Request** — invalid status value

```json
{ "error": "Status must be online, offline, or busy" }
```

**404 Not Found** — no operator with that `externalId` in the project

```json
{ "error": "Operator not found" }
```

**500 Internal Server Error**

```json
{ "error": "Failed to update operator status" }
```
