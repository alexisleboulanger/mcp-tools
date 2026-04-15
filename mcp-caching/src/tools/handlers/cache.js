/**
 * Cache handler — implements read, write, invalidate, stats, list, prune.
 *
 * Storage layout:
 *   <CACHE_ROOT>/<source>/<cache_key>.md
 *
 * Each .md file has YAML front matter with metadata and a markdown body.
 */

const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { CACHE_ROOT, DEFAULT_TTL, STALE_THRESHOLD_HOURS, MAX_ENTRIES_PER_SOURCE } = require('../../config');
const { buildCacheKey, buildMarkdown, parseMarkdown, isoZ } = require('../../helpers');
const { acquireLock, releaseLock } = require('../../lock');
const { CacheError } = require('../../errors');

// ─── Helpers ──────────────────────────────────

function sourceDir(source) {
  // Sanitize source name to prevent path traversal
  const safe = source.replace(/[^a-z0-9_-]/gi, '');
  if (!safe) throw new CacheError('INVALID_SOURCE', `Invalid source name: "${source}"`, 'Use alphanumeric source names like "ado-workitems".');
  return path.join(CACHE_ROOT, safe);
}

function entryPath(source, cacheKey) {
  return path.join(sourceDir(source), `${cacheKey}.md`);
}

function resolveKey(args) {
  if (args.cache_key) return args.cache_key;
  if (args.query) return buildCacheKey(args.source, args.query, args.extras);
  throw new CacheError('MISSING_KEY', 'Provide either cache_key or query.', 'Include "query" so the server can generate a deterministic key.');
}

function freshness(meta) {
  const now = Date.now();
  const expires = new Date(meta.expires_at_utc).getTime();
  const fetched = new Date(meta.fetched_at_utc).getTime();
  const staleLimit = fetched + STALE_THRESHOLD_HOURS * 3600_000;

  if (now <= expires) return 'fresh';
  if (now <= staleLimit) return 'stale';
  return 'expired';
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function listSourceDirs() {
  try {
    const entries = await fsp.readdir(CACHE_ROOT, { withFileTypes: true });
    return entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
  } catch {
    return [];
  }
}

async function listEntries(source) {
  const dir = sourceDir(source);
  try {
    const files = await fsp.readdir(dir);
    const results = [];
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const content = await fsp.readFile(path.join(dir, f), 'utf8');
      const { meta, body } = parseMarkdown(content);
      const stat = await fsp.stat(path.join(dir, f));
      results.push({ file: f, meta, body, mtime: stat.mtimeMs });
    }
    return results.sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

function ok(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

// ─── Handlers ─────────────────────────────────

async function handleCacheRead(args) {
  const { source } = args;
  const key = resolveKey(args);
  const filePath = entryPath(source, key);

  try {
    const content = await fsp.readFile(filePath, 'utf8');
    const { meta, body } = parseMarkdown(content);
    const status = freshness(meta);

    if (status === 'expired') {
      return ok({
        status: 'miss',
        cache_key: key,
        reason: 'Entry expired beyond stale threshold.',
        expired_at: meta.expires_at_utc,
      });
    }

    return ok({
      status,
      cache_key: key,
      source,
      query: meta.query || '',
      fetched_at_utc: meta.fetched_at_utc,
      expires_at_utc: meta.expires_at_utc,
      ttl_minutes: Number(meta.ttl_minutes) || 0,
      content: body,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return ok({ status: 'miss', cache_key: key, reason: 'No cache entry found.' });
    }
    throw err;
  }
}

async function handleCacheWrite(args) {
  const { source, query, content } = args;
  const ttl = args.ttl_minutes || DEFAULT_TTL[source] || 60;
  const key = buildCacheKey(source, query, args.extras);
  const now = new Date();
  const expires = new Date(now.getTime() + ttl * 60_000);

  const meta = {
    cache_key: key,
    source,
    query,
    fetched_at_utc: isoZ(now),
    expires_at_utc: isoZ(expires),
    ttl_minutes: ttl,
    cache_status: 'fresh',
    refresh_hint: 'use "refresh" to force live retrieval',
  };

  const md = buildMarkdown(meta, content);
  const filePath = entryPath(source, key);

  await acquireLock();
  try {
    await ensureDir(sourceDir(source));
    await fsp.writeFile(filePath, md, 'utf8');
  } finally {
    await releaseLock();
  }

  return ok({
    status: 'written',
    cache_key: key,
    source,
    path: filePath,
    expires_at_utc: isoZ(expires),
    ttl_minutes: ttl,
  });
}

async function handleCacheInvalidate(args) {
  const { source, pattern } = args;
  const dir = sourceDir(source);

  let count = 0;
  await acquireLock();
  try {
    let files;
    try {
      files = await fsp.readdir(dir);
    } catch {
      return ok({ status: 'ok', deleted: 0, reason: 'Source directory does not exist.' });
    }

    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const key = f.replace('.md', '');
      if (!pattern || matchGlob(key, pattern)) {
        await fsp.unlink(path.join(dir, f));
        count++;
      }
    }
  } finally {
    await releaseLock();
  }

  return ok({ status: 'ok', source, deleted: count });
}

/**
 * Simple glob matching: supports * as wildcard.
 */
function matchGlob(text, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(text);
}

async function handleCacheStats(args) {
  const sources = args.source ? [args.source] : await listSourceDirs();
  const result = {};

  for (const src of sources) {
    const entries = await listEntries(src);
    let freshCount = 0, staleCount = 0, expiredCount = 0, totalBytes = 0;
    let oldest = null, newest = null;

    for (const e of entries) {
      const status = freshness(e.meta);
      if (status === 'fresh') freshCount++;
      else if (status === 'stale') staleCount++;
      else expiredCount++;

      const stat = await fsp.stat(path.join(sourceDir(src), e.file));
      totalBytes += stat.size;

      const fetched = e.meta.fetched_at_utc;
      if (!oldest || fetched < oldest) oldest = fetched;
      if (!newest || fetched > newest) newest = fetched;
    }

    result[src] = {
      total: entries.length,
      fresh: freshCount,
      stale: staleCount,
      expired: expiredCount,
      total_size_kb: Math.round(totalBytes / 1024),
      oldest_entry: oldest,
      newest_entry: newest,
    };
  }

  return ok(result);
}

async function handleCacheList(args) {
  const { source } = args;
  const limit = args.limit || 20;
  const filterStatus = args.status || 'all';

  const entries = await listEntries(source);
  const results = [];

  for (const e of entries) {
    const status = freshness(e.meta);
    if (filterStatus !== 'all' && status !== filterStatus) continue;
    results.push({
      cache_key: e.meta.cache_key || e.file.replace('.md', ''),
      source: e.meta.source || source,
      query: e.meta.query || '',
      status,
      fetched_at_utc: e.meta.fetched_at_utc,
      expires_at_utc: e.meta.expires_at_utc,
      ttl_minutes: Number(e.meta.ttl_minutes) || 0,
    });
    if (results.length >= limit) break;
  }

  return ok({ source, count: results.length, entries: results });
}

async function handleCachePrune(args) {
  const sources = args.source ? [args.source] : await listSourceDirs();
  let totalPruned = 0;

  await acquireLock();
  try {
    for (const src of sources) {
      const entries = await listEntries(src);
      let pruned = 0;

      // Remove expired entries
      for (const e of entries) {
        if (freshness(e.meta) === 'expired') {
          await fsp.unlink(path.join(sourceDir(src), e.file));
          pruned++;
        }
      }

      // Enforce max entries limit (entries are sorted by mtime desc)
      const remaining = await listEntries(src);
      if (remaining.length > MAX_ENTRIES_PER_SOURCE) {
        const excess = remaining.slice(MAX_ENTRIES_PER_SOURCE);
        for (const e of excess) {
          await fsp.unlink(path.join(sourceDir(src), e.file));
          pruned++;
        }
      }

      totalPruned += pruned;
    }
  } finally {
    await releaseLock();
  }

  return ok({ status: 'ok', pruned: totalPruned });
}

module.exports = {
  handleCacheRead,
  handleCacheWrite,
  handleCacheInvalidate,
  handleCacheStats,
  handleCacheList,
  handleCachePrune,
};
