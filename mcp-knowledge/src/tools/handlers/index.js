/**
 * Handler — knowledge_update_index
 */
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_KNOWLEDGE_BASE, MEMORY_DIR } = require('../../config');
const { sha256File, bumpPatch, parseFrontMatter } = require('../../helpers');
const { loadGraph } = require('../../graph');

function normalizeRelation(relation) {
  if (typeof relation === 'string') return relation.trim();
  if (!relation || typeof relation !== 'object') return '';

  const type = typeof relation.type === 'string' ? relation.type.trim() : '';
  const target = typeof relation.target === 'string' ? relation.target.trim() : '';

  if (type && target) return `${type}: ${target}`;
  if (type) return type;

  const entries = Object.entries(relation)
    .filter(([key, value]) => typeof key === 'string' && value != null)
    .map(([key, value]) => [key.trim(), String(value).trim()])
    .filter(([key, value]) => key && value);

  if (entries.length === 1) {
    const [[key, value]] = entries;
    return `${key}: ${value}`;
  }

  return '';
}

function handleUpdateIndex(args) {
  const generateReports = args?.generateReports !== false;

  try {
    const indexPath = path.join(MEMORY_DIR, 'knowledge-index.json');
    const graph = loadGraph();

    if (!fs.existsSync(indexPath)) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'knowledge-index.json not found', hint: 'Create it first in .knowledge/.memory/' }, null, 2) }],
        isError: true,
      };
    }

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const originalVersion = index.version || '0.0.0';
    let updated = false;
    const errors = [];

    // Update each entry
    (index.entries || []).forEach(entry => {
      const fullPath = path.join(DEFAULT_KNOWLEDGE_BASE, entry.path);
      if (!fs.existsSync(fullPath)) { errors.push(`Missing file: ${entry.slug} -> ${entry.path}`); return; }

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fm = parseFrontMatter(content);

        if (fm.entityType && entry.entityType !== fm.entityType) { entry.entityType = fm.entityType; updated = true; }
        if (Array.isArray(fm.relations)) {
          const rels = fm.relations.map(normalizeRelation).filter(Boolean);
          if (JSON.stringify(entry.relations || []) !== JSON.stringify(rels)) { entry.relations = rels; updated = true; }
        }

        const placeholders = new Set(['TBD', 'PENDING_SHA256', 'PENDING', 'UNKNOWN', 'TODO']);
        if (!entry.checksum || placeholders.has(entry.checksum)) { entry.checksum = sha256File(fullPath); updated = true; }
      } catch (err) {
        errors.push(`Error processing ${entry.slug}: ${err.message}`);
      }
    });

    if (updated) {
      index.version = bumpPatch(originalVersion);
      index.generated = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
    }

    // Generate reports
    const reports = [];
    if (generateReports) {
      const missingEntityType = (index.entries || []).filter(e => !e.entityType);
      const missingRelations  = (index.entries || []).filter(e => !e.relations || e.relations.length === 0);
      const graphRelations = Array.isArray(graph?.relations) ? graph.relations : [];
      const graphLinked = missingRelations.filter(e => graphRelations.some(r => r.from === e.title || r.to === e.title));
      const graphUnlinked = missingRelations.filter(e => !graphRelations.some(r => r.from === e.title || r.to === e.title));
      const orphans = graphUnlinked.filter(e => !['Concept', 'Policy', 'Template'].includes(e.entityType));

      // integrity-report.md
      const integrityLines = [
        '# Knowledge Integrity Report',
        `Generated: ${new Date().toISOString()}`, '',
        '## Summary',
        `Total entries: ${index.entries.length}`,
        `Missing entityType: ${missingEntityType.length}`,
        `Entries with no doc relations: ${missingRelations.length}`,
        `Entries linked in knowledge graph: ${graphLinked.length}`,
        `Entries with no graph relations: ${graphUnlinked.length}`,
        `Potential orphans: ${orphans.length}`,
      ];
      if (missingEntityType.length) { integrityLines.push('', '## Missing entityType'); missingEntityType.forEach(e => integrityLines.push(`- ${e.slug} (${e.path})`)); }
      if (graphLinked.length) { integrityLines.push('', '## No Doc Relations But Linked In Graph'); graphLinked.forEach(e => integrityLines.push(`- ${e.slug} (${e.entityType || 'UNKNOWN'})`)); }
      if (orphans.length) { integrityLines.push('', '## Orphans'); orphans.forEach(e => integrityLines.push(`- ${e.slug} (${e.entityType || 'UNKNOWN'})`)); }
      fs.writeFileSync(path.join(DEFAULT_KNOWLEDGE_BASE, 'integrity-report.md'), integrityLines.join('\n') + '\n', 'utf8');
      reports.push('integrity-report.md');

      // INDEX.md
      const byCategory = {};
      (index.entries || []).forEach(e => { byCategory[e.category] = byCategory[e.category] || []; byCategory[e.category].push(e); });
      const indexLines = ['# Knowledge Index', `Generated: ${new Date().toISOString().slice(0, 10)}`];
      Object.keys(byCategory).sort().forEach(cat => {
        indexLines.push('', `## ${cat}`);
        byCategory[cat].sort((a, b) => a.slug.localeCompare(b.slug)).forEach(e => {
          indexLines.push(`- [${e.title}](${e.path}) (${e.entityType || e.type}) – status: ${e.status}`);
        });
      });
      fs.writeFileSync(path.join(DEFAULT_KNOWLEDGE_BASE, 'INDEX.md'), indexLines.join('\n') + '\n', 'utf8');
      reports.push('INDEX.md');
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          updated,
          version: { before: originalVersion, after: index.version },
          entries_processed: index.entries.length,
          reports_generated: reports,
          errors: errors.length ? errors : undefined,
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
