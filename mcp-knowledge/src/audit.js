/**
 * Lightweight append-only audit log for knowledge-graph mutations.
 * Each line is a JSON object (JSONL format).
 */
const fs = require('node:fs');
const path = require('node:path');
const { MEMORY_DIR } = require('./config');

const AUDIT_LOG = path.join(MEMORY_DIR, 'audit-log.jsonl');

function logOperation(operation, target, details) {
  const entry = {
    t: new Date().toISOString(),
    op: operation,
    target,
    ...details,
  };
  try {
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch { /* non-critical — don't crash on audit failure */ }
}

module.exports = { logOperation };
