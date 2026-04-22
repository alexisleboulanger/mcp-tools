/**
 * Semgrep CLI wrapper — spawns semgrep and parses output.
 */

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { SEMGREP_BIN, PYTHON_SCRIPTS_DIR, DEFAULT_CONFIG, SCAN_TIMEOUT_MS } = require('./config');

/**
 * Build env with Python Scripts dir on PATH so semgrep can find pysemgrep.
 */
function buildEnv() {
  const env = { ...process.env, SEMGREP_SEND_METRICS: 'on' };
  // Force UTF-8 on Windows to avoid cp1252 encoding crashes with Unicode rule files
  if (process.platform === 'win32') {
    env.PYTHONUTF8 = '1';
  }
  const sep = process.platform === 'win32' ? ';' : ':';
  if (PYTHON_SCRIPTS_DIR && !env.PATH?.includes(PYTHON_SCRIPTS_DIR)) {
    env.PATH = `${PYTHON_SCRIPTS_DIR}${sep}${env.PATH || ''}`;
  }
  return env;
}

/**
 * Verify semgrep is available.
 * @returns {Promise<string>} version string
 */
function getVersion() {
  return new Promise((resolve, reject) => {
    execFile(SEMGREP_BIN, ['--version'], { timeout: 10_000, env: buildEnv() }, (err, stdout) => {
      if (err) return reject(new Error(`Semgrep not found at ${SEMGREP_BIN}: ${err.message}`));
      resolve(stdout.trim());
    });
  });
}

/**
 * Run a semgrep scan and return parsed JSON results.
 *
 * @param {object} opts
 * @param {string} opts.target    - Directory or file to scan
 * @param {string} [opts.config]  - Semgrep config (default: "auto")
 * @param {string} [opts.include] - Glob pattern to include files
 * @param {string} [opts.exclude] - Glob pattern to exclude files
 * @param {string} [opts.severity] - Minimum severity filter (INFO, WARNING, ERROR)
 * @returns {Promise<object>} Parsed semgrep JSON output
 */
function runScan(opts) {
  return new Promise((resolve, reject) => {
    const { target, config, include, exclude, severity } = opts;

    // Validate target path exists
    if (!fs.existsSync(target)) {
      return reject(new Error(`Target path does not exist: ${target}`));
    }

    const args = [
      'scan',
      '--config', config || DEFAULT_CONFIG,
      '--json',
      '--quiet',           // Suppress progress output
      '--no-git-ignore',   // Scan all files regardless of .gitignore for completeness
    ];

    if (severity) {
      args.push('--severity', severity);
    }
    if (include) {
      args.push('--include', include);
    }
    if (exclude) {
      args.push('--exclude', exclude);
    }

    args.push(target);

    console.error(`[semgrep] Running: ${SEMGREP_BIN} ${args.join(' ')}`);
    const startTime = Date.now();

    execFile(
      SEMGREP_BIN,
      args,
      {
        timeout: SCAN_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024, // 50 MB buffer for large repos
        env: buildEnv(),
      },
      (err, stdout, stderr) => {
        const elapsed = Date.now() - startTime;
        console.error(`[semgrep] Scan completed in ${elapsed}ms`);

        // Semgrep exits non-zero when findings exist — that's normal
        if (err && !stdout) {
          return reject(new Error(`Semgrep scan failed: ${stderr || err.message}`));
        }

        try {
          const parsed = JSON.parse(stdout);
          parsed._scan_meta = {
            target,
            config: config || DEFAULT_CONFIG,
            elapsed_ms: elapsed,
            scanned_at: new Date().toISOString(),
          };
          resolve(parsed);
        } catch (parseErr) {
          reject(new Error(`Failed to parse semgrep output: ${parseErr.message}\nStderr: ${stderr}`));
        }
      }
    );
  });
}

/**
 * Map semgrep severity to CVSS-like level for gate model alignment.
 */
function normalizeSeverity(semgrepSeverity) {
  switch (semgrepSeverity) {
    case 'ERROR':   return { level: 'high', label: 'High', gate: 'blocks-rc' };
    case 'WARNING': return { level: 'medium', label: 'Medium', gate: 'tracked' };
    case 'INFO':    return { level: 'low', label: 'Low', gate: 'best-effort' };
    default:        return { level: 'info', label: 'Info', gate: 'none' };
  }
}

/**
 * Summarize scan results into a structured object.
 */
function summarizeResults(scanOutput) {
  const results = scanOutput.results || [];
  const errors = scanOutput.errors || [];

  const bySeverity = { ERROR: 0, WARNING: 0, INFO: 0 };
  const byCwe = {};
  const byFile = {};
  const byRule = {};

  for (const finding of results) {
    const sev = finding.extra?.severity || 'INFO';
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;

    const cweList = finding.extra?.metadata?.cwe || [];
    for (const cwe of cweList) {
      byCwe[cwe] = (byCwe[cwe] || 0) + 1;
    }

    const file = finding.path || 'unknown';
    byFile[file] = (byFile[file] || 0) + 1;

    const rule = finding.check_id || 'unknown';
    byRule[rule] = (byRule[rule] || 0) + 1;
  }

  // Top files by finding count
  const topFiles = Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  // Top rules by finding count
  const topRules = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([rule, count]) => ({ rule, count }));

  // Top CWEs
  const topCwes = Object.entries(byCwe)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cwe, count]) => ({ cwe, count }));

  return {
    total_findings: results.length,
    total_errors: errors.length,
    by_severity: bySeverity,
    top_cwes: topCwes,
    top_files: topFiles,
    top_rules: topRules,
    scan_meta: scanOutput._scan_meta,
  };
}

/**
 * Generate a markdown report from scan results.
 */
function generateReport(scanOutput, repoName) {
  const summary = summarizeResults(scanOutput);
  const results = scanOutput.results || [];
  const meta = scanOutput._scan_meta || {};
  const name = repoName || meta.target || 'Unknown';

  const lines = [];
  lines.push(`# Semgrep SAST Report: ${name}`);
  lines.push('');
  lines.push(`> Scanned: ${meta.scanned_at || 'N/A'} | Config: \`${meta.config || 'auto'}\` | Duration: ${meta.elapsed_ms || 'N/A'}ms`);
  lines.push('');

  // Executive summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| **High** (ERROR) | ${summary.by_severity.ERROR || 0} |`);
  lines.push(`| **Medium** (WARNING) | ${summary.by_severity.WARNING || 0} |`);
  lines.push(`| **Low** (INFO) | ${summary.by_severity.INFO || 0} |`);
  lines.push(`| **Total** | **${summary.total_findings}** |`);
  lines.push('');

  if (summary.total_errors > 0) {
    lines.push(`> ⚠ ${summary.total_errors} scan error(s) encountered.`);
    lines.push('');
  }

  // CWE breakdown
  if (summary.top_cwes.length > 0) {
    lines.push('## CWE Breakdown');
    lines.push('');
    lines.push('| CWE | Count |');
    lines.push('|-----|-------|');
    for (const { cwe, count } of summary.top_cwes) {
      lines.push(`| ${cwe} | ${count} |`);
    }
    lines.push('');
  }

  // Top rules
  if (summary.top_rules.length > 0) {
    lines.push('## Top Rules');
    lines.push('');
    lines.push('| Rule | Findings |');
    lines.push('|------|----------|');
    for (const { rule, count } of summary.top_rules) {
      lines.push(`| \`${rule}\` | ${count} |`);
    }
    lines.push('');
  }

  // Hotspot files
  if (summary.top_files.length > 0) {
    lines.push('## Hotspot Files');
    lines.push('');
    lines.push('| File | Findings |');
    lines.push('|------|----------|');
    for (const { file, count } of summary.top_files) {
      lines.push(`| \`${file}\` | ${count} |`);
    }
    lines.push('');
  }

  // Detailed findings (High/ERROR only to keep report manageable)
  const highFindings = results.filter(f => f.extra?.severity === 'ERROR');
  if (highFindings.length > 0) {
    lines.push('## High-Severity Findings (Detail)');
    lines.push('');
    for (const f of highFindings.slice(0, 50)) {
      const cweStr = (f.extra?.metadata?.cwe || []).join(', ');
      const owaspStr = (f.extra?.metadata?.owasp || []).join(', ');
      lines.push(`### ${f.check_id}`);
      lines.push('');
      lines.push(`- **File:** \`${f.path}:${f.start?.line || '?'}\``);
      lines.push(`- **Severity:** ${f.extra?.severity || 'N/A'}`);
      if (cweStr) lines.push(`- **CWE:** ${cweStr}`);
      if (owaspStr) lines.push(`- **OWASP:** ${owaspStr}`);
      lines.push(`- **Message:** ${f.extra?.message || 'No message'}`);
      lines.push('');
    }
    if (highFindings.length > 50) {
      lines.push(`> ... and ${highFindings.length - 50} more high-severity findings.`);
      lines.push('');
    }
  }

  // Medium findings summary (grouped by rule)
  const mediumFindings = results.filter(f => f.extra?.severity === 'WARNING');
  if (mediumFindings.length > 0) {
    lines.push('## Medium-Severity Findings (Summary)');
    lines.push('');
    const byRule = {};
    for (const f of mediumFindings) {
      const rule = f.check_id || 'unknown';
      if (!byRule[rule]) byRule[rule] = { count: 0, files: new Set(), cwe: new Set() };
      byRule[rule].count++;
      byRule[rule].files.add(f.path);
      for (const c of (f.extra?.metadata?.cwe || [])) byRule[rule].cwe.add(c);
    }
    lines.push('| Rule | Count | Files | CWE |');
    lines.push('|------|-------|-------|-----|');
    for (const [rule, data] of Object.entries(byRule).sort((a, b) => b[1].count - a[1].count)) {
      lines.push(`| \`${rule}\` | ${data.count} | ${data.files.size} | ${[...data.cwe].join(', ') || '-'} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  getVersion,
  runScan,
  normalizeSeverity,
  summarizeResults,
  generateReport,
};
