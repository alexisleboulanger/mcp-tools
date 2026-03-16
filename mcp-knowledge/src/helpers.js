/**
 * Shared helpers — front-matter parsing, hashing, versioning
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const YAML = require('yaml');

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
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    return YAML.parse(match[1]) || {};
  } catch (e) {
    console.error('[YAML] Parse error in front-matter:', e.message);
    return {};
  }
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
