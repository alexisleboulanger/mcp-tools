/**
 * SharePoint-specific tools for site and content access
 */

export const sharepointTools = [
  {
    name: 'm365_sharepoint_search_sites',
    description: `Search for SharePoint sites by name or keyword. 
Use to discover team sites, project sites, or departmental sites.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Site name or keyword to search for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'm365_sharepoint_get_site',
    description: `Get details about a specific SharePoint site including its document libraries.
Provide either the site URL or site ID.`,
    inputSchema: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Full SharePoint site URL (e.g., https://contoso.sharepoint.com/sites/engineering)',
        },
        siteId: {
          type: 'string',
          description: 'SharePoint site ID (alternative to URL)',
        },
      },
    },
  },
  {
    name: 'm365_sharepoint_list_libraries',
    description: `List all document libraries in a SharePoint site.
Returns library names, IDs, and item counts.`,
    inputSchema: {
      type: 'object',
      properties: {
        siteId: {
          type: 'string',
          description: 'SharePoint site ID',
        },
      },
      required: ['siteId'],
    },
  },
  {
    name: 'm365_sharepoint_search_content',
    description: `Search within a specific SharePoint site for documents and list items.
More targeted than general search - use when you know which site contains the content.`,
    inputSchema: {
      type: 'object',
      properties: {
        siteId: {
          type: 'string',
          description: 'SharePoint site ID to search within',
        },
        query: {
          type: 'string',
          description: 'Search query',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results (1-50)',
          default: 25,
        },
      },
      required: ['siteId', 'query'],
    },
  },
];

export async function handleSharePointTool(name, args, client, config) {
  switch (name) {
    case 'm365_sharepoint_search_sites': {
      const result = await client.searchSites(args.query);
      return formatSitesList(result.value || []);
    }

    case 'm365_sharepoint_get_site': {
      const siteIdOrUrl = args.siteUrl || args.siteId;
      if (!siteIdOrUrl) {
        throw new Error('Either siteUrl or siteId is required');
      }
      
      const site = await client.getSite(siteIdOrUrl);
      const drives = await client.getSiteDrives(site.id);
      
      return formatSiteDetails(site, drives.value || []);
    }

    case 'm365_sharepoint_list_libraries': {
      const drives = await client.getSiteDrives(args.siteId);
      return formatLibrariesList(drives.value || []);
    }

    case 'm365_sharepoint_search_content': {
      const hits = await client.searchSiteContent(args.siteId, args.query, args.maxResults || 25);
      return formatSiteSearchResults(hits);
    }

    default:
      throw new Error(`Unknown SharePoint tool: ${name}`);
  }
}

function formatSitesList(sites) {
  if (!sites.length) {
    return 'No SharePoint sites found matching your query.';
  }

  let output = `## SharePoint Sites (${sites.length} found)\n\n`;
  
  for (const site of sites) {
    output += `### ${site.displayName || site.name}\n`;
    output += `- **ID:** \`${site.id}\`\n`;
    output += `- **URL:** ${site.webUrl}\n`;
    if (site.description) {
      output += `- **Description:** ${site.description}\n`;
    }
    output += '\n';
  }

  return output;
}

function formatSiteDetails(site, libraries) {
  let output = `## Site: ${site.displayName || site.name}\n\n`;
  output += `- **ID:** \`${site.id}\`\n`;
  output += `- **URL:** ${site.webUrl}\n`;
  if (site.description) {
    output += `- **Description:** ${site.description}\n`;
  }
  output += `- **Created:** ${new Date(site.createdDateTime).toLocaleDateString()}\n`;
  output += `- **Modified:** ${new Date(site.lastModifiedDateTime).toLocaleDateString()}\n`;
  
  if (libraries.length > 0) {
    output += `\n### Document Libraries (${libraries.length})\n\n`;
    for (const lib of libraries) {
      output += `- **${lib.name}** (ID: \`${lib.id}\`)\n`;
      if (lib.description) {
        output += `  - ${lib.description}\n`;
      }
      output += `  - URL: ${lib.webUrl}\n`;
    }
  }

  return output;
}

function formatLibrariesList(libraries) {
  if (!libraries.length) {
    return 'No document libraries found in this site.';
  }

  let output = `## Document Libraries (${libraries.length})\n\n`;
  
  for (const lib of libraries) {
    output += `### ${lib.name}\n`;
    output += `- **ID:** \`${lib.id}\`\n`;
    output += `- **URL:** ${lib.webUrl}\n`;
    if (lib.quota) {
      const usedGB = (lib.quota.used / 1073741824).toFixed(2);
      output += `- **Used:** ${usedGB} GB\n`;
    }
    output += '\n';
  }

  return output;
}

function formatSiteSearchResults(hits) {
  if (!hits || hits.length === 0) {
    return 'No content found matching your query in this site.';
  }

  let output = `## Site Search Results (${hits.length} items)\n\n`;
  
  for (const hit of hits) {
    const resource = hit.resource;
    output += `### ${resource.name || 'Untitled'}\n`;
    output += `- **URL:** ${resource.webUrl || ''}\n`;
    if (resource.lastModifiedDateTime) {
      output += `- **Modified:** ${new Date(resource.lastModifiedDateTime).toLocaleDateString()}\n`;
    }
    if (hit.summary) {
      output += `\n> ${hit.summary.replace(/<[^>]*>/g, '').slice(0, 200)}\n`;
    }
    output += '\n';
  }

  return output;
}
