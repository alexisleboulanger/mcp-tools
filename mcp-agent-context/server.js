#!/usr/bin/env node
/**
 * MCP Agent Context Server
 *
 * Thin wrapper around the session-memory skill scripts.
 * Exposes agent working context CRUD as MCP tools so that:
 *   - VS Code agents can call `agent-context/context_load` etc.
 *   - The Python runtime can call the same tools via MCP protocol
 *   - CLI/CI can use `npx mcp-agent-context` (stdio)
 *
 * No business logic here — every tool delegates to a Node.js script
 * via child_process.execFile, keeping the skill as the single source of truth.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { execFile } = require('node:child_process');
const path = require('node:path');

// ---------- configuration ----------
// WORKSPACE_PATH must point to the workspace root that contains .github/skills/session-memory/
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || 'C:\\dev\\yorizon';
const SCRIPTS_DIR = path.join(WORKSPACE_PATH, '.github', 'skills', 'session-memory', 'scripts');
const CONTEXT_DIR = process.env.CONTEXT_DIR || path.join(WORKSPACE_PATH, '.agent-context');

// ---------- helpers ----------

/**
 * Run a skill script and return parsed JSON output.
 */
function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const execArgs = [scriptPath, '--context-dir', CONTEXT_DIR, ...args];
    execFile('node', execArgs, { timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ raw: stdout.trim() });
      }
    });
  });
}

// ---------- tool definitions ----------

const TOOLS = [
  {
    name: 'context_load',
    description: "Load an agent's working context (Tier 2). Returns the context markdown and metadata (last updated, open items, session count).",
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name, e.g. owner-nfr, owner-devops' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'context_save',
    description: "Save session findings to an agent's working context. Merges with existing content (append-only for session history).",
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name' },
        payload: {
          type: 'object',
          description: 'Session findings: { summary, active_work: [{item,status}], references: [{item,id,status,checked}], open_questions: [string], findings: [string] }',
          properties: {
            summary: { type: 'string' },
            active_work: { type: 'array', items: { type: 'object' } },
            references: { type: 'array', items: { type: 'object' } },
            open_questions: { type: 'array', items: { type: 'string' } },
            findings: { type: 'array', items: { type: 'string' } },
          },
          required: ['summary'],
        },
      },
      required: ['agent', 'payload'],
    },
  },
  {
    name: 'context_init',
    description: "Bootstrap a new agent's working context from the standard template. Safe to call if context already exists (returns exists=true).",
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'context_promote',
    description: 'Promote Tier 1 session highlights to Tier 2 working context. Reads session memory files and appends to the working context.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'context_dashboard',
    description: 'Dashboard view of all stateful agents: last updated, staleness, open items count, session count, coverage.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'table'], default: 'json', description: 'Output format' },
      },
    },
  },
  {
    name: 'context_list',
    description: 'List all working context files with metadata (file name, size, last modified).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ---------- tool handlers ----------

async function handleTool(name, args) {
  switch (name) {
    case 'context_load':
      return await runScript('context_load.js', ['--agent', args.agent]);

    case 'context_save':
      return await runScript('context_save.js', [
        '--agent', args.agent,
        '--payload', JSON.stringify(args.payload),
      ]);

    case 'context_init':
      return await runScript('context_init.js', ['--agent', args.agent]);

    case 'context_promote':
      return await runScript('context_promote.js', ['--agent', args.agent]);

    case 'context_dashboard':
      return await runScript('context_dashboard.js',
        args.format ? ['--format', args.format] : []);

    case 'context_list': {
      const fs = require('node:fs');
      if (!fs.existsSync(CONTEXT_DIR)) {
        return { files: [], message: 'No context directory found.' };
      }
      const files = fs.readdirSync(CONTEXT_DIR)
        .filter(f => f.endsWith('-context.md'))
        .map(f => {
          const stats = fs.statSync(path.join(CONTEXT_DIR, f));
          return {
            file: f,
            agent: f.replace(/-context\.md$/, ''),
            size: stats.size,
            last_modified: stats.mtime.toISOString(),
          };
        });
      return { files, count: files.length };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- MCP server setup ----------

const server = new Server(
  { name: 'mcp-agent-context', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ---------- start ----------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
