#!/usr/bin/env node
/**
 * MCP Grafana Server
 *
 * Smart operational metrics fetching from Yorizon Grafana environments.
 * Connects to Grafana's HTTP API and proxies Prometheus queries
 * with pre-built namespace-level metric templates.
 *
 * Environment:
 *   GRAFANA_URL           — Grafana base URL
 *   GRAFANA_API_KEY       — API key or service-account token
 *   GRAFANA_DATASOURCE_UID — (optional) default Prometheus datasource UID
 *   GRAFANA_DEFAULT_NAMESPACE — (optional) default namespace filter
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { GrafanaClient } = require('./src/grafana-client');
const { NAMESPACE_QUERIES, HEALTH_OVERVIEW_METRICS } = require('./src/queries');
const { mcpError, withErrorHandling } = require('../shared/mcp-error');
const log = require('../shared/mcp-logger')('mcp-grafana');

// ─── Configuration ────────────────────────────────────────────

const GRAFANA_URL = process.env.GRAFANA_URL;
const GRAFANA_API_KEY = process.env.GRAFANA_API_KEY;
const GRAFANA_USER = process.env.GRAFANA_USER;
const GRAFANA_PASSWORD = process.env.GRAFANA_PASSWORD;
const DEFAULT_DS_UID = process.env.GRAFANA_DATASOURCE_UID || undefined;
const DEFAULT_NS = process.env.GRAFANA_DEFAULT_NAMESPACE || undefined;

let client;
try {
  client = new GrafanaClient({
    baseUrl: GRAFANA_URL,
    apiKey: GRAFANA_API_KEY,
    username: GRAFANA_USER,
    password: GRAFANA_PASSWORD,
  });
} catch (err) {
  console.error(`[mcp-grafana] Configuration error: ${err.message}`);
  console.error('[mcp-grafana] Set GRAFANA_URL and either GRAFANA_API_KEY or GRAFANA_USER+GRAFANA_PASSWORD in .env');
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────

function ok(data) {
  return {
    content: [
      { type: 'text', text: JSON.stringify(data, null, 2) },
    ],
  };
}

function resolveNS(argsNs) {
  const ns = argsNs || DEFAULT_NS;
  if (!ns) {
    throw new Error(
      'namespace is required. Provide it as an argument or set GRAFANA_DEFAULT_NAMESPACE.',
    );
  }
  return ns;
}

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return 'N/A';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

function formatCores(value) {
  if (value == null || isNaN(value)) return 'N/A';
  const n = Number(value);
  if (n < 0.01) return `${(n * 1000).toFixed(1)}m`;
  return `${n.toFixed(3)} cores`;
}

function extractScalar(promResult) {
  if (!promResult?.data?.result) return null;
  const results = promResult.data.result;
  if (results.length === 0) return null;
  // For vector results, sum all values
  if (Array.isArray(results)) {
    const vals = results.map((r) =>
      r.value ? Number(r.value[1]) : null,
    ).filter((v) => v !== null);
    if (vals.length === 1) return vals[0];
    if (vals.length > 1) return vals;
    return null;
  }
  return null;
}

// ─── Tool Definitions ─────────────────────────────────────────

const TOOLS = [
  {
    name: 'grafana_health',
    description: 'Check Grafana instance connectivity and health status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'grafana_list_datasources',
    description:
      'List all configured datasources in Grafana. Useful to discover Prometheus datasource UID.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'grafana_search_dashboards',
    description: 'Search Grafana dashboards by name or tag.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search string to filter dashboards by name.',
        },
        tag: {
          type: 'string',
          description: 'Filter dashboards by tag.',
        },
      },
    },
  },
  {
    name: 'grafana_get_dashboard',
    description:
      'Retrieve a Grafana dashboard by UID, including all panels and queries.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Dashboard UID.',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'grafana_query_prometheus',
    description:
      'Execute a raw PromQL instant query via Grafana datasource proxy. Returns Prometheus API response.',
    inputSchema: {
      type: 'object',
      properties: {
        promql: {
          type: 'string',
          description: 'PromQL expression to evaluate.',
        },
        datasource_uid: {
          type: 'string',
          description:
            'Datasource UID or name. Auto-detects Prometheus if omitted.',
        },
      },
      required: ['promql'],
    },
  },
  {
    name: 'grafana_query_range',
    description:
      'Execute a PromQL range query over a time window. Returns time-series data.',
    inputSchema: {
      type: 'object',
      properties: {
        promql: {
          type: 'string',
          description: 'PromQL expression to evaluate.',
        },
        start: {
          type: 'string',
          description:
            'Start time (RFC3339 or Unix epoch seconds). Defaults to 1 hour ago.',
        },
        end: {
          type: 'string',
          description:
            'End time (RFC3339 or Unix epoch seconds). Defaults to now.',
        },
        step: {
          type: 'string',
          description: 'Query resolution step (e.g. "60s", "5m"). Defaults to "60s".',
        },
        datasource_uid: {
          type: 'string',
          description:
            'Datasource UID or name. Auto-detects Prometheus if omitted.',
        },
      },
      required: ['promql'],
    },
  },
  {
    name: 'grafana_namespace_health',
    description:
      'Smart health overview for a Kubernetes namespace. Returns CPU, memory, pod count, restart rate, and readiness status in a formatted summary. Ideal first call for operational triage.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description:
            'Kubernetes namespace to query (e.g. "my-app-pre1"). Uses GRAFANA_DEFAULT_NAMESPACE if omitted.',
        },
        datasource_uid: {
          type: 'string',
          description:
            'Datasource UID or name. Auto-detects Prometheus if omitted.',
        },
      },
    },
  },
  {
    name: 'grafana_namespace_metric',
    description: `Query a specific pre-built operational metric for a namespace. Available metrics: ${Object.keys(NAMESPACE_QUERIES).join(', ')}`,
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to query.',
        },
        metric: {
          type: 'string',
          description: `Metric name. One of: ${Object.keys(NAMESPACE_QUERIES).join(', ')}`,
          enum: Object.keys(NAMESPACE_QUERIES),
        },
        datasource_uid: {
          type: 'string',
          description: 'Datasource UID or name.',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'grafana_namespace_compare',
    description:
      'Compare key operational metrics across multiple namespaces side-by-side. Useful for comparing pre1 vs production or across teams.',
    inputSchema: {
      type: 'object',
      properties: {
        namespaces: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of namespaces to compare (e.g. ["ns-pre1", "ns-prod"]).',
        },
        metrics: {
          type: 'array',
          items: {
            type: 'string',
            enum: Object.keys(NAMESPACE_QUERIES),
          },
          description: `Metrics to compare. Defaults to health overview set. Options: ${Object.keys(NAMESPACE_QUERIES).join(', ')}`,
        },
        datasource_uid: {
          type: 'string',
          description: 'Datasource UID or name.',
        },
      },
      required: ['namespaces'],
    },
  },
  {
    name: 'grafana_namespace_alerts',
    description:
      'Fetch active Grafana alerts optionally filtered by namespace label.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Filter alerts by namespace label.',
        },
      },
    },
  },
  {
    name: 'grafana_list_metrics',
    description:
      'List available pre-built metric queries with descriptions. No Grafana call needed.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────

async function handleTool(name, args) {
  const t0 = Date.now();

  const result = await withErrorHandling(name, async () => {
    switch (name) {
      // ── Health ──────────────────────────────────
      case 'grafana_health': {
        const health = await client.health();
        return ok({ status: 'connected', grafana: health, url: GRAFANA_URL });
      }

      // ── Datasources ────────────────────────────
      case 'grafana_list_datasources': {
        const ds = await client.listDatasources();
        return ok(
          ds.map((d) => ({
            uid: d.uid,
            name: d.name,
            type: d.type,
            url: d.url,
            isDefault: d.isDefault,
          })),
        );
      }

      // ── Dashboards ─────────────────────────────
      case 'grafana_search_dashboards': {
        const results = await client.searchDashboards(
          args.query || '',
          args.tag || '',
        );
        return ok(
          results.map((d) => ({
            uid: d.uid,
            title: d.title,
            url: d.url,
            tags: d.tags,
            type: d.type,
          })),
        );
      }

      case 'grafana_get_dashboard': {
        const dash = await client.getDashboard(args.uid);
        // Return summary: panels list + meta
        const panels = (dash.dashboard?.panels || []).map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          datasource: p.datasource,
        }));
        return ok({
          uid: dash.dashboard?.uid,
          title: dash.dashboard?.title,
          tags: dash.dashboard?.tags,
          panels,
          meta: {
            folder: dash.meta?.folderTitle,
            created: dash.meta?.created,
            updated: dash.meta?.updated,
          },
        });
      }

      // ── Raw Prometheus queries ──────────────────
      case 'grafana_query_prometheus': {
        const result = await client.queryInstant(args.promql, {
          datasourceUid: args.datasource_uid || DEFAULT_DS_UID,
        });
        return ok(result);
      }

      case 'grafana_query_range': {
        const result = await client.queryRange(args.promql, {
          datasourceUid: args.datasource_uid || DEFAULT_DS_UID,
          start: args.start,
          end: args.end,
          step: args.step,
        });
        return ok(result);
      }

      // ── Namespace Health Overview ───────────────
      case 'grafana_namespace_health': {
        const ns = resolveNS(args.namespace);
        const dsUid = args.datasource_uid || DEFAULT_DS_UID;
        const summary = { namespace: ns, timestamp: new Date().toISOString(), metrics: {} };

        // Run all health queries in parallel
        const entries = HEALTH_OVERVIEW_METRICS.map((key) => ({
          key,
          def: NAMESPACE_QUERIES[key],
        }));

        const results = await Promise.allSettled(
          entries.map(({ def }) =>
            client.queryInstant(def.query(ns), { datasourceUid: dsUid }),
          ),
        );

        for (let i = 0; i < entries.length; i++) {
          const { key, def } = entries[i];
          const r = results[i];
          if (r.status === 'fulfilled') {
            const val = extractScalar(r.value);
            let formatted;
            if (key.includes('memory')) formatted = formatBytes(val);
            else if (key.includes('cpu')) formatted = formatCores(val);
            else formatted = val != null ? String(Math.round(Number(val) * 100) / 100) : 'N/A';

            summary.metrics[key] = {
              title: def.title,
              raw: val,
              formatted,
            };
          } else {
            summary.metrics[key] = {
              title: def.title,
              error: r.reason?.message || 'Query failed',
            };
          }
        }

        // Build a human-readable summary line
        const cpu = summary.metrics.cpu_usage?.formatted || 'N/A';
        const mem = summary.metrics.memory_usage?.formatted || 'N/A';
        const pods = summary.metrics.pod_count?.formatted || 'N/A';
        const restarts = summary.metrics.pod_restart_rate?.formatted || 'N/A';
        const notReady = summary.metrics.pods_not_ready?.formatted || '0';

        summary.overview = `Namespace ${ns}: CPU=${cpu}, Mem=${mem}, Pods=${pods}, Restart/h=${restarts}, NotReady=${notReady}`;

        return ok(summary);
      }

      // ── Single namespace metric ─────────────────
      case 'grafana_namespace_metric': {
        const ns = resolveNS(args.namespace);
        const def = NAMESPACE_QUERIES[args.metric];
        if (!def) {
          return mcpError('INVALID_INPUT', `Unknown metric '${args.metric}'`, {
            tool: name,
            recovery: `Use one of: ${Object.keys(NAMESPACE_QUERIES).join(', ')}`,
          });
        }
        const result = await client.queryInstant(def.query(ns), {
          datasourceUid: args.datasource_uid || DEFAULT_DS_UID,
        });
        return ok({
          namespace: ns,
          metric: args.metric,
          title: def.title,
          description: def.description,
          result: result.data,
        });
      }

      // ── Cross-namespace compare ─────────────────
      case 'grafana_namespace_compare': {
        const namespaces = args.namespaces;
        const metricKeys = args.metrics || HEALTH_OVERVIEW_METRICS;
        const dsUid = args.datasource_uid || DEFAULT_DS_UID;

        const comparison = {};
        // Build all queries
        const jobs = [];
        for (const ns of namespaces) {
          comparison[ns] = {};
          for (const key of metricKeys) {
            const def = NAMESPACE_QUERIES[key];
            if (!def) continue;
            jobs.push({ ns, key, def });
          }
        }

        const results = await Promise.allSettled(
          jobs.map((j) =>
            client.queryInstant(j.def.query(j.ns), { datasourceUid: dsUid }),
          ),
        );

        for (let i = 0; i < jobs.length; i++) {
          const { ns, key, def } = jobs[i];
          const r = results[i];
          if (r.status === 'fulfilled') {
            const val = extractScalar(r.value);
            let formatted;
            if (key.includes('memory')) formatted = formatBytes(val);
            else if (key.includes('cpu')) formatted = formatCores(val);
            else formatted = val != null ? String(Math.round(Number(val) * 100) / 100) : 'N/A';
            comparison[ns][key] = { title: def.title, raw: val, formatted };
          } else {
            comparison[ns][key] = { error: r.reason?.message };
          }
        }

        return ok({ namespaces, metrics: metricKeys, comparison });
      }

      // ── Alerts ──────────────────────────────────
      case 'grafana_namespace_alerts': {
        const alerts = await client.getAlerts();
        let filtered = alerts;
        if (args.namespace) {
          filtered = (alerts || []).filter((a) => {
            const labels = a.labels || {};
            return (
              labels.namespace === args.namespace ||
              labels.exported_namespace === args.namespace
            );
          });
        }
        return ok({
          namespace: args.namespace || '(all)',
          count: filtered.length,
          alerts: filtered.map((a) => ({
            labels: a.labels,
            annotations: a.annotations,
            state: a.status?.state,
            startsAt: a.startsAt,
            updatedAt: a.updatedAt,
          })),
        });
      }

      // ── List available metrics ──────────────────
      case 'grafana_list_metrics': {
        return ok(
          Object.entries(NAMESPACE_QUERIES).map(([key, def]) => ({
            name: key,
            title: def.title,
            description: def.description,
          })),
        );
      }

      default:
        return mcpError('NOT_FOUND', `Unknown tool: ${name}`, {
          tool: name,
          recovery: 'Call tools/list to see available tools.',
        });
    }
  });

  log.toolCall(name, args, Date.now() - t0, {
    success: !result?.isError,
    error: result?.isError ? 'see response' : undefined,
  });

  return result;
}

// ─── MCP Server Setup ─────────────────────────────────────────

const server = new Server(
  { name: 'mcp-grafana', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log.info(`Tool call: ${name}`, { args: Object.keys(args || {}) });
  return handleTool(name, args || {});
});

// ─── Start ────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('MCP Grafana Server running on stdio', {
    url: GRAFANA_URL,
    defaultDatasource: DEFAULT_DS_UID || '(auto-detect)',
    defaultNamespace: DEFAULT_NS || '(none)',
    tools: TOOLS.length,
  });
}

main().catch((err) => {
  console.error('[mcp-grafana] Fatal:', err.message);
  process.exit(1);
});
