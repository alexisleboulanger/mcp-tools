/**
 * mcp-backlog — Personal Kanban Backlog MCP Server
 *
 * A lightweight, file-based personal backlog for architecture work.
 * Stores items as JSON in a configurable path (default: .knowledge/.backlog/).
 *
 * Kanban columns: backlog → doing → review → done → archived
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKLOG_PATH = process.env.BACKLOG_PATH || path.join(process.cwd(), '.knowledge', '.backlog');
const BACKLOG_FILE = path.join(BACKLOG_PATH, 'backlog.json');

const VALID_COLUMNS = ['backlog', 'doing', 'review', 'done', 'archived'];
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const COLUMN_ORDER = Object.fromEntries(VALID_COLUMNS.map((c, i) => [c, i]));

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadBacklog() {
  try {
    if (!fs.existsSync(BACKLOG_FILE)) {
      return { items: [], lastUpdated: new Date().toISOString() };
    }
    const raw = fs.readFileSync(BACKLOG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { items: [], lastUpdated: new Date().toISOString() };
  }
}

function saveBacklog(data) {
  data.lastUpdated = new Date().toISOString();
  fs.mkdirSync(BACKLOG_PATH, { recursive: true });
  fs.writeFileSync(BACKLOG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'backlog_create_item',
    description:
      'Create a new backlog item. Returns the created item with its generated ID.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the work item' },
        description: {
          type: 'string',
          description: 'Detailed description, context, or acceptance criteria (markdown supported)',
        },
        column: {
          type: 'string',
          enum: VALID_COLUMNS,
          description: 'Initial Kanban column (default: backlog)',
        },
        priority: {
          type: 'string',
          enum: VALID_PRIORITIES,
          description: 'Priority level (default: medium)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization (e.g. ["security", "nfr", "devops"])',
        },
        due_date: {
          type: 'string',
          description: 'Optional due date (ISO 8601, e.g. 2026-04-01)',
        },
        linked_ado_id: {
          type: 'string',
          description: 'Optional Azure DevOps work item ID to cross-reference',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'backlog_list_items',
    description:
      'List backlog items, optionally filtered by column, priority, or tag. Returns items sorted by priority within each column.',
    inputSchema: {
      type: 'object',
      properties: {
        column: {
          type: 'string',
          enum: VALID_COLUMNS,
          description: 'Filter by Kanban column',
        },
        priority: {
          type: 'string',
          enum: VALID_PRIORITIES,
          description: 'Filter by priority',
        },
        tag: {
          type: 'string',
          description: 'Filter by tag (exact match)',
        },
        include_archived: {
          type: 'boolean',
          description: 'Include archived items (default: false)',
        },
      },
    },
  },
  {
    name: 'backlog_get_item',
    description: 'Get full details for a single backlog item by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'backlog_move_item',
    description:
      'Move a backlog item to a different Kanban column. Valid transitions: backlog → doing → review → done → archived (or any direct move).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item ID' },
        column: {
          type: 'string',
          enum: VALID_COLUMNS,
          description: 'Target Kanban column',
        },
      },
      required: ['id', 'column'],
    },
  },
  {
    name: 'backlog_update_item',
    description:
      'Update one or more fields of a backlog item (title, description, priority, tags, due_date, linked_ado_id, notes). Unspecified fields are left unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item ID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        priority: {
          type: 'string',
          enum: VALID_PRIORITIES,
          description: 'New priority',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace tags array',
        },
        due_date: { type: 'string', description: 'New due date (ISO 8601)' },
        linked_ado_id: { type: 'string', description: 'ADO work item ID' },
        notes: {
          type: 'string',
          description: 'Append a timestamped note to the item history',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'backlog_delete_item',
    description: 'Permanently delete a backlog item. Use backlog_move_item to "archived" column instead if you want to keep history.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item ID to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'backlog_stats',
    description:
      'Return summary statistics: counts per column, overdue items, items by priority, and recent activity.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'backlog_search',
    description: 'Search backlog items by text across title, description, tags, and notes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text (case-insensitive, matches title/description/tags/notes)',
        },
      },
      required: ['query'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function handleCreate(args) {
  const data = loadBacklog();
  const now = new Date().toISOString();
  const item = {
    id: generateId(),
    title: args.title,
    description: args.description || '',
    column: VALID_COLUMNS.includes(args.column) ? args.column : 'backlog',
    priority: VALID_PRIORITIES.includes(args.priority) ? args.priority : 'medium',
    tags: Array.isArray(args.tags) ? args.tags : [],
    due_date: args.due_date || null,
    linked_ado_id: args.linked_ado_id || null,
    history: [{ timestamp: now, action: 'created', column: args.column || 'backlog' }],
    created_at: now,
    updated_at: now,
  };
  data.items.push(item);
  saveBacklog(data);
  return item;
}

function handleList(args) {
  const data = loadBacklog();
  let items = data.items;

  if (args.column) {
    items = items.filter((i) => i.column === args.column);
  } else if (!args.include_archived) {
    items = items.filter((i) => i.column !== 'archived');
  }

  if (args.priority) {
    items = items.filter((i) => i.priority === args.priority);
  }

  if (args.tag) {
    items = items.filter((i) => i.tags && i.tags.includes(args.tag));
  }

  // Sort by column order, then priority within column
  const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => {
    const colDiff = (COLUMN_ORDER[a.column] || 0) - (COLUMN_ORDER[b.column] || 0);
    if (colDiff !== 0) return colDiff;
    return (prioOrder[a.priority] || 2) - (prioOrder[b.priority] || 2);
  });

  return { count: items.length, items };
}

function handleGet(args) {
  const data = loadBacklog();
  const item = data.items.find((i) => i.id === args.id);
  if (!item) throw new Error(`Item not found: ${args.id}`);
  return item;
}

function handleMove(args) {
  const data = loadBacklog();
  const item = data.items.find((i) => i.id === args.id);
  if (!item) throw new Error(`Item not found: ${args.id}`);
  if (!VALID_COLUMNS.includes(args.column)) {
    throw new Error(`Invalid column: ${args.column}. Valid: ${VALID_COLUMNS.join(', ')}`);
  }

  const now = new Date().toISOString();
  const previousColumn = item.column;
  item.column = args.column;
  item.updated_at = now;
  item.history.push({
    timestamp: now,
    action: 'moved',
    from: previousColumn,
    to: args.column,
  });

  if (args.column === 'done' && !item.completed_at) {
    item.completed_at = now;
  }

  saveBacklog(data);
  return { id: item.id, title: item.title, from: previousColumn, to: args.column };
}

function handleUpdate(args) {
  const data = loadBacklog();
  const item = data.items.find((i) => i.id === args.id);
  if (!item) throw new Error(`Item not found: ${args.id}`);

  const now = new Date().toISOString();
  const changes = [];

  if (args.title !== undefined) { item.title = args.title; changes.push('title'); }
  if (args.description !== undefined) { item.description = args.description; changes.push('description'); }
  if (args.priority !== undefined && VALID_PRIORITIES.includes(args.priority)) {
    item.priority = args.priority;
    changes.push('priority');
  }
  if (args.tags !== undefined) { item.tags = args.tags; changes.push('tags'); }
  if (args.due_date !== undefined) { item.due_date = args.due_date; changes.push('due_date'); }
  if (args.linked_ado_id !== undefined) { item.linked_ado_id = args.linked_ado_id; changes.push('linked_ado_id'); }
  if (args.notes) {
    if (!item.notes) item.notes = [];
    item.notes.push({ timestamp: now, text: args.notes });
    changes.push('notes');
  }

  item.updated_at = now;
  item.history.push({ timestamp: now, action: 'updated', fields: changes });
  saveBacklog(data);
  return item;
}

function handleDelete(args) {
  const data = loadBacklog();
  const idx = data.items.findIndex((i) => i.id === args.id);
  if (idx === -1) throw new Error(`Item not found: ${args.id}`);

  const removed = data.items.splice(idx, 1)[0];
  saveBacklog(data);
  return { deleted: true, id: removed.id, title: removed.title };
}

function handleStats() {
  const data = loadBacklog();
  const items = data.items;
  const now = new Date();

  const byColumn = {};
  for (const col of VALID_COLUMNS) {
    byColumn[col] = items.filter((i) => i.column === col).length;
  }

  const byPriority = {};
  for (const prio of VALID_PRIORITIES) {
    byPriority[prio] = items.filter((i) => i.priority === prio && i.column !== 'archived').length;
  }

  const overdue = items.filter(
    (i) => i.due_date && new Date(i.due_date) < now && !['done', 'archived'].includes(i.column)
  );

  const recentActivity = items
    .filter((i) => i.history && i.history.length > 0)
    .flatMap((i) => i.history.map((h) => ({ item_id: i.id, title: i.title, ...h })))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  // WIP limit check
  const wipCount = byColumn['doing'] || 0;

  return {
    total: items.length,
    active: items.length - (byColumn['archived'] || 0),
    by_column: byColumn,
    by_priority: byPriority,
    overdue: overdue.map((i) => ({ id: i.id, title: i.title, due_date: i.due_date, column: i.column })),
    wip_count: wipCount,
    wip_warning: wipCount > 3 ? `⚠ WIP limit exceeded: ${wipCount} items in "doing" (recommended max: 3)` : null,
    recent_activity: recentActivity,
    last_updated: data.lastUpdated,
  };
}

function handleSearch(args) {
  const data = loadBacklog();
  const q = (args.query || '').toLowerCase();
  if (!q) return { count: 0, items: [] };

  const matches = data.items.filter((i) => {
    const searchable = [
      i.title,
      i.description,
      ...(i.tags || []),
      ...(i.notes || []).map((n) => n.text),
    ]
      .join(' ')
      .toLowerCase();
    return searchable.includes(q);
  });

  return { count: matches.length, items: matches };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'mcp-backlog', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case 'backlog_create_item':
        result = handleCreate(args || {});
        break;
      case 'backlog_list_items':
        result = handleList(args || {});
        break;
      case 'backlog_get_item':
        result = handleGet(args || {});
        break;
      case 'backlog_move_item':
        result = handleMove(args || {});
        break;
      case 'backlog_update_item':
        result = handleUpdate(args || {});
        break;
      case 'backlog_delete_item':
        result = handleDelete(args || {});
        break;
      case 'backlog_stats':
        result = handleStats();
        break;
      case 'backlog_search':
        result = handleSearch(args || {});
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[mcp-backlog] Server started — storage: ${BACKLOG_FILE}`);
}

main().catch((error) => {
  console.error('[mcp-backlog] Fatal error:', error);
  process.exit(1);
});
