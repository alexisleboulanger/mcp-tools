#!/usr/bin/env node
/**
 * MCP Semgrep Server — entry point
 *
 * Provides SAST scanning via Semgrep CE for OWASP/CWE-focused
 * static analysis of code repositories.
 *
 * Tools:
 *   semgrep_scan     — Run a Semgrep scan against a target directory
 *   semgrep_findings — Retrieve detailed findings with filtering
 *   semgrep_report   — Generate a markdown report from scan results
 *
 * All tool definitions live in  src/tools/definitions.js
 * All handler logic lives in    src/tools/handlers/scan.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const registerTools = require('./src/tools/router');

const server = new Server(
  { name: 'mcp-semgrep', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Semgrep Server running on stdio');
}

main().catch(console.error);
