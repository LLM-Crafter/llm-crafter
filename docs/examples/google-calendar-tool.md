# Google Calendar Tool

The Google Calendar tool enables AI agents to manage calendar events, check availability, and schedule bookings directly through the Google Calendar API.

## Features

- **Create Events**: Schedule new calendar events with attendees
- **List Events**: Query upcoming or specific time range events
- **Get Event Details**: Retrieve information about specific events
- **Update Events**: Modify existing calendar events
- **Delete Events**: Remove calendar events
- **Find Free Slots**: Discover available time slots for booking

## Prerequisites

### 1. Google Cloud Project Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Configure the OAuth consent screen if prompted
4. Select "Web application" as the application type
5. Add authorized redirect URIs (e.g., `http://localhost:3000/auth/google/callback`)
6. Save your Client ID and Client Secret

### 3. Obtain Access Token

You need to implement OAuth2 flow to get user access tokens. Here's a basic example:

```javascript
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'YOUR_REDIRECT_URI'
);

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar'],
});

// After user authorizes, exchange code for tokens
const { tokens } = await oauth2Client.getToken(authorizationCode);
// Store tokens.access_token and tokens.refresh_token
```

## Usage Examples

### Create a Calendar Event

```javascript
const result = await toolService.executeTool('google_calendar', {
  action: 'create_event',
  access_token: 'YOUR_ACCESS_TOKEN',
  summary: 'Team Meeting',
  description: 'Quarterly planning session',
  location: 'Conference Room A',
  start_time: '2025-11-01T10:00:00-07:00',
  end_time: '2025-11-01T11:00:00-07:00',
  timezone: 'America/Los_Angeles',
  attendees: ['alice@example.com', 'bob@example.com'],
});

console.log(result);
// {
//   success: true,
//   action: 'create_event',
//   event: {
//     id: 'event123',
//     summary: 'Team Meeting',
//     start: '2025-11-01T10:00:00-07:00',
//     end: '2025-11-01T11:00:00-07:00',
//     htmlLink: 'https://calendar.google.com/...',
//     ...
//   },
//   message: 'Event created successfully',
//   execution_time_ms: 423
// }
```

### List Upcoming Events

```javascript
const result = await toolService.executeTool('google_calendar', {
  action: 'list_events',
  access_token: 'YOUR_ACCESS_TOKEN',
  time_min: '2025-10-28T00:00:00Z',
  time_max: '2025-11-04T23:59:59Z',
  max_results: 10,
});

console.log(result);
// {
//   success: true,
//   action: 'list_events',
//   events: [
//     {
//       id: 'event123',
//       summary: 'Team Meeting',
//       start: '2025-11-01T10:00:00-07:00',
//       ...
//     },
//     ...
//   ],
//   total_events: 5,
//   message: 'Found 5 event(s)'
// }
```

### Find Free Time Slots

```javascript
const result = await toolService.executeTool('google_calendar', {
  action: 'find_free_slots',
  access_token: 'YOUR_ACCESS_TOKEN',
  duration_minutes: 60,
  time_min: '2025-10-28T00:00:00Z',
  time_max: '2025-11-01T23:59:59Z',
  timezone: 'America/Los_Angeles',
});

console.log(result);
// {
//   success: true,
//   action: 'find_free_slots',
//   free_slots: [
//     {
//       start: '2025-10-28T09:00:00Z',
//       end: '2025-10-28T10:00:00Z',
//       duration_minutes: 60
//     },
//     {
//       start: '2025-10-28T14:00:00Z',
//       end: '2025-10-28T15:00:00Z',
//       duration_minutes: 60
//     },
//     ...
//   ],
//   total_slots_found: 12,
//   message: 'Found 12 available time slot(s)'
// }
```

### Update an Event

```javascript
const result = await toolService.executeTool('google_calendar', {
  action: 'update_event',
  access_token: 'YOUR_ACCESS_TOKEN',
  event_id: 'event123',
  summary: 'Team Meeting - Updated',
  description: 'Quarterly planning + Q4 review',
  start_time: '2025-11-01T14:00:00-07:00',
  end_time: '2025-11-01T15:00:00-07:00',
});

console.log(result);
// {
//   success: true,
//   action: 'update_event',
//   event: { ... },
//   message: 'Event updated successfully'
// }
```

### Delete an Event

```javascript
const result = await toolService.executeTool('google_calendar', {
  action: 'delete_event',
  access_token: 'YOUR_ACCESS_TOKEN',
  event_id: 'event123',
});

console.log(result);
// {
//   success: true,
//   action: 'delete_event',
//   event_id: 'event123',
//   message: 'Event deleted successfully'
// }
```

### Get Event Details

```javascript
const result = await toolService.executeTool('google_calendar', {
  action: 'get_event',
  access_token: 'YOUR_ACCESS_TOKEN',
  event_id: 'event123',
});

console.log(result);
// {
//   success: true,
//   action: 'get_event',
//   event: {
//     id: 'event123',
//     summary: 'Team Meeting',
//     description: 'Quarterly planning session',
//     location: 'Conference Room A',
//     start: '2025-11-01T10:00:00-07:00',
//     end: '2025-11-01T11:00:00-07:00',
//     attendees: [...],
//     htmlLink: 'https://calendar.google.com/...',
//     status: 'confirmed'
//   },
//   message: 'Event retrieved successfully'
// }
```

## AI Agent Integration

### Agent Configuration

Add the Google Calendar tool to your agent:

```json
{
  "name": "booking_assistant",
  "description": "AI assistant that helps manage calendar bookings",
  "tools": [
    {
      "name": "google_calendar",
      "enabled": true,
      "config": {
        "calendar_id": "primary",
        "timezone": "America/Los_Angeles"
      }
    }
  ]
}
```

### Example: Booking Assistant Agent

```javascript
// Agent system prompt
const systemPrompt = `
You are a professional booking assistant with access to Google Calendar.
You can help users:
- Schedule new appointments and meetings
- Check availability and find free time slots
- Reschedule or cancel existing appointments
- View upcoming events

When scheduling, always:
1. Check for conflicts by listing existing events
2. Find available time slots if needed
3. Confirm details with the user before creating events
4. Include all relevant information (title, time, attendees)

Be proactive in suggesting alternative times if the requested slot is unavailable.
`;

// Example conversation flow
const agent = new Agent({
  name: 'booking_assistant',
  system_prompt: systemPrompt,
  tools: ['google_calendar'],
});

// User: "Can you schedule a 1-hour meeting with John next Monday at 2pm?"
// Agent will:
// 1. Find next Monday's date
// 2. Check if 2pm is available
// 3. Create the event with John as attendee
// 4. Confirm the booking
```

### Example: Multi-step Booking Flow

```javascript
// Agent automatically handles complex booking scenarios

// User: "I need to schedule a 30-minute call with Sarah sometime this week"

// Agent internally:
// Step 1: Find free slots
await toolService.executeTool('google_calendar', {
  action: 'find_free_slots',
  access_token: userAccessToken,
  duration_minutes: 30,
  time_min: startOfWeek,
  time_max: endOfWeek,
});

// Step 2: Present options to user
// "I found several available times this week:
//  - Monday 2:00 PM - 2:30 PM
//  - Tuesday 10:00 AM - 10:30 AM
//  - Wednesday 3:00 PM - 3:30 PM
//  Which time works best for you?"

// Step 3: User selects "Tuesday 10am"

// Step 4: Create the event
await toolService.executeTool('google_calendar', {
  action: 'create_event',
  access_token: userAccessToken,
  summary: 'Call with Sarah',
  start_time: '2025-10-29T10:00:00-07:00',
  end_time: '2025-10-29T10:30:00-07:00',
  attendees: ['sarah@example.com'],
});

// Step 5: Confirm
// "Done! I've scheduled your call with Sarah for Tuesday, October 29 at 10:00 AM.
//  Calendar invitation sent to sarah@example.com."
```

## API Integration

### REST API Usage

```bash
# Execute Google Calendar tool via API
curl -X POST https://your-domain.com/api/tools/execute \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "google_calendar",
    "parameters": {
      "action": "create_event",
      "access_token": "GOOGLE_ACCESS_TOKEN",
      "summary": "Product Demo",
      "start_time": "2025-11-05T15:00:00Z",
      "end_time": "2025-11-05T16:00:00Z"
    }
  }'
```

## Security Considerations

### Access Token Management

- **Never expose access tokens** in client-side code
- Store access tokens securely (encrypted in database)
- Implement token refresh logic using refresh tokens
- Use short-lived access tokens when possible

### Token Refresh Example

```javascript
async function getValidAccessToken(userId) {
  const userTokens = await getUserTokens(userId);

  // Check if token is expired
  if (isTokenExpired(userTokens.access_token)) {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: userTokens.refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    // Store new access token
    await updateUserTokens(userId, credentials.access_token);

    return credentials.access_token;
  }

  return userTokens.access_token;
}
```

### Scopes

Request only the necessary Google Calendar scopes:

- `https://www.googleapis.com/auth/calendar` - Full calendar access
- `https://www.googleapis.com/auth/calendar.readonly` - Read-only access
- `https://www.googleapis.com/auth/calendar.events` - Event management only

## Error Handling

Common errors and solutions:

| Error                 | Cause                           | Solution                              |
| --------------------- | ------------------------------- | ------------------------------------- |
| `Invalid Credentials` | Access token expired or invalid | Refresh the access token              |
| `Not Found`           | Event or calendar doesn't exist | Verify event_id and calendar_id       |
| `Forbidden`           | Insufficient permissions        | Check OAuth scopes                    |
| `Resource Not Found`  | Event already deleted           | Handle gracefully, update local state |
| `Conflict`            | Calendar busy at requested time | Find alternative time slots           |

## Best Practices

### 1. Always Check Availability

Before creating events, check for conflicts:

```javascript
// Check availability first
const events = await toolService.executeTool('google_calendar', {
  action: 'list_events',
  access_token: userToken,
  time_min: requestedStartTime,
  time_max: requestedEndTime,
});

if (events.events.length > 0) {
  // Time slot is busy, suggest alternatives
  const freeSlots = await toolService.executeTool('google_calendar', {
    action: 'find_free_slots',
    duration_minutes: 60,
    // ...
  });
}
```

### 2. Use Descriptive Event Details

```javascript
{
  summary: 'Q4 Planning Meeting', // Clear, concise title
  description: `
    Agenda:
    1. Q3 Review
    2. Q4 Goals
    3. Resource Allocation

    Meeting link: https://meet.google.com/xyz
  `,
  location: 'Conference Room A / Virtual'
}
```

### 3. Handle Timezone Correctly

Always specify timezones explicitly:

```javascript
{
  start_time: '2025-11-01T10:00:00-07:00', // Include timezone offset
  timezone: 'America/Los_Angeles',
}
```

### 4. Implement Retry Logic

```javascript
async function createEventWithRetry(params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await toolService.executeTool('google_calendar', params);
      if (result.success) return result;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

## Limitations

- **Rate Limits**: Google Calendar API has rate limits (quota)
- **Working Hours**: Free slot finding defaults to 9 AM - 5 PM, weekdays
- **Batch Operations**: Currently, events are processed one at a time
- **Recurring Events**: Complex recurrence patterns may need additional handling

## Advanced Features

### Custom Working Hours

Modify the `findFreeSlots` method to use custom working hours:

```javascript
// In agent configuration
{
  "tools": [
    {
      "name": "google_calendar",
      "config": {
        "working_hours": {
          "start": 8,    // 8 AM
          "end": 18,     // 6 PM
          "include_weekends": false
        }
      }
    }
  ]
}
```

### Multiple Calendar Support

```javascript
// List events from multiple calendars
const calendars = ['primary', 'work@example.com', 'team@example.com'];

for (const calendarId of calendars) {
  const result = await toolService.executeTool('google_calendar', {
    action: 'list_events',
    calendar_id: calendarId,
    access_token: userToken,
  });
  // Process results...
}
```

## Troubleshooting

### Token Issues

```bash
# Verify token is valid
curl https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=YOUR_TOKEN
```

### Enable Debug Logging

```javascript
// In toolService.js, add logging
console.log('Google Calendar request:', {
  action,
  calendar_id,
  parameters,
});
```

## Related Documentation

- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [OAuth 2.0 Setup Guide](../features/oauth-setup.md)
- [Custom Tools Guide](./custom-tools.md)
- [Agent Configuration](../concepts/agents.md)

## Support

For issues or questions:

- Check the [FAQ](../features/faq-tool.md)
- Review [API Documentation](../api/tools.md)
- Submit issues on GitHub
