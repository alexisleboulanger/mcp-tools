// Simple harness to send an MCP initialize after spawning wrapper
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['serp-wrapper.js'], { cwd: __dirname, stdio: ['pipe','pipe','inherit'], env: process.env });
child.stdout.on('data', d => process.stdout.write(d));

// Send initialize with explicit params (wrapper will still inject missing fields if any)
setTimeout(() => {
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '0.1', capabilities: {}, clientInfo: { name: 'harness', version: '0.0.0' } } };
  process.stderr.write('[harness] Sending initialize\n');
  child.stdin.write(JSON.stringify(init)+'\n');
}, 400);

// After initialize response, request list_tools
setTimeout(() => {
  const listTools = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  process.stderr.write('[harness] Sending tools/list\n');
  child.stdin.write(JSON.stringify(listTools)+'\n');
}, 1200);
