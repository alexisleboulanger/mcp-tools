# MCP-Chat-Backup: Conversation Persistence for AI Assistants

> **Model Context Protocol (MCP) server** for backing up and restoring VS Code Copilot chat sessions.
> Say "mcp chat backup" to save your conversation - no manual export needed.

[![MCP Version](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=18-brightgreen)](https://nodejs.org)

## Overview

This MCP server enables AI assistants to manage chat conversation backups:

| Feature | Description |
|---------|-------------|
| **Automated Backup** | AI captures and saves conversation directly to JSON |
| **Import Context** | Load previous conversations into current session |
| **Search Backups** | Find conversations by keyword |
| **List Sessions** | View available VS Code chat sessions |
| **Save Summaries** | Capture key insights as markdown |

## Quick Start

```bash
# Install dependencies
npm install

# Start server (usually done by VS Code)
node server.js
```

## Configuration

### VS Code (`.vscode/mcp.json`)

```jsonc
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

## Tool Reference

| Tool | Trigger | Description | Parameters |
|------|---------|-------------|------------|
| `chat_backup` | "mcp chat backup" | Save current conversation to backup | `sessionId`, `topic` (optional) |
| `chat_import` | "mcp chat import \<file\>" | Load a backup into context | `filename` (required) |
| `chat_list` | "mcp chat list" | List available backup files | `limit` (default: 20) |
| `chat_list_sessions` | "mcp chat list sessions" | List VS Code chat sessions | `limit`, `workspacePath` |
| `chat_search` | "mcp chat search \<keyword\>" | Search backup contents | `keyword` (required), `limit` |
| `chat_save_summary` | "mcp chat save summary" | Save markdown summary | `topic`, `content` (required) |

## Usage Examples

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
1. Tool reads VS Code's internal chat session storage
2. Extracts key exchanges from current conversation
3. Saves JSON file in VS Code-compatible export format
4. Returns confirmation with filename

**Output:**
```markdown
✅ Chat Backup Saved
File: 2026-01-20-14-46-api-design.json
Location: .knowledge/chat-backups/
Messages: 22 exchanges saved
```

### Import Previous Chat

```
mcp chat import api-design
```

**What happens:**
1. Tool finds the backup file by partial name match
2. Parses and formats the conversation
3. Returns content as context for current session

### List Available Backups

```
mcp chat list
```

### Search Backups

```
mcp chat search authentication
```

Finds backups containing the search term with preview snippets.

## Backup Location

Default: `{workspace}/.knowledge/chat-backups/`

Structure:
```
.knowledge/chat-backups/
├── 2026-01-19-14-46-api-design.json
├── 2026-01-20-09-00-bugfix.json
└── 2026-01-20-13-33-mcp-m365.json
```

**Filename format:** `YYYY-MM-DD-HH-MM-topic.json`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHAT_BACKUP_PATH` | Base path for backups | `{cwd}/.knowledge/chat-backups` |

## MCP Tool Design Principles

This server follows MCP best practices:

1. **Natural language triggers** - "mcp chat backup" feels conversational
2. **Human-readable output** - Formatted Markdown confirmations
3. **Cross-workspace support** - Shared backup location for all projects
4. **VS Code compatibility** - Export format matches VS Code's native format

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  VS Code / AI Assistant                             │
└──────────────────────┬──────────────────────────────┘
                       │ "mcp chat backup"
                       ▼
┌─────────────────────────────────────────────────────┐
│  mcp-chat-backup Server                             │
│  ┌─────────────┐  ┌─────────────┐                  │
│  │   Tools     │  │   Session   │                  │
│  │   Handler   │──│   Reader    │                  │
│  └─────────────┘  └─────────────┘                  │
└──────────────────────┬──────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│ VS Code    │  │ Backup     │  │ Search     │
│ Sessions   │  │ Files      │  │ Index      │
└────────────┘  └────────────┘  └────────────┘
```

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

### Sessions Not Found

VS Code stores chat sessions in:
- Windows: `%APPDATA%\Code\User\workspaceStorage\{hash}\state.vscdb`
- macOS: `~/Library/Application Support/Code/User/workspaceStorage/`
- Linux: `~/.config/Code/User/workspaceStorage/`

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [VS Code MCP Integration](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

## License

MIT
