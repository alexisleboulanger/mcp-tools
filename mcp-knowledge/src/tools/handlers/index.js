/**
 * Handler — knowledge_update_index
 */
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_KNOWLEDGE_BASE, MEMORY_DIR } = require('../../config');
const { sha256File, bumpPatch } = require('../../helpers');
const { loadGraph } = require('../../graph');
const { entityLayer, entityProjectionPath } = require('../../projections');

function buildIndexEntries(graph, knowledgeBase) {
  return Object.values(graph.entities || {})
    .map(entity => {
      const relativePath = entityProjectionPath(graph, entity);
      const fullPath = path.join(knowledgeBase, relativePath);
      return {
        slug: entity.name.toLowerCase(),
        path: relativePath,
        title: entity.name,
        category: entityLayer(graph, entity).charAt(0).toUpperCase() + entityLayer(graph, entity).slice(1),
        type: entity.type,
        status: 'active',
        entityType: entity.type,
        relations: (graph.relations || [])
          .filter(relation => relation.from === entity.name)
          .map(relation => `${relation.type}: ${relation.to}`),
        fullPath,
      };
    })
    .filter(entry => fs.existsSync(entry.fullPath))
    .map(({ fullPath, ...entry }) => ({ ...entry, checksum: sha256File(fullPath) }));
}

function writeReports(entries, graph, knowledgeBase) {
  const missingRelations = entries.filter(entry => entry.relations.length === 0);
  const graphRelations = Array.isArray(graph.relations) ? graph.relations : [];
  const graphLinked = missingRelations.filter(entry => graphRelations.some(relation => relation.from === entry.title || relation.to === entry.title));
  const graphUnlinked = missingRelations.filter(entry => !graphRelations.some(relation => relation.from === entry.title || relation.to === entry.title));
  const orphans = graphUnlinked.filter(entry => !['Concept', 'Policy', 'Template'].includes(entry.entityType));
  const integrityLines = [
    '# Knowledge Integrity Report',
    `Generated: ${new Date().toISOString()}`, '',
    '## Summary',
    `Total entries: ${entries.length}`,
    'Missing entityType: 0',
    `Entries with no doc relations: ${missingRelations.length}`,
    `Entries linked in knowledge graph: ${graphLinked.length}`,
    `Entries with no graph relations: ${graphUnlinked.length}`,
    `Potential orphans: ${orphans.length}`,
  ];
  if (graphLinked.length) { integrityLines.push('', '## No Doc Relations But Linked In Graph'); graphLinked.forEach(entry => integrityLines.push(`- ${entry.slug} (${entry.entityType})`)); }
  if (orphans.length) { integrityLines.push('', '## Orphans'); orphans.forEach(entry => integrityLines.push(`- ${entry.slug} (${entry.entityType})`)); }
  fs.writeFileSync(path.join(knowledgeBase, 'integrity-report.md'), integrityLines.join('\n') + '\n', 'utf8');

  const byCategory = {};
  entries.forEach(entry => { byCategory[entry.category] = byCategory[entry.category] || []; byCategory[entry.category].push(entry); });
  const indexLines = ['# Knowledge Index', `Generated: ${new Date().toISOString().slice(0, 10)}`];
  Object.keys(byCategory).sort().forEach(category => {
    indexLines.push('', `## ${category}`);
    byCategory[category].sort((a, b) => a.slug.localeCompare(b.slug)).forEach(entry => {
      indexLines.push(`- [${entry.title}](${entry.path}) (${entry.entityType}) – status: ${entry.status}`);
    });
  });
  fs.writeFileSync(path.join(knowledgeBase, 'INDEX.md'), indexLines.join('\n') + '\n', 'utf8');
  return ['integrity-report.md', 'INDEX.md'];
}

function rebuildIndex(graph, { indexPath = path.join(MEMORY_DIR, 'knowledge-index.json'), knowledgeBase = DEFAULT_KNOWLEDGE_BASE, generateReports = true } = {}) {
  const previousIndex = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    : { version: '0.0.0', entries: [] };
  const originalVersion = previousIndex.version || '0.0.0';
  const entries = buildIndexEntries(graph, knowledgeBase);
  const changed = JSON.stringify(entries) !== JSON.stringify(previousIndex.entries || []);
  const index = {
    ...previousIndex,
    version: changed ? bumpPatch(originalVersion) : originalVersion,
    ...(changed ? { generated: new Date().toISOString().slice(0, 10) } : {}),
    entries,
  };
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
  return { changed, originalVersion, index, reports: generateReports ? writeReports(entries, graph, knowledgeBase) : [] };
}

function handleUpdateIndex(args) {
  const generateReports = args?.generateReports !== false;

  try {
    const indexPath = path.join(MEMORY_DIR, 'knowledge-index.json');
    const graph = loadGraph();

    const rebuilt = rebuildIndex(graph, { indexPath, generateReports });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          updated: rebuilt.changed,
          version: { before: rebuilt.originalVersion, after: rebuilt.index.version },
          entries_processed: rebuilt.index.entries.length,
          reports_generated: rebuilt.reports,
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

module.exports = handleUpdateIndex;
module.exports.rebuildIndex = rebuildIndex;
