/**
 * Quick smoke test — verifies the MCP server can start and respond to tool calls.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const serverPath = path.join(__dirname, 'server.js');

async function test() {
  console.log('Starting MCP Dependency Check server...');

  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DC_BIN: 'C:\\tools\\dependency-check\\bin\\dependency-check.bat',
    },
  });

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (d) => { stdout += d.toString(); });
  proc.stderr.on('data', (d) => { stderr += d.toString(); });

  // Give it a moment to start
  await new Promise(r => setTimeout(r, 1000));

  // Send a JSON-RPC initialize request
  const initReq = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    },
  });

  proc.stdin.write(`Content-Length: ${Buffer.byteLength(initReq)}\r\n\r\n${initReq}`);

  await new Promise(r => setTimeout(r, 1000));

  // Send list tools
  const listReq = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  proc.stdin.write(`Content-Length: ${Buffer.byteLength(listReq)}\r\n\r\n${listReq}`);

  await new Promise(r => setTimeout(r, 1000));

  proc.kill();

  console.log('\n=== STDERR (diagnostic) ===');
  console.log(stderr.substring(0, 500));
  console.log('\n=== STDOUT (responses) ===');

  // Parse response bodies from stdout (skip Content-Length headers)
  const bodies = stdout.split(/Content-Length: \d+\r\n\r\n/).filter(Boolean);
  for (const body of bodies) {
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Raw:', body.substring(0, 200));
    }
  }

  console.log('\n✅ Test complete');
}

test().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
