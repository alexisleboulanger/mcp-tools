/**
 * Tool definitions — single source of truth for every MCP Gitleaks tool.
 *
 * Each entry is a standard MCP tool descriptor:
 *   { name, description, inputSchema }
 */

const tools = [
  {
    name: 'gitleaks_scan',
    description:
      'Run a Gitleaks secret detection scan against a target Git repository directory. Identifies hardcoded secrets, API keys, tokens, passwords, and private keys in source code and git history. Returns a summary with finding counts by severity and category. Results are cached in memory for use by gitleaks_findings and gitleaks_report.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path to the Git repository directory to scan (e.g., "C:\\dev\\yorizon\\yorizon-portal").',
        },
        project: {
          type: 'string',
          description: 'Human-readable project name for labeling results (e.g., "yorizon-portal"). If omitted, derived from target path.',
        },
        no_git: {
          type: 'boolean',
          description: 'Scan working directory files only (skip git history). Faster but may miss secrets that were committed and later removed. Default: false.',
        },
        config_path: {
          type: 'string',
          description: 'Path to a custom .gitleaks.toml configuration file for rule customization or allowlisting.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'gitleaks_findings',
    description:
      'Retrieve detailed secret findings from the most recent scan of a target. Supports filtering by severity, category, rule ID, or file path. Run gitleaks_scan first to populate results.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path that was previously scanned. Must match a cached scan.',
        },
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
          description: 'Filter to findings of this severity level.',
        },
        category: {
          type: 'string',
          description: 'Filter to findings in this category (e.g., "Private Keys", "Cloud Credentials (AWS)").',
        },
        rule_id: {
          type: 'string',
          description: 'Filter to findings matching this rule ID.',
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
    name: 'gitleaks_report',
    description:
      'Generate a comprehensive markdown secret detection report from scan results. Includes executive summary, severity breakdown, category analysis, and detailed findings. Run gitleaks_scan first, or this tool will trigger a scan automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path that was previously scanned (or will be scanned).',
        },
        project: {
          type: 'string',
          description: 'Project name for report header.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'gitleaks_version',
    description: 'Check Gitleaks binary availability and version. Use as a health check.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

module.exports = tools;
