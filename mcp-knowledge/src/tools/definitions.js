/**
 * Tool definitions — single source of truth for every MCP tool
 *
 * Each entry is a standard MCP tool descriptor:
 *   { name, description, inputSchema }
 *
 * Handler logic lives in ./handlers/*.js — this file is ONLY schema.
 */

const tools = [
  // ─── Initialisation ───────────────────────────
  {
    name: 'knowledge_init',
    description: 'Initialize a new knowledge base with optional ontology selection',
    inputSchema: {
      type: 'object',
      properties: {
        targetPath:   { type: 'string', description: 'Path where to create .knowledge folder (default: current directory)' },
        projectName:  { type: 'string', description: 'Project name for initial documentation' },
        ontology:     { type: 'string', enum: ['standard', 'nomad'], description: 'Ontology type: "standard" (3-layer) or "nomad" (cultural OS)' },
      },
    },
  },

  // ─── Graph CRUD ───────────────────────────────
  {
    name: 'knowledge_graph_read',
    description: 'Read the complete knowledge graph or filter by entity type',
    inputSchema: {
      type: 'object',
      properties: {
        filter:           { type: 'string',  description: 'Optional: Filter by entity type (e.g., "Service", "ADR")' },
        includeRelations: { type: 'boolean', description: 'Include relations in output (default: true)' },
      },
    },
  },
  {
    name: 'knowledge_graph_add_entity',
    description: 'Add new entity to knowledge graph with validation',
    inputSchema: {
      type: 'object',
      properties: {
        name:         { type: 'string', description: 'Entity name (should be PascalCase and unique)' },
        type:         { type: 'string', description: 'Entity type from ontology (e.g., Pillar, Objective, Service)' },
        observations: { type: 'array', items: { type: 'string' }, description: 'Initial observations/facts about entity' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'knowledge_graph_add_relation',
    description: 'Add relationship between two entities',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source entity name' },
        to:   { type: 'string', description: 'Target entity name' },
        type: { type: 'string', description: 'Relation type (e.g., supports_objective, measures, mitigates)' },
      },
      required: ['from', 'to', 'type'],
    },
  },
  {
    name: 'knowledge_graph_delete_relation',
    description: 'Delete a relation from the knowledge graph by its ID, or by from/to/type match',
    inputSchema: {
      type: 'object',
      properties: {
        relationId: { type: 'string', description: 'Exact relation ID (e.g., "EntityA--relation_type--EntityB")' },
        from:       { type: 'string', description: 'Source entity name (used with to/type when relationId is omitted)' },
        to:         { type: 'string', description: 'Target entity name' },
        type:       { type: 'string', description: 'Relation type' },
      },
    },
  },
  {
    name: 'knowledge_graph_export',
    description: 'Export knowledge graph as JSON',
    inputSchema: {
      type: 'object',
      properties: {
        includeOntology: { type: 'boolean', description: 'Include ontology definition (default: true)' },
      },
    },
  },
  {
    name: 'knowledge_graph_search',
    description: 'Search entities by name, type, or observations',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Search term' },
        searchType: { type: 'string', enum: ['name', 'type', 'observations', 'all'], description: 'What to search (default: all)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge_graph_stats',
    description: 'Get statistics about knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: { type: 'boolean', description: 'Include detailed breakdown (default: false)' },
      },
    },
  },
  {
    name: 'knowledge_graph_validate',
    description: 'Validate knowledge graph against ontology schema',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['entities', 'relations', 'all'], description: 'What to validate (default: all)' },
      },
    },
  },

  // ─── Ontology ─────────────────────────────────
  {
    name: 'knowledge_ontology_view',
    description: 'Display knowledge ontology with all entity and relation types',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['table', 'markdown'], description: 'Output format (default: table)' },
      },
    },
  },
  {
    name: 'knowledge_ontology_extend',
    description: 'Add new entity type or relation type to the ontology',
    inputSchema: {
      type: 'object',
      properties: {
        itemType:    { type: 'string', enum: ['entityType', 'relationType'], description: 'What to add' },
        name:        { type: 'string', description: 'Name of new type' },
        description: { type: 'string', description: 'Description of the type' },
        layer:       { type: 'string', enum: ['strategy', 'delivery', 'solution'], description: 'Layer (for entity types only)' },
      },
      required: ['itemType', 'name', 'description'],
    },
  },
  {
    name: 'knowledge_extract_ontology_to_memory',
    description: 'Extract ontology from knowledge-graph.json to .memory/ontology.json (smooth migration)',
    inputSchema: { type: 'object', properties: {} },
  },

  // ─── Visualisation ────────────────────────────
  {
    name: 'knowledge_model_visualize',
    description: 'Generate Mermaid diagrams of ontology or model',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['ontology', 'model'], description: 'Visualize ontology (structure) or model (instances)' },
      },
      required: ['type'],
    },
  },

  // ─── Sync ─────────────────────────────────────
  {
    name: 'knowledge_docs_sync',
    description: 'Synchronize knowledge graph with .knowledge folder documentation',
    inputSchema: {
      type: 'object',
      properties: {
        action:           { type: 'string', enum: ['to_docs', 'from_docs'], description: 'Sync direction: graph->docs or docs->graph' },
        generateDiagrams: { type: 'boolean', description: 'Generate Mermaid diagrams (default: true)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'knowledge_sync_memory',
    description: 'Sync knowledge graph with memory MCP tool for persistence',
    inputSchema: {
      type: 'object',
      properties: {
        action:          { type: 'string', enum: ['to_memory', 'from_memory', 'bidirectional'], description: 'Sync direction' },
        includeMetadata: { type: 'boolean', description: 'Include metadata in sync (default: true)' },
      },
      required: ['action'],
    },
  },

  // ─── Index / Versioning ───────────────────────
  {
    name: 'knowledge_update_index',
    description: 'Update knowledge-index.json with checksums and version bump',
    inputSchema: {
      type: 'object',
      properties: {
        generateReports: { type: 'boolean', description: 'Generate integrity-report.md and INDEX.md (default: true)' },
      },
    },
  },
];

module.exports = tools;
