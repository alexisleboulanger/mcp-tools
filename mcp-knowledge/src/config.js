/**
 * Configuration — paths and constants
 */
const path = require('node:path');

const DEFAULT_KNOWLEDGE_BASE = process.env.KNOWLEDGE_PATH ||
  path.join(process.cwd(), '.knowledge');

const FOUNDATION_PATH = path.join(__dirname, '..', '..', '.knowledge-foundation');

// Directory structure
const MEMORY_DIR   = path.join(DEFAULT_KNOWLEDGE_BASE, '.memory');
const ONTOLOGY_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, '.ontology');

// File locations
const GRAPH_FILE      = path.join(MEMORY_DIR, 'knowledge-graph.json');
const GRAPH_MD_FILE   = path.join(MEMORY_DIR, 'knowledge-graph.md');
const ONTOLOGY_MD_FILE = path.join(ONTOLOGY_DIR, 'knowledge-ontology.md');
const INDEX_FILE      = path.join(DEFAULT_KNOWLEDGE_BASE, 'INDEX.md');
const INDEX_JSON_FILE = path.join(DEFAULT_KNOWLEDGE_BASE, 'knowledge-index.json');

module.exports = {
  DEFAULT_KNOWLEDGE_BASE,
  FOUNDATION_PATH,
  MEMORY_DIR,
  ONTOLOGY_DIR,
  GRAPH_FILE,
  GRAPH_MD_FILE,
  ONTOLOGY_MD_FILE,
  INDEX_FILE,
  INDEX_JSON_FILE,
};
