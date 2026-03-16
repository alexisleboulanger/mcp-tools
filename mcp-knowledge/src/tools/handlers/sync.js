/**
 * Handlers — sync: knowledge_docs_sync (to_docs, from_docs), knowledge_sync_memory
 */
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_KNOWLEDGE_BASE, MEMORY_DIR, ONTOLOGY_MD_FILE, GRAPH_MD_FILE, GRAPH_FILE } = require('../../config');
const { loadGraph, saveGraph } = require('../../graph');
const { ensureKnowledgeBaseDirs } = require('../../knowledge-base');
const { generateOntologyDoc, generateModelDoc } = require('../../generators');
const { parseFrontMatter, extractObservations, sha256File, bumpPatch } = require('../../helpers');
const { logOperation } = require('../../audit');

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
  const indexPath = path.join(MEMORY_DIR, 'knowledge-index.json');
  let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : null;

  Object.values(graph.entities || {}).forEach(entity => {
    const folder = entityLayer(graph, entity);
    const folderPath = path.join(DEFAULT_KNOWLEDGE_BASE, folder);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const filename = entity.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.md';
    const relativePath = `${folder}/${filename}`;
    const filePath = path.join(folderPath, filename);

    const relations = (graph.relations || [])
      .filter(r => r.from === entity.name)
      .map(r => `${r.type}: ${r.to}`);

    const lines = [
      '---',
      `entityType: ${entity.type}`,
      'relations:',
      ...relations.map(r => `  - ${r}`),
      '---',
      '',
      `# ${entity.name}`,
      '',
      `**Type:** ${entity.type}`,
      '',
      '## Observations',
      '',
      ...entity.observations.map(o => `- ${o}`),
    ];

    if (relations.length) {
      lines.push('', '## Relations', '', ...relations.map(r => `- ${r}`));
    }

    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
    generatedFiles.push(relativePath);

    // Update index
    if (index) {
      const existing = (index.entries || []).find(e => e.slug === entity.name.toLowerCase());
      if (!existing) {
        (index.entries = index.entries || []).push({
          slug: entity.name.toLowerCase(),
          path: relativePath,
          title: entity.name,
          category: folder.charAt(0).toUpperCase() + folder.slice(1),
          type: entity.type,
          status: 'active',
          entityType: entity.type,
          relations,
        });
      } else {
        existing.path = relativePath;
        existing.entityType = entity.type;
        existing.relations = relations;
      }
    }
  });

  if (index) {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
  }

  // 4. Auto-update checksums & version
  const indexUpdate = autoUpdateIndex(indexPath);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'to_docs',
        files: { ontology: ONTOLOGY_MD_FILE, graph: GRAPH_MD_FILE, generated: generatedFiles.length },
        generatedFiles,
        indexUpdate,
        message: `Knowledge synced FROM memory to .knowledge folder (${generatedFiles.length} entity files generated)`,
        architecture: { primary: 'Memory MCP (source of truth)', secondary: '.knowledge folder (human-readable sync)' },
      }, null, 2),
    }],
  };
}

// ── from_docs ────────────────────────────────

async function syncFromDocs(graph) {
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
        message: `Knowledge synced FROM .knowledge folder TO memory (${addedEntities.length} entities, ${addedRelations.length} relations)`,
        architecture: { primary: 'Memory MCP (source of truth updated)', secondary: '.knowledge folder (source)' },
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

function entityLayer(graph, entity) {
  const def = graph.ontology.entityTypes.find(et => et.name === entity.type);
  return def?.layer || 'solution';
}

function autoUpdateIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return { updated: false, message: 'Index not found or skipped' };

  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const originalVersion = index.version || '0.0.0';
    let updated = false;

    (index.entries || []).forEach(entry => {
      const fullPath = path.join(DEFAULT_KNOWLEDGE_BASE, entry.path);
      if (!fs.existsSync(fullPath)) return;

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fm = parseFrontMatter(content);

        if (fm.entityType && entry.entityType !== fm.entityType) { entry.entityType = fm.entityType; updated = true; }
        if (Array.isArray(fm.relations)) {
          const rels = fm.relations.map(r => r.trim()).filter(Boolean);
          if (rels.length && JSON.stringify(entry.relations || []) !== JSON.stringify(rels)) { entry.relations = rels; updated = true; }
        }

        const placeholders = new Set(['TBD', 'PENDING_SHA256', 'PENDING', 'UNKNOWN', 'TODO']);
        if (!entry.checksum || placeholders.has(entry.checksum)) { entry.checksum = sha256File(fullPath); updated = true; }
      } catch { /* skip */ }
    });

    if (updated) {
      index.version = bumpPatch(originalVersion);
      index.generated = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
      return { updated: true, version: { before: originalVersion, after: index.version }, entries: index.entries.length };
    }
    return { updated: false, message: 'No changes detected, version unchanged', version: originalVersion };
  } catch (err) {
    return { updated: false, error: err.message };
  }
}

// ─── knowledge_sync_memory ──────────────────

function handleSyncMemory(args) {
  const graph = loadGraph();
  const action = args?.action || 'bidirectional';

  const syncData = {
    action,
    timestamp: new Date().toISOString(),
    ontology: { name: graph.ontology.name, version: graph.ontology.version, entityTypes: graph.ontology.entityTypes, relationTypes: graph.ontology.relationTypes },
    graph: { version: graph.version, entities: graph.entities, relations: graph.relations, metadata: graph.metadata },
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action,
        status: 'pending_implementation',
        message: 'Memory sync requires active memory MCP tool connection',
        note: 'Use knowledge_docs_sync for human-readable display in .knowledge folder',
        dataReadyForSync: {
          ontologySize: `${JSON.stringify(syncData.ontology).length} bytes`,
          graphSize: `${JSON.stringify(syncData.graph).length} bytes`,
          entities: graph.metadata.totalEntities,
          relations: graph.metadata.totalRelations,
        },
        architecture: {
          'Memory MCP': 'Source of truth (ontology + graph)',
          'knowledge-graph.json': 'Primary backup in .memory/',
          '.knowledge folder': 'Read-only human-readable display',
        },
      }, null, 2),
    }],
  };
}

module.exports = {
  handleDocsSync,
  handleSyncMemory,
};
