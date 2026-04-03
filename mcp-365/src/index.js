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

// Standardized MCP error response (matches mcp-knowledge pattern).
function mcpError(code, message, opts = {}) {
  const payload = { error: code, message };
  if (opts.tool) payload.tool = opts.tool;
  if (opts.recovery) payload.recovery = opts.recovery;
  if (opts.next_steps?.length) payload.next_steps = opts.next_steps;
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

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
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('token')) {
      return mcpError('AUTH_ERROR', errorMessage, {
        tool: name,
        recovery: 'Authentication failed or token expired.',
        next_steps: ['Re-authenticate with M365', 'Check tenant configuration'],
      });
    }
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return mcpError('NOT_FOUND', errorMessage, {
        tool: name,
        recovery: 'The requested M365 resource was not found.',
        next_steps: ['Verify the resource identifier', 'Use m365_search to find the resource'],
      });
    }
    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      return mcpError('FORBIDDEN', errorMessage, {
        tool: name,
        recovery: 'Insufficient permissions to access this resource.',
        next_steps: ['Check Graph API permissions', 'Request admin consent for the required scope'],
      });
    }
    return mcpError('INTERNAL_ERROR', errorMessage, {
      tool: name,
      recovery: 'An error occurred querying Microsoft 365.',
      next_steps: ['Retry the operation', 'Try m365_status to check connectivity'],
    });
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
