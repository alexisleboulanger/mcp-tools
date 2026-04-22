/**
 * Configuration for the Semgrep MCP server.
 */

const path = require('node:path');

// Python Scripts directory where semgrep + pysemgrep are installed
const PYTHON_SCRIPTS_DIR = process.env.SEMGREP_SCRIPTS_DIR
  || path.join(process.env.APPDATA || '', 'Python', 'Python311', 'Scripts');

// Semgrep binary
const SEMGREP_BIN = process.env.SEMGREP_BIN
  || path.join(PYTHON_SCRIPTS_DIR, 'semgrep.exe');

// Default scan config (Semgrep rulesets)
const DEFAULT_CONFIG = process.env.SEMGREP_CONFIG || 'auto';

// Maximum scan timeout in milliseconds (5 minutes)
const SCAN_TIMEOUT_MS = parseInt(process.env.SEMGREP_TIMEOUT_MS || '300000', 10);

// Maximum number of findings to return in a single response
const MAX_FINDINGS_RESPONSE = parseInt(process.env.SEMGREP_MAX_FINDINGS || '500', 10);

// Scan results cache (in-memory, keyed by target path)
const scanCache = new Map();

module.exports = {
  SEMGREP_BIN,
  PYTHON_SCRIPTS_DIR,
  DEFAULT_CONFIG,
  SCAN_TIMEOUT_MS,
  MAX_FINDINGS_RESPONSE,
  scanCache,
};
