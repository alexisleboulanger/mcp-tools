#!/usr/bin/env node
/**
 * MCP Server for Microsoft 365 Graph API Integration
 * 
 * Provides tools for GitHub Copilot / AI assistants to query:
 * - SharePoint sites and documents
 * - OneDrive files
 * - Teams channels and messages
 * - Outlook emails and calendar
 * - Microsoft Search across tenant
 * 
 * Authentication: Entra ID (Azure AD) with delegated or application permissions
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { createAuthProvider } from './auth.js';
import { GraphClient } from './graph-client.js';
import { tools, handleToolCall } from './tools/index.js';

const config = loadConfig();

// Initialize MCP server
const server = new Server(
  {
    name: 'mcp-365',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Graph client singleton (lazy initialized after auth)
let graphClient = null;

async function getGraphClient() {
  if (!graphClient) {
    const authProvider = await createAuthProvider(config);
    graphClient = new GraphClient(authProvider, config);
  }
  return graphClient;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const client = await getGraphClient();
    const result = await handleToolCall(name, args, client, config);
    
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (not stdout which is for MCP protocol)
  console.error('[mcp-365] Server started');
  console.error(`[mcp-365] Tenant: ${config.tenantId || 'common'}`);
  console.error(`[mcp-365] Tools available: ${tools.length}`);
}

main().catch((error) => {
  console.error('[mcp-365] Fatal error:', error);
  process.exit(1);
});
