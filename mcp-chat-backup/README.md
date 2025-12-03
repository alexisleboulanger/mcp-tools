# MCP Chat Backup Server

An MCP (Model Context Protocol) server for managing VS Code Copilot chat backups across workspaces.

## Overview

This MCP server provides tools that enable GitHub Copilot to **automatically backup and restore chat conversations**. When you say "mcp chat backup", the AI captures the conversation and saves it directly to your backup folder - no manual export needed.

## Features

| Feature | Description |
|---------|-------------|
| **Automated Backup** | AI captures and saves conversation directly to JSON |
| **Import Context** | Load previous conversations into current session |
| **List Backups** | View all available chat backups sorted by date |
| **Search Backups** | Find conversations by keyword |
| **Save Summaries** | Capture key insights as markdown |

## Installation

```bash
cd mcp-chat-backup
npm install
```

## Configuration

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "chat-backup": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\dev\\mcp\\mcp-chat-backup\\server.js"],
      "env": {
        "CHAT_BACKUP_PATH": "C:\\dev\\mcp\\.knowledge\\chat-backups"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "chat-backup": {
      "command": "node",
      "args": ["/path/to/mcp-chat-backup/server.js"],
      "env": {
        "CHAT_BACKUP_PATH": "/path/to/.knowledge/chat-backups"
      }
    }
  }
}
```

## Usage

### Backup Current Chat

Simply say in your conversation:

```
mcp chat backup
```

Or with a topic:

```
mcp chat backup topic:api-design
```

**What happens:**
1. AI extracts key exchanges from current conversation
2. Tool saves JSON file to backup folder automatically
3. Returns confirmation with filename for future import

**Output:**
```
✅ Chat Backup Saved
File: 2026-01-19-14-46-api-design.json
Location: .knowledge/chat-backups/2026/01/
Messages: 6 exchanges saved
```

### Import Previous Chat

```
mcp chat import 2026-01-19-14-46-api-design.json
```

Or search by partial name:

```
mcp chat import api-design
```

**What happens:**
1. Tool finds the backup file
2. Parses and formats the conversation
3. Returns content as context for current session

### List Available Backups

```
mcp chat list
```

Shows all backup files sorted by most recent.

### Search Backups

```
mcp chat search authentication
```

Finds backups containing the search term with preview snippets.

### Save Summary

```
mcp chat save summary topic:decisions content:We decided to use OAuth2...
```

Saves a markdown summary without full conversation export.

## Tools Reference

| Tool | Trigger | Parameters |
|------|---------|------------|
| `chat_backup` | "mcp chat backup" | `topic` (optional), `conversation` (auto-provided by AI) |
| `chat_import` | "mcp chat import \<file\>" | `filename` (required) |
| `chat_list` | "mcp chat list" | `limit` (optional, default: 20) |
| `chat_search` | "mcp chat search \<keyword\>" | `keyword` (required), `limit` (optional) |
| `chat_save_summary` | "mcp chat save summary" | `topic`, `content` (required) |

## Backup Location

Default: `.knowledge/chat-backups/{YYYY}/{MM}/`

Structure:
```
.knowledge/chat-backups/
├── 2026/
│   ├── 01/
│   │   ├── 2026-01-19-14-46-api-design.json
│   │   ├── 2026-01-19-16-45-bug-fix.json
│   │   └── 2026-01-20-09-00-summary.md
│   └── 02/
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHAT_BACKUP_PATH` | Base path for backups | `{cwd}/.knowledge/chat-backups` |

## Cross-Workspace Usage

This server can be configured in multiple VS Code instances to share a common backup location:

1. Set `CHAT_BACKUP_PATH` to a shared/synced folder
2. All instances will see the same backups
3. Import conversations from any workspace

## Troubleshooting

### Server Not Starting

```bash
# Test manually
node server.js
```

Check for errors in the MCP output panel in VS Code.

### Backups Not Found

Ensure:
1. `CHAT_BACKUP_PATH` is correctly set
2. The folder exists and is readable
3. Files have `.json` extension

### Import Fails

Check:
1. File exists in backup folder
2. File is valid JSON (VS Code export format)
3. File permissions allow reading

## License

MIT
