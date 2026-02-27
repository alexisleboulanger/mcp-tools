/**
 * Handlers — ontology: view, extend, extract_to_memory
 */
const fs = require('node:fs');
const path = require('node:path');
const { MEMORY_DIR, GRAPH_FILE } = require('../../config');
const { loadGraph, saveGraph } = require('../../graph');
const { ensureKnowledgeBaseDirs } = require('../../knowledge-base');
const { generateOntologyDoc } = require('../../generators');

// ─── knowledge_ontology_view ────────────────
function handleOntologyView(args) {
  const graph = loadGraph();
  const output = args?.format === 'markdown'
    ? generateOntologyDoc(graph)
    : JSON.stringify(graph.ontology, null, 2);

  return { content: [{ type: 'text', text: output }] };
}

// ─── knowledge_ontology_extend ──────────────
function handleOntologyExtend(args) {
  const graph = loadGraph();

  if (!args.itemType || !args.name || !args.description) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'itemType, name, and description are required' }, null, 2) }],
      isError: true,
    };
  }

  if (args.itemType === 'entityType') {
    graph.ontology.entityTypes.push({
      name: args.name,
      layer: args.layer || 'solution',
      description: args.description,
    });
  } else if (args.itemType === 'relationType') {
    graph.ontology.relationTypes.push({
      name: args.name,
      description: args.description,
    });
  }

  saveGraph(graph);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: `Added ${args.itemType}: ${args.name}`,
        ontology: graph.ontology,
        syncStatus: 'pending_to_memory',
        note: 'Run knowledge_sync_memory action=to_memory to persist to Memory MCP',
      }, null, 2),
    }],
  };
}

// ─── knowledge_extract_ontology_to_memory ────
function handleExtractOntologyToMemory() {
  try {
    ensureKnowledgeBaseDirs();

    if (!fs.existsSync(GRAPH_FILE)) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'No knowledge-graph.json found', hint: 'Initialize with knowledge_init first' }, null, 2) }],
        isError: true,
      };
    }

    const graphData = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));

    if (!graphData.ontology) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'No embedded ontology found in knowledge-graph.json', message: 'Ontology may already be in .memory/ontology.json' }, null, 2) }],
        isError: true,
      };
    }

    const ontology = graphData.ontology;
    const memoryOntologyPath = path.join(MEMORY_DIR, 'ontology.json');
    fs.writeFileSync(memoryOntologyPath, JSON.stringify(ontology, null, 2), 'utf8');

    delete graphData.ontology;
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(graphData, null, 2), 'utf8');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Ontology extracted to .memory/ontology.json',
          details: {
            ontology_file: memoryOntologyPath,
            entity_types: ontology.entityTypes.length,
            relation_types: ontology.relationTypes.length,
            graph_cleaned: true,
          },
          next_steps: [
            'All future operations will load ontology from .memory/ontology.json',
            'Knowledge-graph.json now contains only entities and relations',
            'Run knowledge_test_compliance to verify',
          ],
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
      isError: true,
    };
  }
}

module.exports = {
  handleOntologyView,
  handleOntologyExtend,
  handleExtractOntologyToMemory,
};
