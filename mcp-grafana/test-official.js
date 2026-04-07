#!/usr/bin/env node
/**
 * Test the official grafana/mcp-grafana server via MCP JSON-RPC protocol.
 * Sends initialize → tools/list → query_prometheus for yorizon-system-api metrics.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const UVX = 'C:\\Users\\aleboula\\AppData\\Roaming\\Python\\Python311\\Scripts\\uvx.exe';
const NS = 'yorizon-system-api';

const env = {
  ...process.env,
  GRAFANA_URL: process.env.GRAFANA_URL,
  GRAFANA_USERNAME: process.env.GRAFANA_USER,
  GRAFANA_PASSWORD: process.env.GRAFANA_PASSWORD,
};

let msgId = 1;
function jsonrpc(method, params = {}) {
  return JSON.stringify({ jsonrpc: '2.0', id: msgId++, method, params }) + '\n';
}

const child = spawn(UVX, ['mcp-grafana', '--disable-write'], { env, stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
const responses = {};
const pending = {};

child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending[msg.id]) {
        responses[msg.id] = msg;
        pending[msg.id](msg);
        delete pending[msg.id];
      }
    } catch {}
  }
});

child.stderr.on('data', (chunk) => {
  // Show server logs
  const text = chunk.toString().trim();
  if (text) console.error('[official]', text);
});

function send(method, params = {}) {
  const id = msgId;
  const msg = jsonrpc(method, params);
  return new Promise((resolve) => {
    pending[id] = resolve;
    child.stdin.write(msg);
  });
}

const TWO_DAYS_SEC = 2 * 24 * 3600;
const now = Math.floor(Date.now() / 1000);
const start = now - TWO_DAYS_SEC;

async function main() {
  console.log('\n=== Testing Official grafana/mcp-grafana ===\n');
  console.log('URL:', env.GRAFANA_URL);
  console.log('Auth: username/password\n');

  // Step 1: Initialize
  console.log('--- Initialize ---');
  const initResp = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-official', version: '1.0.0' },
  });
  console.log('Server:', initResp.result?.serverInfo?.name, initResp.result?.serverInfo?.version);

  // Notify initialized
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // Step 2: List tools
  console.log('\n--- Tools Available ---');
  const toolsResp = await send('tools/list', {});
  const tools = toolsResp.result?.tools || [];
  console.log(`Total tools: ${tools.length}`);
  const promTools = tools.filter(t => t.name.includes('prometheus'));
  console.log('Prometheus tools:', promTools.map(t => t.name).join(', '));

  // Step 3: list_datasources
  console.log('\n--- Datasources ---');
  const dsResp = await send('tools/call', {
    name: 'list_datasources',
    arguments: {},
  });
  const dsText = dsResp.result?.content?.[0]?.text || '';
  console.log(dsText.slice(0, 500));

  // Step 4: Query CPU usage (instant)
  console.log('\n--- CPU Usage (instant) for', NS, '---');
  const cpuResp = await send('tools/call', {
    name: 'query_prometheus',
    arguments: {
      datasourceUid: 'mimir',
      expr: `sum(rate(container_cpu_usage_seconds_total{namespace="${NS}",container!="",container!="POD"}[5m]))`,
      queryType: 'instant',
      endTime: 'now',
    },
  });
  console.log(cpuResp.result?.content?.[0]?.text?.slice(0, 500) || JSON.stringify(cpuResp.error));

  // Step 5: Query Memory usage (instant)
  console.log('\n--- Memory Usage (instant) for', NS, '---');
  const memResp = await send('tools/call', {
    name: 'query_prometheus',
    arguments: {
      datasourceUid: 'mimir',
      expr: `sum(container_memory_working_set_bytes{namespace="${NS}",container!="",container!="POD"})`,
      queryType: 'instant',
      endTime: 'now',
    },
  });
  console.log(memResp.result?.content?.[0]?.text?.slice(0, 500) || JSON.stringify(memResp.error));

  // Step 6: Range query - CPU over 2 days
  console.log('\n--- CPU Range (last 2 days) for', NS, '---');
  const cpuRangeResp = await send('tools/call', {
    name: 'query_prometheus',
    arguments: {
      datasourceUid: 'mimir',
      expr: `sum(rate(container_cpu_usage_seconds_total{namespace="${NS}",container!="",container!="POD"}[5m]))`,
      queryType: 'range',
      startTime: 'now-2d',
      endTime: 'now',
      stepSeconds: 300,
    },
  });
  const cpuRangeText = cpuRangeResp.result?.content?.[0]?.text || JSON.stringify(cpuRangeResp.error);
  // Parse and summarize if it's range data
  try {
    const data = JSON.parse(cpuRangeText);
    if (data.data?.result?.[0]?.values) {
      const vals = data.data.result[0].values.map(v => Number(v[1]));
      console.log(`  Data points: ${vals.length}`);
      console.log(`  Min: ${Math.min(...vals).toFixed(3)} cores`);
      console.log(`  Max: ${Math.max(...vals).toFixed(3)} cores`);
      console.log(`  Avg: ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3)} cores`);
    } else {
      console.log(cpuRangeText.slice(0, 500));
    }
  } catch {
    console.log(cpuRangeText.slice(0, 500));
  }

  // Step 7: Range query - Memory over 2 days
  console.log('\n--- Memory Range (last 2 days) for', NS, '---');
  const memRangeResp = await send('tools/call', {
    name: 'query_prometheus',
    arguments: {
      datasourceUid: 'mimir',
      expr: `sum(container_memory_working_set_bytes{namespace="${NS}",container!="",container!="POD"})`,
      queryType: 'range',
      startTime: 'now-2d',
      endTime: 'now',
      stepSeconds: 300,
    },
  });
  const memRangeText = memRangeResp.result?.content?.[0]?.text || JSON.stringify(memRangeResp.error);
  try {
    const data = JSON.parse(memRangeText);
    if (data.data?.result?.[0]?.values) {
      const vals = data.data.result[0].values.map(v => Number(v[1]));
      const toGiB = v => (v / 1024 ** 3).toFixed(2);
      console.log(`  Data points: ${vals.length}`);
      console.log(`  Min: ${toGiB(Math.min(...vals))} GiB`);
      console.log(`  Max: ${toGiB(Math.max(...vals))} GiB`);
      console.log(`  Avg: ${toGiB(vals.reduce((a, b) => a + b, 0) / vals.length)} GiB`);
    } else {
      console.log(memRangeText.slice(0, 500));
    }
  } catch {
    console.log(memRangeText.slice(0, 500));
  }

  console.log('\n=== Done ===\n');
  child.kill();
  process.exit(0);
}

// Timeout safety
setTimeout(() => {
  console.error('TIMEOUT — killing official server');
  child.kill();
  process.exit(1);
}, 60000);

main().catch(err => {
  console.error('Fatal:', err.message);
  child.kill();
  process.exit(1);
});
