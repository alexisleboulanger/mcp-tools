/**
 * Tool definitions — single source of truth for every MCP Semgrep tool.
 *
 * Each entry is a standard MCP tool descriptor:
 *   { name, description, inputSchema }
 *
 * Handler logic lives in ./handlers/scan.js — this file is ONLY schema.
 */

const tools = [
  {
    name: 'semgrep_scan',
    description:
      'Run a Semgrep SAST scan against a target directory. Returns a summary with finding counts by severity, top CWEs, top rules, and hotspot files. Scan results are cached in memory for use by semgrep_findings and semgrep_report. Uses Semgrep CE with OWASP/CWE-focused rule sets.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path to the directory or file to scan (e.g., "C:\\dev\\yorizon\\yorizon-portal").',
        },
        config: {
          type: 'string',
          description: 'Semgrep config/ruleset. Default: "auto" (recommended community rules). Can be a registry URL like "p/owasp-top-ten" or a local .semgrep.yml path.',
        },
        severity: {
          type: 'string',
          enum: ['INFO', 'WARNING', 'ERROR'],
          description: 'Minimum severity filter. Only return findings at this level or above.',
        },
        include: {
          type: 'string',
          description: 'Glob pattern to include files (e.g., "*.ts" or "src/**/*.py").',
        },
        exclude: {
          type: 'string',
          description: 'Glob pattern to exclude files (e.g., "node_modules/**" or "*.test.js").',
        },
        repo_name: {
          type: 'string',
          description: 'Human-readable repository name for labeling results (e.g., "yorizon-portal"). If omitted, derived from target path.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'semgrep_findings',
    description:
      'Retrieve detailed findings from the most recent scan of a target. Supports filtering by severity, CWE, rule ID, or file path. Returns up to 500 findings per call. Run semgrep_scan first to populate results.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path that was previously scanned. Must match a cached scan.',
        },
        severity: {
          type: 'string',
          enum: ['INFO', 'WARNING', 'ERROR'],
          description: 'Filter to findings of this exact severity.',
        },
        cwe: {
          type: 'string',
          description: 'Filter to findings matching this CWE identifier (e.g., "CWE-79").',
        },
        rule: {
          type: 'string',
          description: 'Filter to findings from this rule ID (substring match).',
        },
        file: {
          type: 'string',
          description: 'Filter to findings in files matching this substring.',
        },
        limit: {
          type: 'number',
          description: 'Maximum findings to return. Default: 50.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'semgrep_report',
    description:
      'Generate a comprehensive markdown SAST report from scan results. Includes executive summary, severity breakdown, CWE mapping, top rules, hotspot files, and detailed high-severity findings. Run semgrep_scan first, or this tool will trigger a scan automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path that was previously scanned (or to scan now).',
        },
        config: {
          type: 'string',
          description: 'Semgrep config/ruleset. Only used if no cached scan exists. Default: "auto".',
        },
        repo_name: {
          type: 'string',
          description: 'Human-readable name for the report title (e.g., "yorizon-portal").',
        },
        save_path: {
          type: 'string',
          description: 'Optional absolute file path to save the markdown report to disk.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'semgrep_version',
    description:
      'Return the installed Semgrep version and binary path. Useful for health checks.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

module.exports = tools;
