# mcp-a2a-gateway (Scaffold)

MCP server scaffold for Phase 5 A2A protocol work.

This server provides the planned gateway tool surface:
- `a2a_list_agents`
- `a2a_discover`
- `a2a_send_task`
- `a2a_get_result`

## Scope

This is a scaffold implementation intended to unblock integration and testing:
- Agent discovery reads local Agent Card JSON files from `agent-cards/`
- Task dispatch supports real HTTP endpoint calls with timeout/retry/correlation-id
- `auto` mode can fall back to scaffold behavior when endpoint dispatch fails
- Persistent job storage and production auth policy are not implemented yet

## Setup

```bash
cd c:/dev/mcp/mcp-a2a-gateway
npm install
npm start

# export active cards from knowledge graph
npm run export-cards

# run live smoke test (starts local mock endpoint and invokes gateway tools)
npm run smoke
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `A2A_AGENT_CARDS_PATH` | `<repo>/mcp-a2a-gateway/agent-cards` | Directory containing Agent Card `.json` files |
| `A2A_SIMULATED_DELAY_MS` | `500` | Delay before scaffold jobs complete |
| `A2A_REQUEST_TIMEOUT_MS` | `30000` | HTTP dispatch timeout per attempt |
| `A2A_RETRY_COUNT` | `1` | Number of HTTP retries before failure |
| `A2A_RETRY_DELAY_MS` | `500` | Delay between retries |
| `A2A_ALLOW_SCAFFOLD_FALLBACK` | `true` | In `auto` mode, use scaffold fallback when HTTP dispatch fails |
| `A2A_JOB_STORE_PATH` | `<repo>/mcp-a2a-gateway/data/jobs.json` | Persistent JSON store for queued/running/completed jobs |
| `A2A_JOB_STORE_MAX_ENTRIES` | `5000` | Maximum persisted jobs retained in store |
| `A2A_AUDIT_LOG_PATH` | `<repo>/mcp-a2a-gateway/data/audit-log.jsonl` | Structured append-only audit log for tool calls and job lifecycle |

## Persistence and audit behavior

- Jobs are persisted to disk on each state change, so `a2a_get_result` survives server restarts.
- Audit records are written as NDJSON with event names such as:
  - `tool.a2a_send_task`
  - `tool.a2a_get_result`
  - `job.queued`
  - `job.running`
  - `job.completed`
  - `job.failed`

## VS Code MCP config

```json
{
  "a2a-gateway": {
    "type": "stdio",
    "command": "node",
    "args": ["C:/dev/mcp/mcp-a2a-gateway/server.js"],
    "env": {
      "A2A_AGENT_CARDS_PATH": "C:/dev/mcp/mcp-a2a-gateway/agent-cards"
    }
  }
}
```

## Next implementation steps

1. Replace simulated `a2a_send_task` with real A2A client calls per agent card endpoint.
2. Add auth model (OAuth/bearer/API key) in card metadata and request middleware.
3. Add persistent job store (file/redis/sql) instead of in-memory map.
4. Add correlation-id propagation and audit logs for each call.
5. Add retry policy and timeout contracts per agent skill.
