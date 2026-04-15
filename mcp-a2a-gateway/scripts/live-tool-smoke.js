#!/usr/bin/env node

const http = require('node:http');
const path = require('node:path');

process.env.A2A_AGENT_CARDS_PATH = process.env.A2A_AGENT_CARDS_PATH || path.join(__dirname, '..', 'agent-cards');

const { handleTool } = require('../server');

function startMockAgentServer(port) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/a2a') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch {
          payload = {};
        }

        const response = {
          status: 'ok',
          accepted: true,
          correlation_id: payload.correlation_id || null,
          summary: `Mock agent processed task: ${payload.task || ''}`,
          inputEcho: payload.input || {},
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function pollJob(jobId) {
  for (let i = 0; i < 20; i += 1) {
    const result = await handleTool('a2a_get_result', { job_id: jobId });
    if (result.status === 'completed' || result.status === 'failed') return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return handleTool('a2a_get_result', { job_id: jobId });
}

async function main() {
  const mockPort = 8900;
  const server = await startMockAgentServer(mockPort);

  try {
    const list = await handleTool('a2a_list_agents', {});
    const discover = await handleTool('a2a_discover', { query: 'nfr audit', top_k: 3 });

    const targetAgent = (list.agents || []).find((a) => a.endpoint === `http://localhost:${mockPort}/a2a`)?.name || 'ADOAgent';

    const send = await handleTool('a2a_send_task', {
      agent: targetAgent,
      task: 'Run A2A pilot flow smoke test',
      input: { scope: 'security' },
      mode: 'http',
      timeout_ms: 5000,
      retry_count: 1,
    });

    const final = await pollJob(send.job_id);

    process.stdout.write(
      JSON.stringify(
        {
          status: 'ok',
          list_count: list.count,
          discover_count: discover.count,
          send,
          final,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    server.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
