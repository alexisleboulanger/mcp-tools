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
    description: 'Creates a new .knowledge folder with ontology, directory structure, and empty graph. Use this once to bootstrap a project. Returns the created folder path, chosen ontology, and suggested next steps.',
    inputSchema: {
      type: 'object',
      properties: {
        targetPath:   { type: 'string', description: 'Absolute path where .knowledge folder will be created. Defaults to current working directory.' },
        projectName:  { type: 'string', description: 'Human-readable project name used in generated docs. Defaults to "Project".' },
        ontology:     { type: 'string', enum: ['standard', 'nomad'], description: '"standard" = 3-layer (Strategy/Delivery/Solution). "nomad" = Cultural OS (Structure + Culture). Default: standard.' },
      },
    },
  },

  // ─── Graph CRUD ───────────────────────────────
  {
    name: 'knowledge_graph_read',
    description: 'Returns all entities in the knowledge graph. Use filter to retrieve only entities of a specific type (e.g., "Service", "ADR", "Objective"). Returns entities with their observations and optionally their relations. Use this to explore what is already captured before adding new entities.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:           { type: 'string',  description: 'Entity type to filter by (e.g., "Service", "ADR", "Pillar"). Omit to return all entities.' },
        includeRelations: { type: 'boolean', description: 'Whether to include relations in the output. Default: true.' },
      },
    },
  },
  {
    name: 'knowledge_graph_add_entity',
    description: 'Creates a new entity in the knowledge graph, or appends observations to an existing entity with the same name. Entity type must be valid per the ontology (use knowledge_ontology_view to see allowed types). Observations must contain substantive findings (decisions, risks, gaps, metrics, actions) and not be metadata-only. Meeting artifacts with only date/organizer/key_topics are rejected. Returns the created/updated entity.',
    inputSchema: {
      type: 'object',
      properties: {
        name:         { type: 'string', description: 'PascalCase entity name, must be unique. Examples: "AuthService", "NFRConfidentiality", "ADR001".' },
        type:         { type: 'string', description: 'Entity type from the ontology. Common types: Pillar, Objective, Metric, CapabilityL1, CapabilityL2, Service, ADR, Concept, Pattern.' },
        observations: { type: 'array', items: { type: 'string' }, description: 'Facts or notes about the entity. Include at least one contextual, substantive observation. Metadata fields alone are not accepted.' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'knowledge_graph_add_relation',
    description: 'Creates a directed relationship between two existing entities. Relation type must be valid per the ontology (use knowledge_ontology_view to see allowed types). Returns the created relation with its auto-generated ID. Both entities must already exist in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source entity name (must already exist in the graph).' },
        to:   { type: 'string', description: 'Target entity name (must already exist in the graph).' },
        type: { type: 'string', description: 'Relation type from the ontology. Common types: supports_objective, measures, mitigates, references_service, depends_on.' },
      },
      required: ['from', 'to', 'type'],
    },
  },
  {
    name: 'knowledge_graph_delete_relation',
    description: 'Removes a relation from the knowledge graph. Identify the relation either by its exact ID (e.g., "AuthService--depends_on--UserService") or by specifying all three of from, to, and type. Returns the deleted relation for confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        relationId: { type: 'string', description: 'Exact relation ID in format "FromEntity--relation_type--ToEntity". Use knowledge_graph_read to find IDs.' },
        from:       { type: 'string', description: 'Source entity name. Required (with to and type) when relationId is omitted.' },
        to:         { type: 'string', description: 'Target entity name. Required (with from and type) when relationId is omitted.' },
        type:       { type: 'string', description: 'Relation type. Required (with from and to) when relationId is omitted.' },
      },
    },
  },
  {
    name: 'knowledge_graph_export',
    description: 'Returns the complete knowledge graph as a JSON object, including all entities, relations, metadata, and optionally the ontology. Use this for backups, migrations, or full-graph analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        includeOntology: { type: 'boolean', description: 'Whether to include the ontology definition in the export. Default: true.' },
      },
    },
  },
  {
    name: 'knowledge_graph_search',
    description: 'Searches entities by name, type, or observation text. Returns matching entities with relevance scores (1.0 = exact match, lower = partial). Use this to find existing knowledge before creating duplicates. Supports partial matching.',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Search term to match against entity names, types, or observations. Case-insensitive.' },
        searchType: { type: 'string', enum: ['name', 'type', 'observations', 'all'], description: 'Scope of search. "all" searches across name, type, and observations. Default: "all".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge_graph_stats',
    description: 'Returns summary statistics: entity count, relation count, ontology version, and creation/update timestamps. Set detailed=true for a full breakdown by entity type and relation type. Use this for a quick health check of the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: { type: 'boolean', description: 'If true, includes per-type counts and full type listings. Default: false.' },
      },
    },
  },
  {
    name: 'knowledge_graph_validate',
    description: 'Checks all entities and relations against the ontology schema. Returns a list of errors (invalid types, dangling references) and warnings. Use this after bulk imports or ontology changes to ensure graph integrity.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['entities', 'relations', 'all'], description: '"entities" = check entity types only. "relations" = check relation types and references. "all" = both. Default: "all".' },
      },
    },
  },

  // ─── Ontology ─────────────────────────────────
  {
    name: 'knowledge_ontology_view',
    description: 'Returns the full ontology definition: all allowed entity types (with layer and description) and relation types. Use this to discover valid types before calling knowledge_graph_add_entity or knowledge_graph_add_relation. Supports JSON table or markdown output.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['table', 'markdown'], description: '"table" returns structured JSON. "markdown" returns a formatted document. Default: "table".' },
      },
    },
  },
  {
    name: 'knowledge_ontology_extend',
    description: 'Adds a new entity type or relation type to the ontology. The new type becomes immediately available for use in knowledge_graph_add_entity or knowledge_graph_add_relation. Persists to both the graph and .memory/ontology.json.',
    inputSchema: {
      type: 'object',
      properties: {
        itemType:    { type: 'string', enum: ['entityType', 'relationType'], description: '"entityType" to add a new entity category. "relationType" to add a new relationship kind.' },
        name:        { type: 'string', description: 'PascalCase name for entity types (e.g., "Runbook"), snake_case for relation types (e.g., "owned_by").' },
        description: { type: 'string', description: 'Clear description of what this type represents and when to use it.' },
        layer:       { type: 'string', enum: ['strategy', 'delivery', 'solution'], description: 'Which architecture layer this entity type belongs to. Required for entityType, ignored for relationType.' },
      },
      required: ['itemType', 'name', 'description'],
    },
  },
  {
    name: 'knowledge_extract_ontology_to_memory',
    description: 'One-time migration tool: extracts the embedded ontology from knowledge-graph.json into .memory/ontology.json and removes it from the graph file. Only needed if the graph still contains an embedded ontology from before v3.0.0.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ─── Visualisation ────────────────────────────
  {
    name: 'knowledge_model_visualize',
    description: 'Generates a Mermaid diagram of either the ontology structure (entity types and their layers) or the actual model (entity instances and their relations). Returns a fenced Mermaid code block ready to render.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['ontology', 'model'], description: '"ontology" = shows entity types grouped by layer with relation types. "model" = shows actual entities and their connections.' },
      },
      required: ['type'],
    },
  },

  // ─── Sync ─────────────────────────────────────
  {
    name: 'knowledge_docs_sync',
    description: 'Synchronizes between the knowledge graph and the .knowledge folder. "to_docs" generates markdown files from the graph (one per entity, plus ontology and model docs). "from_docs" scans markdown files and imports entities/relations into the graph. Returns a summary of what was created or updated.',
    inputSchema: {
      type: 'object',
      properties: {
        action:           { type: 'string', enum: ['to_docs', 'from_docs'], description: '"to_docs" = graph → .knowledge markdown files. "from_docs" = .knowledge markdown files → graph.' },
        generateDiagrams: { type: 'boolean', description: 'Whether to generate Mermaid diagrams during sync. Default: true.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'knowledge_sync_memory',
    description: 'Prepares knowledge graph data for synchronization with the Memory MCP tool. Returns the full graph and ontology as a sync payload. Note: actual Memory MCP integration is pending — use knowledge_docs_sync for file-based persistence.',
    inputSchema: {
      type: 'object',
      properties: {
        action:          { type: 'string', enum: ['to_memory', 'from_memory', 'bidirectional'], description: '"to_memory" = push graph to Memory MCP. "from_memory" = pull from Memory MCP. "bidirectional" = merge both ways.' },
        includeMetadata: { type: 'boolean', description: 'Whether to include graph metadata (timestamps, version) in the sync payload. Default: true.' },
      },
      required: ['action'],
    },
  },

  // ─── Index / Versioning ───────────────────────
  {
    name: 'knowledge_update_index',
    description: 'Recalculates checksums for all indexed files, updates entity types and relations from frontmatter, bumps the index version, and optionally generates integrity-report.md and INDEX.md. Use this after manual edits to .knowledge files.',
    inputSchema: {
      type: 'object',
      properties: {
        generateReports: { type: 'boolean', description: 'Whether to generate integrity-report.md and INDEX.md alongside the index update. Default: true.' },
      },
    },
  },
];

module.exports = tools;
