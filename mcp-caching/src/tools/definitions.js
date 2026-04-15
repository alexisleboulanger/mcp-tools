/**
 * Tool definitions — single source of truth for every MCP caching tool.
 *
 * Each entry is a standard MCP tool descriptor:
 *   { name, description, inputSchema }
 *
 * Handler logic lives in ./handlers/cache.js — this file is ONLY schema.
 */

const tools = [
  {
    name: 'cache_read',
    description:
      'Read a cached entry by source and cache key (or original query). Returns the cached content with freshness status: "fresh" (within TTL), "stale" (expired but within stale threshold), or "miss" (not found or fully expired). Use this BEFORE calling external MCP tools to avoid redundant requests.',
    inputSchema: {
      type: 'object',
      properties: {
        source:    { type: 'string', description: 'Cache source identifier (e.g., "ado-workitems", "ado-wiki", "internet-research"). Determines the subdirectory.' },
        cache_key: { type: 'string', description: 'Exact cache key returned by a previous cache_write. If omitted, provide "query" to generate the key.' },
        query:     { type: 'string', description: 'Original query text. Used to generate cache_key when cache_key is not provided.' },
        extras:    { type: 'object', description: 'Additional key-value pairs for deterministic key generation (e.g., filters, area path). Must match what was used in cache_write.' },
      },
      required: ['source'],
    },
  },
  {
    name: 'cache_write',
    description:
      'Write or update a cache entry. Stores markdown content with YAML front matter including TTL and expiry. Returns the cache key and file path. Call this after fetching data from an external MCP tool to persist the result for future cache_read calls.',
    inputSchema: {
      type: 'object',
      properties: {
        source:      { type: 'string', description: 'Cache source identifier (e.g., "ado-workitems", "ado-wiki", "internet-research").' },
        query:       { type: 'string', description: 'Original query text that produced this result.' },
        content:     { type: 'string', description: 'The markdown content to cache (body of the response).' },
        ttl_minutes: { type: 'number', description: 'Time-to-live in minutes. Defaults to the source-specific TTL from server config.' },
        extras:      { type: 'object', description: 'Additional key-value pairs for deterministic key generation. Must be consistent with cache_read calls for the same data.' },
      },
      required: ['source', 'query', 'content'],
    },
  },
  {
    name: 'cache_invalidate',
    description:
      'Remove cache entries matching a source and optional pattern. Use after mutation operations (create, update, delete) to ensure stale data is not served. Returns the count of deleted entries.',
    inputSchema: {
      type: 'object',
      properties: {
        source:  { type: 'string', description: 'Cache source identifier. All entries under this source will be searched.' },
        pattern: { type: 'string', description: 'Glob-like pattern to match cache keys (e.g., "ado-workitems-*" or a specific key). If omitted, ALL entries for the source are invalidated.' },
      },
      required: ['source'],
    },
  },
  {
    name: 'cache_stats',
    description:
      'Returns cache statistics for a specific source or all sources. Includes counts of fresh, stale, and expired entries, total disk usage, and oldest/newest timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Cache source identifier. Omit to get stats for all sources.' },
      },
    },
  },
  {
    name: 'cache_list',
    description:
      'List cache entries for a source, ordered by most recent. Returns cache keys, queries, freshness status, and expiry timestamps. Useful for inspecting what is cached before deciding to refresh.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Cache source identifier.' },
        limit:  { type: 'number', description: 'Max entries to return. Default: 20.' },
        status: { type: 'string', enum: ['fresh', 'stale', 'all'], description: 'Filter by freshness status. Default: "all".' },
      },
      required: ['source'],
    },
  },
  {
    name: 'cache_prune',
    description:
      'Remove expired entries and enforce the max-entries-per-source limit. Returns count of pruned entries. Run periodically or after bulk writes to keep cache size bounded.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Cache source identifier. Omit to prune all sources.' },
      },
    },
  },
];

module.exports = tools;
