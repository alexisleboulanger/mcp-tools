/**
 * Scan handlers — implements semgrep_scan, semgrep_findings, semgrep_report, semgrep_version.
 */

const path = require('node:path');
const fsp = require('node:fs/promises');
const { scanCache, MAX_FINDINGS_RESPONSE, SEMGREP_BIN } = require('../../config');
const { getVersion, runScan, summarizeResults, generateReport } = require('../../semgrep');

// ─── Helpers ──────────────────────────────────

function repoNameFromTarget(target) {
  return path.basename(target);
}

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function markdownResult(md) {
  return { content: [{ type: 'text', text: md }] };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

// ─── Handlers ─────────────────────────────────

/**
 * semgrep_scan — Run a scan and return summary.
 */
async function handleScan(args) {
  const { target, config, severity, include, exclude, repo_name } = args;

  if (!target) return errorResult('target is required');

  try {
    const scanOutput = await runScan({ target, config, severity, include, exclude });
    const name = repo_name || repoNameFromTarget(target);

    // Cache results for subsequent findings/report calls
    scanCache.set(target, { output: scanOutput, repo_name: name, timestamp: Date.now() });

    const summary = summarizeResults(scanOutput);
    summary.repo_name = name;

    return textResult(summary);
  } catch (err) {
    return errorResult(`Scan failed: ${err.message}`);
  }
}

/**
 * semgrep_findings — Retrieve detailed findings with filtering.
 */
async function handleFindings(args) {
  const { target, severity, cwe, rule, file, limit } = args;

  if (!target) return errorResult('target is required');

  const cached = scanCache.get(target);
  if (!cached) {
    return errorResult(`No cached scan for "${target}". Run semgrep_scan first.`);
  }

  let results = cached.output.results || [];

  // Apply filters
  if (severity) {
    results = results.filter(f => f.extra?.severity === severity);
  }
  if (cwe) {
    results = results.filter(f =>
      (f.extra?.metadata?.cwe || []).some(c => c.includes(cwe))
    );
  }
  if (rule) {
    results = results.filter(f => (f.check_id || '').includes(rule));
  }
  if (file) {
    results = results.filter(f => (f.path || '').includes(file));
  }

  const maxResults = Math.min(limit || 50, MAX_FINDINGS_RESPONSE);
  const truncated = results.length > maxResults;
  const slice = results.slice(0, maxResults);

  // Simplify findings for response
  const findings = slice.map(f => ({
    rule_id: f.check_id,
    file: f.path,
    line: f.start?.line,
    end_line: f.end?.line,
    severity: f.extra?.severity,
    message: f.extra?.message,
    cwe: f.extra?.metadata?.cwe || [],
    owasp: f.extra?.metadata?.owasp || [],
    confidence: f.extra?.metadata?.confidence,
    fix: f.extra?.fix,
  }));

  return textResult({
    total_matching: results.length,
    returned: findings.length,
    truncated,
    repo_name: cached.repo_name,
    findings,
  });
}

/**
 * semgrep_report — Generate markdown report.
 */
async function handleReport(args) {
  const { target, config, repo_name, save_path } = args;

  if (!target) return errorResult('target is required');

  let cached = scanCache.get(target);

  // Auto-scan if no cached results
  if (!cached) {
    try {
      const scanOutput = await runScan({ target, config });
      const name = repo_name || repoNameFromTarget(target);
      cached = { output: scanOutput, repo_name: name, timestamp: Date.now() };
      scanCache.set(target, cached);
    } catch (err) {
      return errorResult(`Auto-scan failed: ${err.message}`);
    }
  }

  const name = repo_name || cached.repo_name || repoNameFromTarget(target);
  const report = generateReport(cached.output, name);

  // Optionally save to disk
  if (save_path) {
    try {
      await fsp.mkdir(path.dirname(save_path), { recursive: true });
      await fsp.writeFile(save_path, report, 'utf8');
    } catch (err) {
      return errorResult(`Report generated but failed to save: ${err.message}`);
    }
  }

  return markdownResult(report);
}

/**
 * semgrep_version — Health check.
 */
async function handleVersion() {
  try {
    const version = await getVersion();
    return textResult({
      version,
      binary: SEMGREP_BIN,
      status: 'ok',
    });
  } catch (err) {
    return errorResult(`Semgrep not available: ${err.message}`);
  }
}

module.exports = {
  handleScan,
  handleFindings,
  handleReport,
  handleVersion,
};
