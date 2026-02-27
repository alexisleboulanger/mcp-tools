/**
 * Shared helpers — front-matter parsing, hashing, versioning
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

/**
 * Compute SHA-256 checksum of a file.
 */
function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Bump the patch segment of a semver string (e.g. "2.0.3" → "2.0.4").
 */
function bumpPatch(version) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return version;
  parts[2] += 1;
  return parts.join('.');
}

/**
 * Parse simple YAML-style front-matter from markdown content.
 * Returns a plain object with key→value mappings.
 */
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
        value = value.substring(1, value.length - 1)
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);
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

/**
 * Extract observation bullet points from an "## Observations" section.
 */
function extractObservations(content) {
  const obsMatch = content.match(/## Observations\s*([\s\S]*?)(?=\n##|\n---|\Z)/);
  if (!obsMatch) return [];
  return obsMatch[1]
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.trim().substring(2).trim())
    .filter(Boolean);
}

module.exports = {
  sha256File,
  bumpPatch,
  parseFrontMatter,
  extractObservations,
};
