# Organizations API

The Organizations API provides endpoints for managing organizations, which serve as the top-level containers for projects and teams in LLM Crafter.

## Base URL
```
https://your-domain.com/api/organizations
```

## Authentication
All endpoints require authentication via JWT token or API key.

**Headers:**
```
Authorization: Bearer {jwt_token}
# OR
X-API-Key: {api_key}
```

## Endpoints

### List Organizations

Get all organizations the authenticated user has access to.

```http
GET /api/organizations
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": "org_123456",
        "name": "Acme Corp",
        "description": "Main organization for Acme Corp projects",
        "role": "owner",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "member_count": 5,
        "project_count": 3
      },
      {
        "id": "org_789012",
        "name": "Side Projects",
        "description": "Personal projects and experiments",
        "role": "member",
        "created_at": "2024-01-10T14:20:00Z",
        "updated_at": "2024-01-12T09:15:00Z",
        "member_count": 2,
        "project_count": 1
      }
    ],
    "total": 2
  }
}
```

### Create Organization

Create a new organization.

```http
POST /api/organizations
```

**Request Body:**
```json
{
  "name": "My New Organization",
  "description": "Description of the organization"
}
```

**Validation Rules:**
- `name`: Required, minimum 1 character after trimming
- `description`: Optional string

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "org_345678",
      "name": "My New Organization",
      "description": "Description of the organization",
      "created_at": "2024-01-15T11:30:00Z",
      "updated_at": "2024-01-15T11:30:00Z",
      "members": [
        {
          "user": {
            "id": "user_123",
            "name": "John Doe",
            "email": "john@example.com"
          },
          "role": "owner",
          "joined_at": "2024-01-15T11:30:00Z"
        }
      ]
    }
  }
}
```

### Get Organization

Get details of a specific organization.

```http
GET /api/organizations/{organization_id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "org_123456",
      "name": "Acme Corp",
      "description": "Main organization for Acme Corp projects",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "members": [
        {
          "user": {
            "id": "user_123",
            "name": "John Doe",
            "email": "john@example.com"
          },
          "role": "owner",
          "joined_at": "2024-01-15T10:30:00Z"
        },
        {
          "user": {
            "id": "user_456",
            "name": "Jane Smith",
            "email": "jane@example.com"
          },
          "role": "admin",
          "joined_at": "2024-01-16T09:15:00Z"
        }
      ],
      "projects": [
        {
          "id": "proj_789",
          "name": "Customer Support Bot",
          "description": "AI-powered customer support system"
        }
      ],
      "stats": {
        "total_projects": 3,
        "total_agents": 12,
        "total_executions": 1456
      }
    }
  }
}
```

### Update Organization

Update an organization's details.

```http
PUT /api/organizations/{organization_id}
```

**Request Body:**
```json
{
  "name": "Updated Organization Name",
  "description": "Updated description"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "org_123456",
      "name": "Updated Organization Name",
      "description": "Updated description",
      "updated_at": "2024-01-15T12:30:00Z"
    }
  }
}
```

### Delete Organization

Delete an organization and all its associated data.

```http
DELETE /api/organizations/{organization_id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Organization deleted successfully"
}
```

**Note:** This operation permanently deletes the organization, all its projects, agents, and associated data. Only organization owners can perform this action.

## Member Management

### List Members

Get all members of an organization.

```http
GET /api/organizations/{organization_id}/members
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "members": [
      {
        "user": {
          "id": "user_123",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "role": "owner",
        "joined_at": "2024-01-15T10:30:00Z",
        "permissions": [
          "organization:manage",
          "projects:manage",
          "agents:manage"
        ]
      },
      {
        "user": {
          "id": "user_456",
          "name": "Jane Smith",
          "email": "jane@example.com"
        },
        "role": "admin",
        "joined_at": "2024-01-16T09:15:00Z",
        "permissions": [
          "projects:manage",
          "agents:manage"
        ]
      }
    ],
    "total": 2
  }
}
```

### Invite Member

Invite a new member to the organization.

```http
POST /api/organizations/{organization_id}/members
```

**Request Body:**
```json
{
  "email": "newmember@example.com",
  "role": "member",
  "message": "Welcome to our organization!"
}
```

**Available Roles:**
- `owner`: Full organization control
- `admin`: Manage projects and members
- `member`: Access assigned projects
- `viewer`: Read-only access

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "invitation": {
      "id": "inv_123456",
      "email": "newmember@example.com",
      "role": "member",
      "invited_by": "user_123",
      "created_at": "2024-01-15T13:30:00Z",
      "expires_at": "2024-01-22T13:30:00Z",
      "status": "pending"
    }
  },
  "message": "Invitation sent successfully"
}
```

### Update Member Role

Update a member's role in the organization.

```http
PUT /api/organizations/{organization_id}/members/{user_id}
```

**Request Body:**
```json
{
  "role": "admin"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "member": {
      "user": {
        "id": "user_456",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "role": "admin",
      "updated_at": "2024-01-15T14:30:00Z"
    }
  }
}
```

### Remove Member

Remove a member from the organization.

```http
DELETE /api/organizations/{organization_id}/members/{user_id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Member removed successfully"
}
```

## Organization Statistics

### Get Usage Statistics

Get usage statistics for an organization.

```http
GET /api/organizations/{organization_id}/stats
```

**Query Parameters:**
- `period` (optional): `day`, `week`, `month`, `year` (default: `month`)
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "period": "month",
      "start_date": "2024-01-01T00:00:00Z",
      "end_date": "2024-01-31T23:59:59Z",
      "totals": {
        "projects": 3,
        "agents": 12,
        "executions": 1456,
        "api_calls": 3420,
        "tokens_used": 156789
      },
      "daily_breakdown": [
        {
          "date": "2024-01-01",
          "executions": 45,
          "api_calls": 112,
          "tokens_used": 5234
        }
      ]
    }
  }
}
```

## Error Handling

### Common Error Responses

**404 Not Found:**
```json
{
  "error": "Organization not found",
  "code": "ORG_NOT_FOUND"
}
```

**403 Forbidden:**
```json
{
  "error": "Insufficient permissions",
  "code": "INSUFFICIENT_PERMISSIONS",
  "required_role": "admin"
}
```

**409 Conflict:**
```json
{
  "error": "Organization name already exists",
  "code": "ORG_NAME_EXISTS"
}
```

**422 Unprocessable Entity:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "name",
      "message": "Name is required"
    }
  ]
}
```

## Usage Examples

### JavaScript/Node.js
```javascript
// Create organization
const createOrgResponse = await fetch('/api/organizations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'My Organization',
    description: 'Organization for my projects'
  })
});

const { data } = await createOrgResponse.json();
const organizationId = data.organization.id;

// Get organization details
const orgResponse = await fetch(`/api/organizations/${organizationId}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### cURL
```bash
# List organizations
curl -X GET "https://api.example.com/api/organizations" \
  -H "Authorization: Bearer {token}"

# Create organization
curl -X POST "https://api.example.com/api/organizations" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Organization","description":"My org description"}'

# Invite member
curl -X POST "https://api.example.com/api/organizations/org_123/members" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"email":"member@example.com","role":"member"}'
```

### Python
```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Create organization
org_data = {
    'name': 'My Organization',
    'description': 'Organization for my projects'
}

response = requests.post(
    'https://api.example.com/api/organizations',
    json=org_data,
    headers=headers
)

organization = response.json()['data']['organization']
```
