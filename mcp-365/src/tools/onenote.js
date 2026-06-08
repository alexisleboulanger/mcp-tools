/**
 * OneNote tools — access cloud-synced notebooks via Graph API
 * 
 * OneNote .one files are binary and can't be read via the files API.
 * These tools use the dedicated /onenote endpoints which return page content as HTML.
 * 
 * Requires: Notes.Read or Notes.ReadWrite.All scope
 */

export const onenoteTools = [
  {
    name: 'm365_onenote_notebooks',
    description: `List all OneNote notebooks accessible to the user.
Returns notebook names, IDs, and links. Use this first to discover available notebooks.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'm365_onenote_sections',
    description: `List sections within a OneNote notebook.
Each section contains pages. Provide a notebook ID from m365_onenote_notebooks.`,
    inputSchema: {
      type: 'object',
      properties: {
        notebookId: {
          type: 'string',
          description: 'Notebook ID (from m365_onenote_notebooks)',
        },
      },
      required: ['notebookId'],
    },
  },
  {
    name: 'm365_onenote_pages',
    description: `List pages within a OneNote section.
Returns page titles, IDs, creation/modification dates. Provide a section ID from m365_onenote_sections.`,
    inputSchema: {
      type: 'object',
      properties: {
        sectionId: {
          type: 'string',
          description: 'Section ID (from m365_onenote_sections)',
        },
        maxItems: {
          type: 'number',
          description: 'Maximum pages to return (1-100)',
          default: 50,
        },
      },
      required: ['sectionId'],
    },
  },
  {
    name: 'm365_onenote_page_content',
    description: `Read the content of a OneNote page as HTML.
Returns the full page content including text, tables, and embedded media references.
Use this to actually read notebook content.`,
    inputSchema: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Page ID (from m365_onenote_pages)',
        },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'm365_onenote_search',
    description: `Search OneNote pages by keyword — searches page CONTENT, not just titles.
Returns matching pages with full IDs. Use m365_onenote_page_content to read the full page (no snippet limit).

If you have many sections, provide a notebookId to scope the search (faster and avoids API limits).
Without a notebookId, searches all notebooks but may be slower.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text to find in OneNote page content',
        },
        notebookId: {
          type: 'string',
          description: 'Optional: limit search to a specific notebook (from m365_onenote_notebooks)',
        },
        maxItems: {
          type: 'number',
          description: 'Maximum results to return (1-50)',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
];

export async function handleOneNoteTool(name, args, client) {
  switch (name) {
    case 'm365_onenote_notebooks':
      return listNotebooks(client);
    case 'm365_onenote_sections':
      return listSections(client, args);
    case 'm365_onenote_pages':
      return listPages(client, args);
    case 'm365_onenote_page_content':
      return getPageContent(client, args);
    case 'm365_onenote_search':
      return searchPages(client, args);
    default:
      throw new Error(`Unknown OneNote tool: ${name}`);
  }
}

async function listNotebooks(client) {
  const data = await client.get('/me/onenote/notebooks?$select=id,displayName,createdDateTime,lastModifiedDateTime,isShared,links&$orderby=lastModifiedDateTime desc');

  const notebooks = (data.value || []).map(nb => ({
    id: nb.id,
    name: nb.displayName,
    shared: nb.isShared || false,
    created: nb.createdDateTime,
    modified: nb.lastModifiedDateTime,
    webUrl: nb.links?.oneNoteWebUrl?.href || null,
  }));

  return {
    count: notebooks.length,
    notebooks,
    hint: 'Use m365_onenote_sections with a notebook ID to see its sections.',
  };
}

async function listSections(client, args) {
  const { notebookId } = args;
  const data = await client.get(`/me/onenote/notebooks/${notebookId}/sections?$select=id,displayName,createdDateTime,lastModifiedDateTime&$orderby=displayName`);

  const sections = (data.value || []).map(s => ({
    id: s.id,
    name: s.displayName,
    created: s.createdDateTime,
    modified: s.lastModifiedDateTime,
  }));

  return {
    notebookId,
    count: sections.length,
    sections,
    hint: 'Use m365_onenote_pages with a section ID to see its pages.',
  };
}

async function listPages(client, args) {
  const { sectionId, maxItems = 50 } = args;
  const top = Math.min(Math.max(1, maxItems), 100);
  const data = await client.get(`/me/onenote/sections/${sectionId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,order&$orderby=order&$top=${top}`);

  const pages = (data.value || []).map(p => ({
    id: p.id,
    title: p.title || '(Untitled)',
    created: p.createdDateTime,
    modified: p.lastModifiedDateTime,
  }));

  return {
    sectionId,
    count: pages.length,
    pages,
    hint: 'Use m365_onenote_page_content with a page ID to read its content.',
  };
}

async function getPageContent(client, args) {
  const { pageId } = args;

  // Get page metadata first
  const meta = await client.get(`/me/onenote/pages/${pageId}?$select=id,title,createdDateTime,lastModifiedDateTime,parentSection`);

  // Get content as HTML
  const token = await client.authProvider.getAccessToken();
  const url = `${client.baseUrl}/me/onenote/pages/${pageId}/content`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get page content: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Strip full HTML wrapper, keep body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1].trim() : html;

  return {
    id: pageId,
    title: meta.title || '(Untitled)',
    modified: meta.lastModifiedDateTime,
    parentSection: meta.parentSection?.displayName || null,
    contentHtml: content,
    hint: 'Content is HTML. Tables, lists, and formatting are preserved.',
  };
}

async function searchPages(client, args) {
  const { query, notebookId, maxItems = 20 } = args;
  const top = Math.min(Math.max(1, maxItems), 50);

  // Get sections to search within (scoped to notebook or all)
  let sections;
  if (notebookId) {
    const data = await client.get(
      `/me/onenote/notebooks/${notebookId}/sections?$select=id,displayName`
    );
    sections = data.value || [];
  } else {
    // Get all sections across all notebooks
    const data = await client.get('/me/onenote/sections?$select=id,displayName&$top=50');
    sections = data.value || [];
  }

  if (sections.length === 0) {
    return { query, count: 0, pages: [], hint: 'No sections found to search.' };
  }

  // Search within each section in parallel (Graph requires per-section search)
  const allPages = [];
  const searchResults = await Promise.allSettled(
    sections.map(async (section) => {
      try {
        const data = await client.get(
          `/me/onenote/sections/${section.id}/pages?$search=${encodeURIComponent(query)}&$select=id,title,createdDateTime,lastModifiedDateTime&$top=10`
        );
        return (data.value || []).map(p => ({
          id: p.id,
          title: p.title || '(Untitled)',
          modified: p.lastModifiedDateTime,
          section: section.displayName,
        }));
      } catch {
        // If $search fails for this section, try listing and filtering by title
        try {
          const data = await client.get(
            `/me/onenote/sections/${section.id}/pages?$select=id,title,lastModifiedDateTime&$top=50`
          );
          const queryLower = query.toLowerCase();
          return (data.value || [])
            .filter(p => (p.title || '').toLowerCase().includes(queryLower))
            .map(p => ({
              id: p.id,
              title: p.title || '(Untitled)',
              modified: p.lastModifiedDateTime,
              section: section.displayName,
            }));
        } catch {
          return [];
        }
      }
    })
  );

  for (const result of searchResults) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allPages.push(...result.value);
    }
  }

  // Sort by modified date, deduplicate, limit
  const pages = allPages
    .sort((a, b) => new Date(b.modified) - new Date(a.modified))
    .slice(0, top);

  return {
    query,
    searchMethod: 'per-section content search',
    sectionsSearched: sections.length,
    count: pages.length,
    pages,
    hint: pages.length > 0
      ? 'Use m365_onenote_page_content with a page ID to read the FULL page (no snippet limit).'
      : 'No matching pages found. Try different keywords or browse with m365_onenote_notebooks.',
  };
}
