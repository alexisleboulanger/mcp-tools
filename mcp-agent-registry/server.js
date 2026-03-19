#!/usr/bin/env node
/**
 * MCP Agent Registry Server
 *
 * Exposes agent metadata from the knowledge graph as MCP tools.
 * Generates A2A Agent Card format, supports discovery, registration, and health checks.
 *
 * Environment:
 *   KNOWLEDGE_PATH — path to .knowledge folder (default: cwd/.knowledge)
 *   AGENTS_PATH    — path to .github/agents/ folder (auto-detected from KNOWLEDGE_PATH parent)
 */

const fs = require('node:fs');
const path = require('node:path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const YAML = require('yaml');

// ─── Configuration ───────────────────────────────────────────

const KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH || path.join(process.cwd(), '.knowledge');
const GRAPH_FILE = path.join(KNOWLEDGE_PATH, '.memory', 'knowledge-graph.json');

// Derive agents dir: KNOWLEDGE_PATH parent is the workspace root
const WORKSPACE_ROOT = path.dirname(KNOWLEDGE_PATH);
const AGENTS_DIR = process.env.AGENTS_PATH || path.join(WORKSPACE_ROOT, '.github', 'agents');

// ─── Graph helpers ───────────────────────────────────────────

function loadGraph() {
  if (!fs.existsSync(GRAPH_FILE)) {
    return { entities: {}, relations: [] };
  }
  return JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
}

function saveGraph(graph) {
  graph.lastUpdated = new Date().toISOString();
  fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');
}

function getAgentEntities(graph) {
  return Object.values(graph.entities).filter(e => e.type === 'Agent');
}

function getMCPServerEntities(graph) {
  return Object.values(graph.entities).filter(e => e.type === 'MCPServer');
}

function getRelationsFor(graph, entityName) {
  if (!Array.isArray(graph.relations)) return [];
  return graph.relations.filter(r => r.from === entityName || r.to === entityName);
}

// ─── Agent file discovery ────────────────────────────────────

function discoverAgentFiles() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.agent.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8');
      const frontmatter = parseFrontMatter(content);
      return {
        fileName: f,
        agentName: f.replace('.agent.md', ''),
        description: frontmatter.description || '',
        tools: frontmatter.tools || [],
      };
    });
}

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    return YAML.parse(match[1]) || {};
  } catch {
    return {};
  }
}

/**
 * Normalize a name for matching: strip 'Yorizon-' prefix, hyphens, 'Agent' suffix, lowercase.
 * e.g. 'Yorizon-NFR-Auditor-Agent' → 'nfrauditor'
 *      'NFRAuditorAgent'           → 'nfrauditor'
 */
function normalizeForMatch(name) {
  return name
    .replace(/^Yorizon-/i, '')
    .replace(/-/g, '')
    .replace(/Agent$/i, '')
    .replace(/\.agent\.md$/i, '')
    .toLowerCase();
}

function isDeprecatedEntity(entity) {
  return (entity?.observations || []).some(obs => obs.toLowerCase().includes('status=deprecated'));
}

function getDeclaredTools(agentFile, entity) {
  const fileTools = Array.isArray(agentFile?.tools) ? agentFile.tools : [];
  if (fileTools.length > 0) return fileTools;

  return (entity?.observations || [])
    .filter(o => o.startsWith('Tools:'))
    .flatMap(o => o.replace('Tools:', '').split(',').map(t => t.trim()))
    .filter(Boolean);
}

function requiresMcpServer(tools) {
  return tools.some(tool => tool.includes('/'));
}

function findAgentFile(agentFiles, entityName) {
  const normalized = normalizeForMatch(entityName);
  return agentFiles.find(f => normalizeForMatch(f.agentName) === normalized) || null;
}

// ─── A2A Agent Card generation ───────────────────────────────

function toAgentCard(entity, relations, agentFile) {
  // Extract skills from observations
  const skills = [];
  const capabilities = [];

  for (const obs of entity.observations || []) {
    const lower = obs.toLowerCase();
    if (lower.includes('capabilit') || lower.includes('expertise') || lower.includes('audit') || lower.includes('review')) {
      capabilities.push(obs);
    }
  }

  // Extract delegations and served_by from relations
  const delegatesTo = relations
    .filter(r => r.from === entity.name && r.type === 'delegates_to')
    .map(r => r.to);

  const servedBy = relations
    .filter(r => r.from === entity.name && r.type === 'served_by')
    .map(r => r.to);

  // Build skills from capabilities
  const skillId = entity.name.replace(/Agent$/, '').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  skills.push({
    id: skillId,
    name: entity.name,
    description: capabilities[0] || entity.observations?.[0] || '',
    inputModes: ['text/plain'],
    outputModes: ['text/markdown'],
  });

  // Determine tools from agent file or observations
  const tools = agentFile?.tools || [];
  const toolsFromObs = (entity.observations || [])
    .filter(o => o.startsWith('Tools:'))
    .flatMap(o => o.replace('Tools:', '').split(',').map(t => t.trim()));

  return {
    name: entity.name,
    description: entity.observations?.[0] || '',
    provider: { organization: 'Yorizon' },
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills,
    metadata: {
      entityId: entity.id,
      entityType: entity.type,
      created: entity.created,
      tools: tools.length > 0 ? tools : toolsFromObs,
      delegatesTo,
      servedBy,
      agentFile: agentFile?.fileName || null,
    },
  };
}

// ─── Tool definitions ────────────────────────────────────────

const toolDefinitions = [
  {
    name: 'list_agents',
    description: 'List registered agents with their capabilities, delegation targets, and MCP server dependencies. Returns active Agent entities by default, with an option to include deprecated lineage.',
    inputSchema: {
      type: 'object',
      properties: {
        includeServers: {
          type: 'boolean',
          description: 'Also include MCPServer entities in the listing (default: false)',
        },
        includeDeprecated: {
          type: 'boolean',
          description: 'Also include deprecated Agent entities in the listing (default: false)',
        },
      },
    },
  },
  {
    name: 'find_agent',
    description: 'Find the best agent for a given task description. Searches agent observations, capabilities, and tools to match against the query. Returns ranked results with relevance scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of the task you need an agent for (e.g., "audit NFR compliance", "review security architecture")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_agent_card',
    description: 'Return agent metadata in A2A Agent Card format (JSON). Includes skills, capabilities, delegation targets, MCP server dependencies, and agent file reference.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: {
          type: 'string',
          description: 'Name of the agent entity in the knowledge graph (e.g., "OrchestratorAgent", "NFRAuditorAgent")',
        },
      },
      required: ['agentName'],
    },
  },
  {
    name: 'register_agent',
    description: 'Add or update an agent in the knowledge graph. Creates an Agent entity with observations and optionally wires served_by relations to MCP servers. If the agent already exists, appends new observations.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'PascalCase agent name (e.g., "ReleaseManagerAgent")',
        },
        description: {
          type: 'string',
          description: 'One-line description of what the agent does',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of tool namespaces the agent uses (e.g., ["ado-wrapped/*", "knowledge/*"])',
        },
        delegatesTo: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of agents this agent delegates to (e.g., ["ADOAgent", "NFRAuditorAgent"])',
        },
        servedBy: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of MCP servers this agent uses (e.g., ["McpKnowledge", "McpAdoWrapped"])',
        },
        agentFile: {
          type: 'string',
          description: 'Filename of the .agent.md file (e.g., "Yorizon-My-Agent.agent.md")',
        },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'agent_health',
    description: 'Check agent registration health: verifies all agents have observations, relations, and matching .agent.md files. Reports orphans, missing relations, and coverage gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: {
          type: 'string',
          description: 'Check a specific agent (omit to check all agents)',
        },
      },
    },
  },
  {
    name: 'delete_agent',
    description: 'Remove an agent from the knowledge graph. Deletes the Agent entity and all relations where this agent is source or target. Optionally deletes the corresponding .agent.md file.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: {
          type: 'string',
          description: 'Name of the agent entity to delete (e.g., "ReleaseManagerAgent")',
        },
        deleteAgentFile: {
          type: 'boolean',
          description: 'Also delete the corresponding .agent.md file from .github/agents/ (default: false)',
        },
      },
      required: ['agentName'],
    },
  },
];

// ─── Tool handlers ───────────────────────────────────────────

function handleListAgents(args) {
  const graph = loadGraph();
  const agents = getAgentEntities(graph);
  const agentFiles = discoverAgentFiles();
  const includeDeprecated = args?.includeDeprecated === true;

  const result = agents
    .filter(agent => includeDeprecated || !isDeprecatedEntity(agent))
    .map(agent => {
    const relations = getRelationsFor(graph, agent.name);
    const agentFile = findAgentFile(agentFiles, agent.name);
    const deprecated = isDeprecatedEntity(agent);

    return {
      name: agent.name,
      description: agent.observations?.[0] || '',
      status: deprecated ? 'deprecated' : 'active',
      delegatesTo: relations.filter(r => r.from === agent.name && r.type === 'delegates_to').map(r => r.to),
      servedBy: relations.filter(r => r.from === agent.name && r.type === 'served_by').map(r => r.to),
      observationCount: agent.observations?.length || 0,
      hasAgentFile: !!agentFile,
      agentFile: agentFile?.fileName || null,
    };
    });

  const response = {
    agents: result,
    totalAgents: result.length,
    includeDeprecated,
  };

  if (args?.includeServers) {
    const servers = getMCPServerEntities(graph);
    response.mcpServers = servers.map(s => ({
      name: s.name,
      description: s.observations?.[0] || '',
      observationCount: s.observations?.length || 0,
    }));
    response.totalServers = servers.length;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
}

function handleFindAgent(args) {
  if (!args?.query || typeof args.query !== 'string') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'query is required', recovery: 'Provide a task description string' }, null, 2) }],
      isError: true,
    };
  }

  const graph = loadGraph();
  const agents = getAgentEntities(graph);
  const agentFiles = discoverAgentFiles();
  const queryTerms = args.query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  const scored = agents
    .filter(agent => !isDeprecatedEntity(agent))
    .map(agent => {
    let score = 0;
    const nameLower = agent.name.toLowerCase();
    const allText = [
      agent.name,
      ...(agent.observations || []),
    ].join(' ').toLowerCase();

    // Score based on query term matches
    for (const term of queryTerms) {
      if (nameLower.includes(term)) score += 10;
      const obsMatches = (agent.observations || []).filter(o => o.toLowerCase().includes(term)).length;
      score += obsMatches * 3;
    }

    // Boost for agent file match
    const agentFile = findAgentFile(agentFiles, agent.name);
    if (agentFile) {
      const fileDesc = agentFile.description.toLowerCase();
      for (const term of queryTerms) {
        if (fileDesc.includes(term)) score += 5;
      }
    }

    const relations = getRelationsFor(graph, agent.name);

      return {
        name: agent.name,
        score,
        description: agent.observations?.[0] || '',
        delegatesTo: relations.filter(r => r.from === agent.name && r.type === 'delegates_to').map(r => r.to),
        servedBy: relations.filter(r => r.from === agent.name && r.type === 'served_by').map(r => r.to),
        agentFile: agentFile?.fileName || null,
      };
    });

  // Filter to agents with any relevance, sort by score descending
  const results = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  return {
    content: [{ type: 'text', text: JSON.stringify({
      query: args.query,
      results,
      bestMatch: results[0] || null,
      totalMatches: results.length,
      hint: results.length === 0 ? 'No agents matched. Try broader terms or use list_agents to see all available agents.' : undefined,
    }, null, 2) }],
  };
}

function handleGetAgentCard(args) {
  if (!args?.agentName || typeof args.agentName !== 'string') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'agentName is required', recovery: 'Provide an agent entity name (e.g., "OrchestratorAgent"). Use list_agents to see all available agents.' }, null, 2) }],
      isError: true,
    };
  }

  const graph = loadGraph();
  const entity = graph.entities[args.agentName];

  if (!entity) {
    // Try case-insensitive match
    const match = Object.values(graph.entities).find(e =>
      e.name.toLowerCase() === args.agentName.toLowerCase() && e.type === 'Agent'
    );
    if (!match) {
      const agents = getAgentEntities(graph).map(a => a.name);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NOT_FOUND', message: `Agent "${args.agentName}" not found in knowledge graph`, recovery: `Available agents: ${agents.join(', ')}` }, null, 2) }],
        isError: true,
      };
    }
    return buildCardResponse(match, graph);
  }

  if (entity.type !== 'Agent') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'WRONG_TYPE', message: `"${args.agentName}" is a ${entity.type}, not an Agent`, recovery: 'Use list_agents to see Agent entities only' }, null, 2) }],
      isError: true,
    };
  }

  return buildCardResponse(entity, graph);
}

function buildCardResponse(entity, graph) {
  const relations = getRelationsFor(graph, entity.name);
  const agentFiles = discoverAgentFiles();
  const agentFile = findAgentFile(agentFiles, entity.name);
  const card = toAgentCard(entity, relations, agentFile);

  return {
    content: [{ type: 'text', text: JSON.stringify({ agentCard: card }, null, 2) }],
  };
}

function handleRegisterAgent(args) {
  if (!args?.name || typeof args.name !== 'string') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'name is required (PascalCase)', recovery: 'e.g., "ReleaseManagerAgent"' }, null, 2) }],
      isError: true,
    };
  }
  if (!args?.description || typeof args.description !== 'string') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'description is required', recovery: 'Provide a one-line description of the agent' }, null, 2) }],
      isError: true,
    };
  }

  const graph = loadGraph();
  const existing = graph.entities[args.name];
  const isUpdate = !!existing;

  // Build observations
  const observations = [args.description];
  if (args.tools?.length) observations.push(`Tools: ${args.tools.join(', ')}`);
  if (args.agentFile) observations.push(`File: .github/agents/${args.agentFile}`);

  if (isUpdate) {
    // Append new observations that don't already exist
    for (const obs of observations) {
      if (!existing.observations.includes(obs)) {
        existing.observations.push(obs);
      }
    }
  } else {
    // Create new entity
    graph.entities[args.name] = {
      id: crypto.randomUUID(),
      name: args.name,
      type: 'Agent',
      created: new Date().toISOString(),
      observations,
      relations: [],
    };
  }

  // Wire relations
  const newRelations = [];

  if (args.delegatesTo?.length) {
    for (const target of args.delegatesTo) {
      if (!graph.entities[target]) continue;
      const relId = `${args.name}--delegates_to--${target}`;
      const exists = graph.relations?.some(r => r.from === args.name && r.to === target && r.type === 'delegates_to');
      if (!exists) {
        const rel = { id: relId, from: args.name, to: target, type: 'delegates_to' };
        graph.relations = graph.relations || [];
        graph.relations.push(rel);
        newRelations.push(relId);
      }
    }
  }

  if (args.servedBy?.length) {
    for (const server of args.servedBy) {
      if (!graph.entities[server]) continue;
      const relId = `${args.name}--served_by--${server}`;
      const exists = graph.relations?.some(r => r.from === args.name && r.to === server && r.type === 'served_by');
      if (!exists) {
        const rel = { id: relId, from: args.name, to: server, type: 'served_by' };
        graph.relations = graph.relations || [];
        graph.relations.push(rel);
        newRelations.push(relId);
      }
    }
  }

  // Update entity-level relation references
  const entityRelations = graph.relations
    .filter(r => r.from === args.name || r.to === args.name)
    .map(r => r.id);
  graph.entities[args.name].relations = entityRelations;

  saveGraph(graph);

  return {
    content: [{ type: 'text', text: JSON.stringify({
      success: true,
      action: isUpdate ? 'updated' : 'created',
      agent: args.name,
      observations: graph.entities[args.name].observations.length,
      relationsAdded: newRelations.length,
      totalRelations: entityRelations.length,
      next_steps: 'Use get_agent_card to verify the A2A card, or agent_health to check registration completeness.',
    }, null, 2) }],
  };
}

function handleAgentHealth(args) {
  const graph = loadGraph();
  const agents = getAgentEntities(graph);
  const agentFiles = discoverAgentFiles();
  const mcpServers = getMCPServerEntities(graph);

  const checkAgent = (agent) => {
    const relations = getRelationsFor(graph, agent.name);
    const servedBy = relations.filter(r => r.from === agent.name && r.type === 'served_by');
    const delegatesTo = relations.filter(r => r.from === agent.name && r.type === 'delegates_to');
    const agentFile = findAgentFile(agentFiles, agent.name);
    const deprecated = isDeprecatedEntity(agent);
    const declaredTools = getDeclaredTools(agentFile, agent);

    const issues = [];
    if (!deprecated) {
      if (!agent.observations?.length) issues.push('No observations');
      if (agent.observations?.length < 3) issues.push(`Only ${agent.observations.length} observations (recommend ≥3)`);
      if (requiresMcpServer(declaredTools) && servedBy.length === 0) issues.push('No served_by relations (no MCP server connections)');
      if (!agentFile) issues.push('No matching .agent.md file in .github/agents/');
    }

    // Check that served_by targets exist
    for (const rel of servedBy) {
      if (!graph.entities[rel.to]) issues.push(`served_by target "${rel.to}" not found in graph`);
    }
    for (const rel of delegatesTo) {
      if (!graph.entities[rel.to]) issues.push(`delegates_to target "${rel.to}" not found in graph`);
    }

    return {
      name: agent.name,
      status: deprecated ? 'deprecated' : (issues.length === 0 ? 'healthy' : 'issues'),
      observationCount: agent.observations?.length || 0,
      servedByCount: servedBy.length,
      delegatesToCount: delegatesTo.length,
      hasAgentFile: !!agentFile,
      issues,
    };
  };

  // Check specific agent or all
  if (args?.agentName) {
    const agent = agents.find(a => a.name === args.agentName);
    if (!agent) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NOT_FOUND', message: `Agent "${args.agentName}" not found`, recovery: `Available agents: ${agents.map(a => a.name).join(', ')}` }, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ health: checkAgent(agent) }, null, 2) }],
    };
  }

  // Check all agents
  const health = agents.map(checkAgent);
  const healthy = health.filter(h => h.status === 'healthy').length;
  const withIssues = health.filter(h => h.status === 'issues').length;
  const deprecated = health.filter(h => h.status === 'deprecated').length;
  const activeAgents = health.filter(h => h.status !== 'deprecated').length;

  // Check for orphan agent files (agent files without KG entity)
  const orphanFiles = agentFiles.filter(f => {
    const normalized = normalizeForMatch(f.agentName);
    return !agents.some(a => {
      const aN = normalizeForMatch(a.name);
      return aN === normalized;
    });
  });

  return {
    content: [{ type: 'text', text: JSON.stringify({
      summary: {
        totalAgents: agents.length,
        activeAgents,
        deprecated,
        healthy,
        withIssues,
        totalMCPServers: mcpServers.length,
        totalAgentFiles: agentFiles.length,
        orphanFiles: orphanFiles.map(f => f.fileName),
      },
      agents: health,
    }, null, 2) }],
  };
}

function handleDeleteAgent(args) {
  if (!args?.agentName || typeof args.agentName !== 'string') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'agentName is required', recovery: 'Provide the agent entity name (e.g., "ReleaseManagerAgent"). Use list_agents to see all agents.' }, null, 2) }],
      isError: true,
    };
  }

  const graph = loadGraph();
  const entity = graph.entities[args.agentName];

  // Try case-insensitive match if exact match fails
  let targetName = args.agentName;
  if (!entity) {
    const match = Object.values(graph.entities).find(e =>
      e.name.toLowerCase() === args.agentName.toLowerCase() && e.type === 'Agent'
    );
    if (match) {
      targetName = match.name;
    } else {
      const agents = getAgentEntities(graph).map(a => a.name);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NOT_FOUND', message: `Agent "${args.agentName}" not found in knowledge graph`, recovery: `Available agents: ${agents.join(', ')}` }, null, 2) }],
        isError: true,
      };
    }
  }

  const targetEntity = graph.entities[targetName];
  if (targetEntity.type !== 'Agent') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'WRONG_TYPE', message: `"${targetName}" is a ${targetEntity.type}, not an Agent`, recovery: 'Use list_agents to see Agent entities only' }, null, 2) }],
      isError: true,
    };
  }

  // Find relations to remove (where agent is source or target)
  const relationsToRemove = (graph.relations || []).filter(r => r.from === targetName || r.to === targetName);
  const removedRelationIds = relationsToRemove.map(r => r.id);

  // Remove relations from graph
  graph.relations = (graph.relations || []).filter(r => r.from !== targetName && r.to !== targetName);

  // Update relation references in other entities that pointed to this agent
  for (const entityName of Object.keys(graph.entities)) {
    const e = graph.entities[entityName];
    if (e.relations?.length) {
      e.relations = e.relations.filter(rid => !removedRelationIds.includes(rid));
    }
  }

  // Remove the agent entity
  delete graph.entities[targetName];

  saveGraph(graph);

  // Optionally delete the agent file
  let deletedFile = null;
  if (args.deleteAgentFile) {
    const agentFiles = discoverAgentFiles();
    const agentFile = findAgentFile(agentFiles, targetName);
    if (agentFile) {
      const filePath = path.join(AGENTS_DIR, agentFile.fileName);
      try {
        fs.unlinkSync(filePath);
        deletedFile = agentFile.fileName;
      } catch (err) {
        // File deletion failed, but entity was removed — report partial success
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            partial: true,
            agent: targetName,
            relationsRemoved: removedRelationIds.length,
            fileDeleteError: err.message,
            message: `Agent entity removed but .agent.md file deletion failed: ${err.message}`,
          }, null, 2) }],
        };
      }
    }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify({
      success: true,
      agent: targetName,
      relationsRemoved: removedRelationIds.length,
      removedRelations: removedRelationIds,
      deletedFile,
      message: `Agent "${targetName}" removed from knowledge graph`,
    }, null, 2) }],
  };
}

// ─── Handler map ─────────────────────────────────────────────

const handlers = {
  list_agents: handleListAgents,
  find_agent: handleFindAgent,
  get_agent_card: handleGetAgentCard,
  register_agent: handleRegisterAgent,
  agent_health: handleAgentHealth,
  delete_agent: handleDeleteAgent,
};

// ─── Server setup ────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-agent-registry', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name];

  if (!handler) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2) }],
      isError: true,
    };
  }

  try {
    return handler(args);
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message, tool: name }, null, 2) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Agent Registry running on stdio');
}

main().catch(console.error);
