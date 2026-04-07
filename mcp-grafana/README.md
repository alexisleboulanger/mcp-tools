# mcp-grafana

MCP server for smart operational metrics fetching from Yorizon Grafana environments. Connects to Grafana's HTTP API and proxies Prometheus queries with pre-built namespace-level metric templates for Kubernetes workload monitoring.

## Quick Start

```bash
cd mcp-grafana
cp .env.example .env
# Edit .env with your Grafana URL and API key
npm install
npm start
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `GRAFANA_URL` | Yes | Grafana instance URL (e.g. `https://grafana.pre1.vienna.yorizon.io`) |
| `GRAFANA_API_KEY` | Yes | Service account token or API key |
| `GRAFANA_DATASOURCE_UID` | No | Default Prometheus datasource UID (auto-detected) |
| `GRAFANA_DEFAULT_NAMESPACE` | No | Default namespace for queries |

### Getting an API Key

1. Open Grafana → Administration → Service Accounts
2. Create a service account with **Viewer** role
3. Generate a token → copy into `.env`

## Tools

| Tool | Description |
|---|---|
| `grafana_health` | Check Grafana connectivity |
| `grafana_list_datasources` | List configured datasources |
| `grafana_search_dashboards` | Search dashboards by name/tag |
| `grafana_get_dashboard` | Get dashboard panels and metadata |
| `grafana_query_prometheus` | Execute raw PromQL instant query |
| `grafana_query_range` | Execute PromQL range query with time window |
| `grafana_namespace_health` | **Smart health overview** — CPU, memory, pods, restarts in one call |
| `grafana_namespace_metric` | Query a specific pre-built metric for a namespace |
| `grafana_namespace_compare` | Compare metrics across multiple namespaces |
| `grafana_namespace_alerts` | Fetch active alerts filtered by namespace |
| `grafana_list_metrics` | List available pre-built metric queries |

## Pre-Built Namespace Metrics

These are ready-made PromQL queries accessible via `grafana_namespace_metric`:

- `cpu_usage` — CPU usage in cores
- `cpu_requests` / `cpu_limits` — Resource requests and limits
- `memory_usage` — Memory working set
- `memory_requests` / `memory_limits` — Resource requests and limits
- `pod_count` — Running pod count
- `pod_restarts` / `pod_restart_rate` — Restart totals and hourly rate
- `pods_not_ready` — Pods in non-ready state
- `network_rx` / `network_tx` — Network throughput
- `pvc_usage` — PVC disk usage
- `deployment_replicas` — Desired vs available replicas
- `hpa_current` — HPA current replica count

## Usage Examples

### Operational triage (recommended first call)
```
grafana_namespace_health { namespace: "my-app-pre1" }
```

### Compare environments
```
grafana_namespace_compare { namespaces: ["my-app-pre1", "my-app-prod"] }
```

### Custom PromQL
```
grafana_query_prometheus { promql: "up{job=\"my-service\"}" }
```

## VS Code Integration

Copy `mcp-settings.example.jsonc` into your `.vscode/mcp.json` under `servers`.

## Architecture

```
server.js          ← MCP server (stdio transport)
src/
  grafana-client.js ← Grafana HTTP API client (auth, proxy queries)
  queries.js        ← Pre-built PromQL templates per namespace metric
```

Uses shared utilities from `../shared/` (`mcp-error.js`, `mcp-logger.js`).
