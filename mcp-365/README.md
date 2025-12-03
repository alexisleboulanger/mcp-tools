# MCP-365: Microsoft 365 Graph API Integration for GitHub Copilot

MCP server that enables GitHub Copilot (and other AI assistants) to query Microsoft 365 content including SharePoint, OneDrive, Outlook, Calendar, and Teams.

## Features

- **Unified Search** - Search across all M365 content (documents, emails, events)
- **SharePoint** - Browse sites, document libraries, search site content
- **OneDrive** - List files, read text content, get metadata
- **Outlook Mail** - Search emails, get recent messages
- **Calendar** - View events by date range, today's schedule, weekly view
- **Teams** - List teams, channels, read channel messages
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

## Available Tools

### Status
- `m365_status` - Check which capabilities are available with current auth

### Search
- `m365_search` - Unified search across all M365 content
- `m365_search_documents` - Search specifically for documents/files

### SharePoint
- `m365_sharepoint_search_sites` - Find SharePoint sites
- `m365_sharepoint_get_site` - Get site details and libraries
- `m365_sharepoint_list_libraries` - List document libraries
- `m365_sharepoint_search_content` - Search within a site

### Files (OneDrive)
- `m365_files_my_drive` - Get user's OneDrive info
- `m365_files_list` - List folder contents
- `m365_files_get_metadata` - Get file/folder details
- `m365_files_read_content` - Read text file content

### Mail
- `m365_mail_search` - Search emails
- `m365_mail_recent` - Get recent emails

### Calendar
- `m365_calendar_events` - Get events in date range
- `m365_calendar_today` - Today's schedule
- `m365_calendar_week` - This week's events

### Teams
- `m365_teams_list` - List user's Teams
- `m365_teams_channels` - List channels in a Team
- `m365_teams_messages` - Read channel messages

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
