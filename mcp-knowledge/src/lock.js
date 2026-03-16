/**
 * File-based write lock for knowledge-graph mutations.
 * Prevents concurrent saveGraph() calls from corrupting the graph file.
 */
const fsp = require('node:fs/promises');
const path = require('node:path');
const { MEMORY_DIR } = require('./config');

const LOCK_FILE = path.join(MEMORY_DIR, '.graph.lock');
const LOCK_TIMEOUT = 5000; // 5s max wait

async function acquireLock() {
  const start = Date.now();
  while (Date.now() - start < LOCK_TIMEOUT) {
    try {
      await fsp.writeFile(LOCK_FILE, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  throw new Error('Knowledge graph lock timeout — another operation in progress');
}

async function releaseLock() {
  try { await fsp.unlink(LOCK_FILE); } catch { /* already released */ }
}

module.exports = { acquireLock, releaseLock };