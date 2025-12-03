/**
 * MCP Tool definitions and handlers for Microsoft 365 integration
 */

import { searchTools, handleSearchTool } from './search.js';
import { sharepointTools, handleSharePointTool } from './sharepoint.js';
import { filesTools, handleFilesTool } from './files.js';
import { mailTools, handleMailTool } from './mail.js';
import { calendarTools, handleCalendarTool } from './calendar.js';
import { teamsTools, handleTeamsTool } from './teams.js';
import { PermissionError } from '../graph-client.js';

// Status/diagnostic tool
const statusTools = [
  {
    name: 'm365_status',
    description: 'Check which Microsoft 365 capabilities are available with current authentication. Use this first to see what features you can access.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// Aggregate all tools
export const tools = [
  ...statusTools,
  ...searchTools,
  ...sharepointTools,
  ...filesTools,
  ...mailTools,
  ...calendarTools,
  ...teamsTools,
];

// Handle capability check
async function handleStatusTool(client) {
  const capabilities = await client.checkCapabilities();
  
  const status = {
    summary: [],
    available: [],
    unavailable: [],
    recommendations: [],
  };

  const featureMap = {
    user: { name: 'User Profile', tools: ['Basic user info'] },
    mail: { name: 'Outlook Mail', tools: ['m365_mail_search', 'm365_mail_recent'] },
    calendar: { name: 'Calendar', tools: ['m365_calendar_today', 'm365_calendar_week', 'm365_calendar_events'] },
    files: { name: 'OneDrive/Files', tools: ['m365_files_list', 'm365_files_read', 'm365_files_search'] },
    sites: { name: 'SharePoint Sites', tools: ['m365_sharepoint_sites', 'm365_sharepoint_search'] },
    teams: { name: 'Microsoft Teams', tools: ['m365_teams_list', 'm365_teams_channels'] },
    search: { name: 'Unified Search', tools: ['m365_search', 'm365_search_documents'] },
  };

  for (const [key, available] of Object.entries(capabilities)) {
    const feature = featureMap[key];
    if (!feature) continue;
    
    if (available) {
      status.available.push(`✓ ${feature.name}: ${feature.tools.join(', ')}`);
    } else {
      status.unavailable.push(`✗ ${feature.name}: Requires additional permissions`);
    }
  }

  if (status.unavailable.length > 0) {
    status.recommendations.push(
      'To access more features:',
      '1. Use Graph Explorer token (quick): https://developer.microsoft.com/graph/graph-explorer',
      '2. Run: node src/token-helper.js refresh',
      '3. Or request admin consent for your app registration'
    );
  }

  return {
    capabilities,
    available: status.available,
    unavailable: status.unavailable,
    recommendations: status.recommendations,
  };
}

// Route tool calls to appropriate handler
export async function handleToolCall(name, args, client, config) {
  try {
    // Status tool
    if (name === 'm365_status') {
      return handleStatusTool(client);
    }
    
    // Search tools
    if (name.startsWith('m365_search')) {
      return handleSearchTool(name, args, client, config);
    }
    
    // SharePoint tools
    if (name.startsWith('m365_sharepoint')) {
      return handleSharePointTool(name, args, client, config);
    }
    
    // Files/OneDrive tools
    if (name.startsWith('m365_files')) {
      return handleFilesTool(name, args, client, config);
    }
    
    // Mail tools
    if (name.startsWith('m365_mail')) {
      return handleMailTool(name, args, client, config);
    }
    
    // Calendar tools
    if (name.startsWith('m365_calendar')) {
      return handleCalendarTool(name, args, client, config);
    }
    
    // Teams tools
    if (name.startsWith('m365_teams')) {
      return handleTeamsTool(name, args, client, config);
    }
    
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    // Enhance permission errors with helpful guidance
    if (error instanceof PermissionError || error.isPermissionError) {
      return {
        error: error.message,
        help: error.getHelpText?.() || 'Try using a Graph Explorer token with broader permissions.',
        requiredPermissions: error.requiredPermissions,
      };
    }
    throw error;
  }
}
