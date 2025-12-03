/**
 * Microsoft Search tools - unified search across M365 content
 */

export const searchTools = [
  {
    name: 'm365_search',
    description: `Search across all Microsoft 365 content including SharePoint documents, OneDrive files, emails, and calendar events. 
Returns relevant excerpts with source links. Use this for broad discovery queries when you don't know where content lives.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Supports KQL syntax (e.g., "project plan filetype:docx", "from:john budget")',
        },
        entityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['driveItem', 'listItem', 'message', 'event', 'site'],
          },
          description: 'Types of content to search. Default: all types.',
          default: ['driveItem', 'listItem', 'message', 'event'],
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results to return (1-50)',
          default: 25,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'm365_search_documents',
    description: `Search specifically for documents and files across SharePoint and OneDrive. 
Use when looking for specific document types, presentations, spreadsheets, or files.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Can include filetype: modifier (e.g., "quarterly report filetype:pptx")',
        },
        fileType: {
          type: 'string',
          description: 'Filter by file extension (e.g., "docx", "xlsx", "pdf", "pptx")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results to return (1-50)',
          default: 25,
        },
      },
      required: ['query'],
    },
  },
];

export async function handleSearchTool(name, args, client, config) {
  switch (name) {
    case 'm365_search': {
      const entityTypes = args.entityTypes || ['driveItem', 'listItem', 'message', 'event'];
      const hits = await client.search(args.query, entityTypes, args.maxResults || 25);
      return formatSearchResults(hits);
    }

    case 'm365_search_documents': {
      let query = args.query;
      if (args.fileType) {
        query += ` filetype:${args.fileType}`;
      }
      const hits = await client.search(query, ['driveItem', 'listItem'], args.maxResults || 25);
      return formatSearchResults(hits);
    }

    default:
      throw new Error(`Unknown search tool: ${name}`);
  }
}

function formatSearchResults(hits) {
  if (!hits || hits.length === 0) {
    return 'No results found.';
  }

  const results = hits.map((hit, index) => {
    const resource = hit.resource;
    const summary = hit.summary || resource.bodyPreview || '';
    
    return {
      rank: index + 1,
      name: resource.name || resource.subject || 'Untitled',
      type: resource['@odata.type']?.replace('#microsoft.graph.', '') || 'unknown',
      url: resource.webUrl || resource.webLink || '',
      lastModified: resource.lastModifiedDateTime || '',
      summary: cleanSummary(summary),
      path: resource.parentReference?.path || '',
    };
  });

  // Format as markdown for readability
  let output = `## Search Results (${results.length} items)\n\n`;
  
  for (const result of results) {
    output += `### ${result.rank}. ${result.name}\n`;
    output += `- **Type:** ${result.type}\n`;
    if (result.lastModified) {
      output += `- **Modified:** ${new Date(result.lastModified).toLocaleDateString()}\n`;
    }
    if (result.path) {
      output += `- **Path:** ${result.path}\n`;
    }
    if (result.url) {
      output += `- **Link:** ${result.url}\n`;
    }
    if (result.summary) {
      output += `\n> ${result.summary}\n`;
    }
    output += '\n';
  }

  return output;
}

function cleanSummary(summary) {
  if (!summary) return '';
  // Remove HTML tags and normalize whitespace
  return summary
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}
