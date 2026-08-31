# Conversation Metadata (Third-Party Annotations)

Third-party frontends built on top of llm-crafter can attach arbitrary
key/value data to a conversation and then **filter and sort conversations
server-side** — instead of loading every conversation and filtering in the
browser.

Typical use case: a CRM integration links a conversation to a lead and stores
`lead_priority: "hot"` on it. The CRM inbox UI can then ask llm-crafter for
_only_ the hot-lead conversations, already paginated.

> **This is not `dynamic_context`.** `dynamic_context` is passed to the LLM.
> Conversation metadata is a filtering/reporting aid only and is never seen by
> the agent.

## Authentication

All endpoints on this page use the standard org-member session:

```
Authorization: Bearer <jwt>
```

The caller must be a member of the organization that owns the conversation
(same requirement as the rest of `/api/v1/handoffs`).

## Data model

Every value lives under a **namespace** so different integrations never
overwrite each other's keys:

```json
"external_metadata": {
  "acme-crm":    { "lead_priority": "hot", "lead_score": 82, "vip": true },
  "zendesk":     { "ticket_id": "ZD-4471" }
}
```

- **Namespace** – supplied per request in the body as `namespace`
  (slug: lowercase `a-z`, `0-9`, `_`, `-`, max 64 chars). Defaults to
  `internal` when omitted. Pick one stable namespace per integration.
- **Keys** – `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$`
- **Values** – string (≤ 1024 chars), finite number, or boolean.
  `null` deletes the key.
- **Limits** – 100 keys per namespace per conversation; 25 metadata filter
  params per list request.

`external_metadata` is included on every conversation object returned by the
list and detail endpoints.

## Write metadata

```
PATCH /api/v1/handoffs/organizations/:orgId/conversations/:conversationId/metadata
```

**Body**

| field       | type    | notes                                                                                       |
| ----------- | ------- | ------------------------------------------------------------------------------------------- |
| `values`    | object  | **required.** `{ "<key>": <string \| number \| boolean \| null> }`                          |
| `namespace` | string  | optional. Namespace to write into. Defaults to `internal`.                                  |
| `replace`   | boolean | optional. When `true`, keys in the namespace missing from `values` are removed (full sync). |

Writes are a **merge** by default — keys you don't mention are left untouched.

### Example – merge

```http
PATCH /api/v1/handoffs/organizations/org_1/conversations/conv_9/metadata
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "namespace": "acme-crm",
  "values": { "lead_priority": "hot", "lead_score": 82, "old_field": null }
}
```

### Response

```json
{
  "success": true,
  "conversation_id": "conv_9",
  "namespace": "acme-crm",
  "changed": {
    "namespace": "acme-crm",
    "updated": ["lead_priority", "lead_score"],
    "removed": ["old_field"],
    "key_count": 2
  },
  "external_metadata": {
    "acme-crm": { "lead_priority": "hot", "lead_score": 82 }
  }
}
```

### Errors

| Status | Cause                                                        |
| ------ | ------------------------------------------------------------ |
| `400`  | `values` missing or not an object                            |
| `403`  | caller is not a member of the organization                   |
| `404`  | conversation not found in this organization                  |
| `422`  | invalid key/value/namespace, or namespace over the key limit |

## Filter the conversation list

```
GET /api/v1/handoffs/organizations/:orgId/conversations
```

Existing query params (`page`, `limit`, `status`, `channel`, `archived`,
`conversationIds`) are unchanged. Add `meta.<namespace>.<key>` params to filter
by annotations — multiple params are ANDed together.

| Query                                  | Meaning                               |
| -------------------------------------- | ------------------------------------- |
| `meta.acme-crm.lead_priority=hot`      | equals                                |
| `meta.acme-crm.lead_priority[ne]=cold` | not equal                             |
| `meta.acme-crm.stage[in]=demo,trial`   | in list                               |
| `meta.acme-crm.stage[nin]=lost,won`    | not in list                           |
| `meta.acme-crm.lead_score[gte]=50`     | `gt` / `gte` / `lt` / `lte` (numeric) |
| `meta.acme-crm.owner[exists]=true`     | key present / absent                  |

### Example

```http
GET /api/v1/handoffs/organizations/org_1/conversations?meta.acme-crm.lead_priority=hot&meta.acme-crm.lead_score[gte]=50&page=1&limit=20
Authorization: Bearer <jwt>
```

Response shape is unchanged from the existing list endpoint (`conversations` +
`pagination`); every conversation carries its `external_metadata`.

An unknown operator or a malformed `meta.*` param returns `400` with a
`details` array naming the offending filters.

Sorting by a metadata value is not supported yet — results keep the default
`metadata.last_activity` descending order.

## Reading metadata back

No dedicated read endpoint is needed — `external_metadata` is returned by:

- `GET /api/v1/handoffs/organizations/:orgId/conversations` (list)
- `GET /api/v1/handoffs/conversations/:conversationId` (detail)

## Indexing notes

Values are stored with the attribute pattern
(`external_attributes: [{ ns, key, s, n, b }]`) and backed by compound indexes
`{ agent, external_attributes.ns, external_attributes.key, external_attributes.s|n }`,
so filters stay within the organization scoping during the index scan.
