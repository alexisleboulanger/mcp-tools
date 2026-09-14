/**
 * Handlers — sync: knowledge_docs_sync (to_docs, from_docs), knowledge_sync_memory
 */
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_KNOWLEDGE_BASE, MEMORY_DIR, ONTOLOGY_MD_FILE, GRAPH_MD_FILE, GRAPH_FILE } = require('../../config');
const { loadGraph, saveGraph } = require('../../graph');
const { ensureKnowledgeBaseDirs } = require('../../knowledge-base');
const { generateOntologyDoc, generateModelDoc } = require('../../generators');
const { parseFrontMatter, extractObservations } = require('../../helpers');
const { logOperation } = require('../../audit');
const { entityLayer, entityProjectionPath } = require('../../projections');
const { rebuildIndex } = require('./index');

// ─── knowledge_docs_sync ────────────────────

function handleDocsSync(args) {
  const graph = loadGraph();
  ensureKnowledgeBaseDirs();

  if (args?.action === 'to_docs') return syncToDocs(graph, args);
  if (args?.action === 'from_docs') return syncFromDocs(graph, args);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: false,
        error: 'Invalid action. Use "to_docs" or "from_docs"',
        hint: 'to_docs: memory → .knowledge folder | from_docs: .knowledge folder → memory',
      }, null, 2),
    }],
    isError: true,
  };
}

// ── to_docs ──────────────────────────────────

function syncToDocs(graph) {
  // 1. Ontology doc
  fs.writeFileSync(ONTOLOGY_MD_FILE, generateOntologyDoc(graph), 'utf8');

  // 2. Graph doc
  fs.writeFileSync(GRAPH_MD_FILE, generateModelDoc(graph), 'utf8');

  // 3. Entity files in dynamic layer folders
  const layers = dynamicLayers(graph);
  const generatedFiles = [];
  const expectedPaths = new Set(Object.values(graph.entities || {}).map(entity => entityProjectionPath(graph, entity)));
  const prunedFiles = pruneStaleProjections(layers, expectedPaths);

  Object.values(graph.entities || {}).forEach(entity => {
    const relativePath = entityProjectionPath(graph, entity);
    const folder = path.dirname(relativePath);
    const folderPath = path.join(DEFAULT_KNOWLEDGE_BASE, folder);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const filePath = path.join(DEFAULT_KNOWLEDGE_BASE, relativePath);

    const relations = (graph.relations || [])
      .filter(r => r.from === entity.name)
      .map(r => `${r.type}: ${r.to}`);

    const frontMatterLines = [
      '---',
      `entityType: ${entity.type}`,
      'relations:',
      ...relations.map(r => `  - ${r}`),
      '---',
    ];

    let body = '';
    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, 'utf8');
      body = stripFrontMatter(existingContent).replace(/^\s+/, '');
    }

    if (!body) {
      const generatedBodyLines = [
        `# ${entity.name}`,
        '',
        `**Type:** ${entity.type}`,
        '',
        '## Observations',
        '',
        ...entity.observations.map(o => `- ${o}`),
      ];

      if (relations.length) {
        generatedBodyLines.push('', '## Relations', '', ...relations.map(r => `- ${r}`));
      }

      body = generatedBodyLines.join('\n');
    }

    fs.writeFileSync(filePath, frontMatterLines.join('\n') + '\n\n' + body.replace(/\s+$/, '') + '\n', 'utf8');
    generatedFiles.push(relativePath);
  });

  // 4. Rebuild derived index from the graph and projections just written.
  const indexUpdate = rebuildIndex(graph, { generateReports: false });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'to_docs',
        files: { ontology: ONTOLOGY_MD_FILE, graph: GRAPH_MD_FILE, generated: generatedFiles.length, pruned: prunedFiles.length },
        generatedFiles,
        prunedFiles,
        indexUpdate,
        message: `Knowledge synced FROM graph to .knowledge folder (${generatedFiles.length} entity files generated)`,
        architecture: { primary: 'knowledge-graph.json (source of truth)', secondary: '.knowledge folder (derived read-only views)' },
      }, null, 2),
    }],
  };
}

// ── from_docs ────────────────────────────────

async function syncFromDocs(graph) {
  // DEPRECATED: from_docs direction is deprecated. The graph is the source of truth.
  // This path exists for backward compatibility but should not be used.
  const deprecationWarning = 'WARNING: from_docs is DEPRECATED. The graph (knowledge-graph.json) is the single source of truth. Use to_docs to regenerate derived views. If entity data in markdown conflicts with the graph, mutate the graph via knowledge_graph_* tools instead.';
  const layers = dynamicLayers(graph);
  const addedEntities = [];
  const addedRelations = [];
  const errors = [];

  layers.forEach(folder => {
    const folderPath = path.join(DEFAULT_KNOWLEDGE_BASE, folder);
    if (!fs.existsSync(folderPath)) return;

    fs.readdirSync(folderPath).filter(f => f.endsWith('.md')).forEach(filename => {
      try {
        const content = fs.readFileSync(path.join(folderPath, filename), 'utf8');
        const fm = parseFrontMatter(content);
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (!titleMatch) { errors.push(`No title found in ${folder}/${filename}`); return; }

        const entityName = titleMatch[1].trim();
        const entityType = fm.entityType || 'Concept';
        const observations = extractObservations(content);

        if (!graph.entities[entityName]) {
          graph.entities[entityName] = { name: entityName, type: entityType, observations, createdAt: new Date().toISOString() };
          addedEntities.push(entityName);
          graph.metadata.totalEntities++;
        } else {
          const newObs = observations.filter(o => !graph.entities[entityName].observations.includes(o));
          if (newObs.length) {
            graph.entities[entityName].observations.push(...newObs);
            addedEntities.push(`${entityName} (updated)`);
          }
        }

        if (Array.isArray(fm.relations)) {
          fm.relations.forEach(rel => {
            const parts = rel.split(':').map(s => s.trim());
            if (parts.length === 2) {
              const [relType, target] = parts;
              const relId = `${entityName}_${relType}_${target}`;
              if (!graph.relations[relId]) {
                graph.relations[relId] = { from: entityName, to: target, type: relType };
                addedRelations.push(relId);
                graph.metadata.totalRelations++;
              }
            }
          });
        }
      } catch (err) {
        errors.push(`Error processing ${folder}/${filename}: ${err.message}`);
      }
    });
  });

  if (addedEntities.length || addedRelations.length) {
    await saveGraph(graph);
    logOperation('sync_from_docs', 'graph', { entities: addedEntities.length, relations: addedRelations.length });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'from_docs',
        summary: { entitiesAdded: addedEntities.length, relationsAdded: addedRelations.length, errors: errors.length },
        entities: addedEntities,
        relations: addedRelations.slice(0, 10),
        errors: errors.length ? errors : undefined,
        message: `DEPRECATED: ${deprecationWarning} — Synced FROM .knowledge folder TO graph (${addedEntities.length} entities, ${addedRelations.length} relations)`,
        deprecation: deprecationWarning,
        architecture: { primary: 'knowledge-graph.json (source of truth)', secondary: '.knowledge folder (derived views — do not use as source)' },
      }, null, 2),
    }],
  };
}

// ── helpers ──────────────────────────────────

function dynamicLayers(graph) {
  const set = new Set();
  (graph.ontology.entityTypes || []).forEach(et => { if (et.layer) set.add(et.layer); });
  return Array.from(set);
}

function pruneStaleProjections(layers, expectedPaths) {
  const pruned = [];
  layers.forEach(layer => {
    const folderPath = path.join(DEFAULT_KNOWLEDGE_BASE, layer);
    if (!fs.existsSync(folderPath)) return;
    fs.readdirSync(folderPath, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .forEach(entry => {
        const relativePath = path.posix.join(layer, entry.name);
        if (!expectedPaths.has(relativePath)) {
          fs.unlinkSync(path.join(folderPath, entry.name));
          pruned.push(relativePath);
        }
      });
  });
  return pruned;
}

function stripFrontMatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

// ─── knowledge_sync_memory ──────────────────

function handleSyncMemory(args) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        status: 'not_applicable',
        message: 'The DKG (Domain Knowledge Graph) and MCP Memory server are separate stores by design. DKG entities live in knowledge-graph.json and are managed exclusively by mcp-knowledge tools. MCP Memory (@modelcontextprotocol/server-memory) is for session-scoped working notes and user preferences only. No sync between them is needed or supported.',
        architecture: {
          'knowledge-graph.json': 'DKG source of truth — entities, relations, ontology',
          'MCP Memory': 'Session/user preferences only — not for DKG data',
          '.knowledge folder': 'Derived read-only views regenerated by knowledge_docs_sync (to_docs)',
        },
      }, null, 2),
    }],
  };
}

module.exports = {
  handleDocsSync,
  handleSyncMemory,
};
