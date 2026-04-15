# mcp-caching

MCP server for agent-level caching — stores markdown snapshots with YAML front matter, TTL-based expiry, stale-while-revalidate, and deterministic keys.

## Architecture

Follows the same pattern as `mcp-knowledge`:

```
mcp-caching/
├── server.js                    # Entry point (stdio transport)
├── src/
│   ├── config.js                # Paths, TTL defaults, constants
│   ├── errors.js                # Structured error types
│   ├── helpers.js               # Key generation, markdown parsing
│   ├── lock.js                  # File-based write lock
│   └── tools/
│       ├── definitions.js       # Tool schemas (MCP descriptors)
│       ├── router.js            # Name → handler dispatch
│       └── handlers/
│           └── cache.js         # All handler implementations
├── test-caching.js              # Smoke test
└── package.json
```

## Tools

| Tool | Description |
|------|-------------|
| `cache_read` | Read cache entry by source + key/query. Returns fresh/stale/miss status. |
| `cache_write` | Write markdown snapshot with TTL metadata. |
| `cache_invalidate` | Remove entries by source + optional glob pattern. |
| `cache_stats` | Get per-source counts (fresh/stale/expired) and disk usage. |
| `cache_list` | List recent cache entries with freshness status. |
| `cache_prune` | Remove expired entries and enforce max-entries limit. |

## Storage Layout

```
<CACHE_ROOT>/
├── ado-workitems/
│   ├── ado-workitems-a1b2c3d4e5f67890.md
│   └── ado-workitems-f0e1d2c3b4a59876.md
├── ado-wiki/
│   └── ado-wiki-1234567890abcdef.md
├── internet-research/
│   └── internet-research-abcdef1234567890.md
└── .cache.lock
```

Each `.md` file has YAML front matter:

```yaml
---
cache_key: ado-wiki-1234567890abcdef
source: ado-wiki
query: yorizon architecture governance
fetched_at_utc: 2026-04-15T10:30:00Z
expires_at_utc: 2026-04-15T11:30:00Z
ttl_minutes: 60
cache_status: fresh
refresh_hint: use "refresh" to force live retrieval
---
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `CACHE_PATH` | `<cwd>/.cache` | Root directory for cache files |
| `MCP_DEBUG` | unset | Enable debug logging |

## Usage

Register in `.vscode/mcp.json`:

```json
{
  "caching": {
    "type": "stdio",
    "command": "node",
    "args": ["C:\\dev\\mcp\\mcp-caching\\server.js"],
    "env": {
      "CACHE_PATH": "C:\\dev\\yorizon\\.cache"
    }
  }
}
```

## Testing

```bash
cd mcp-caching
npm install
node test-caching.js
```
