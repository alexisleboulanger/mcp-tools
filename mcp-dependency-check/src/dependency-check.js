/**
 * OWASP Dependency Check CLI wrapper — spawns dependency-check and parses output.
 */

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { DC_BIN, DC_DATA_DIR, NVD_API_KEY, SCAN_TIMEOUT_MS, OUTPUT_FORMAT } = require('./config');

/**
 * Verify dependency-check is available.
 * @returns {Promise<string>} version string
 */
function getVersion() {
  return new Promise((resolve, reject) => {
    execFile(DC_BIN, ['--version'], { timeout: 30_000, shell: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Dependency-Check not found at ${DC_BIN}: ${err.message}`));
      // Output looks like: "Dependency-Check Core version 12.2.2"
      const output = (stdout || stderr || '').trim();
      resolve(output);
    });
  });
}

/**
 * Run a dependency-check scan and return parsed JSON results.
 *
 * @param {object} opts
 * @param {string} opts.target    - Directory to scan
 * @param {string} [opts.project] - Project name for the report
 * @param {string} [opts.exclude] - Pattern to exclude
 * @param {boolean} [opts.skipUpdate] - Skip NVD update (use cached data)
 * @returns {Promise<object>} Parsed dependency-check JSON output
 */
async function runScan(opts) {
  const { target, project, exclude, skipUpdate } = opts;

  // Validate target path exists
  if (!fs.existsSync(target)) {
    throw new Error(`Target path does not exist: ${target}`);
  }

  // Create a temp directory for the JSON output
  const tmpDir = path.join(os.tmpdir(), `dc-scan-${Date.now()}`);
  await fsp.mkdir(tmpDir, { recursive: true });

  const args = [
    '--project', project || path.basename(target),
    '--scan', target,
    '--format', OUTPUT_FORMAT,
    '--out', tmpDir,
    '--prettyPrint',
  ];

  // Add NVD API key if available
  if (NVD_API_KEY) {
    args.push('--nvdApiKey', NVD_API_KEY);
  }

  // Skip update for faster subsequent scans
  if (skipUpdate) {
    args.push('--noupdate');
  }

  // Exclude patterns
  if (exclude) {
    args.push('--exclude', exclude);
  }

  // Disable analyzers that require external tools not guaranteed to be present
  args.push('--disableYarnAudit');
  args.push('--disablePnpmAudit');
  args.push('--disableNodeAudit');
  args.push('--disableBundleAudit');
  args.push('--disableMixAudit');

  console.error(`[dependency-check] Running: ${DC_BIN} ${args.join(' ')}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    execFile(
      DC_BIN,
      args,
      {
        timeout: SCAN_TIMEOUT_MS,
        maxBuffer: 100 * 1024 * 1024, // 100 MB buffer
        shell: true,
        env: { ...process.env },
      },
      async (err, stdout, stderr) => {
        const elapsed = Date.now() - startTime;
        console.error(`[dependency-check] Scan completed in ${elapsed}ms`);

        if (err) {
          // Check if output file was still created (DC may exit non-zero on findings)
          const jsonFile = path.join(tmpDir, 'dependency-check-report.json');
          if (!fs.existsSync(jsonFile)) {
            await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
            return reject(new Error(`Dependency-Check scan failed: ${stderr || err.message}`));
          }
        }

        try {
          const jsonFile = path.join(tmpDir, 'dependency-check-report.json');
          const raw = await fsp.readFile(jsonFile, 'utf8');
          const parsed = JSON.parse(raw);

          // Clean up temp directory
          await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

          // Add scan metadata
          parsed._scan_meta = {
            target,
            project: project || path.basename(target),
            elapsed_ms: elapsed,
            scanned_at: new Date().toISOString(),
          };

          resolve(parsed);
        } catch (parseErr) {
          await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          reject(new Error(`Failed to parse dependency-check output: ${parseErr.message}`));
        }
      }
    );
  });
}

/**
 * Map CVSS score to severity level for gate model alignment.
 */
function cvssToSeverity(score) {
  if (score >= 9.0) return { level: 'critical', label: 'Critical', gate: 'blocks-rc' };
  if (score >= 7.0) return { level: 'high', label: 'High', gate: 'blocks-rc' };
  if (score >= 4.0) return { level: 'medium', label: 'Medium', gate: 'tracked' };
  if (score >= 0.1) return { level: 'low', label: 'Low', gate: 'best-effort' };
  return { level: 'none', label: 'None', gate: 'none' };
}

/**
 * Extract vulnerabilities from the DC JSON report.
 */
function extractVulnerabilities(scanOutput) {
  const dependencies = scanOutput.dependencies || [];
  const vulnerabilities = [];

  for (const dep of dependencies) {
    if (!dep.vulnerabilities || dep.vulnerabilities.length === 0) continue;

    for (const vuln of dep.vulnerabilities) {
      const cvssv3 = vuln.cvssv3 || {};
      const cvssv2 = vuln.cvssv2 || {};
      const score = cvssv3.baseScore || cvssv2.score || 0;

      vulnerabilities.push({
        dependency: dep.fileName,
        filePath: dep.filePath,
        package_name: dep.packages?.[0]?.id || dep.fileName,
        evidenceCollected: dep.evidenceCollected,
        cve: vuln.name,
        description: vuln.description,
        cvss_score: score,
        cvss_vector: cvssv3.attackVector || cvssv2.accessVector || '',
        severity: vuln.severity || cvssToSeverity(score).label,
        cwe: vuln.cwes ? vuln.cwes.map(c => `CWE-${c}`) : [],
        references: (vuln.references || []).slice(0, 3).map(r => r.url),
        source: vuln.source || 'NVD',
      });
    }
  }

  return vulnerabilities;
}

/**
 * Summarize scan results into a structured object.
 */
function summarizeResults(scanOutput) {
  const dependencies = scanOutput.dependencies || [];
  const vulnerabilities = extractVulnerabilities(scanOutput);

  const totalDeps = dependencies.length;
  const vulnerableDeps = dependencies.filter(d => d.vulnerabilities && d.vulnerabilities.length > 0).length;
  const totalVulns = vulnerabilities.length;

  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const byCwe = {};
  const byDependency = {};

  for (const vuln of vulnerabilities) {
    const sev = (vuln.severity || '').toUpperCase();
    if (sev in bySeverity) {
      bySeverity[sev]++;
    } else if (vuln.cvss_score >= 9.0) {
      bySeverity.CRITICAL++;
    } else if (vuln.cvss_score >= 7.0) {
      bySeverity.HIGH++;
    } else if (vuln.cvss_score >= 4.0) {
      bySeverity.MEDIUM++;
    } else {
      bySeverity.LOW++;
    }

    for (const cwe of vuln.cwe) {
      byCwe[cwe] = (byCwe[cwe] || 0) + 1;
    }

    const depName = vuln.package_name || vuln.dependency;
    byDependency[depName] = (byDependency[depName] || 0) + 1;
  }

  // Top vulnerable dependencies
  const topDependencies = Object.entries(byDependency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  // Top CWEs
  const topCwes = Object.entries(byCwe)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cwe, count]) => ({ cwe, count }));

  return {
    total_dependencies: totalDeps,
    vulnerable_dependencies: vulnerableDeps,
    total_vulnerabilities: totalVulns,
    by_severity: bySeverity,
    top_cwes: topCwes,
    top_dependencies: topDependencies,
    scan_meta: scanOutput._scan_meta,
  };
}

/**
 * Generate a markdown SCA report.
 */
function generateReport(scanOutput, repoName) {
  const summary = summarizeResults(scanOutput);
  const vulnerabilities = extractVulnerabilities(scanOutput);
  const meta = scanOutput._scan_meta || {};

  const lines = [];
  lines.push(`# OWASP Dependency Check — ${repoName}`);
  lines.push('');
  lines.push(`**Scan Date:** ${meta.scanned_at || new Date().toISOString()}`);
  lines.push(`**Target:** \`${meta.target || 'unknown'}\``);
  lines.push(`**Duration:** ${meta.elapsed_ms ? (meta.elapsed_ms / 1000).toFixed(1) + 's' : 'N/A'}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Dependencies Scanned | ${summary.total_dependencies} |`);
  lines.push(`| Vulnerable Dependencies | ${summary.vulnerable_dependencies} |`);
  lines.push(`| Total Vulnerabilities (CVEs) | ${summary.total_vulnerabilities} |`);
  lines.push(`| Critical | ${summary.by_severity.CRITICAL} |`);
  lines.push(`| High | ${summary.by_severity.HIGH} |`);
  lines.push(`| Medium | ${summary.by_severity.MEDIUM} |`);
  lines.push(`| Low | ${summary.by_severity.LOW} |`);
  lines.push('');

  // Top CWEs
  if (summary.top_cwes.length > 0) {
    lines.push('## Top CWE Categories');
    lines.push('');
    lines.push('| CWE | Count |');
    lines.push('|-----|-------|');
    for (const { cwe, count } of summary.top_cwes) {
      lines.push(`| ${cwe} | ${count} |`);
    }
    lines.push('');
  }

  // Top vulnerable dependencies
  if (summary.top_dependencies.length > 0) {
    lines.push('## Most Vulnerable Dependencies');
    lines.push('');
    lines.push('| Dependency | CVE Count |');
    lines.push('|-----------|-----------|');
    for (const { name, count } of summary.top_dependencies) {
      lines.push(`| ${name} | ${count} |`);
    }
    lines.push('');
  }

  // Detailed findings by severity
  lines.push('## Detailed Findings');
  lines.push('');

  const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (const sev of severityOrder) {
    const sevVulns = vulnerabilities.filter(v => {
      const vs = (v.severity || '').toUpperCase();
      if (vs === sev) return true;
      if (sev === 'CRITICAL' && v.cvss_score >= 9.0) return true;
      if (sev === 'HIGH' && v.cvss_score >= 7.0 && v.cvss_score < 9.0) return true;
      if (sev === 'MEDIUM' && v.cvss_score >= 4.0 && v.cvss_score < 7.0) return true;
      if (sev === 'LOW' && v.cvss_score > 0 && v.cvss_score < 4.0) return true;
      return false;
    });

    if (sevVulns.length === 0) continue;

    lines.push(`### ${sev} (${sevVulns.length})`);
    lines.push('');
    lines.push('| CVE | CVSS | Dependency | CWE | Description |');
    lines.push('|-----|------|-----------|-----|-------------|');

    for (const v of sevVulns.slice(0, 50)) {
      const desc = (v.description || '').substring(0, 100).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const cwes = v.cwe.join(', ') || '-';
      lines.push(`| ${v.cve} | ${v.cvss_score.toFixed(1)} | ${v.package_name || v.dependency} | ${cwes} | ${desc} |`);
    }

    if (sevVulns.length > 50) {
      lines.push(`| ... | ... | ... | ... | *${sevVulns.length - 50} more ${sev} findings omitted* |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  getVersion,
  runScan,
  extractVulnerabilities,
  summarizeResults,
  generateReport,
  cvssToSeverity,
};
