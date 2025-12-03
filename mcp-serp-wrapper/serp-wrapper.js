#!/usr/bin/env node
/**
 * Wrapper launcher for SerpAPI MCP server with debug logging.
 * Provides visibility when run under VS Code MCP integration.
 */
const { spawn } = require('node:child_process');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const key = process.env.SERPAPI_API_KEY;
if (!key) {
  console.error('[serp-wrapper] SERPAPI_API_KEY missing in environment');
  process.exit(1);
}
console.error('[serp-wrapper] Starting mcp-serpapi with key length', key.length);

// Resolve entry script deterministically from package.json (avoid .bin shim & npx)
const path = require('path');
const fs = require('fs');
let serpCmd = process.execPath; // node executable
let serpArgs;
try {
  const entry = path.join(__dirname, 'node_modules', 'mcp-serpapi', 'dist', 'index.js');
  if (!fs.existsSync(entry)) throw new Error('Missing dist/index.js at expected location: ' + entry);
  serpArgs = [entry, '-k', key];
  console.error('[serp-wrapper] Using local node_modules entry', entry);
} catch (e) {
  console.error('[serp-wrapper] Failed to build local entry path:', e.message);
  process.exit(2);
}

const child = spawn(serpCmd, serpArgs, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env
});

// Forward protocol messages; also log first successful JSON-RPC response to stderr for debug
let firstResponseLogged = false;
let stdoutBuffer = '';
child.stdout.on('data', chunk => {
  const text = chunk.toString();
  stdoutBuffer += text;
  // Attempt to split by newlines (MCP typically newline-delimited)
  let idx;
  while ((idx = stdoutBuffer.indexOf('\n')) !== -1) {
    const line = stdoutBuffer.slice(0, idx + 1); // keep newline
    stdoutBuffer = stdoutBuffer.slice(idx + 1);
    if (!firstResponseLogged) {
      try {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          JSON.parse(trimmed); // parse test
          console.error('[serp-wrapper] Received first JSON-RPC frame');
          firstResponseLogged = true;
        }
      } catch (_) { /* ignore parse errors */ }
    }
    process.stdout.write(line);
  }
});
child.stdout.on('end', () => {
  if (stdoutBuffer.length) {
    process.stdout.write(stdoutBuffer);
  }
});
child.stderr.on('data', chunk => {
  process.stderr.write('[serp-err] ' + chunk.toString());
});
child.on('exit', code => {
  console.error('[serp-wrapper] Child exited with code', code);
});
child.on('error', err => {
  console.error('[serp-wrapper] Child process error', err);
});

// Intercept MCP JSON-RPC stdin to inject required initialize fields if missing
let inBuffer = '';
process.stdin.on('data', chunk => {
  inBuffer += chunk.toString();
  let idx;
  while ((idx = inBuffer.indexOf('\n')) !== -1) {
    const rawLine = inBuffer.slice(0, idx).trim();
    inBuffer = inBuffer.slice(idx + 1);
    if (!rawLine) continue;
    let obj;
    try { obj = JSON.parse(rawLine); } catch { child.stdin.write(rawLine + '\n'); continue; }
    if (obj.method === 'initialize' && obj.params) {
      let mutated = false;
      if (!obj.params.capabilities) { obj.params.capabilities = {}; mutated = true; }
      if (!obj.params.clientInfo) { obj.params.clientInfo = { name: 'serp-wrapper', version: '0.0.1' }; mutated = true; }
  if (!obj.params.protocolVersion) { obj.params.protocolVersion = '2025-06-18'; mutated = true; }
      if (mutated) console.error('[serp-wrapper] Injected missing initialize fields');
      child.stdin.write(JSON.stringify(obj) + '\n');
    } else {
      child.stdin.write(rawLine + '\n');
    }
  }
});

// Graceful shutdown passthrough
process.on('SIGINT', () => {
  console.error('[serp-wrapper] Caught SIGINT, forwarding to child');
  child.kill('SIGINT');
  process.exit(130);
});
process.on('SIGTERM', () => {
  console.error('[serp-wrapper] Caught SIGTERM, forwarding to child');
  child.kill('SIGTERM');
  process.exit(143);
});
