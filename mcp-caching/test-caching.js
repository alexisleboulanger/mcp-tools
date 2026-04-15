#!/usr/bin/env node
/**
 * Smoke test for mcp-caching — exercises each handler directly (no MCP transport).
 */
const path = require('node:path');
const fsp = require('node:fs/promises');

// Override CACHE_PATH to a temp directory for testing
const TEST_DIR = path.join(__dirname, '.test-cache');
process.env.CACHE_PATH = TEST_DIR;

// Clear module cache to pick up the env override
delete require.cache[require.resolve('./src/config')];

const {
  handleCacheRead,
  handleCacheWrite,
  handleCacheInvalidate,
  handleCacheStats,
  handleCacheList,
  handleCachePrune,
} = require('./src/tools/handlers/cache');

async function cleanup() {
  try { await fsp.rm(TEST_DIR, { recursive: true, force: true }); } catch { /* ok */ }
}

function parse(result) {
  return JSON.parse(result.content[0].text);
}

async function run() {
  await cleanup();
  let passed = 0;
  let failed = 0;

  function assert(label, condition) {
    if (condition) { passed++; console.log(`  ✓ ${label}`); }
    else { failed++; console.error(`  ✗ ${label}`); }
  }

  console.log('\n─── mcp-caching smoke test ───\n');

  // 1. cache_read miss
  console.log('1. cache_read (miss)');
  const r1 = parse(await handleCacheRead({ source: 'ado-wiki', query: 'test query' }));
  assert('status is miss', r1.status === 'miss');
  assert('cache_key is present', !!r1.cache_key);

  // 2. cache_write
  console.log('2. cache_write');
  const r2 = parse(await handleCacheWrite({
    source: 'ado-wiki',
    query: 'test query',
    content: '# Wiki Page\n\nSome content here.',
    ttl_minutes: 60,
  }));
  assert('status is written', r2.status === 'written');
  assert('cache_key matches', r2.cache_key === r1.cache_key);
  assert('ttl_minutes is 60', r2.ttl_minutes === 60);

  // 3. cache_read fresh hit
  console.log('3. cache_read (fresh)');
  const r3 = parse(await handleCacheRead({ source: 'ado-wiki', query: 'test query' }));
  assert('status is fresh', r3.status === 'fresh');
  assert('content matches', r3.content.includes('Some content here'));

  // 4. cache_read by exact key
  console.log('4. cache_read (by key)');
  const r4 = parse(await handleCacheRead({ source: 'ado-wiki', cache_key: r2.cache_key }));
  assert('status is fresh', r4.status === 'fresh');

  // 5. cache_list
  console.log('5. cache_list');
  const r5 = parse(await handleCacheList({ source: 'ado-wiki' }));
  assert('count is 1', r5.count === 1);
  assert('entry has query', r5.entries[0].query === 'test query');

  // 6. cache_stats
  console.log('6. cache_stats');
  const r6 = parse(await handleCacheStats({ source: 'ado-wiki' }));
  assert('ado-wiki total is 1', r6['ado-wiki'].total === 1);
  assert('ado-wiki fresh is 1', r6['ado-wiki'].fresh === 1);

  // 7. Write more entries, then stats across all sources
  console.log('7. cache_write (second source)');
  await handleCacheWrite({ source: 'ado-repos', query: 'pr list', content: '# PRs\n\n- PR #1' });
  const r7 = parse(await handleCacheStats({}));
  assert('two sources present', Object.keys(r7).length === 2);

  // 8. cache_invalidate specific key
  console.log('8. cache_invalidate (by pattern)');
  const r8 = parse(await handleCacheInvalidate({ source: 'ado-wiki', pattern: `${r2.cache_key}` }));
  assert('deleted 1 entry', r8.deleted === 1);

  // 9. Verify miss after invalidation
  console.log('9. cache_read after invalidation');
  const r9 = parse(await handleCacheRead({ source: 'ado-wiki', query: 'test query' }));
  assert('status is miss', r9.status === 'miss');

  // 10. cache_prune (nothing expired yet)
  console.log('10. cache_prune');
  const r10 = parse(await handleCachePrune({}));
  assert('pruned is 0', r10.pruned === 0);

  // 11. Invalidate all
  console.log('11. cache_invalidate (all for source)');
  const r11 = parse(await handleCacheInvalidate({ source: 'ado-repos' }));
  assert('deleted ado-repos entries', r11.deleted >= 1);

  console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`);

  await cleanup();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
