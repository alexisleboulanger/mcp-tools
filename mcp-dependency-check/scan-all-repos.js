#!/usr/bin/env node
/**
 * Batch scan all Yorizon repos with OWASP Dependency Check.
 * Runs sequentially (first with update, rest with --noupdate).
 * Saves results to a JSON file for report generation.
 */

const path = require('node:path');
const fs = require('node:fs');
const { runScan, summarizeResults, extractVulnerabilities } = require('./src/dependency-check');

const WORKSPACE = 'C:\\dev\\yorizon';
const REPOS = [
  'yorizon-portal',
  'yorizon-system-api',
  'uview',
  'yorizon-cclm',
  'yorizon-accounting',
  'yorizon-helm-charts',
  'yorizon-iac',
  'yorizon-infrastructure',
  'yorizon-pipelines',
  'yorizon-argo-helm-values',
  'yorizon-argo-manifests',
  'yorizon-themes',
];

const OUTPUT_FILE = path.join(WORKSPACE, '.cache', 'dc-scan-results.json');

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
        skipUpdate: true, // DB was just updated via --updateonly
      });

      const summary = summarizeResults(scanOutput);
      const vulnerabilities = extractVulnerabilities(scanOutput);
      const elapsed = Date.now() - startTime;

      console.error(`[${i + 1}/${REPOS.length}] ${repo}: ${summary.total_vulnerabilities} vulns (${Math.round(elapsed / 1000)}s)`);

      results.push({
        repo,
        summary,
        vulnerabilities,
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
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
