/**
 * Configuration for the OWASP Dependency Check MCP server.
 */

const path = require('node:path');

// Dependency Check binary (bat on Windows, sh on *nix)
const DC_BIN = process.env.DC_BIN
  || (process.platform === 'win32'
    ? path.join(__dirname, '..', 'tools', 'dependency-check', 'bin', 'dependency-check.bat')
    : '/usr/local/bin/dependency-check.sh');

// Data directory for NVD cache
const DC_DATA_DIR = process.env.DC_DATA_DIR
  || path.join(path.dirname(DC_BIN), '..', 'data');

// NVD API key (strongly recommended — without it, rate limits are very low)
const NVD_API_KEY = process.env.NVD_API_KEY || '';

// Maximum scan timeout in milliseconds (10 minutes — DC is slower than Semgrep)
const SCAN_TIMEOUT_MS = parseInt(process.env.DC_TIMEOUT_MS || '600000', 10);

// Maximum number of findings to return in a single response
const MAX_FINDINGS_RESPONSE = parseInt(process.env.DC_MAX_FINDINGS || '500', 10);

// Default output format (JSON for parsing)
const OUTPUT_FORMAT = 'JSON';

// Scan results cache (in-memory, keyed by target path)
const scanCache = new Map();

// Persistent cache directory (mirrors mcp-caching layout)
const CACHE_ROOT = process.env.CACHE_PATH
  || path.join(process.env.WORKSPACE_PATH || path.resolve(__dirname, '..', '..', '..', 'yorizon'), '.cache');
const CACHE_SOURCE = 'dependency-check';
const CACHE_TTL_MINUTES = 10080; // 7 days — vulnerabilities don't change that fast

module.exports = {
  DC_BIN,
  DC_DATA_DIR,
  NVD_API_KEY,
  SCAN_TIMEOUT_MS,
  MAX_FINDINGS_RESPONSE,
  OUTPUT_FORMAT,
  scanCache,
  CACHE_ROOT,
  CACHE_SOURCE,
  CACHE_TTL_MINUTES,
};
