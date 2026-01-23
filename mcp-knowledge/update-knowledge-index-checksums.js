#!/usr/bin/env node
/**
 * update-knowledge-index-checksums.js
 * 
 * Run from .knowledge folder: node .tools/update-knowledge-index-checksums.js
 * 
 * Enhancements:
 *  - Compute SHA256 checksums for new/changed entries.
 *  - Parse front-matter of markdown files to enrich index with entityType & relations.
 *  - Generate integrity-report.md (missing front-matter, orphan detection, stats).
 *  - Generate INDEX.md grouped by category for human navigation.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ROOT is the .knowledge folder (parent of .tools)
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.resolve(ROOT, 'knowledge-index.json');
const INTEGRITY_REPORT_PATH = path.resolve(__dirname, 'integrity-report.md');
const HUMAN_INDEX_PATH = path.resolve(ROOT, 'INDEX.md');

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function bumpPatch(version) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return version;
  parts[2] += 1;
  return parts.join('.');
}

function parseFrontMatter(content) {
  const fmMatch = content.match(/^---\s*([\s\S]*?)\n---/);
  if (!fmMatch) return {};
  const lines = fmMatch[1].split('\n');
  const data = {};
  let currentListKey = null;
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (currentListKey && trimmed.startsWith('- ')) {
      if (!Array.isArray(data[currentListKey])) data[currentListKey] = [];
      data[currentListKey].push(trimmed.substring(2).trim());
      return;
    }
    const kv = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let value = kv[2];
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.substring(1, value.length - 1).split(',').map(v => v.trim()).filter(Boolean);
      }
      if (value === '') {
        currentListKey = key;
        data[key] = [];
      } else {
        currentListKey = null;
        data[key] = value;
      }
    }
  });
  return data;
}

function generateIntegrityReport(json) {
  const lines = [];
  lines.push('# Knowledge Integrity Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  const missingEntityType = json.entries.filter(e => !e.entityType);
  const missingRelations = json.entries.filter(e => !e.relations || e.relations.length === 0);
  const orphans = missingRelations.filter(e => !['Concept', 'Policy', 'Template'].includes(e.entityType));
  lines.push('\n## Summary');
  lines.push(`Total entries: ${json.entries.length}`);
  lines.push(`Missing entityType: ${missingEntityType.length}`);
  lines.push(`Entries with no relations: ${missingRelations.length}`);
  lines.push(`Potential orphans (non-root, no relations): ${orphans.length}`);
  if (missingEntityType.length) {
    lines.push('\n## Missing entityType');
    missingEntityType.forEach(e => lines.push(`- ${e.slug} (${e.path})`));
  }
  if (orphans.length) {
    lines.push('\n## Orphans');
    orphans.forEach(e => lines.push(`- ${e.slug} (${e.entityType || 'UNKNOWN'})`));
  }
  fs.writeFileSync(INTEGRITY_REPORT_PATH, lines.join('\n') + '\n');
}

function generateHumanIndex(json) {
  const byCategory = {};
  json.entries.forEach(e => {
    byCategory[e.category] = byCategory[e.category] || [];
    byCategory[e.category].push(e);
  });
  const lines = [];
  lines.push('# Knowledge Index');
  lines.push(`Generated: ${new Date().toISOString().slice(0,10)}`);
  Object.keys(byCategory).sort().forEach(cat => {
    lines.push(`\n## ${cat}`);
    byCategory[cat].sort((a,b)=>a.slug.localeCompare(b.slug)).forEach(e => {
      lines.push(`- [${e.title}](${e.path}) (${e.entityType || e.type}) – status: ${e.status}`);
    });
  });
  fs.writeFileSync(HUMAN_INDEX_PATH, lines.join('\n') + '\n');
}

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('Index file not found:', INDEX_PATH);
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const originalVersion = json.version || '0.0.0';
  let updated = false;

  json.entries.forEach(entry => {
    const fullPath = path.resolve(ROOT, entry.path);
    if (!fs.existsSync(fullPath)) {
      console.warn('[WARN] Missing file for entry', entry.slug, '->', fullPath);
      return;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const fm = parseFrontMatter(content);
    if (fm.entityType && entry.entityType !== fm.entityType) {
      entry.entityType = fm.entityType; updated = true;
    }
    if (Array.isArray(fm.relations)) {
      const rels = fm.relations.map(r => r.trim()).filter(Boolean);
      if (rels.length && JSON.stringify(entry.relations || []) !== JSON.stringify(rels)) {
        entry.relations = rels; updated = true;
      }
    }
    // Treat common placeholder markers as needing checksum generation
    const placeholderMarkers = new Set(['TBD','PENDING_SHA256','PENDING','UNKNOWN']);
    if (!entry.checksum || placeholderMarkers.has(entry.checksum)) {
      entry.checksum = sha256File(fullPath); updated = true;
    }
  });

  if (updated) {
    json.version = bumpPatch(originalVersion);
    json.generated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(INDEX_PATH, JSON.stringify(json, null, 2));
    console.log('Updated knowledge-index.json from', originalVersion, 'to', json.version);
  } else {
    console.log('No index field or checksum updates needed. Version remains', originalVersion);
  }

  generateIntegrityReport(json);
  generateHumanIndex(json);
  console.log('Generated integrity report and human index.');
}

if (require.main === module) {
  main();
}
