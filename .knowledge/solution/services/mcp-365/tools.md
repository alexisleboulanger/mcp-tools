# MCP-365 Tools Reference

## Overview

MCP-365 provides 19 tools for querying Microsoft 365 content via the Graph API.

## Status Tool

### m365_status

Check which M365 capabilities are available with current authentication.

**Use this first** to understand what features you can access.

```json
{
  "name": "m365_status",
  "arguments": {}
}
```

**Response:**
```json
{
  "capabilities": {
    "user": true,
    "mail": false,
    "calendar": false,
    "files": false,
    "sites": true,
    "teams": false,
    "search": false
  },
  "available": [
    "✓ User Profile: Basic user info",
    "✓ SharePoint Sites: m365_sharepoint_sites, m365_sharepoint_search"
  ],
  "unavailable": [
    "✗ Outlook Mail: Requires additional permissions",
    "✗ Calendar: Requires additional permissions"
  ],
  "recommendations": [
    "To access more features:",
    "1. Use Graph Explorer token: https://developer.microsoft.com/graph/graph-explorer",
    "2. Run: node src/token-helper.js refresh"
  ]
}
```

## Search Tools

### m365_search

Unified search across all M365 content (documents, emails, events).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| entityTypes | array | No | Filter: driveItem, message, event |
| maxResults | number | No | Max results (default: 25) |

**Required scopes:** Files.Read.All, Mail.Read, Calendars.Read (at least one)

### m365_search_documents

Search specifically for documents/files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| maxResults | number | No | Max results (default: 25) |

**Required scopes:** Files.Read.All or Sites.Read.All

## SharePoint Tools

### m365_sharepoint_search_sites

Find SharePoint sites by name or keyword.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Site name or keyword |

**Required scopes:** Sites.Read.All

### m365_sharepoint_get_site

Get details about a specific SharePoint site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| siteIdOrUrl | string | Yes | Site ID or full URL |

**Required scopes:** Sites.Read.All

### m365_sharepoint_list_libraries

List document libraries in a SharePoint site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| siteId | string | Yes | Site ID |

**Required scopes:** Sites.Read.All

### m365_sharepoint_search_content

Search within a specific site's content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| siteId | string | Yes | Site ID |
| query | string | Yes | Search query |
| maxResults | number | No | Max results (default: 25) |

**Required scopes:** Sites.Read.All

## Files/OneDrive Tools

### m365_files_my_drive

Get information about user's OneDrive (quota, usage).

**Required scopes:** Files.Read or Files.Read.All

### m365_files_list

List files and folders in OneDrive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | No | Folder path (default: root) |
| maxItems | number | No | Max items (default: 50) |

**Required scopes:** Files.Read or Files.Read.All

### m365_files_get_metadata

Get metadata for a specific file or folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| itemId | string | Yes | Item ID or path |

**Required scopes:** Files.Read or Files.Read.All

### m365_files_read_content

Read text content of a file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| itemId | string | Yes | Item ID or path |

**Required scopes:** Files.Read or Files.Read.All

**Limitation:** Only works for text-based files (txt, md, json, etc.)

## Mail Tools

### m365_mail_search

Search emails by keyword.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| maxResults | number | No | Max results (default: 25) |

**Required scopes:** Mail.Read

### m365_mail_recent

Get recent emails.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| count | number | No | Number of emails (default: 10) |
| folder | string | No | Folder name (default: inbox) |

**Required scopes:** Mail.Read

## Calendar Tools

### m365_calendar_events

Get calendar events in a date range.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startDate | string | Yes | Start date (ISO 8601) |
| endDate | string | Yes | End date (ISO 8601) |
| maxResults | number | No | Max results (default: 50) |

**Required scopes:** Calendars.Read

### m365_calendar_today

Get today's calendar events.

**Required scopes:** Calendars.Read

### m365_calendar_week

Get this week's calendar events.

**Required scopes:** Calendars.Read

## Teams Tools

### m365_teams_list

List Teams the user has joined.

**Required scopes:** Team.ReadBasic.All

### m365_teams_channels

List channels in a Team.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| teamId | string | Yes | Team ID |

**Required scopes:** Channel.ReadBasic.All

### m365_teams_messages

Read messages from a channel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| teamId | string | Yes | Team ID |
| channelId | string | Yes | Channel ID |
| maxMessages | number | No | Max messages (default: 20) |

**Required scopes:** ChannelMessage.Read.All

## Error Handling

When a tool fails due to missing permissions, it returns a helpful error:

```json
{
  "error": "Access denied: This API requires Mail.Read or Mail.ReadWrite permission. Use Graph Explorer token with these scopes or request admin consent.",
  "help": "To resolve this permission issue:\n\n1. Graph Explorer (Quick fix):\n   - Go to https://developer.microsoft.com/graph/graph-explorer\n   - Sign in and consent to: Mail.Read\n   - Copy the access token to your .env file\n\n2. Azure CLI (Limited scopes):\n   - Azure CLI tokens have predefined scopes\n   - Cannot access: Mail, Calendar, Files content\n\n3. Admin Consent (Permanent fix):\n   - Request IT to grant admin consent to your app",
  "requiredPermissions": ["Mail.Read", "Mail.ReadWrite"]
}
```

## Scope Requirements Summary

| Feature | Minimum Scope | Full Access Scope |
|---------|---------------|-------------------|
| User Profile | User.Read | User.Read.All |
| Mail | Mail.Read | Mail.ReadWrite |
| Calendar | Calendars.Read | Calendars.ReadWrite |
| Files | Files.Read | Files.ReadWrite.All |
| Sites | Sites.Read.All | Sites.ReadWrite.All |
| Teams | Team.ReadBasic.All | Team.ReadBasic.All |
| Search | At least one content scope | All content scopes |
