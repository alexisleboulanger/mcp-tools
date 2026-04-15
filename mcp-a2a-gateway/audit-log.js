const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_AUDIT_LOG_PATH = process.env.A2A_AUDIT_LOG_PATH || path.join(__dirname, 'data', 'audit-log.jsonl');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createAuditLogger(options = {}) {
  const filePath = options.filePath || DEFAULT_AUDIT_LOG_PATH;
  ensureDir(filePath);

  function write(event, details = {}) {
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...details,
    };
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  }

  return {
    filePath,
    write,
  };
}

module.exports = {
  DEFAULT_AUDIT_LOG_PATH,
  createAuditLogger,
};
