/**
 * Tool definitions — single source of truth for every MCP Dependency Check tool.
 *
 * Each entry is a standard MCP tool descriptor:
 *   { name, description, inputSchema }
 */

const tools = [
  {
    name: 'dependency_check_scan',
    description:
      'Run an OWASP Dependency Check (SCA) scan against a target directory. Identifies known CVEs in project dependencies (npm, NuGet, Go modules, Python, etc.). Returns a summary with vulnerability counts by severity, top CWEs, and most vulnerable packages. Results are cached in memory for use by dependency_check_findings and dependency_check_report.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path to the project directory to scan (e.g., "C:\\dev\\yorizon\\yorizon-portal").',
        },
        project: {
          type: 'string',
          description: 'Human-readable project name for labeling results (e.g., "yorizon-portal"). If omitted, derived from target path.',
        },
        exclude: {
          type: 'string',
          description: 'Ant-style path pattern to exclude from scanning (e.g., "**/*.test.js" or "**/node_modules/**").',
        },
        skip_update: {
          type: 'boolean',
          description: 'Skip NVD database update (use cached vulnerability data). Faster for subsequent scans but may miss new CVEs. Default: false.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'dependency_check_findings',
    description:
      'Retrieve detailed vulnerability findings from the most recent scan of a target. Supports filtering by severity, CVE ID, CWE, or dependency name. Run dependency_check_scan first to populate results.',
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
        cve: {
          type: 'string',
          description: 'Filter to a specific CVE identifier (e.g., "CVE-2021-44228").',
        },
        cwe: {
          type: 'string',
          description: 'Filter to findings matching this CWE identifier (e.g., "CWE-79").',
        },
        dependency: {
          type: 'string',
          description: 'Filter to findings for dependencies matching this substring.',
        },
        min_cvss: {
          type: 'number',
          description: 'Minimum CVSS score filter (0.0-10.0). Only return findings at or above this score.',
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
    name: 'dependency_check_report',
    description:
      'Generate a comprehensive markdown SCA report from scan results. Includes executive summary, severity breakdown, CWE mapping, most vulnerable dependencies, and detailed CVE listings. Run dependency_check_scan first, or this tool will trigger a scan automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Absolute path that was previously scanned (or to scan now).',
        },
        project: {
          type: 'string',
          description: 'Human-readable name for the report title (e.g., "yorizon-portal").',
        },
        save_path: {
          type: 'string',
          description: 'Optional absolute file path to save the markdown report to disk.',
        },
        skip_update: {
          type: 'boolean',
          description: 'Skip NVD database update if auto-scanning. Default: false.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'dependency_check_version',
    description:
      'Return the installed OWASP Dependency Check version and binary path. Useful for health checks.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

module.exports = tools;
