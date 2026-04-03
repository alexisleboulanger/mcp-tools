// Lightweight structured file logger for MCP servers.
// Zero dependencies — uses only Node.js built-ins.
// Writes NDJSON to a rotating log file in the shared/logs/ directory.
// Also forwards to stderr for MCP-compatible diagnostic output.
//
// Usage:
//   const log = require('../shared/mcp-logger')('mcp-knowledge');
//   log.info('Server started', { tools: 16 });
//   log.error('Tool failed', { tool: 'search', error: err.message });

const fs = require('node:fs');
const path = require('node:path');

const LOG_DIR = process.env.MCP_LOG_DIR || path.join(__dirname, 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB before rotation

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function rotateIfNeeded(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_LOG_SIZE) {
      const rotated = filePath.replace('.log', `.${Date.now()}.log`);
      fs.renameSync(filePath, rotated);
    }
  } catch {
    // File doesn't exist yet — no rotation needed.
  }
}

function createLogger(serverName) {
  ensureLogDir();
  const logFile = path.join(LOG_DIR, `${serverName}.log`);

  function write(level, msg, data) {
    const entry = {
      time: new Date().toISOString(),
      level,
      server: serverName,
      msg,
      ...data,
    };
    const line = JSON.stringify(entry);

    // Write to file (append, sync to avoid interleaving).
    try {
      rotateIfNeeded(logFile);
      fs.appendFileSync(logFile, line + '\n', 'utf8');
    } catch {
      // Logging failure should never crash the server.
    }

    // Also write to stderr for MCP diagnostic output.
    process.stderr.write(`[${serverName}] ${level}: ${msg}\n`);
  }

  return {
    info(msg, data = {}) { write('info', msg, data); },
    warn(msg, data = {}) { write('warn', msg, data); },
    error(msg, data = {}) { write('error', msg, data); },
    debug(msg, data = {}) {
      if (process.env.MCP_DEBUG) write('debug', msg, data);
    },
    /** Log a tool invocation (call + duration). */
    toolCall(toolName, args, durationMs, opts = {}) {
      write('info', `tool:${toolName}`, {
        tool: toolName,
        args: Object.keys(args || {}),
        durationMs,
        success: opts.success !== false,
        ...(opts.error ? { error: opts.error } : {}),
      });
    },
  };
}

module.exports = createLogger;
