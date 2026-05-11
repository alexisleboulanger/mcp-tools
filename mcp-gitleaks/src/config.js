/**
 * Configuration for the Gitleaks MCP server.
 */

const path = require('node:path');

// Gitleaks binary path
const GITLEAKS_BIN = process.env.GITLEAKS_BIN
  || path.join(__dirname, '..', 'tools', 'gitleaks', 'gitleaks.exe');

// Maximum scan timeout in milliseconds (5 minutes)
const SCAN_TIMEOUT_MS = parseInt(process.env.GITLEAKS_TIMEOUT_MS || '300000', 10);

// Maximum number of findings to return in a single response
const MAX_FINDINGS_RESPONSE = parseInt(process.env.GITLEAKS_MAX_FINDINGS || '500', 10);

// Scan results cache (in-memory, keyed by target path)
const scanCache = new Map();

module.exports = {
  GITLEAKS_BIN,
  SCAN_TIMEOUT_MS,
  MAX_FINDINGS_RESPONSE,
  scanCache,
};
