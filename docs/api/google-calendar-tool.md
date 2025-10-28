# Google Calendar Tool API Reference

## Tool Definition

**Name:** `google_calendar`  
**Category:** `communication`  
**Type:** System Tool (Internal)

## Actions

### create_event

Create a new calendar event.

**Required Parameters:**

- `action`: `"create_event"`
- `access_token`: Google OAuth2 access token
- `summary`: Event title
- `start_time`: ISO 8601 datetime (e.g., `"2025-11-01T10:00:00-07:00"`)
- `end_time`: ISO 8601 datetime

**Optional Parameters:**

- `calendar_id`: Calendar ID (default: `"primary"`)
- `description`: Event description
- `location`: Event location
- `timezone`: Timezone (default: `"UTC"`)
- `attendees`: Array of email addresses

**Returns:**

```javascript
{
  success: true,
  action: "create_event",
  event: {
    id: "event123",
    summary: "Team Meeting",
    start: "2025-11-01T10:00:00-07:00",
    end: "2025-11-01T11:00:00-07:00",
    htmlLink: "https://calendar.google.com/...",
    // ... more fields
  },
  message: "Event created successfully",
  execution_time_ms: 423
}
```

---

### list_events

List calendar events in a time range.

**Required Parameters:**

- `action`: `"list_events"`
- `access_token`: Google OAuth2 access token

**Optional Parameters:**

- `calendar_id`: Calendar ID (default: `"primary"`)
- `time_min`: ISO 8601 datetime (default: now)
- `time_max`: ISO 8601 datetime
- `max_results`: Number (default: 10, max: 250)

**Returns:**

```javascript
{
  success: true,
  action: "list_events",
  events: [
    {
      id: "event123",
      summary: "Team Meeting",
      start: "2025-11-01T10:00:00-07:00",
      // ... more fields
    }
  ],
  total_events: 5,
  message: "Found 5 event(s)"
}
```

---

### get_event

Get details of a specific event.

**Required Parameters:**

- `action`: `"get_event"`
- `access_token`: Google OAuth2 access token
- `event_id`: Event ID

**Optional Parameters:**

- `calendar_id`: Calendar ID (default: `"primary"`)

**Returns:**

```javascript
{
  success: true,
  action: "get_event",
  event: {
    id: "event123",
    summary: "Team Meeting",
    description: "...",
    location: "...",
    start: "2025-11-01T10:00:00-07:00",
    end: "2025-11-01T11:00:00-07:00",
    attendees: [...],
    htmlLink: "https://calendar.google.com/...",
    status: "confirmed"
  },
  message: "Event retrieved successfully"
}
```

---

### update_event

Update an existing event.

**Required Parameters:**

- `action`: `"update_event"`
- `access_token`: Google OAuth2 access token
- `event_id`: Event ID

**Optional Parameters:**

- `calendar_id`: Calendar ID (default: `"primary"`)
- `summary`: New event title
- `description`: New event description
- `location`: New event location
- `start_time`: New start time (ISO 8601)
- `end_time`: New end time (ISO 8601)
- `timezone`: Timezone
- `attendees`: Array of email addresses

**Returns:**

```javascript
{
  success: true,
  action: "update_event",
  event: { /* updated event data */ },
  message: "Event updated successfully"
}
```

---

### delete_event

Delete an event.

**Required Parameters:**

- `action`: `"delete_event"`
- `access_token`: Google OAuth2 access token
- `event_id`: Event ID

**Optional Parameters:**

- `calendar_id`: Calendar ID (default: `"primary"`)

**Returns:**

```javascript
{
  success: true,
  action: "delete_event",
  event_id: "event123",
  message: "Event deleted successfully"
}
```

---

### find_free_slots

Find available time slots for booking.

**Required Parameters:**

- `action`: `"find_free_slots"`
- `access_token`: Google OAuth2 access token
- `duration_minutes`: Duration for each slot (minimum: 15)

**Optional Parameters:**

- `calendar_id`: Calendar ID (default: `"primary"`)
- `time_min`: ISO 8601 datetime (default: now)
- `time_max`: ISO 8601 datetime (default: 7 days from now)
- `timezone`: Timezone (default: `"UTC"`)

**Returns:**

```javascript
{
  success: true,
  action: "find_free_slots",
  free_slots: [
    {
      start: "2025-10-28T09:00:00Z",
      end: "2025-10-28T10:00:00Z",
      duration_minutes: 60
    },
    // ... more slots
  ],
  total_slots_found: 12,
  duration_minutes: 60,
  timezone: "America/Los_Angeles",
  message: "Found 12 available time slot(s)"
}
```

**Note:** Free slot finding uses working hours (9 AM - 5 PM, weekdays by default).

---

## Error Handling

All actions return an error response on failure:

```javascript
{
  success: false,
  action: "create_event",
  error: "Invalid Credentials",
  calendar_id: "primary",
  execution_time_ms: 234
}
```

Common errors:

- `"Invalid Credentials"` - Access token expired or invalid
- `"Not Found"` - Event or calendar doesn't exist
- `"Forbidden"` - Insufficient permissions
- `"Action parameter is required"` - Missing required parameter

## Event Object Structure

```javascript
{
  id: string,              // Event ID
  summary: string,         // Event title
  description: string,     // Event description
  location: string,        // Event location
  start: string,          // ISO 8601 datetime
  end: string,            // ISO 8601 datetime
  timezone: string,       // Timezone name
  attendees: [            // Array of attendees
    {
      email: string,
      responseStatus: string  // 'accepted', 'declined', 'needsAction', 'tentative'
    }
  ],
  htmlLink: string,       // Link to event in Google Calendar
  status: string,         // 'confirmed', 'tentative', 'cancelled'
  created: string,        // ISO 8601 datetime
  updated: string         // ISO 8601 datetime
}
```

## Authentication

All actions require a valid Google OAuth2 access token with calendar permissions.

**Required Scope:**

```
https://www.googleapis.com/auth/calendar
```

**Token Parameters:**

- `access_token` (required): Current access token
- `refresh_token` (optional): For automatic token refresh

## Usage Examples

### JavaScript

```javascript
const toolService = require('./services/toolService');

const result = await toolService.executeTool('google_calendar', {
  action: 'create_event',
  access_token: userAccessToken,
  summary: 'Client Meeting',
  start_time: '2025-11-01T14:00:00-07:00',
  end_time: '2025-11-01T15:00:00-07:00',
  attendees: ['client@example.com'],
});
```

### REST API

```bash
curl -X POST https://your-domain.com/api/tools/execute \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "google_calendar",
    "parameters": {
      "action": "list_events",
      "access_token": "GOOGLE_ACCESS_TOKEN",
      "max_results": 10
    }
  }'
```

### Python

```python
import requests

response = requests.post(
    'https://your-domain.com/api/tools/execute',
    headers={'Authorization': 'Bearer YOUR_API_TOKEN'},
    json={
        'tool_name': 'google_calendar',
        'parameters': {
            'action': 'find_free_slots',
            'access_token': 'GOOGLE_ACCESS_TOKEN',
            'duration_minutes': 30,
        }
    }
)
```

## Rate Limits

Google Calendar API has the following limits (default):

- **Queries per day:** 1,000,000
- **Queries per 100 seconds per user:** 5,000

The tool automatically handles rate limiting through Google's API client.

## See Also

- [Full Documentation](../docs/examples/google-calendar-tool.md)
- [Setup Guide](../docs/features/oauth-setup.md)
- [Code Examples](../examples/google-calendar-example.js)
