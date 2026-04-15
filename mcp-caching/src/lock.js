/**
 * File-based write lock for cache mutations.
 * Prevents concurrent writes from corrupting cache entries.
 */
const fsp = require('node:fs/promises');
const path = require('node:path');
const { CACHE_ROOT } = require('./config');

const LOCK_FILE = path.join(CACHE_ROOT, '.cache.lock');
const LOCK_TIMEOUT = 3000; // 3s max wait

async function acquireLock() {
  const start = Date.now();
  while (Date.now() - start < LOCK_TIMEOUT) {
    try {
      await fsp.mkdir(path.dirname(LOCK_FILE), { recursive: true });
      await fsp.writeFile(LOCK_FILE, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 30));
    }
  }
  throw new Error('Cache lock timeout — another operation in progress');
}

async function releaseLock() {
  try { await fsp.unlink(LOCK_FILE); } catch { /* already released */ }
}

module.exports = { acquireLock, releaseLock };
