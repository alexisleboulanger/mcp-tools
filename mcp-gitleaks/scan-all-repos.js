#!/usr/bin/env node
/**
 * Batch scan all Yorizon repos with Gitleaks.
 * Runs sequentially and saves results to a JSON file for report generation.
 */

const path = require('node:path');
const fs = require('node:fs');
const { runScan, summarizeResults, extractFindings } = require('./src/gitleaks');

const WORKSPACE = 'C:\\dev\\yorizon';
const REPOS = [
  'uview',
  'yorizon-accounting',
  'yorizon-argo-helm-values',
  'yorizon-argo-manifests',
  'yorizon-cclm',
  'yorizon-helm-charts',
  'yorizon-iac',
  'yorizon-infrastructure',
  'yorizon-pipelines',
  'yorizon-portal',
  'yorizon-system-api',
  'yorizon-themes',
];

const OUTPUT_FILE = path.join(WORKSPACE, '.cache', 'gitleaks-scan-results.json');

async function main() {
  const results = [];

  for (let i = 0; i < REPOS.length; i++) {
    const repo = REPOS[i];
    const target = path.join(WORKSPACE, repo);

    if (!fs.existsSync(target)) {
      console.error(`[${i + 1}/${REPOS.length}] SKIP ${repo} — directory not found`);
      results.push({ repo, error: 'Directory not found', skipped: true });
      continue;
    }

    console.error(`[${i + 1}/${REPOS.length}] Scanning ${repo}...`);
    const startTime = Date.now();

    try {
      const scanOutput = await runScan({
        target,
        project: repo,
        noGit: false, // Full git history scan
      });

      const summary = summarizeResults(scanOutput);
      const findings = extractFindings(scanOutput);
      const elapsed = Date.now() - startTime;

      console.error(`[${i + 1}/${REPOS.length}] ${repo}: ${summary.total_findings} findings (${Math.round(elapsed / 1000)}s)`);

      results.push({
        repo,
        summary,
        findings,
        elapsed_ms: elapsed,
        scanned_at: new Date().toISOString(),
      });
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.error(`[${i + 1}/${REPOS.length}] ${repo}: ERROR — ${err.message} (${Math.round(elapsed / 1000)}s)`);
      results.push({
        repo,
        error: err.message,
        elapsed_ms: elapsed,
        scanned_at: new Date().toISOString(),
      });
    }
  }

  // Save results
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.error(`\nResults saved to: ${OUTPUT_FILE}`);
  console.error(`Total repos: ${results.length}, Errors: ${results.filter(r => r.error).length}`);
  console.error(`Total findings: ${results.reduce((acc, r) => acc + (r.summary?.total_findings || 0), 0)}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
