#!/usr/bin/env node
/**
 * MCP Caching Server — entry point
 *
 * Provides deterministic, TTL-based caching for external-data agents.
 * Stores markdown snapshots with YAML front matter in a root .cache folder.
 *
 * All tool definitions live in  src/tools/definitions.js
 * All handler logic lives in    src/tools/handlers/cache.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const registerTools = require('./src/tools/router');

const server = new Server(
  { name: 'mcp-caching', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Caching Server running on stdio');
}

main().catch(console.error);
