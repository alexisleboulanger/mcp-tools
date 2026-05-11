/**
 * Scan handlers — implements dependency_check_scan, dependency_check_findings,
 * dependency_check_report, dependency_check_version.
 */

const path = require('node:path');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const { scanCache, MAX_FINDINGS_RESPONSE, DC_BIN, CACHE_ROOT, CACHE_SOURCE, CACHE_TTL_MINUTES } = require('../../config');
const {
  getVersion,
  runScan,
  extractVulnerabilities,
  summarizeResults,
  generateReport,
  cvssToSeverity,
} = require('../../dependency-check');

// ─── Helpers ──────────────────────────────────

function projectNameFromTarget(target) {
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

function isoZ() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildCacheKey(project) {
  const payload = JSON.stringify({ source: CACHE_SOURCE, project: project.trim().toLowerCase() });
  const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `${CACHE_SOURCE}-${digest}`;
}

function cacheDir() {
  return path.join(CACHE_ROOT, CACHE_SOURCE);
}

async function writeCacheEntry(project, summary, vulnerabilities) {
  const dir = cacheDir();
  await fsp.mkdir(dir, { recursive: true });

  const key = buildCacheKey(project);
  const now = new Date();
  const expires = new Date(now.getTime() + CACHE_TTL_MINUTES * 60_000);

  // Build readable markdown body
  const lines = [];
  lines.push(`# Dependency Check: ${project}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push(`- **Total dependencies:** ${summary.total_dependencies}`);
  lines.push(`- **Vulnerable dependencies:** ${summary.vulnerable_dependencies}`);
  lines.push(`- **Total vulnerabilities:** ${summary.total_vulnerabilities}`);
  lines.push(`- **Critical:** ${summary.by_severity?.CRITICAL || summary.severity_counts?.CRITICAL || 0}`);
  lines.push(`- **High:** ${summary.by_severity?.HIGH || summary.severity_counts?.HIGH || 0}`);
  lines.push(`- **Medium:** ${summary.by_severity?.MEDIUM || summary.severity_counts?.MEDIUM || 0}`);
  lines.push(`- **Low:** ${summary.by_severity?.LOW || summary.severity_counts?.LOW || 0}`);
  lines.push('');

  if (vulnerabilities.length > 0) {
    lines.push('## Top Findings');
    lines.push('');
    lines.push('| CVE | CVSS | Severity | Package | CWE |');
    lines.push('|-----|------|----------|---------|-----|');
    const top = vulnerabilities.slice(0, 30);
    for (const v of top) {
      const cwe = (v.cwe || []).join(', ') || '—';
      lines.push(`| ${v.cve} | ${v.cvss_score || '—'} | ${v.severity || '—'} | ${v.package_name || v.dependency || '—'} | ${cwe} |`);
    }
    lines.push('');
    if (vulnerabilities.length > 30) {
      lines.push(`> ${vulnerabilities.length - 30} additional findings omitted from cache snapshot.`);
    }
  }

  const body = lines.join('\n');
  const frontMatter = [
    '---',
    `cache_key: ${key}`,
    `source: ${CACHE_SOURCE}`,
    `query: dependency-check-scan-${project}`,
    `fetched_at_utc: ${isoZ()}`,
    `expires_at_utc: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    `ttl_minutes: ${CACHE_TTL_MINUTES}`,
    `cache_status: fresh`,
    `refresh_hint: use "refresh" to force live retrieval`,
    '---',
    '',
  ].join('\n');

  const content = frontMatter + body + '\n';
  await fsp.writeFile(path.join(dir, `${key}.md`), content, 'utf8');
  return key;
}

async function readCacheEntry(project) {
  const key = buildCacheKey(project);
  const filePath = path.join(cacheDir(), `${key}.md`);
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    // Parse front matter to check freshness
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;
    const meta = {};
    for (const line of match[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    const expires = new Date(meta.expires_at_utc).getTime();
    if (Date.now() > expires) return null; // Expired
    return { meta, body: match[2], key };
  } catch {
    return null;
  }
}

// ─── Handlers ─────────────────────────────────

/**
 * dependency_check_scan — Run a scan and return summary.
 */
async function handleScan(args) {
  const { target, project, exclude, skip_update } = args;

  if (!target) return errorResult('target is required');

  try {
    const scanOutput = await runScan({
      target,
      project: project || projectNameFromTarget(target),
      exclude,
      skipUpdate: skip_update,
    });

    const name = project || projectNameFromTarget(target);

    // Cache results in-memory for subsequent findings/report calls
    scanCache.set(target, { output: scanOutput, project: name, timestamp: Date.now() });

    const summary = summarizeResults(scanOutput);
    summary.project = name;

    // Persist to file-based cache for cross-session retrieval
    const vulnerabilities = extractVulnerabilities(scanOutput);
    const cacheKey = await writeCacheEntry(name, summary, vulnerabilities);
    summary.cache_key = cacheKey;

    return textResult(summary);
  } catch (err) {
    return errorResult(`Scan failed: ${err.message}`);
  }
}

/**
 * dependency_check_findings — Retrieve detailed findings with filtering.
 */
async function handleFindings(args) {
  const { target, severity, cve, cwe, dependency, min_cvss, limit } = args;

  if (!target) return errorResult('target is required');

  const cached = scanCache.get(target);
  if (!cached) {
    return errorResult(`No cached scan for "${target}". Run dependency_check_scan first.`);
  }

  let vulnerabilities = extractVulnerabilities(cached.output);

  // Apply filters
  if (severity) {
    const sevUpper = severity.toUpperCase();
    vulnerabilities = vulnerabilities.filter(v => {
      const vs = (v.severity || '').toUpperCase();
      if (vs === sevUpper) return true;
      // Fall back to CVSS-based matching
      const computed = cvssToSeverity(v.cvss_score).label.toUpperCase();
      return computed === sevUpper;
    });
  }
  if (cve) {
    vulnerabilities = vulnerabilities.filter(v => v.cve.includes(cve));
  }
  if (cwe) {
    vulnerabilities = vulnerabilities.filter(v =>
      v.cwe.some(c => c.includes(cwe))
    );
  }
  if (dependency) {
    vulnerabilities = vulnerabilities.filter(v =>
      (v.package_name || v.dependency || '').toLowerCase().includes(dependency.toLowerCase())
    );
  }
  if (min_cvss !== undefined) {
    vulnerabilities = vulnerabilities.filter(v => v.cvss_score >= min_cvss);
  }

  const maxResults = Math.min(limit || 50, MAX_FINDINGS_RESPONSE);
  const truncated = vulnerabilities.length > maxResults;
  const slice = vulnerabilities.slice(0, maxResults);

  return textResult({
    total_matching: vulnerabilities.length,
    returned: slice.length,
    truncated,
    project: cached.project,
    findings: slice,
  });
}

/**
 * dependency_check_report — Generate markdown report.
 */
async function handleReport(args) {
  const { target, project, save_path, skip_update } = args;

  if (!target) return errorResult('target is required');

  let cached = scanCache.get(target);

  // Auto-scan if no cached results
  if (!cached) {
    try {
      const name = project || projectNameFromTarget(target);
      const scanOutput = await runScan({
        target,
        project: name,
        skipUpdate: skip_update,
      });
      cached = { output: scanOutput, project: name, timestamp: Date.now() };
      scanCache.set(target, cached);
    } catch (err) {
      return errorResult(`Auto-scan failed: ${err.message}`);
    }
  }

  const name = project || cached.project || projectNameFromTarget(target);
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
 * dependency_check_version — Health check.
 */
async function handleVersion() {
  try {
    const version = await getVersion();
    return textResult({
      version,
      binary: DC_BIN,
      status: 'ok',
    });
  } catch (err) {
    return errorResult(`Dependency-Check not available: ${err.message}`);
  }
}

module.exports = {
  handleScan,
  handleFindings,
  handleReport,
  handleVersion,
};
