#!/usr/bin/env node
/**
 * MCP Gitleaks Server — entry point
 *
 * Provides secret detection scanning via Gitleaks to find credentials,
 * API keys, tokens, and other sensitive data in Git repositories.
 *
 * Tools:
 *   gitleaks_scan     — Run a scan against a target repository
 *   gitleaks_findings — Retrieve findings with filtering
 *   gitleaks_report   — Generate a markdown report from results
 *   gitleaks_version  — Health check / version info
 *
 * All tool definitions live in  src/tools/definitions.js
 * All handler logic lives in    src/tools/handlers/scan.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const registerTools = require('./src/tools/router');

const server = new Server(
  { name: 'mcp-gitleaks', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Gitleaks Server running on stdio');
}

main().catch(console.error);
