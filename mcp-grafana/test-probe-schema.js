#!/usr/bin/env node
/**
 * Quick probe: get query_prometheus tool schema from official server.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const UVX = 'C:\\Users\\aleboula\\AppData\\Roaming\\Python\\Python311\\Scripts\\uvx.exe';
const env = {
  ...process.env,
  GRAFANA_URL: process.env.GRAFANA_URL,
  GRAFANA_USERNAME: process.env.GRAFANA_USER,
  GRAFANA_PASSWORD: process.env.GRAFANA_PASSWORD,
};

let msgId = 1;
const child = spawn(UVX, ['mcp-grafana'], { env, stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
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
        pending[msg.id](msg);
        delete pending[msg.id];
      }
    } catch {}
  }
});
child.stderr.on('data', () => {});

function send(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve) => {
    pending[id] = resolve;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function main() {
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'probe', version: '1.0.0' },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const resp = await send('tools/list', {});
  const tool = (resp.result?.tools || []).find(t => t.name === 'query_prometheus');
  console.log(JSON.stringify(tool, null, 2));
  child.kill();
  process.exit(0);
}

setTimeout(() => { child.kill(); process.exit(1); }, 15000);
main().catch(() => { child.kill(); process.exit(1); });
