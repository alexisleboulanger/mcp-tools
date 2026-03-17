# mcp-agent-registry

MCP server for agent discovery, registration, and A2A Agent Card generation from the knowledge graph.

## Overview

This server reads Agent and MCPServer entities from the Yorizon knowledge graph and exposes them through 5 MCP tools. It also scans `.github/agents/*.agent.md` files for auto-discovery and generates A2A-compatible Agent Cards.

## Tools

| Tool | Description |
|------|-------------|
| `list_agents` | List all registered agents with capabilities, delegation targets, and MCP server dependencies |
| `find_agent` | Find the best agent for a natural language task description (ranked by relevance) |
| `get_agent_card` | Return agent metadata in A2A Agent Card format (JSON) |
| `register_agent` | Add or update an agent in the knowledge graph with relations |
| `agent_health` | Check agent registration completeness — orphans, missing relations, coverage |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KNOWLEDGE_PATH` | `<cwd>/.knowledge` | Path to the `.knowledge` folder |
| `AGENTS_PATH` | `<workspace>/.github/agents` | Path to agent `.agent.md` files (auto-detected from KNOWLEDGE_PATH parent) |

## Setup

```bash
cd c:\dev\mcp\mcp-agent-registry
npm install
```

## VS Code MCP Configuration

Add to `.vscode/mcp.json`:

```json
{
  "agent-registry": {
    "type": "stdio",
    "command": "node",
    "args": ["C:\\dev\\mcp\\mcp-agent-registry\\server.js"],
    "env": {
      "KNOWLEDGE_PATH": "C:\\dev\\yorizon\\.knowledge"
    }
  }
}
```

## Architecture

```
Knowledge Graph (.memory/knowledge-graph.json)
  └─ Agent entities (type: "Agent") ──→ list_agents, find_agent, get_agent_card
  └─ MCPServer entities (type: "MCPServer") ──→ list_agents (includeServers)
  └─ Relations (delegates_to, served_by) ──→ agent_health

.github/agents/*.agent.md
  └─ Agent file discovery ──→ enriches cards + health checks
```

## A2A Agent Card Format

`get_agent_card` returns cards compatible with the [A2A Protocol](https://google.github.io/A2A/):

```json
{
  "name": "NFRAuditorAgent",
  "description": "Audits Non-Functional Requirements compliance...",
  "provider": { "organization": "Yorizon" },
  "version": "1.0.0",
  "capabilities": { "streaming": false, "pushNotifications": false },
  "skills": [{ "id": "nfr_auditor", "name": "NFRAuditorAgent", ... }],
  "metadata": {
    "entityId": "...",
    "tools": ["ado-wrapped/*", "knowledge/*"],
    "delegatesTo": ["ADOAgent"],
    "servedBy": ["McpAdoWrapped", "McpKnowledge"],
    "agentFile": "Yorizon-NFR-Auditor-Agent.agent.md"
  }
}
```

## Phase Reference

This server is **Phase 3.3** of the [Agentic AI Roadmap](../../.knowledge/solution/architecture-agentic-ai-roadmap.md) and serves as the foundation for Phase 6 (Agent Discovery Registry).
