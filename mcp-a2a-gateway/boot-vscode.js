#!/usr/bin/env node

const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

const httpPort = Number(process.env.A2A_HTTP_PORT || 8901);
const httpHost = process.env.A2A_HTTP_HOST || '127.0.0.1';

function isPortOpen(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

let facadeProc = null;

async function startFacadeSidecar() {
  const alreadyOpen = await isPortOpen(httpHost, httpPort);
  if (alreadyOpen) {
    return;
  }

  const facadeScript = path.join(__dirname, 'scripts', 'a2a-http-facade.js');
  facadeProc = spawn(process.execPath, [facadeScript], {
    cwd: __dirname,
    env: process.env,
    stdio: 'ignore',
  });

  facadeProc.unref();
}

function shutdown() {
  if (facadeProc && !facadeProc.killed) {
    try {
      facadeProc.kill('SIGTERM');
    } catch {
      // no-op
    }
  }
}

process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

startFacadeSidecar()
  .catch(() => {
    // Ignore sidecar startup errors; MCP stdio server should still run.
  })
  .finally(() => {
    // Start MCP stdio server (blocks as main process).
    // eslint-disable-next-line global-require
    require('./server.js');
  });
