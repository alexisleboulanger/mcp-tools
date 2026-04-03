#!/usr/bin/env node
/**
 * MCP Agent Runtime Bridge
 *
 * Bridges VS Code Copilot Chat to the Yorizon Python agent runtime (FastAPI).
 * All requests are forwarded to the FastAPI server via HTTP.
 *
 * Environment:
 *   AGENT_RUNTIME_URL — base URL of the FastAPI server (default: http://localhost:8000)
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { mcpError } = require('../shared/mcp-error');
const createLogger = require('../shared/mcp-logger');
const log = createLogger('mcp-agent-runtime-bridge');

// ─── Configuration ────────────────────────────────────────────────────────────

const AGENT_RUNTIME_URL = (process.env.AGENT_RUNTIME_URL || 'http://localhost:8000').replace(/\/$/, '');
const runtimeUrl = new URL(AGENT_RUNTIME_URL);
const AGENT_RUNTIME_AUTOSTART = (process.env.AGENT_RUNTIME_AUTOSTART || 'true').toLowerCase() === 'true';
const AGENT_RUNTIME_HEALTH_TIMEOUT_MS = Number(process.env.AGENT_RUNTIME_HEALTH_TIMEOUT_MS || 25000);
const AGENT_RUNTIME_HEALTH_INTERVAL_MS = Number(process.env.AGENT_RUNTIME_HEALTH_INTERVAL_MS || 1000);
const AGENT_RUNTIME_APP_MODULE = process.env.AGENT_RUNTIME_APP_MODULE || 'yorizon_agents.server:app';
const AGENT_RUNTIME_HOST = process.env.AGENT_RUNTIME_HOST || '0.0.0.0';
const AGENT_RUNTIME_PORT = Number(
  process.env.AGENT_RUNTIME_PORT || (runtimeUrl.port ? runtimeUrl.port : (runtimeUrl.protocol === 'https:' ? 443 : 80)),
);
const AGENT_RUNTIME_WORKDIR = process.env.AGENT_RUNTIME_WORKDIR ||
  (process.platform === 'win32'
    ? 'C:\\dev\\yorizon\\yorizon-agent-runtime'
    : '/c/dev/yorizon/yorizon-agent-runtime');
const AGENT_RUNTIME_PYTHON = process.env.AGENT_RUNTIME_PYTHON ||
  (process.platform === 'win32'
    ? path.join(AGENT_RUNTIME_WORKDIR, '.venv', 'Scripts', 'python.exe')
    : path.join(AGENT_RUNTIME_WORKDIR, '.venv', 'bin', 'python'));

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function runtimeFetch(path, options = {}) {
  const url = `${AGENT_RUNTIME_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  if (!res.ok) {
    const detail = typeof body === 'object' ? (body.detail || JSON.stringify(body)) : body;
    throw new Error(`Runtime error ${res.status}: ${detail}`);
  }

  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isRuntimeHealthy() {
  try {
    await runtimeFetch('/health');
    return true;
  } catch {
    return false;
  }
}

async function waitForRuntimeHealthy(timeoutMs, intervalMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isRuntimeHealthy()) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

function startRuntimeInBackground() {
  if (!fs.existsSync(AGENT_RUNTIME_WORKDIR)) {
    throw new Error(
      `Runtime workdir not found: ${AGENT_RUNTIME_WORKDIR}. Set AGENT_RUNTIME_WORKDIR to the yorizon-agent-runtime directory.`,
    );
  }
  if (!fs.existsSync(AGENT_RUNTIME_PYTHON)) {
    throw new Error(
      `Runtime python not found: ${AGENT_RUNTIME_PYTHON}. Set AGENT_RUNTIME_PYTHON to your Python executable.`,
    );
  }

  const child = spawn(
    AGENT_RUNTIME_PYTHON,
    ['-m', 'uvicorn', AGENT_RUNTIME_APP_MODULE, '--host', AGENT_RUNTIME_HOST, '--port', String(AGENT_RUNTIME_PORT)],
    {
      cwd: AGENT_RUNTIME_WORKDIR,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
    },
  );

  child.unref();
}

async function ensureRuntimeReady() {
  if (await isRuntimeHealthy()) {
    return;
  }

  if (!AGENT_RUNTIME_AUTOSTART) {
    throw new Error(
      `Agent runtime is not reachable at ${AGENT_RUNTIME_URL}. Enable AGENT_RUNTIME_AUTOSTART=true or start runtime manually.`,
    );
  }

  startRuntimeInBackground();

  const healthy = await waitForRuntimeHealthy(AGENT_RUNTIME_HEALTH_TIMEOUT_MS, AGENT_RUNTIME_HEALTH_INTERVAL_MS);
  if (!healthy) {
    throw new Error(
      `Agent runtime did not become healthy at ${AGENT_RUNTIME_URL} within ${AGENT_RUNTIME_HEALTH_TIMEOUT_MS}ms after auto-start.`,
    );
  }
}

// ─── Tool definitions ──────────────────────────────────────────────────────────

const toolDefinitions = [
  {
    name: 'agent_list_available',
    description:
      'List all agents, teams, and workflows available in the Yorizon agent runtime. ' +
      'Returns agents, teams (pre-built multi-agent groups), workflows (LangGraph with optional human-in-the-loop), and the count of currently active workflow instances.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'agent_run_task',
    description:
      'Run a single named agent with a task description. ' +
      'Use this for point-in-time agent invocations that do not require a full team or workflow. ' +
      'Supported agents: NFR_Auditor, Security_Reviewer, Knowledge_Curator, ADO_Analyst.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'task'],
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (e.g. NFR_Auditor, Security_Reviewer, Knowledge_Curator, ADO_Analyst)',
        },
        task: {
          type: 'string',
          description: 'Task description for the agent to execute',
        },
        async_mode: {
          type: 'boolean',
          description: 'If true, queue the run and return a job_id immediately (recommended for long tasks). If omitted, nfr-audit defaults to true.',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Optional request timeout override in seconds for synchronous mode.',
        },
      },
    },
  },
  {
    name: 'agent_run_team',
    description:
      'Run an AutoGen multi-agent team against a topic. ' +
      'Teams are defined in teams.yaml and composed of agents loaded from .agent.md specs. ' +
      'Use agent_list_available to discover available teams. ' +
      'Returns the full team conversation result including gaps, security concerns, and message count.',
    inputSchema: {
      type: 'object',
      required: ['team', 'task'],
      properties: {
        team: {
          type: 'string',
          description: 'Team name (e.g. "nfr-audit", "maintenance") — use agent_list_available to see all',
        },
        task: {
          type: 'string',
          description: 'Task description for the team (e.g. "Audit security NFRs for Portal and DevOps")',
        },
        async_mode: {
          type: 'boolean',
          description: 'If true, queue the run and return a job_id immediately (recommended for long tasks). If omitted, nfr-audit* teams default to true.',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Optional request timeout override in seconds for synchronous mode.',
        },
      },
    },
  },
  {
    name: 'agent_get_result',
    description:
      'Get status/result for an async team/task run by job_id. ' +
      'Use this after agent_run_team or agent_run_task when async_mode=true.',
    inputSchema: {
      type: 'object',
      required: ['job_id'],
      properties: {
        job_id: {
          type: 'string',
          description: 'Job ID returned by async agent_run_team or agent_run_task',
        },
      },
    },
  },
  {
    name: 'agent_run_workflow',
    description:
      'Start a LangGraph workflow. Returns immediately with a workflow_id if the workflow pauses for human review. ' +
      'Available workflows: "nfr-audit" (includes human-in-the-loop review step). ' +
      'Use agent_resume_workflow to continue after human review.',
    inputSchema: {
      type: 'object',
      required: ['workflow', 'category'],
      properties: {
        workflow: {
          type: 'string',
          description: 'Workflow name: "nfr-audit"',
          enum: ['nfr-audit'],
        },
        category: {
          type: 'string',
          description: 'Topic or category for the workflow (e.g. "security", "availability")',
        },
      },
    },
  },
  {
    name: 'agent_resume_workflow',
    description:
      'Resume a paused LangGraph workflow after human review. ' +
      'Provide the workflow_id returned by agent_run_workflow and a decision string ("approve", "reject", or free-text instructions).',
    inputSchema: {
      type: 'object',
      required: ['workflow_id', 'decision'],
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Workflow ID returned by agent_run_workflow',
        },
        decision: {
          type: 'string',
          description: 'Human decision: "approve", "reject", or free-text instructions for the workflow to continue with',
        },
      },
    },
  },
  {
    name: 'agent_health',
    description:
      'Check whether the Yorizon agent runtime is reachable and healthy. ' +
      'Returns status and version. Use this before running other agent tools to verify the runtime is up.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(name, args) {
  function withPollingHint(payload, context = {}) {
    if (!payload || payload.status !== 'queued' || !payload.job_id) {
      return payload;
    }
    return {
      ...payload,
      next_action: {
        tool: 'agent_get_result',
        input: { job_id: payload.job_id },
        recommendation: 'Poll every 3-5 seconds until status is completed, failed, or timed_out.',
      },
      context,
    };
  }

  switch (name) {
    // ── agent_health ────────────────────────────────────────────────────────
    case 'agent_health': {
      const data = await runtimeFetch('/health');
      return { status: data.status, version: data.version, url: AGENT_RUNTIME_URL };
    }

    // ── agent_list_available ────────────────────────────────────────────────
    case 'agent_list_available': {
      const data = await runtimeFetch('/agents');
      return data;
    }

    // ── agent_run_task ──────────────────────────────────────────────────────
    case 'agent_run_task': {
      const { agent, task, async_mode, timeout_seconds } = args;
      if (!agent || !task) throw new Error('agent and task are required');

      // Route single-agent tasks through the generic /teams/run endpoint.
      // The runtime will select the appropriate team based on the agent name.
      const lowerAgent = agent.toLowerCase();
      let team = 'nfr-audit';
      if (lowerAgent.includes('curator') || lowerAgent.includes('maintenance') || lowerAgent.includes('validator')) {
        team = 'maintenance';
      }
      const resolvedAsyncMode = async_mode ?? team.startsWith('nfr-audit');
      const data = await runtimeFetch('/teams/run', {
        method: 'POST',
        body: JSON.stringify({ team, task, async_mode: resolvedAsyncMode, timeout_seconds }),
      });
      return withPollingHint({ agent, task, team, async_mode: resolvedAsyncMode, ...data }, { routed_from: 'agent_run_task' });
    }

    // ── agent_run_team ──────────────────────────────────────────────────────
    case 'agent_run_team': {
      const { team, task, async_mode, timeout_seconds } = args;
      if (!team || !task) throw new Error('team and task are required');

      const resolvedAsyncMode = async_mode ?? team.startsWith('nfr-audit');

      const data = await runtimeFetch('/teams/run', {
        method: 'POST',
        body: JSON.stringify({ team, task, async_mode: resolvedAsyncMode, timeout_seconds }),
      });
      return withPollingHint({ team, task, async_mode: resolvedAsyncMode, ...data });
    }

    // ── agent_get_result ───────────────────────────────────────────────────
    case 'agent_get_result': {
      const { job_id } = args;
      if (!job_id) throw new Error('job_id is required');
      const encodedJobId = encodeURIComponent(job_id);
      const data = await runtimeFetch(`/jobs/${encodedJobId}`);
      return data;
    }

    // ── agent_run_workflow ──────────────────────────────────────────────────
    case 'agent_run_workflow': {
      const { workflow, category } = args;
      if (!workflow || !category) throw new Error('workflow and category are required');

      // Only nfr-audit workflow supported currently
      const data = await runtimeFetch('/workflows/nfr-audit', {
        method: 'POST',
        body: JSON.stringify({ category }),
      });
      return { workflow, category, ...data };
    }

    // ── agent_resume_workflow ───────────────────────────────────────────────
    case 'agent_resume_workflow': {
      const { workflow_id, decision } = args;
      if (!workflow_id || !decision) throw new Error('workflow_id and decision are required');

      const data = await runtimeFetch('/workflows/resume', {
        method: 'POST',
        body: JSON.stringify({ workflow_id, decision }),
      });
      return data;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP server wiring ─────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-agent-runtime-bridge', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const start = Date.now();
  try {
    const result = await handleTool(name, args || {});
    log.toolCall(name, args, Date.now() - start);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    log.toolCall(name, args, elapsed, { success: false, error: message });
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return mcpError('CONNECTION_ERROR', message, {
        tool: name,
        recovery: 'The agent runtime is not reachable.',
        next_steps: ['Check if the FastAPI server is running on ' + AGENT_RUNTIME_URL, 'Run: cd yorizon-agent-runtime && uvicorn yorizon_agents.server:app'],
      });
    }
    if (message.includes('404')) {
      return mcpError('NOT_FOUND', message, {
        tool: name,
        recovery: 'The requested agent or endpoint was not found.',
        next_steps: ['Use agent_list_available to see available agents', 'Check agent name spelling'],
      });
    }
    if (message.includes('timeout') || message.includes('504')) {
      return mcpError('TIMEOUT', message, {
        tool: name,
        recovery: 'The agent operation timed out.',
        next_steps: ['Retry with a simpler task', 'Use async_mode: true for long-running operations'],
      });
    }
    return mcpError('INTERNAL_ERROR', message, {
      tool: name,
      recovery: 'An unexpected error occurred in the agent runtime.',
      next_steps: ['Retry the operation', 'Check runtime logs'],
    });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  log.info('Starting', { url: AGENT_RUNTIME_URL });
  await ensureRuntimeReady();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('Connected to MCP transport');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
