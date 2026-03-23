/**
 * Handlers — graph CRUD: read, add_entity, add_relation, export, search, stats, validate
 */
const { loadGraph, mutateGraph, addEntity, addRelation, deleteRelation, validateEntity, validateRelation } = require('../../graph');
const { KnowledgeError } = require('../../errors');
const { validateAddEntity, validateAddRelation, validateSearch } = require('../../validate-input');
const { logOperation } = require('../../audit');

// ─── knowledge_graph_read ───────────────────
function handleGraphRead(args) {
  const graph = loadGraph();
  const filtered = { ...graph };

  if (args?.filter) {
    filtered.entities = Object.fromEntries(
      Object.entries(graph.entities || {}).filter(([, e]) => e.type === args.filter),
    );
  }

  return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
}

// ─── knowledge_graph_add_entity ─────────────
async function handleGraphAddEntity(args) {
  args = validateAddEntity(args);

  const { result: entity } = await mutateGraph(graph => {
    if (!validateEntity(graph, args.type)) {
      const validTypes = graph.ontology.entityTypes.map(t => t.name).join(', ');
      throw new KnowledgeError(
        'INVALID_ENTITY_TYPE',
        `Type "${args.type}" is not in the ontology`,
        `Valid entity types: ${validTypes}. Use knowledge_ontology_view to see the full schema.`,
      );
    }
    return addEntity(graph, args.name, args.type, args.observations);
  });

  logOperation('add_entity', args.name, { type: args.type });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        entity,
        message: `Added entity: ${args.name} (${args.type})`,
        next_steps: [
          `Connect it: knowledge_graph_add_relation (from: "${args.name}", to: "<target>", type: "<relation_type>")`,
          `Add more facts: knowledge_graph_add_entity (same name "${args.name}" to append observations)`,
          'See valid relation types: knowledge_ontology_view',
        ],
      }, null, 2),
    }],
  };
}

// ─── knowledge_graph_add_relation ───────────
async function handleGraphAddRelation(args) {
  args = validateAddRelation(args);

  const { result: relation } = await mutateGraph(graph => {
    if (!validateRelation(graph, args.type)) {
      const validTypes = graph.ontology.relationTypes.map(t => t.name).join(', ');
      throw new KnowledgeError(
        'INVALID_RELATION_TYPE',
        `Type "${args.type}" is not in the ontology`,
        `Valid relation types: ${validTypes}. Use knowledge_ontology_view to see the full schema.`,
      );
    }
    return addRelation(graph, args.from, args.to, args.type);
  });

  logOperation('add_relation', relation.id, { from: args.from, to: args.to, type: args.type });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        relation,
        message: `Added relation: ${args.from} -[${args.type}]-> ${args.to}`,
        next_steps: [
          `Add more relations from ${args.from}: knowledge_graph_add_relation`,
          'Visualize the graph: knowledge_model_visualize (type: "model")',
          'Validate integrity: knowledge_graph_validate',
        ],
      }, null, 2),
    }],
  };
}

// ─── knowledge_graph_delete_relation ─────────
async function handleGraphDeleteRelation(args) {
  // Resolve relation ID: either explicit or from/to/type match
  let relationId = args?.relationId;

  if (!relationId) {
    if (!args?.from || !args?.to || !args?.type) {
      throw new KnowledgeError(
        'INVALID_INPUT',
        'Provide either relationId, or all of from + to + type',
        'Use knowledge_graph_read to list existing relations and their IDs.',
      );
    }
    relationId = `${args.from}--${args.type}--${args.to}`;
  }

  const { result: removed } = await mutateGraph(graph => deleteRelation(graph, relationId));
  logOperation('delete_relation', removed.id, { from: removed.from, to: removed.to, type: removed.type });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        deleted: removed,
        message: `Deleted relation: ${removed.from} -[${removed.type}]-> ${removed.to}`,
        next_steps: [
          'Validate no dangling references: knowledge_graph_validate',
          `Check remaining relations: knowledge_graph_read (filter by entity)`,
        ],
      }, null, 2),
    }],
  };
}

// ─── knowledge_graph_export ─────────────────
function handleGraphExport(args) {
  const graph = loadGraph();
  const output = JSON.stringify(
    args?.includeOntology !== false ? graph : { ...graph, ontology: undefined },
    null, 2,
  );
  return { content: [{ type: 'text', text: output }] };
}

// ─── knowledge_graph_search ─────────────────
function handleGraphSearch(args) {
  args = validateSearch(args);
  const graph = loadGraph();
  const query = (args.query || '').toLowerCase();
  const searchType = args.searchType || 'all';
  const results = [];

  Object.values(graph.entities || {}).forEach(entity => {
    const matchReasons = [];

    if ((searchType === 'name' || searchType === 'all') && entity.name.toLowerCase().includes(query)) {
      matchReasons.push('name');
    }
    if ((searchType === 'type' || searchType === 'all') && entity.type.toLowerCase().includes(query)) {
      matchReasons.push('type');
    }
    if ((searchType === 'observations' || searchType === 'all') &&
        entity.observations.some(obs => obs.toLowerCase().includes(query))) {
      matchReasons.push('observation');
    }

    if (matchReasons.length) {
      // Relevance scoring: exact > starts-with > contains; name > type > observation
      let relevance = 0;
      const nameLower = entity.name.toLowerCase();
      if (matchReasons.includes('name')) {
        relevance += nameLower === query ? 1.0 : nameLower.startsWith(query) ? 0.8 : 0.6;
      }
      if (matchReasons.includes('type')) {
        relevance += entity.type.toLowerCase() === query ? 0.5 : 0.3;
      }
      if (matchReasons.includes('observation')) {
        const exactObs = entity.observations.some(o => o.toLowerCase() === query);
        relevance += exactObs ? 0.4 : 0.2;
      }
      relevance = Math.round(Math.min(relevance, 1.0) * 100) / 100;

      results.push({ name: entity.name, type: entity.type, relevance, matchReasons, observations: entity.observations });
    }
  });

  // Sort by relevance descending
  results.sort((a, b) => b.relevance - a.relevance);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        query: args.query,
        resultCount: results.length,
        results,
        next_steps: results.length
          ? ['Inspect a specific entity: knowledge_graph_read (with filter by type)', 'Add relations: knowledge_graph_add_relation']
          : ['Try a broader query or different searchType', 'List all entity types: knowledge_ontology_view'],
      }, null, 2),
    }],
  };
}

// ─── knowledge_graph_stats ──────────────────
function handleGraphStats(args) {
  const graph = loadGraph();
  const stats = {
    version: graph.version,
    totalEntities: graph.metadata.totalEntities,
    totalRelations: graph.metadata.totalRelations,
    created: graph.created,
    lastUpdated: graph.lastUpdated,
    ontology: {
      entityTypes: graph.ontology.entityTypes.length,
      relationTypes: graph.ontology.relationTypes.length,
    },
  };

  if (args?.detailed) {
    stats.categories = graph.metadata.categories;
    stats.entityTypeBreakdown = graph.ontology.entityTypes;
    stats.relationTypeBreakdown = graph.ontology.relationTypes;
  }

  return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
}

// ─── knowledge_graph_validate ───────────────
function handleGraphValidate(args) {
  const graph = loadGraph();
  const mode = args?.mode || 'all';
  const errors = [];
  const warnings = [];

  if (mode === 'entities' || mode === 'all') {
    Object.values(graph.entities || {}).forEach(entity => {
      if (!validateEntity(graph, entity.type)) {
        errors.push(`Entity "${entity.name}" has invalid type: ${entity.type}`);
      }
    });
  }

  if (mode === 'relations' || mode === 'all') {
    (graph.relations || []).forEach(rel => {
      if (!validateRelation(graph, rel.type)) {
        errors.push(`Relation ${rel.from}-[${rel.type}]->${rel.to} has invalid type`);
      }
      if (!graph.entities[rel.from]) errors.push(`Relation from non-existent entity: ${rel.from}`);
      if (!graph.entities[rel.to])   errors.push(`Relation to non-existent entity: ${rel.to}`);
    });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        valid: errors.length === 0,
        errors,
        warnings,
        summary: `Found ${errors.length} errors, ${warnings.length} warnings`,
      }, null, 2),
    }],
    isError: errors.length > 0,
  };
}

module.exports = {
  handleGraphRead,
  handleGraphAddEntity,
  handleGraphAddRelation,
  handleGraphDeleteRelation,
  handleGraphExport,
  handleGraphSearch,
  handleGraphStats,
  handleGraphValidate,
};
