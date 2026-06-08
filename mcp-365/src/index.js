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
    // m365_authenticate doesn't need a graph client
    if (name === 'm365_authenticate') {
      const result = await handleToolCall(name, args, null, config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

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
        recovery: 'Token expired or invalid. Call m365_authenticate to get a new token.',
        next_steps: ['Call m365_authenticate'],
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
        next_steps: ['Check Graph API permissions', 'Call m365_authenticate with broader scopes'],
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
  // Check if we have a valid token
  if (config.accessToken) {
    try {
      // Decode JWT to check expiry
      const parts = config.accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const expiresAt = payload.exp * 1000;
        const now = Date.now();
        if (now > expiresAt) {
          const minutesAgo = Math.round((now - expiresAt) / 60000);
          console.error(`[mcp-365] ⚠ Token EXPIRED (${minutesAgo} min ago)`);
          console.error('[mcp-365] Run: npm run token:refresh');
        } else {
          const minutesLeft = Math.round((expiresAt - now) / 60000);
          console.error(`[mcp-365] ✓ Token valid (${minutesLeft} min remaining)`);
          console.error(`[mcp-365] User: ${payload.name || payload.upn || 'unknown'}`);
        }
      }
    } catch { /* ignore decode errors */ }
  } else {
    console.error('[mcp-365] ⚠ No token configured');
    console.error('[mcp-365] Run: npm run token:refresh');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('[mcp-365] Server started');
  console.error(`[mcp-365] Tenant: ${config.tenantId || 'common'}`);
  console.error(`[mcp-365] Tools available: ${tools.length}`);
}

main().catch((error) => {
  console.error('[mcp-365] Fatal error:', error);
  process.exit(1);
});
