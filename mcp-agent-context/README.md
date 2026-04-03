# mcp-agent-context

Thin MCP server that wraps the `session-memory` skill scripts as MCP tools.

**No business logic** — every tool call delegates to a Node.js script in
`.github/skills/session-memory/scripts/` via `child_process.execFile`.
The skill scripts remain the single source of truth.

## Tools

| Tool | Description |
|------|-------------|
| `context_load` | Load an agent's working context (Tier 2) |
| `context_save` | Save session findings to working context |
| `context_init` | Bootstrap a new agent's working context |
| `context_promote` | Promote Tier 1 session → Tier 2 working context |
| `context_dashboard` | Memory health dashboard for all agents |
| `context_list` | List all working context files |

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `WORKSPACE_PATH` | `C:\dev\yorizon` | Workspace root (must contain `.github/skills/session-memory/`) |
| `CONTEXT_DIR` | `{WORKSPACE_PATH}/.agent-context` | Directory for working context files |

## Usage

### VS Code (mcp.json)

```json
"agent-context": {
  "type": "stdio",
  "command": "node",
  "args": ["C:\\dev\\mcp\\mcp-agent-context\\server.js"],
  "env": {
    "WORKSPACE_PATH": "C:\\dev\\yorizon"
  }
}
```

### CLI

```bash
npx mcp-agent-context
```

### Install dependencies

```bash
cd c:\dev\mcp\mcp-agent-context
npm install
```
