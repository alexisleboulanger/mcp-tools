#!/usr/bin/env node

/**
 * MCP A2A Gateway
 *
 * Provides the A2A protocol tool surface:
 * - a2a_send_task  — dispatch a task to an agent endpoint (HTTP or scaffold)
 * - a2a_get_result — poll job status / retrieve result
 *
 * Agent listing and discovery are handled by the agent-registry MCP server.
 * This gateway is purely the task dispatch + result layer.
 */

const crypto = require('node:crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { mcpError, withErrorHandling } = require('../shared/mcp-error');
const createLogger = require('../shared/mcp-logger');
const { DEFAULT_JOB_STORE_PATH, createJobStore } = require('./job-store');
const { DEFAULT_AUDIT_LOG_PATH, createAuditLogger } = require('./audit-log');

const log = createLogger('mcp-a2a-gateway');
const A2A_SIMULATED_DELAY_MS = Number(process.env.A2A_SIMULATED_DELAY_MS || 500);
const A2A_REQUEST_TIMEOUT_MS = Number(process.env.A2A_REQUEST_TIMEOUT_MS || 30000);
const A2A_RETRY_COUNT = Number(process.env.A2A_RETRY_COUNT || 1);
const A2A_RETRY_DELAY_MS = Number(process.env.A2A_RETRY_DELAY_MS || 500);
const A2A_ALLOW_SCAFFOLD_FALLBACK = (process.env.A2A_ALLOW_SCAFFOLD_FALLBACK || 'true').toLowerCase() === 'true';
const A2A_JOB_STORE_MAX_ENTRIES = Number(process.env.A2A_JOB_STORE_MAX_ENTRIES || 5000);

const jobStore = createJobStore({
  filePath: DEFAULT_JOB_STORE_PATH,
  maxEntries: A2A_JOB_STORE_MAX_ENTRIES,
});

const auditLog = createAuditLogger({ filePath: DEFAULT_AUDIT_LOG_PATH });

function nowIso() {
  return new Date().toISOString();
}

function makeJobId() {
  return `job_${crypto.randomUUID()}`;
}

function audit(event, payload = {}) {
  try {
    auditLog.write(event, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('Audit write failed', { event, error: message });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatchHttpTask({ endpoint, task, input, correlationId, timeoutMs, retryCount, retryDelayMs }) {
  const maxAttempts = Math.max(1, Number(retryCount) + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
        },
        body: JSON.stringify({
          task,
          input: input || {},
          correlation_id: correlationId,
          source: 'mcp-a2a-gateway',
          requested_at: nowIso(),
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      let payload;
      if (contentType.includes('application/json')) {
        payload = await response.json();
      } else {
        payload = await response.text();
      }

      if (!response.ok) {
        const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
        throw new Error(`HTTP ${response.status}: ${msg}`);
      }

      clearTimeout(timeout);
      return {
        ok: true,
        endpoint,
        attempts: attempt,
        duration_ms: Date.now() - startedAt,
        http_status: response.status,
        payload,
      };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  return {
    ok: false,
    endpoint,
    attempts: maxAttempts,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function queueHttpJob({ agentName, endpoint, task, input, correlationId, timeoutMs, retryCount, retryDelayMs, mode }) {
  const id = makeJobId();
  const startedAt = nowIso();
  const job = {
    job_id: id,
    status: 'queued',
    mode,
    agent: agentName,
    endpoint,
    correlation_id: correlationId,
    task,
    input: input || {},
    created_at: startedAt,
    updated_at: startedAt,
    completed_at: null,
    result: null,
    error: null,
  };
  jobStore.set(job);
  audit('job.queued', {
    job_id: id,
    mode,
    agent: agentName,
    endpoint,
    correlation_id: correlationId,
    task,
    timeout_ms: timeoutMs,
    retry_count: retryCount,
  });

  setTimeout(async () => {
    const current = jobStore.get(id);
    if (!current || current.status !== 'queued') return;

    current.status = 'running';
    current.updated_at = nowIso();
    jobStore.set(current);
    audit('job.running', {
      job_id: id,
      mode,
      agent: agentName,
      endpoint,
      correlation_id: correlationId,
    });

    const dispatch = await dispatchHttpTask({
      endpoint,
      task,
      input,
      correlationId,
      timeoutMs,
      retryCount,
      retryDelayMs,
    });

    const completedAt = nowIso();
    if (dispatch.ok) {
      current.status = 'completed';
      current.updated_at = completedAt;
      current.completed_at = completedAt;
      current.result = {
        dispatch: 'http',
        endpoint,
        attempts: dispatch.attempts,
        duration_ms: dispatch.duration_ms,
        http_status: dispatch.http_status,
        payload: dispatch.payload,
      };
      jobStore.set(current);
      log.info('Job completed (http)', { job_id: id, agent: agentName, endpoint, attempts: dispatch.attempts });
      audit('job.completed', {
        job_id: id,
        mode,
        dispatch: 'http',
        agent: agentName,
        endpoint,
        correlation_id: correlationId,
        attempts: dispatch.attempts,
        http_status: dispatch.http_status,
      });
      return;
    }

    if (mode === 'auto' && A2A_ALLOW_SCAFFOLD_FALLBACK) {
      current.status = 'completed';
      current.updated_at = completedAt;
      current.completed_at = completedAt;
      current.result = {
        dispatch: 'scaffold-fallback',
        warning: 'HTTP dispatch failed; scaffold fallback used.',
        endpoint,
        attempts: dispatch.attempts,
        error: dispatch.error,
        summary: `Fallback execution complete for ${agentName}`,
        output: `Task accepted in fallback mode: ${task}`,
      };
      jobStore.set(current);
      log.warn('Job completed with scaffold fallback', { job_id: id, agent: agentName, endpoint, error: dispatch.error });
      audit('job.completed', {
        job_id: id,
        mode,
        dispatch: 'scaffold-fallback',
        agent: agentName,
        endpoint,
        correlation_id: correlationId,
        attempts: dispatch.attempts,
        error: dispatch.error,
      });
      return;
    }

    current.status = 'failed';
    current.updated_at = completedAt;
    current.completed_at = completedAt;
    current.error = {
      dispatch: 'http',
      endpoint,
      attempts: dispatch.attempts,
      message: dispatch.error,
    };
    jobStore.set(current);
    log.error('Job failed (http)', { job_id: id, agent: agentName, endpoint, error: dispatch.error });
    audit('job.failed', {
      job_id: id,
      mode,
      dispatch: 'http',
      agent: agentName,
      endpoint,
      correlation_id: correlationId,
      attempts: dispatch.attempts,
      error: dispatch.error,
    });
  }, 0);

  return job;
}

function queueScaffoldJob(agentName, task, input) {
  const id = makeJobId();
  const startedAt = nowIso();
  const job = {
    job_id: id,
    status: 'queued',
    mode: 'scaffold',
    agent: agentName,
    task,
    input: input || {},
    created_at: startedAt,
    updated_at: startedAt,
    completed_at: null,
    result: null,
    error: null,
  };

  jobStore.set(job);
  audit('job.queued', {
    job_id: id,
    mode: 'scaffold',
    agent: agentName,
    task,
  });

  setTimeout(() => {
    const current = jobStore.get(id);
    if (!current || current.status !== 'queued') return;

    const completedAt = nowIso();
    current.status = 'completed';
    current.updated_at = completedAt;
    current.completed_at = completedAt;
    current.result = {
      summary: `Scaffold execution complete for ${agentName}`,
      output: `Task accepted in scaffold mode: ${task}`,
      note: 'Replace scaffold dispatcher with real A2A HTTP invocation.',
    };

    jobStore.set(current);
    log.info('Job completed (scaffold)', { job_id: id, agent: agentName });
    audit('job.completed', {
      job_id: id,
      mode: 'scaffold',
      dispatch: 'scaffold',
      agent: agentName,
    });
  }, A2A_SIMULATED_DELAY_MS);

  return job;
}

const toolDefinitions = [
  {
    name: 'a2a_send_task',
    description:
      'Send a task to a target A2A agent. ' +
      'Use agent-registry (find_agent / get_agent_card) to discover agents and their endpoints first. ' +
      'Default mode is auto: HTTP dispatch with timeout/retry/correlation-id, then optional scaffold fallback. ' +
      'Use a2a_get_result to poll completion.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'task'],
      properties: {
        agent: {
          type: 'string',
          description: 'Target agent name (use agent-registry find_agent to discover agents).',
        },
        task: {
          type: 'string',
          description: 'Task description to dispatch to the target agent.',
        },
        endpoint: {
          type: 'string',
          description: 'HTTP endpoint URL for the agent (from agent-registry get_agent_card). Required for http/auto mode.',
        },
        input: {
          type: 'object',
          description: 'Optional structured payload for the task.',
        },
        mode: {
          type: 'string',
          enum: ['auto', 'http', 'scaffold'],
          description: 'Dispatch mode: auto (default), http only, or scaffold only.',
        },
        correlation_id: {
          type: 'string',
          description: 'Optional correlation identifier propagated to the target endpoint.',
        },
        timeout_ms: {
          type: 'number',
          description: `Optional request timeout in ms (default ${A2A_REQUEST_TIMEOUT_MS}).`,
        },
        retry_count: {
          type: 'number',
          description: `Optional retry count for HTTP dispatch (default ${A2A_RETRY_COUNT}).`,
        },
      },
    },
  },
  {
    name: 'a2a_get_result',
    description:
      'Get the status/result of a previously submitted A2A task using job_id. ' +
      'Scaffold jobs progress queued -> completed in-memory.',
    inputSchema: {
      type: 'object',
      required: ['job_id'],
      properties: {
        job_id: {
          type: 'string',
          description: 'Job id returned by a2a_send_task.',
        },
      },
    },
  },
];

async function handleTool(name, args) {
  switch (name) {
    case 'a2a_send_task': {
      const agentName = String(args.agent || '').trim();
      const task = String(args.task || '').trim();
      const mode = String(args.mode || 'auto').trim().toLowerCase();
      const correlationId = String(args.correlation_id || crypto.randomUUID());
      const timeoutMs = Number(args.timeout_ms || A2A_REQUEST_TIMEOUT_MS);
      const retryCount = Number(args.retry_count || A2A_RETRY_COUNT);
      const endpoint = args.endpoint ? String(args.endpoint).trim() : null;
      if (!agentName) throw new Error('agent is required');
      if (!task) throw new Error('task is required');
      if (!['auto', 'http', 'scaffold'].includes(mode)) {
        throw new Error('mode must be one of: auto, http, scaffold');
      }
      if (mode === 'http' && !endpoint) {
        throw new Error('endpoint is required when mode is http. Use agent-registry get_agent_card to find the endpoint.');
      }

      if (mode === 'scaffold') {
        const job = queueScaffoldJob(agentName, task, args.input || {});
        audit('tool.a2a_send_task', {
          mode: 'scaffold',
          job_id: job.job_id,
          agent: agentName,
          correlation_id: correlationId,
        });
        return {
          status: 'queued',
          mode: 'scaffold',
          correlation_id: correlationId,
          job_id: job.job_id,
          agent: agentName,
          task,
          note: 'Scaffold-only mode.',
          next_action: {
            tool: 'a2a_get_result',
            input: { job_id: job.job_id },
          },
        };
      }

      if (!endpoint) {
        if (mode === 'auto' && A2A_ALLOW_SCAFFOLD_FALLBACK) {
          const job = queueScaffoldJob(agentName, task, args.input || {});
          audit('tool.a2a_send_task', {
            mode: 'scaffold-fallback-no-endpoint',
            job_id: job.job_id,
            agent: agentName,
            correlation_id: correlationId,
          });
          return {
            status: 'queued',
            mode: 'scaffold-fallback',
            correlation_id: correlationId,
            job_id: job.job_id,
            agent: agentName,
            task,
            warning: 'No endpoint provided; scaffold fallback used. Use agent-registry get_agent_card to find the endpoint.',
            next_action: {
              tool: 'a2a_get_result',
              input: { job_id: job.job_id },
            },
          };
        }
        throw new Error(`No endpoint provided for ${agentName}. Use agent-registry get_agent_card to find the endpoint.`);
      }

      const job = queueHttpJob({
        agentName,
        endpoint,
        task,
        input: args.input || {},
        correlationId,
        timeoutMs,
        retryCount,
        retryDelayMs: A2A_RETRY_DELAY_MS,
        mode,
      });
      audit('tool.a2a_send_task', {
        mode,
        dispatch: 'http',
        job_id: job.job_id,
        agent: agentName,
        endpoint,
        correlation_id: correlationId,
        timeout_ms: timeoutMs,
        retry_count: retryCount,
      });
      return {
        status: 'queued',
        mode,
        dispatch: 'http',
        job_id: job.job_id,
        agent: agentName,
        endpoint,
        correlation_id: correlationId,
        timeout_ms: timeoutMs,
        retry_count: retryCount,
        task,
        note: 'HTTP dispatch queued.',
        next_action: {
          tool: 'a2a_get_result',
          input: { job_id: job.job_id },
        },
      };
    }

    case 'a2a_get_result': {
      const jobId = String(args.job_id || '').trim();
      if (!jobId) throw new Error('job_id is required');

      const job = jobStore.get(jobId);
      if (!job) {
        throw new Error(`Unknown job_id: ${jobId}`);
      }

      audit('tool.a2a_get_result', {
        job_id: jobId,
        status: job.status,
        mode: job.mode,
        correlation_id: job.correlation_id || null,
      });

      return {
        status: job.status,
        mode: job.mode,
        job_id: job.job_id,
        agent: job.agent,
        endpoint: job.endpoint,
        correlation_id: job.correlation_id,
        task: job.task,
        created_at: job.created_at,
        updated_at: job.updated_at,
        completed_at: job.completed_at,
        result: job.result,
        error: job.error,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  { name: 'mcp-a2a-gateway', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const start = Date.now();
  const name = request?.params?.name;
  const args = request?.params?.arguments || {};

  return withErrorHandling(name, async () => {
    const payload = await handleTool(name, args);
    const durationMs = Date.now() - start;
    log.toolCall(name, args, durationMs, { success: true });
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  });
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('MCP A2A Gateway server running on stdio', {
    jobStorePath: DEFAULT_JOB_STORE_PATH,
    auditLogPath: DEFAULT_AUDIT_LOG_PATH,
    persistedJobs: jobStore.size(),
    simulatedDelayMs: A2A_SIMULATED_DELAY_MS,
    timeoutMs: A2A_REQUEST_TIMEOUT_MS,
    retryCount: A2A_RETRY_COUNT,
    fallbackEnabled: A2A_ALLOW_SCAFFOLD_FALLBACK,
  });
}

if (require.main === module) {
main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  log.error('Server failed to start', { error: message });
  process.stderr.write(
    JSON.stringify(
      mcpError('STARTUP_ERROR', message, {
        recovery: 'Verify dependencies and configuration, then restart the server.',
        next_steps: ['Run npm install'],
      }),
      null,
      2,
    ) + '\n',
  );
  process.exit(1);
});
}

module.exports = {
  handleTool,
  toolDefinitions,
  queueScaffoldJob,
  dispatchHttpTask,
};
