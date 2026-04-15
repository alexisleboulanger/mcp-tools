# mcp-agent-registry

MCP server for agent discovery, registration, and A2A Agent Card generation from the knowledge graph.

## Overview

This server reads Agent and MCPServer entities from the Yorizon knowledge graph and exposes them through 6 MCP tools. It also scans `.github/agents/*.agent.md` files for auto-discovery and generates A2A-compatible Agent Cards.

Deprecated agents can remain in the knowledge graph for lineage, but active discovery and health checks are intended to reflect the current reference architecture.

`list_agents` returns active agents by default. Set `includeDeprecated=true` when you explicitly want lineage and superseded agents included in the response.

## Tools

| Tool | Description |
| ---- | ----------- |
| `list_agents` | List active registered agents with capabilities, delegation targets, and MCP server dependencies. Use `includeDeprecated=true` to include superseded agents |
| `find_agent` | Find the best agent for a natural language task description (ranked by relevance) |
| `get_agent_card` | Return agent metadata in A2A Agent Card format (JSON) |
| `register_agent` | Add or update an agent in the knowledge graph with relations |
| `delete_agent` | Remove an agent from the knowledge graph and its relations (optionally delete .agent.md file) |
| `agent_health` | Check agent registration completeness — orphans, missing relations, coverage |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
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

```text
Knowledge Graph (.memory/knowledge-graph.json)
  └─ Agent entities (type: "Agent") ──→ list_agents, find_agent, get_agent_card
  └─ MCPServer entities (type: "MCPServer") ──→ list_agents (includeServers)
  └─ Relations (delegates_to, served_by) ──→ agent_health

.github/agents/*.agent.md
  └─ Agent file discovery ──→ enriches cards + health checks
  └─ tools array (e.g., 'caching/*') ──→ getDeclaredTools, requiresMcpServer
```

### Related MCP Servers

| Server | Relation to Registry |
|--------|---------------------|
| `mcp-knowledge` | Source of truth — registry reads Agent/MCPServer entities from KG |
| `mcp-caching` | 9 external-data agents declare `caching/*` tools — registry detects via `getDeclaredTools()` |
| `mcp-agent-context` | Context staleness data used in `agent_health` reports |

## A2A Agent Card Format

`get_agent_card` returns cards compatible with the [A2A Protocol](https://google.github.io/A2A/):

```json
{
  "name": "OwnerNFRAgent",
  "description": "Audits non-functional requirements across architecture domains...",
  "provider": { "organization": "Yorizon" },
  "version": "1.0.0",
  "capabilities": { "streaming": false, "pushNotifications": false },
  "skills": [{ "id": "owner_n_f_r", "name": "OwnerNFRAgent", ... }],
  "metadata": {
    "entityId": "...",
    "tools": ["knowledge/knowledge_graph_read", "knowledge/knowledge_graph_search", "knowledge/knowledge_ontology_view"],
    "delegatesTo": ["OwnerArchitectureAgent", "KGGraphAgent", "ADOWorkItemsAgent", "ADOWikiAgent", "OwnerPortalAgent", "OwnerSystemAPIAgent", "OwnerDevOpsAgent"],
    "servedBy": ["McpAdoWrapped", "McpKnowledge"],
    "agentFile": "Owner-NFR.agent.md"
  }
}
```

## Phase Reference

This server is **Phase 3.3** of the [Agentic AI Roadmap](../../.knowledge/solution/architecture-agentic-ai-roadmap.md) and serves as the foundation for Phase 6 (Agent Discovery Registry).

Phase 4.8 (`mcp-caching`) added `caching/*` to 9 agent tool arrays — the registry auto-discovers these via agent file scanning and surfaces them in `get_agent_card` metadata and `agent_health` tool dependency checks.
