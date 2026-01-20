# MCP-365: Microsoft 365 Graph API for AI Assistants

> **Model Context Protocol (MCP) server** providing read-only access to Microsoft 365 via Graph API.
> Works with GitHub Copilot, Claude, and any MCP-compatible AI assistant.

[![MCP Version](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=18-brightgreen)](https://nodejs.org)

## Overview

MCP-365 exposes Microsoft 365 content as **25 read-only tools** that AI assistants can call to search, read, and analyze your organization's data:

| Domain | Tools | Description |
|--------|-------|-------------|
| **Search** | 2 | Unified search across all M365 content |
| **SharePoint** | 4 | Sites, document libraries, site search |
| **OneDrive** | 4 | Files, folders, text content |
| **Outlook** | 2 | Email search and recent messages |
| **Calendar** | 3 | Events, today's schedule, weekly view |
| **Teams** | 3 | Teams, channels, channel messages |
| **Recordings** | 4 | Meeting recordings across organization |
| **Transcripts** | 2 | Meeting transcript search and reading |
| **Status** | 1 | Capability detection |

## Features

- **Unified Search** - Search across all M365 content (documents, emails, events)
- **SharePoint** - Browse sites, document libraries, search site content
- **OneDrive** - List files, read text content, get metadata
- **Outlook Mail** - Search emails, get recent messages
- **Calendar** - View events by date range, today's schedule, weekly view
- **Teams** - List teams, channels, read channel messages
- **Meeting Recordings** - Search and access recordings across the organization (uses Files API - no special permissions!)
- **Capability Detection** - Automatically detects available permissions and gracefully degrades

## Quick Start

```bash
# Install dependencies
npm install

# Check token status
npm run token:status

# Refresh token (interactive)
npm run token:refresh

# Start server
npm start
```

## Authentication Options

### Option 1: Graph Explorer Token (Recommended for Testing)

Best for environments with strict admin consent policies. Provides full M365 permissions.

1. Go to [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
2. Sign in with your corporate account
3. Consent to the permissions you need (Files, Mail, Calendar, etc.)
4. Click "Access token" tab and copy the token
5. Run `npm run token:refresh` and paste the token

**Token Helper Commands:**
```bash
npm run token:status   # Show current token status and expiry
npm run token:refresh  # Prompt to enter a new token
```

**Note:** Token expires in ~1 hour. The server will detect expired tokens and tell you which permissions are missing.

### Option 2: Azure CLI (Limited Scopes)

Good for basic user info, groups, and directory operations. Handles login/refresh automatically.

```bash
# Login to your tenant
az login --tenant YOUR_TENANT_ID --allow-no-subscriptions

# Verify
az account show --query "{tenant:tenantId, user:user.name}"
```

Leave `MICROSOFT_ACCESS_TOKEN` empty in `.env` to use Azure CLI.

**Limitation:** Azure CLI tokens don't include Mail.Read, Files.Read, Calendars.Read scopes.
Works for: `/me`, `/users`, `/groups`, `/sites` listing

### Option 3: Custom App with Admin Consent (Full Solution)

For production use, get IT to approve your app registration:

1. Create App Registration in Azure Portal
2. Add required API permissions (see below)
3. Request admin consent from your IT department
4. Use device code flow or client credentials

### Option 4: Client Credentials (App-Only Access)

For service accounts without user context:

1. Create App Registration with client secret
2. Add Application permissions (not Delegated)
3. Grant admin consent
4. Set `MICROSOFT_CLIENT_SECRET` in `.env`

## Why Graph Explorer Has More Access Than Azure CLI

Understanding why authentication methods have different capabilities:

### Microsoft First-Party App Pre-Authorization

| App | Owner | Mail/Calendar/Files | Reason |
|-----|-------|---------------------|--------|
| **Graph Explorer** | Microsoft | ✅ Full access | Pre-authorized by Microsoft for developer testing |
| **Azure CLI** | Microsoft | ❌ Not available | Fixed scopes for Azure infrastructure, not M365 content |
| **Custom App** | You | ❌ Blocked* | Requires admin consent in enterprise tenants |

*Many enterprise tenants require admin consent for ALL unverified (non-Microsoft-published) apps.

### How Graph Explorer Works

Graph Explorer (`de8bc8b5-d9f9-48b1-a8ad-b748da725064`) is special:
- **Published by Microsoft** and pre-verified in all tenants
- **Pre-authorized** for a wide range of Graph API permissions
- **User consent only** - when you consent to `Mail.Read`, you're allowing it to read YOUR mail as YOU
- No admin approval needed because Microsoft already vetted the app

### Why Azure CLI Is Limited

Azure CLI (`04b07795-8ddb-461a-bbee-02f9e1bf7b46`) has a fixed scope set:
- **Designed for Azure resource management** (VMs, storage, etc.)
- **Intentionally excludes personal data APIs** (mail, calendar, files)
- Requesting additional scopes fails with: `AADSTS65002: Consent must be configured via preauthorization`

### Why Custom Apps Are Blocked

Enterprise tenants often have policies like:
> "Admin consent required for all apps not published by Microsoft"

Even permissions that are normally user-consentable (like `Mail.Read`) get blocked for unverified apps.

### Your Options Summary

| Solution | Effort | Access Level | Auto-Refresh |
|----------|--------|--------------|--------------|
| Graph Explorer token | Low | Full | ❌ (1hr expiry) |
| Request admin consent | Medium | Full | ✅ |
| Publish/verify your app | High | Full | ✅ |
| Use Azure CLI only | None | Limited (no mail/files) | ✅ |

## MCP Tool Design Principles

This server follows MCP best practices for tool design:

### 1. Clear, Descriptive Tool Names
```
m365_<domain>_<action>
├── m365_recordings_all      # Domain: recordings, Action: all
├── m365_calendar_today      # Domain: calendar, Action: today
└── m365_sharepoint_search   # Domain: sharepoint, Action: search
```

### 2. Comprehensive Descriptions
Each tool description includes:
- **What it does** - Primary function
- **When to use it** - Use cases and context
- **Dependencies** - Required parameters or prior tool calls
- **Permissions** - Graph API scopes needed

### 3. Well-Defined Input Schemas
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query (e.g., 'Sprint Review', 'Yorizon')"
    },
    "maxResults": {
      "type": "number", 
      "description": "Maximum results to return (1-50)",
      "default": 25
    }
  },
  "required": ["query"]
}
```

### 4. Human-Readable Output
All tools return formatted Markdown:
- Headers for sections
- Tables for structured data
- Code blocks for IDs and URLs
- Helpful hints for next steps

### 5. Graceful Error Handling
```markdown
⚠️ **Permission Denied** - Cannot access mail

This requires `Mail.Read` permission. To fix:
1. Use Graph Explorer token (quick testing)
2. Or request admin consent for your app
```

## Graceful Degradation

The server automatically detects which permissions are available and provides helpful error messages when features are unavailable:

```
Use the m365_status tool to check available capabilities:
- ✓ User Profile: Available
- ✓ SharePoint Sites: Available  
- ✗ Outlook Mail: Requires Mail.Read permission
- ✗ Calendar: Requires Calendars.Read permission
```

When a tool fails due to permissions, it returns guidance on how to fix it rather than just an error.

## Prerequisites

1. **Microsoft Entra ID (Azure AD) App Registration** (Options 3-4)
   - Go to [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps)
   - Create a new App Registration
   - Note the Application (client) ID and Directory (tenant) ID
   - For delegated access: Add redirect URI `http://localhost:3000/auth/callback`
   - Configure API permissions (see below)

2. **API Permissions Required** (for full M365 access)
   - `User.Read` - Sign in and read user profile
   - `Files.Read.All` - Read all files user can access
   - `Sites.Read.All` - Read SharePoint sites
   - `Mail.Read` - Read user mail
   - `Calendars.Read` - Read user calendars
   - `Team.ReadBasic.All` - Read Teams basic info

## Installation

```bash
cd mcp-365
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required: App Registration details
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_TENANT_ID=your-tenant-id

# For app-only access (optional):
MICROSOFT_CLIENT_SECRET=your-secret

# Or for quick testing with a pre-acquired token:
MICROSOFT_ACCESS_TOKEN=your-token
```

## Usage with VS Code / GitHub Copilot

Add to your `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "m365": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/dev/mcp/mcp-365/src/index.js"]
    }
  }
}
```

## Tool Reference

All tools follow MCP best practices:
- **Read-only operations** - No destructive or write operations
- **Permission-aware** - Graceful degradation when permissions are missing
- **Human-readable output** - Formatted Markdown responses

### Status & Diagnostics

| Tool | Description | Parameters |
|------|-------------|------------|
| `m365_status` | Check which M365 capabilities are available with current authentication | None |

### Search (Unified)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_search` | Search across ALL M365 content (documents, emails, events, messages) | `query` (required), `maxResults` |
| `m365_search_documents` | Search specifically for documents and files | `query` (required), `maxResults` |

### SharePoint

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_sharepoint_search_sites` | Find SharePoint sites by name or keyword | `query` |
| `m365_sharepoint_get_site` | Get site details and document libraries | `siteId` (required) |
| `m365_sharepoint_list_libraries` | List all document libraries in a site | `siteId` (required) |
| `m365_sharepoint_search_content` | Search for content within a specific site | `siteId`, `query` |

### OneDrive Files

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_files_my_drive` | Get user's OneDrive info and root folder | None |
| `m365_files_list` | List contents of a folder | `folderId`, `driveId` |
| `m365_files_get_metadata` | Get file or folder metadata | `itemId` (required), `driveId` |
| `m365_files_read_content` | Read text content of a file | `itemId` (required), `driveId` |

### Outlook Mail

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_mail_search` | Search emails by keyword, sender, or date | `query` (required), `maxResults` |
| `m365_mail_recent` | Get most recent emails | `maxResults` |

### Calendar

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_calendar_events` | Get events within a date range | `startDate`, `endDate` |
| `m365_calendar_today` | Get today's scheduled events | None |
| `m365_calendar_week` | Get this week's events | None |

### Microsoft Teams

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_teams_list` | List all Teams the user is a member of | None |
| `m365_teams_channels` | List channels in a specific Team | `teamId` (required) |
| `m365_teams_messages` | Get recent messages from a channel | `teamId`, `channelId`, `maxResults` |

### Meeting Recordings

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_recordings_all` | **Search ALL recordings across organization** via Microsoft Search API | `query`, `maxResults` |
| `m365_recordings_search` | Search recordings in your OneDrive only | `query`, `maxResults` |
| `m365_recordings_recent` | List recent recordings from OneDrive | `maxResults` |
| `m365_recording_download` | Get time-limited download URL | `driveId`, `itemId` (both required) |

### Meeting Transcripts

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `m365_transcripts_search` | Search transcripts (VTT/DOCX) across organization | `query`, `maxResults` |
| `m365_transcript_read` | Read transcript content with speaker parsing | `driveId`, `itemId` (both required) |

## Meeting Recordings Guide

Teams meeting recordings are stored as MP4 files in OneDrive/SharePoint. This MCP server provides multiple ways to find them.

### Finding Recordings

#### 1. Search All Accessible Recordings (Recommended)
Use `m365_recordings_all` to search across the entire organization:

```
m365_recordings_all                    # List all accessible recordings
m365_recordings_all query="Yorizon"    # Filter by project name
m365_recordings_all query="Sprint"     # Filter by meeting type
m365_recordings_all maxResults=50      # Get more results
```

This searches:
- ✅ Your OneDrive
- ✅ SharePoint team sites you have access to
- ✅ Other users' shared OneDrive content
- ✅ Teams channel recordings

#### 2. Search Your OneDrive Only
Use `m365_recordings_search` for faster searches limited to your OneDrive:

```
m365_recordings_search query="Workshop"
m365_recordings_recent maxResults=10
```

#### 3. Get Download Links
Once you find a recording, use `m365_recording_download`:

```
m365_recording_download driveId="..." itemId="..."
```

### Permissions Required

| Tool | Permission | Notes |
|------|------------|-------|
| `m365_recordings_all` | `Files.Read.All` | Uses Microsoft Search API |
| `m365_recordings_search` | `Files.Read.All` | OneDrive only |
| `m365_recordings_recent` | `Files.Read.All` | OneDrive only |
| `m365_recording_download` | `Files.Read.All` | Any accessible drive |

**Note:** No special Teams/OnlineMeeting permissions needed! Recordings are just files.

## Meeting Transcripts Guide

Teams meeting transcripts are stored as VTT or DOCX files alongside recordings.

### Finding Transcripts

```
# Search all accessible transcripts
m365_transcripts_search

# Filter by project/meeting name
m365_transcripts_search query="Yorizon"
m365_transcripts_search query="Architecture"
```

### Reading Transcript Content

Once you find a transcript, read it with:

```
m365_transcript_read driveId="..." itemId="..."
```

**Supported formats:**
- `.vtt` - WebVTT format (parsed and formatted with speaker names)
- `.docx` - Word documents (provides download link)

### Example Output

```markdown
## 📝 Transcript: Sprint Review

**Meeting:** Sprint Review

---

**John Smith:** Welcome everyone to the sprint review.

**Jane Doe:** Thanks John. Let me share the demo...
```

## Authentication Flows

### 1. Device Code Flow (Recommended for development)
Set only `MICROSOFT_CLIENT_ID` and `MICROSOFT_TENANT_ID`. On first use, you'll be prompted to authenticate via browser.

### 2. Client Credentials (App-only, for automation)
Set `MICROSOFT_CLIENT_SECRET` in addition to client ID and tenant. Requires admin consent for application permissions.

### 3. Pre-configured Token (Quick testing)
Set `MICROSOFT_ACCESS_TOKEN` to bypass authentication. Token must have required scopes.

## Security Considerations

- **Permission Trimming**: Results are automatically filtered to content the authenticated user can access
- **No Write Operations**: This MCP server is read-only by design
- **Token Security**: Tokens are cached in memory only, not persisted to disk
- **Scopes**: Request minimum necessary scopes for your use case

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  VS Code / GitHub Copilot Chat                      │
└──────────────────────┬──────────────────────────────┘
                       │ MCP Protocol (stdio)
                       ▼
┌─────────────────────────────────────────────────────┐
│  mcp-365 Server                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Tools     │  │   Auth      │  │ Graph       │ │
│  │   Index     │──│   Provider  │──│ Client      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + OAuth 2.0
                       ▼
┌─────────────────────────────────────────────────────┐
│  Microsoft Graph API                                │
│  ┌────────┐ ┌─────────┐ ┌──────┐ ┌───────┐        │
│  │SharePt │ │OneDrive │ │Mail  │ │Teams  │ ...    │
│  └────────┘ └─────────┘ └──────┘ └───────┘        │
└─────────────────────────────────────────────────────┘
```

## Troubleshooting

### "No MICROSOFT_CLIENT_ID configured"
Create an App Registration in Azure Portal and set the client ID in `.env`.

### "Failed to acquire token"
- Check that your App Registration has the correct redirect URI
- Ensure API permissions are granted (may require admin consent)
- Verify tenant ID is correct (use 'common' for multi-tenant)

### "Graph API error 403"
User doesn't have permission to access the requested resource. This is expected behavior - results are permission-trimmed.

### "Graph API error 401"
Token expired or invalid. The server will attempt to refresh automatically.

## References

- [Microsoft Graph API Documentation](https://learn.microsoft.com/en-us/graph/overview)
- [MCP Specification](https://modelcontextprotocol.io/)
- [GitHub Copilot MCP Integration](https://docs.github.com/en/copilot/concepts/context)
- [Azure App Registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)

## License

MIT
