/**
 * Cache key helpers — deterministic key generation and markdown formatting.
 */
const crypto = require('node:crypto');

/**
 * Normalize text for deterministic key generation.
 */
function normalizeText(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build a deterministic cache key from source + query + optional extras.
 *   key format: <source>-<sha256_prefix_16>
 */
function buildCacheKey(source, query, extras) {
  const payload = {
    source: normalizeText(source),
    query: normalizeText(query),
  };
  if (extras && Object.keys(extras).length > 0) {
    payload.extras = {};
    for (const k of Object.keys(extras).sort()) {
      payload.extras[k] = normalizeText(String(extras[k]));
    }
  }
  const blob = JSON.stringify(payload, Object.keys(payload).sort(), 0);
  const digest = crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
  return `${payload.source}-${digest}`;
}

/**
 * Build markdown file content with YAML front matter.
 */
function buildMarkdown(meta, body) {
  const fields = [
    'cache_key', 'source', 'query',
    'fetched_at_utc', 'expires_at_utc', 'ttl_minutes',
    'cache_status', 'refresh_hint',
  ];
  const lines = ['---'];
  for (const field of fields) {
    if (meta[field] !== undefined) {
      lines.push(`${field}: ${meta[field]}`);
    }
  }
  lines.push('---');
  lines.push('');
  lines.push(body.trimEnd());
  lines.push('');
  return lines.join('\n');
}

/**
 * Parse front matter from a markdown cache file.
 * Returns { meta: {}, body: string }.
 */
function parseMarkdown(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      meta[key] = val;
    }
  }
  return { meta, body: match[2].trim() };
}

function isoZ(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = {
  normalizeText,
  buildCacheKey,
  buildMarkdown,
  parseMarkdown,
  isoZ,
};
