#!/usr/bin/env node
/**
 * MCP Dependency Check Server — entry point
 *
 * Provides Software Composition Analysis (SCA) via OWASP Dependency Check
 * to detect known vulnerabilities (CVEs) in project dependencies.
 *
 * Tools:
 *   dependency_check_scan     — Run a scan against a target project
 *   dependency_check_findings — Retrieve findings with filtering
 *   dependency_check_report   — Generate a markdown report from results
 *   dependency_check_version  — Health check / version info
 *
 * All tool definitions live in  src/tools/definitions.js
 * All handler logic lives in    src/tools/handlers/scan.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const registerTools = require('./src/tools/router');

const server = new Server(
  { name: 'mcp-dependency-check', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Dependency Check Server running on stdio');
}

main().catch(console.error);
