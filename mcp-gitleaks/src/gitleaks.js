/**
 * Gitleaks CLI wrapper — spawns gitleaks and parses JSON output.
 */

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { GITLEAKS_BIN, SCAN_TIMEOUT_MS } = require('./config');

/**
 * Verify gitleaks is available.
 * @returns {Promise<string>} version string
 */
function getVersion() {
  return new Promise((resolve, reject) => {
    execFile(GITLEAKS_BIN, ['version'], { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Gitleaks not found at ${GITLEAKS_BIN}: ${err.message}`));
      const output = (stdout || stderr || '').trim();
      resolve(output);
    });
  });
}

/**
 * Run a gitleaks scan and return parsed JSON findings.
 *
 * @param {object} opts
 * @param {string} opts.target       - Directory to scan
 * @param {string} [opts.project]    - Project name for labeling
 * @param {boolean} [opts.noGit]     - Scan files only (no git history). Default: false
 * @param {string} [opts.configPath] - Path to custom .gitleaks.toml config
 * @returns {Promise<object>} Parsed gitleaks findings + metadata
 */
async function runScan(opts) {
  const { target, project, noGit, configPath } = opts;

  // Validate target path exists
  if (!fs.existsSync(target)) {
    throw new Error(`Target path does not exist: ${target}`);
  }

  // Create a temp file for the JSON output
  const tmpFile = path.join(os.tmpdir(), `gitleaks-${Date.now()}.json`);

  const args = [
    'detect',
    '--source', target,
    '--report-format', 'json',
    '--report-path', tmpFile,
    '--exit-code', '0', // Don't fail on findings — we parse them
  ];

  // No-git mode scans working directory only (no git history)
  if (noGit) {
    args.push('--no-git');
  }

  // Custom config file
  if (configPath && fs.existsSync(configPath)) {
    args.push('--config', configPath);
  }

  console.error(`[gitleaks] Running: ${GITLEAKS_BIN} ${args.join(' ')}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    execFile(
      GITLEAKS_BIN,
      args,
      {
        timeout: SCAN_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024, // 50 MB buffer
        env: { ...process.env },
      },
      async (err, stdout, stderr) => {
        const elapsed = Date.now() - startTime;
        console.error(`[gitleaks] Scan completed in ${elapsed}ms`);

        // Gitleaks exits 0 = no leaks, 1 = leaks found (when exit-code not forced)
        // We force exit-code 0 above, so err should only be timeouts or missing binary
        if (err && !fs.existsSync(tmpFile)) {
          return reject(new Error(`Gitleaks scan failed: ${stderr || err.message}`));
        }

        try {
          let findings = [];
          if (fs.existsSync(tmpFile)) {
            const raw = await fsp.readFile(tmpFile, 'utf8');
            if (raw.trim()) {
              findings = JSON.parse(raw);
            }
            await fsp.unlink(tmpFile).catch(() => {});
          }

          resolve({
            findings,
            _scan_meta: {
              target,
              project: project || path.basename(target),
              elapsed_ms: elapsed,
              scanned_at: new Date().toISOString(),
              no_git: !!noGit,
              total_findings: findings.length,
            },
          });
        } catch (parseErr) {
          await fsp.unlink(tmpFile).catch(() => {});
          reject(new Error(`Failed to parse gitleaks output: ${parseErr.message}`));
        }
      }
    );
  });
}

/**
 * Categorize a finding by its rule ID into a high-level category.
 */
function categorizeRule(ruleID) {
  const id = (ruleID || '').toLowerCase();

  if (id.includes('aws') || id.includes('amazon')) return 'Cloud Credentials (AWS)';
  if (id.includes('azure') || id.includes('microsoft')) return 'Cloud Credentials (Azure)';
  if (id.includes('gcp') || id.includes('google')) return 'Cloud Credentials (GCP)';
  if (id.includes('github') || id.includes('gitlab') || id.includes('bitbucket')) return 'Source Control Tokens';
  if (id.includes('docker') || id.includes('npm') || id.includes('nuget') || id.includes('pypi')) return 'Package Registry Tokens';
  if (id.includes('private-key') || id.includes('rsa') || id.includes('ssh')) return 'Private Keys';
  if (id.includes('jwt') || id.includes('token') || id.includes('bearer')) return 'API Tokens';
  if (id.includes('password') || id.includes('passwd') || id.includes('secret')) return 'Passwords & Secrets';
  if (id.includes('database') || id.includes('postgres') || id.includes('mysql') || id.includes('mongo') || id.includes('redis') || id.includes('connection-string')) return 'Database Credentials';
  if (id.includes('slack') || id.includes('discord') || id.includes('telegram') || id.includes('webhook')) return 'Communication Platform Tokens';
  if (id.includes('stripe') || id.includes('paypal') || id.includes('square')) return 'Payment Service Credentials';
  if (id.includes('sendgrid') || id.includes('mailgun') || id.includes('twilio')) return 'Communication Service Keys';
  if (id.includes('generic') || id.includes('api-key') || id.includes('apikey')) return 'Generic API Keys';
  return 'Other Secrets';
}

/**
 * Map a gitleaks rule to a severity level.
 * Gitleaks doesn't natively assign severity, so we infer it.
 */
function ruleSeverity(ruleID) {
  const id = (ruleID || '').toLowerCase();

  // Critical: private keys, cloud IAM credentials
  if (id.includes('private-key') || id.includes('rsa') || id.includes('ssh-key')) return 'CRITICAL';
  if (id.includes('aws-access') || id.includes('aws-secret') || id.includes('gcp-service-account')) return 'CRITICAL';
  if (id.includes('azure-ad') || id.includes('azure-client-secret')) return 'CRITICAL';

  // High: tokens with broad access
  if (id.includes('github-pat') || id.includes('github-oauth') || id.includes('gitlab-token')) return 'HIGH';
  if (id.includes('database') || id.includes('connection-string') || id.includes('postgres') || id.includes('mysql')) return 'HIGH';
  if (id.includes('jwt') || id.includes('bearer')) return 'HIGH';
  if (id.includes('stripe') || id.includes('paypal')) return 'HIGH';

  // Medium: service-specific tokens, webhook URLs
  if (id.includes('slack') || id.includes('discord') || id.includes('sendgrid') || id.includes('twilio')) return 'MEDIUM';
  if (id.includes('npm') || id.includes('nuget') || id.includes('docker')) return 'MEDIUM';
  if (id.includes('webhook')) return 'MEDIUM';

  // Low: generic patterns (high false-positive rate)
  if (id.includes('generic')) return 'LOW';

  return 'MEDIUM'; // default
}

/**
 * Extract and enrich findings from gitleaks output.
 */
function extractFindings(scanOutput) {
  const rawFindings = scanOutput.findings || [];
  return rawFindings.map(f => ({
    rule_id: f.RuleID,
    description: f.Description,
    category: categorizeRule(f.RuleID),
    severity: ruleSeverity(f.RuleID),
    file: f.File,
    line: f.StartLine,
    commit: f.Commit || null,
    author: f.Author || null,
    date: f.Date || null,
    match: f.Match ? maskSecret(f.Match) : null,
    secret: f.Secret ? maskSecret(f.Secret) : null,
    fingerprint: f.Fingerprint || null,
  }));
}

/**
 * Mask a secret value — show only first 4 and last 2 chars.
 */
function maskSecret(value) {
  if (!value || value.length <= 8) return '***REDACTED***';
  return value.slice(0, 4) + '***' + value.slice(-2);
}

/**
 * Summarize scan results into a structured object.
 */
function summarizeResults(scanOutput) {
  const findings = extractFindings(scanOutput);
  const total = findings.length;

  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const byCategory = Object.create(null);
  const byRule = Object.create(null);
  const byFile = Object.create(null);

  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byRule[f.rule_id] = (byRule[f.rule_id] || 0) + 1;
    byFile[f.file] = (byFile[f.file] || 0) + 1;
  }

  // Top files with most findings
  const topFiles = Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  // Top rules
  const topRules = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({ rule, count }));

  return {
    total_findings: total,
    by_severity: bySeverity,
    by_category: byCategory,
    top_files: topFiles,
    top_rules: topRules,
    has_critical: bySeverity.CRITICAL > 0,
    has_high: bySeverity.HIGH > 0,
  };
}

module.exports = {
  getVersion,
  runScan,
  extractFindings,
  summarizeResults,
  categorizeRule,
  ruleSeverity,
  maskSecret,
};
