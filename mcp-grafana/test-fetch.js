#!/usr/bin/env node
/**
 * Test script: fetch compute metrics for yorizon-system-api namespace (last 2 days).
 * Tests the mcp-grafana-yorizon smart tools by calling the Grafana API directly.
 * Run: node test-fetch.js
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { GrafanaClient } = require('./src/grafana-client');
const { NAMESPACE_QUERIES } = require('./src/queries');

const NS = 'yorizon-system-api';
const TWO_DAYS_SEC = 2 * 24 * 3600;
const now = Math.floor(Date.now() / 1000);
const start = now - TWO_DAYS_SEC;
const STEP = '5m'; // 5-minute resolution over 2 days

const client = new GrafanaClient({
  baseUrl: process.env.GRAFANA_URL,
  apiKey: process.env.GRAFANA_API_KEY,
  username: process.env.GRAFANA_USER,
  password: process.env.GRAFANA_PASSWORD,
});

const COMPUTE_METRICS = [
  'cpu_usage', 'cpu_requests', 'cpu_limits',
  'memory_usage', 'memory_requests', 'memory_limits',
];

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return 'N/A';
  const n = Number(bytes);
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

function formatCores(val) {
  if (val == null || isNaN(val)) return 'N/A';
  const n = Number(val);
  return n < 0.01 ? `${(n * 1000).toFixed(1)}m` : `${n.toFixed(3)} cores`;
}

async function main() {
  console.log(`\n=== Grafana Test: ${NS} compute metrics (last 2 days) ===\n`);
  console.log(`URL: ${process.env.GRAFANA_URL}`);
  console.log(`Auth: ${process.env.GRAFANA_API_KEY ? 'API Key' : 'Basic Auth'}\n`);

  // Step 1: Health check
  console.log('--- Health Check ---');
  try {
    const health = await client.health();
    console.log('OK:', JSON.stringify(health));
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }

  // Step 2: Auto-detect Prometheus datasource
  console.log('\n--- Datasources ---');
  try {
    const ds = await client.listDatasources();
    ds.forEach(d => console.log(`  ${d.name} (${d.type}) uid=${d.uid} ${d.isDefault ? '[default]' : ''}`));
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Step 3: Instant snapshots for each compute metric
  console.log(`\n--- Instant Snapshot (now) for ${NS} ---`);
  for (const key of COMPUTE_METRICS) {
    const def = NAMESPACE_QUERIES[key];
    const promql = def.query(NS);
    try {
      const result = await client.queryInstant(promql);
      const data = result?.data?.result || [];
      let val = data.length > 0 ? Number(data[0].value?.[1] ?? data.reduce((s, r) => s + Number(r.value?.[1] || 0), 0)) : null;
      // For sum aggregations with multiple results, sum them
      if (data.length > 1) val = data.reduce((s, r) => s + Number(r.value?.[1] || 0), 0);
      const formatted = key.includes('memory') ? formatBytes(val) : formatCores(val);
      console.log(`  ${def.title}: ${formatted} (raw: ${val})`);
    } catch (err) {
      console.log(`  ${def.title}: ERROR - ${err.message}`);
    }
  }

  // Step 4: Range query for CPU usage over 2 days (summary stats)
  console.log(`\n--- CPU Usage Range (last 2 days, step=${STEP}) ---`);
  try {
    const promql = NAMESPACE_QUERIES.cpu_usage.query(NS);
    const result = await client.queryRange(promql, {
      start: String(start),
      end: String(now),
      step: STEP,
    });
    const series = result?.data?.result || [];
    if (series.length > 0) {
      const values = series[0].values.map(v => Number(v[1]));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      console.log(`  Data points: ${values.length}`);
      console.log(`  Min: ${formatCores(min)}`);
      console.log(`  Max: ${formatCores(max)}`);
      console.log(`  Avg: ${formatCores(avg)}`);
    } else {
      console.log('  No data returned');
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  // Step 5: Range query for Memory usage over 2 days (summary stats)
  console.log(`\n--- Memory Usage Range (last 2 days, step=${STEP}) ---`);
  try {
    const promql = NAMESPACE_QUERIES.memory_usage.query(NS);
    const result = await client.queryRange(promql, {
      start: String(start),
      end: String(now),
      step: STEP,
    });
    const series = result?.data?.result || [];
    if (series.length > 0) {
      const values = series[0].values.map(v => Number(v[1]));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      console.log(`  Data points: ${values.length}`);
      console.log(`  Min: ${formatBytes(min)}`);
      console.log(`  Max: ${formatBytes(max)}`);
      console.log(`  Avg: ${formatBytes(avg)}`);
    } else {
      console.log('  No data returned');
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
