/**
 * Gitleaks tool handlers — scan, findings, report, version.
 */

const { runScan, getVersion, extractFindings, summarizeResults } = require('../../gitleaks');
const { scanCache, MAX_FINDINGS_RESPONSE } = require('../../config');

function jsonResponse(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * gitleaks_scan — run a scan and cache results.
 */
async function handleScan(args) {
  const { target, project, no_git, config_path } = args;

  const result = await runScan({
    target,
    project,
    noGit: no_git,
    configPath: config_path,
  });

  // Cache results
  scanCache.set(target, result);

  const summary = summarizeResults(result);
  return jsonResponse({
    status: 'completed',
    project: result._scan_meta.project,
    target,
    scanned_at: result._scan_meta.scanned_at,
    elapsed_ms: result._scan_meta.elapsed_ms,
    summary,
  });
}

/**
 * gitleaks_findings — retrieve filtered findings from cache.
 */
async function handleFindings(args) {
  const { target, severity, category, rule_id, file, limit } = args;

  const cached = scanCache.get(target);
  if (!cached) {
    return jsonResponse({ error: `No cached scan for target: ${target}. Run gitleaks_scan first.` });
  }

  let findings = extractFindings(cached);

  // Apply filters
  if (severity) {
    findings = findings.filter(f => f.severity === severity.toUpperCase());
  }
  if (category) {
    findings = findings.filter(f => f.category.toLowerCase().includes(category.toLowerCase()));
  }
  if (rule_id) {
    findings = findings.filter(f => f.rule_id === rule_id);
  }
  if (file) {
    findings = findings.filter(f => f.file && f.file.includes(file));
  }

  const maxResults = Math.min(limit || 50, MAX_FINDINGS_RESPONSE);
  const total = findings.length;
  findings = findings.slice(0, maxResults);

  return jsonResponse({
    target,
    total_matching: total,
    returned: findings.length,
    findings,
  });
}

/**
 * gitleaks_report — generate markdown report.
 */
async function handleReport(args) {
  const { target, project } = args;

  let cached = scanCache.get(target);
  if (!cached) {
    // Auto-scan if not cached
    cached = await runScan({ target, project });
    scanCache.set(target, cached);
  }

  const summary = summarizeResults(cached);
  const findings = extractFindings(cached);
  const projName = project || cached._scan_meta.project;

  let md = `# Gitleaks Secret Detection Report: ${projName}\n\n`;
  md += `**Scanned:** ${cached._scan_meta.scanned_at}  \n`;
  md += `**Duration:** ${cached._scan_meta.elapsed_ms}ms  \n`;
  md += `**Mode:** ${cached._scan_meta.no_git ? 'Files only (no git history)' : 'Full git history'}  \n\n`;

  md += `## Summary\n\n`;
  md += `| Severity | Count |\n|----------|-------|\n`;
  for (const [sev, count] of Object.entries(summary.by_severity)) {
    md += `| ${sev} | ${count} |\n`;
  }
  md += `| **TOTAL** | **${summary.total_findings}** |\n\n`;

  if (summary.total_findings === 0) {
    md += `No secrets detected.\n`;
    return jsonResponse({ report: md });
  }

  md += `## By Category\n\n`;
  md += `| Category | Count |\n|----------|-------|\n`;
  for (const [cat, count] of Object.entries(summary.by_category).sort((a, b) => b[1] - a[1])) {
    md += `| ${cat} | ${count} |\n`;
  }
  md += `\n`;

  md += `## Top Rules Triggered\n\n`;
  md += `| Rule | Count |\n|------|-------|\n`;
  for (const { rule, count } of summary.top_rules) {
    md += `| ${rule} | ${count} |\n`;
  }
  md += `\n`;

  md += `## Findings\n\n`;
  for (const f of findings.slice(0, 100)) {
    md += `### ${f.rule_id} (${f.severity})\n`;
    md += `- **File:** ${f.file}:${f.line}\n`;
    md += `- **Category:** ${f.category}\n`;
    if (f.commit) md += `- **Commit:** ${f.commit}\n`;
    if (f.author) md += `- **Author:** ${f.author}\n`;
    if (f.date) md += `- **Date:** ${f.date}\n`;
    md += `\n`;
  }

  return jsonResponse({ report: md });
}

/**
 * gitleaks_version — health check.
 */
async function handleVersion() {
  const version = await getVersion();
  return jsonResponse({ tool: 'gitleaks', version, status: 'available' });
}

module.exports = {
  handleScan,
  handleFindings,
  handleReport,
  handleVersion,
};
