/**
 * Knowledge-graph CRUD — load, save, entity/relation management, validation
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { GRAPH_FILE } = require('./config');
const { getDefaultOntology } = require('./ontologies');
const { ensureKnowledgeBaseDirs, loadOntologyFromMemory } = require('./knowledge-base');
const { acquireLock, releaseLock } = require('./lock');

// ──────────────────────────────────────────────
// Load / initialise
// ──────────────────────────────────────────────

function initializeGraph() {
  return {
    version: '1.0.0',
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    entities: {},
    relations: [],
    ontology: getDefaultOntology(),
    metadata: { totalEntities: 0, totalRelations: 0, categories: {} },
  };
}

function loadGraph() {
  ensureKnowledgeBaseDirs();

  if (fs.existsSync(GRAPH_FILE)) {
    try {
      const graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
      // Always enforce ontology from memory hierarchy
      graph.ontology = loadOntologyFromMemory();
      return graph;
    } catch {
      return initializeGraph();
    }
  }
  return initializeGraph();
}

async function saveGraph(graph) {
  ensureKnowledgeBaseDirs();
  await acquireLock();
  try {
    graph.lastUpdated = new Date().toISOString();
    updateMetadata(graph);
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');
    return true;
  } finally {
    await releaseLock();
  }
}

// ──────────────────────────────────────────────
// Entity / relation CRUD
// ──────────────────────────────────────────────

function addEntity(graph, name, type, observations = []) {
  if (!graph.entities) graph.entities = {};
  graph.entities[name] = {
    id: crypto.randomUUID(),
    name,
    type,
    created: new Date().toISOString(),
    observations,
    relations: [],
  };
  updateMetadata(graph);
  return graph.entities[name];
}

function addRelation(graph, fromName, toName, relationType) {
  if (!graph.relations) graph.relations = [];
  if (!graph.entities[fromName] || !graph.entities[toName]) {
    throw new Error(`Entity not found: ${fromName} or ${toName}`);
  }

  const relation = {
    id: `${fromName}--${relationType}--${toName}`,
    from: fromName,
    to: toName,
    type: relationType,
    created: new Date().toISOString(),
  };
  graph.relations.push(relation);

  if (!graph.entities[fromName].relations) graph.entities[fromName].relations = [];
  graph.entities[fromName].relations.push(relation.id);

  updateMetadata(graph);
  return relation;
}

function deleteRelation(graph, relationId) {
  if (!graph.relations) graph.relations = [];
  const idx = graph.relations.findIndex(r => r.id === relationId);
  if (idx === -1) throw new Error(`Relation not found: ${relationId}`);

  const removed = graph.relations.splice(idx, 1)[0];

  // Remove from source entity's relations list
  const srcEntity = graph.entities[removed.from];
  if (srcEntity && Array.isArray(srcEntity.relations)) {
    srcEntity.relations = srcEntity.relations.filter(id => id !== relationId);
  }

  updateMetadata(graph);
  return removed;
}

// ──────────────────────────────────────────────
// Metadata & validation
// ──────────────────────────────────────────────

function updateMetadata(graph) {
  graph.metadata.totalEntities  = Object.keys(graph.entities || {}).length;
  graph.metadata.totalRelations = (graph.relations || []).length;
  graph.metadata.categories = {};
  Object.values(graph.entities || {}).forEach(e => {
    graph.metadata.categories[e.type] = (graph.metadata.categories[e.type] || 0) + 1;
  });
}

function validateEntity(graph, entityType) {
  return (graph.ontology?.entityTypes || []).some(t => t.name === entityType);
}

function validateRelation(graph, relationType) {
  return (graph.ontology?.relationTypes || []).some(t => t.name === relationType);
}

module.exports = {
  initializeGraph,
  loadGraph,
  saveGraph,
  addEntity,
  addRelation,
  deleteRelation,
  updateMetadata,
  validateEntity,
  validateRelation,
};
