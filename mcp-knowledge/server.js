#!/usr/bin/env node
/**
 * MCP Knowledge Server — entry point
 *
 * Enforces Ontology on Domain Knowledge Graph.
 * Architecture: Memory MCP (source of truth) → .knowledge folder (human-readable display).
 *
 * All tool definitions live in  src/tools/definitions.js
 * All handler logic lives in    src/tools/handlers/*
 * Internal modules:             src/{config,ontologies,graph,generators,knowledge-base,helpers}.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const registerTools = require('./src/tools/router');

// Create server
const server = new Server(
  { name: 'mcp-knowledge', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// Register all tools (definitions + handlers)
registerTools(server);

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Knowledge Server running on stdio');
}

main().catch(console.error);
