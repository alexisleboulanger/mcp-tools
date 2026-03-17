# MCP Tools Collection

> A curated collection of **Model Context Protocol (MCP) servers** that extend AI assistants with powerful integrations.

[![MCP Version](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Overview

This repository contains custom MCP servers that enable AI assistants (GitHub Copilot, Claude, etc.) to interact with external services and data sources.

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Assistant (VS Code Copilot / Claude Desktop)                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ MCP Protocol
        ┌───────────────────┼───────────────────┬─────────────┐
        ▼                   ▼                   ▼             ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌──────────────┐
│  mcp-365      │   │  mcp-ado      │   │  mcp-miro     │   │  mcp-serp    │
│  M365/Graph   │   │  Azure DevOps │   │  Miro Boards  │   │  Web Search  │
└───────────────┘   └───────────────┘   └───────────────┘   └──────────────┘
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌─────────────────┐
│  mcp-chat     │   │  mcp-knowledge│   │  mcp-agent      │
│  Backup       │   │  Docs Manager │   │  Registry       │
└───────────────┘   └───────────────┘   └─────────────────┘
```

## Available Servers

| Server | Description | Transport | Tools |
|--------|-------------|-----------|-------|
| [**mcp-365**](mcp-365/) | Microsoft 365 Graph API | stdio | 25 |
| [**mcp-ado-wrapper**](mcp-ado-wrapper/) | Azure DevOps | stdio | 40+ |
| [**mcp-server-miro**](mcp-server-miro/) | Miro Boards | SSE | 30+ |
| [**mcp-serp-wrapper**](mcp-serp-wrapper/) | Web Search (SerpAPI) | stdio | 15+ |
| [**mcp-chat-backup**](mcp-chat-backup/) | Chat Persistence | stdio | 6 |
| [**mcp-knowledge**](mcp-knowledge/) | Documentation Manager | stdio | 7 |
| [**mcp-agent-registry**](mcp-agent-registry/) | Agent Discovery & A2A Cards | stdio | 5 |

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/yourorg/mcp.git
cd mcp

# Install all servers
cd mcp-365 && npm install && cd ..
cd mcp-ado-wrapper && npm install && cd ..
cd mcp-server-miro && npm install && cd ..
cd mcp-serp-wrapper && npm install && cd ..
cd mcp-chat-backup && npm install && cd ..
cd mcp-knowledge && npm install && cd ..
cd mcp-agent-registry && npm install && cd ..
```

### 2. Configure VS Code

Create `.vscode/mcp.json` in your workspace:

```jsonc
{
  "servers": {
    // Microsoft 365 - SharePoint, OneDrive, Mail, Calendar, Teams
    "m365": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/dev/mcp/mcp-365/src/index.js"]
    },
    
    // Azure DevOps - Work Items, Pipelines, Wiki
    "ado-wrapped": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/dev/mcp/mcp-ado-wrapper/wrapper.js"]
    },
    
    // Miro - Board manipulation, diagram extraction
    "miro": {
      "type": "sse",
      "url": "http://localhost:8899/sse"
    },
    
    // Web Search - Google, Bing, DuckDuckGo
    "serp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/dev/mcp/mcp-serp-wrapper/serp-wrapper.js"]
    },
    
    // Chat Backup - Conversation persistence
    "chat-backup": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/dev/mcp/mcp-chat-backup/server.js"],
      "env": {
        "CHAT_BACKUP_PATH": "C:/dev/mcp/.knowledge/chat-backups"
      }
    },
    
    // Knowledge Manager - Documentation management
    "knowledge": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/dev/mcp/mcp-knowledge/server.js"],
      "env": {
        "KNOWLEDGE_PATH": "${workspaceFolder}/.knowledge"
      }
    },

    // Agent Registry - Agent discovery, A2A cards, health checks
    "agent-registry": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/dev/mcp/mcp-agent-registry/server.js"],
      "env": {
        "KNOWLEDGE_PATH": "${workspaceFolder}/.knowledge"
      }
    }
  }
}
```

### 3. Configure Environment

Each server has its own `.env` file. Copy `.env.example` and fill in your credentials:

| Server | Required Credentials |
|--------|---------------------|
| mcp-365 | `MICROSOFT_ACCESS_TOKEN` (via Graph Explorer) |
| mcp-ado-wrapper | `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_ORG_URL` |
| mcp-server-miro | `MIRO_API_TOKEN`, `MIRO_BOARD_ID` |
| mcp-serp-wrapper | `SERPAPI_API_KEY` |
| mcp-chat-backup | `CHAT_BACKUP_PATH` (optional) |
| mcp-agent-registry | `KNOWLEDGE_PATH` (path to `.knowledge` folder) |

## Server Details

### 🏢 MCP-365: Microsoft 365

Access SharePoint, OneDrive, Outlook, Calendar, Teams, and meeting recordings.

**Key Features:**
- Unified search across all M365 content
- Meeting recordings via Files API (no special permissions!)
- Transcript reading with speaker identification
- Graceful degradation for missing permissions

**Example prompts:**
```
"Search my SharePoint for architecture documents"
"Show my calendar for this week"
"Find all Yorizon meeting recordings"
"Read the transcript from the Sprint Review"
```

[📖 Full Documentation](mcp-365/README.md)

---

### 🔧 MCP-ADO-Wrapper: Azure DevOps

Manage work items, pipelines, wikis, and test plans.

**Key Features:**
- PAT resolution from multiple sources
- Preflight validation before startup
- Domain selection (work-items, wiki, pipelines, etc.)
- All upstream @azure-devops/mcp tools

**Example prompts:**
```
"Create a bug for the login issue"
"Show me the sprint backlog"
"What's the status of build 12345?"
"Update the wiki page for deployment"
```

[📖 Full Documentation](mcp-ado-wrapper/README.md)

---

### 🎨 MCP-Server-Miro: Miro Boards

Create and manipulate Miro boards, extract diagrams as code.

**Key Features:**
- Full CRUD for sticky notes, shapes, cards, connectors
- Extract ERD diagrams as Mermaid
- Convert flowcharts to Mermaid
- Runtime board switching

**Example prompts:**
```
"Add a sticky note saying 'TODO: Review API'"
"Summarize what's on my Miro board"
"Convert the ERD in frame X to Mermaid"
"Create a connector between these two items"
```

[📖 Full Documentation](mcp-server-miro/README.md)

---

### 🔍 MCP-SERP-Wrapper: Web Search

Search the web via Google, Bing, DuckDuckGo, and more.

**Key Features:**
- Multiple search engines
- Specialized searches (images, news, scholar, maps)
- Debug logging for troubleshooting
- Protocol injection for compatibility

**Example prompts:**
```
"Search the web for MCP best practices"
"Find images of system architecture diagrams"
"Search Google Scholar for AI assistants papers"
```

[📖 Full Documentation](mcp-serp-wrapper/README.md)

---

### 💾 MCP-Chat-Backup: Conversation Persistence

Backup and restore AI chat conversations.

**Key Features:**
- Natural language triggers ("mcp chat backup")
- Reads VS Code session storage directly
- Search previous conversations
- VS Code-compatible export format

**Example prompts:**
```
"mcp chat backup"
"mcp chat import api-design"
"mcp chat search authentication"
"mcp chat list"
```

[📖 Full Documentation](mcp-chat-backup/README.md)

---

### 🤖 MCP-Agent-Registry: Agent Discovery

Discover, query, and manage AI agents registered in the knowledge graph.

**Key Features:**
- List all agents with capabilities, delegation targets, and MCP server dependencies
- Find the best agent for a task via natural language search
- Generate A2A Agent Card format JSON for inter-agent discovery
- Register new agents directly into the knowledge graph
- Health checks: detect orphan agents, missing relations, coverage gaps

**Example prompts:**
```
"List all registered agents"
"Which agent can help with NFR compliance?"
"Get the A2A agent card for SecurityReviewerAgent"
"Check agent health and report any issues"
```

[📖 Full Documentation](mcp-agent-registry/README.md)

---

## MCP Tool Design Standards

All servers in this collection follow consistent documentation patterns:

### Tool Naming Convention
```
{domain}_{action}

Examples:
- m365_recordings_search
- ado_create_work_item  
- miro_create_sticky_note
```

### Tool Description Structure
```markdown
**Use when:** Context for when to use this tool

**How it works:** Brief technical explanation

**Returns:** What the tool outputs

**Next step:** Follow-up actions

**Permissions:** Required API scopes
```

### Output Format
- Human-readable Markdown
- Tables for structured data
- Code blocks for IDs/URLs
- Helpful hints for next steps

## Knowledge Management

This repository includes a `.knowledge/` folder for:

- **Chat backups** - Saved conversations
- **Documentation** - Architecture decisions
- **Memory graph** - Persistent knowledge entities

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the documentation standards
4. Submit a pull request

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [VS Code MCP Integration](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [GitHub MCP Registry](https://github.com/mcp)

## License

MIT
