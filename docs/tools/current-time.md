# Current Time Tool

Get the current date and time in various formats and timezones.

## Overview

The Current Time tool provides agents with access to current date and time information in multiple formats and timezones. Useful for time-sensitive operations, scheduling, and timezone conversions.

## Configuration

**Category:** Utility  
**Tool Name:** `current_time`

## Parameters

| Parameter  | Type   | Required | Default | Description                                           |
| ---------- | ------ | -------- | ------- | ----------------------------------------------------- |
| `timezone` | string | No       | `UTC`   | Timezone identifier (e.g., "UTC", "America/New_York") |
| `format`   | string | No       | `iso`   | Output format: `iso`, `unix`, or `human`              |

## Usage Example

```json
{
  "tool_name": "current_time",
  "parameters": {
    "timezone": "America/New_York",
    "format": "human"
  }
}
```

## Response Format

```json
{
  "timestamp": "Thursday, October 3, 2025 at 3:45 PM",
  "timezone": "America/New_York",
  "format": "human",
  "unix_timestamp": 1759647900,
  "iso_string": "2025-10-03T19:45:00.000Z"
}
```

## Output Formats

### ISO Format (`iso`)

Standard ISO 8601 format

```
2025-10-03T19:45:00.000Z
```

### Unix Timestamp (`unix`)

Seconds since January 1, 1970

```
1759647900
```

### Human Readable (`human`)

Natural language format

```
Thursday, October 3, 2025 at 3:45 PM
```

## Supported Timezones

All standard IANA timezone identifiers are supported:

### Common Timezones

- `UTC` - Coordinated Universal Time
- `America/New_York` - Eastern Time
- `America/Los_Angeles` - Pacific Time
- `America/Chicago` - Central Time
- `Europe/London` - British Time
- `Europe/Paris` - Central European Time
- `Asia/Tokyo` - Japan Standard Time
- `Asia/Dubai` - Gulf Standard Time
- `Australia/Sydney` - Australian Eastern Time

## Usage Examples

### Get Current UTC Time

```json
{
  "tool_name": "current_time",
  "parameters": {
    "timezone": "UTC",
    "format": "iso"
  }
}
```

### Get Local Time in Human Format

```json
{
  "tool_name": "current_time",
  "parameters": {
    "timezone": "America/New_York",
    "format": "human"
  }
}
```

### Get Unix Timestamp

```json
{
  "tool_name": "current_time",
  "parameters": {
    "format": "unix"
  }
}
```

## Common Use Cases

- **Timestamps**: Add timestamps to logs and messages
- **Scheduling**: Check current time for scheduling operations
- **Timezone Conversion**: Display time in user's timezone
- **Time-based Logic**: Make decisions based on time of day
- **Audit Trails**: Record when actions occurred
- **Expiry Checks**: Verify if time-based constraints are met

## Best Practices

- **Always Specify Timezone**: Avoid ambiguity by specifying timezone
- **Use ISO for Storage**: ISO format is best for database storage
- **Use Human for Display**: Human format is best for user-facing content
- **Cache Wisely**: Don't call repeatedly; cache when appropriate

## Configuration in Agents

```json
{
  "name": "scheduling_assistant",
  "type": "chatbot",
  "tools": ["current_time"],
  "system_prompt": "You are a scheduling assistant that can check current time..."
}
```

## Error Handling

- **Invalid Timezone**: Returns error for unrecognized timezone identifiers
- **Invalid Format**: Falls back to default format if invalid format specified

## Related Tools

- [Calculator](/tools/calculator) - Perform time-based calculations
- [JSON Processor](/tools/json-processor) - Process time data in JSON format
