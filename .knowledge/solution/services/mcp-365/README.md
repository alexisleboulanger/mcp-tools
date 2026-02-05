# MCP-365 Knowledge Base

Documentation for the Microsoft 365 Graph API integration MCP server.

## Overview

MCP-365 is a Model Context Protocol (MCP) server that enables GitHub Copilot and other AI assistants to query Microsoft 365 content via the Microsoft Graph API.

## Key Documents

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System architecture and component overview |
| [Authentication](./authentication.md) | Authentication strategies and constraints |
| [Tools Reference](./tools.md) | Available MCP tools and usage |

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

### VS Code Integration

Add to `.vscode/mcp.json`:

```jsonc
"m365": {
  "type": "stdio",
  "command": "node",
  "args": ["c:/dev/mcp/mcp-365/src/index.js"]
}
```

## Quick Reference

### Authentication Priority

1. **Graph Explorer Token** - Full M365 access, 1hr expiry
2. **Azure CLI** - Auto-refresh, limited scopes (no Mail/Calendar/Files)
3. **Custom App + Admin Consent** - Full access, permanent
4. **Client Credentials** - App-only, service accounts

### Available Capabilities by Auth Method

| Capability | Graph Explorer | Azure CLI | Custom App |
|------------|----------------|-----------|------------|
| User Profile | ✅ | ✅ | ✅* |
| Groups | ✅ | ✅ | ✅* |
| Sites Listing | ✅ | ✅ | ✅* |
| Mail | ✅ | ❌ | ✅* |
| Calendar | ✅ | ❌ | ✅* |
| Files/OneDrive | ✅ | ❌ | ✅* |
| Search | ✅ | ❌ | ✅* |

*Requires admin consent in enterprise tenants

## Tool Summary

19 tools organized by category:

| Category | Tools |
|----------|-------|
| Status | `m365_status` |
| Search | `m365_search`, `m365_search_documents` |
| SharePoint | `m365_sharepoint_search_sites`, `m365_sharepoint_get_site`, `m365_sharepoint_list_libraries`, `m365_sharepoint_search_content` |
| Files | `m365_files_my_drive`, `m365_files_list`, `m365_files_get_metadata`, `m365_files_read_content` |
| Mail | `m365_mail_search`, `m365_mail_recent` |
| Calendar | `m365_calendar_events`, `m365_calendar_today`, `m365_calendar_week` |
| Teams | `m365_teams_list`, `m365_teams_channels`, `m365_teams_messages` |

## Related MCP Memory Entities

- `MCP365Service` - Service entity
- `MCP365Authentication` - Authentication practice
- `MCP365CapabilityDetection` - Graceful degradation pattern
- `MCP365TokenHelper` - Token management tool
- `GraphExplorerFirstPartyPrivilege` - Microsoft pre-authorization concept

## Cross-References

- [MCP Repository Index](../README.md) - All MCP servers overview
- [MCPDynamicToolIntegration](../README.md#mcp-memory-entities) - Integration pattern
