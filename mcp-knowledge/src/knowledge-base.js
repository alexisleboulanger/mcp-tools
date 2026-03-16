/**
 * Knowledge-base initialisation, directory management, ontology loading
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_KNOWLEDGE_BASE,
  FOUNDATION_PATH,
  MEMORY_DIR,
  ONTOLOGY_DIR,
  GRAPH_FILE,
} = require('./config');
const { selectOntology } = require('./ontologies');

// ──────────────────────────────────────────────
// Directory helpers
// ──────────────────────────────────────────────

/**
 * Create all required knowledge-base directories if they don't exist.
 */
function ensureKnowledgeBaseDirs() {
  [MEMORY_DIR, ONTOLOGY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Recursively copy a directory tree.
 */
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ──────────────────────────────────────────────
// Knowledge-base initialisation
// ──────────────────────────────────────────────

/**
 * Scaffold a new .knowledge folder from the foundation template.
 */
function initializeKnowledgeBase(targetPath, projectName = 'Project', ontology = 'standard') {
  const knowledgePath = path.join(targetPath, '.knowledge');

  if (fs.existsSync(knowledgePath)) {
    throw new Error('.knowledge folder already exists at target path');
  }

  const templatePath = path.join(FOUNDATION_PATH, 'bootstrap-template');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Foundational template not found. Ensure .knowledge-foundation exists.');
  }

  // Copy template
  copyRecursive(templatePath, knowledgePath);

  // Write initial graph
  const selectedOntology = loadFoundationalOntology(ontology);
  const initialGraph = {
    version: '1.0.0',
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    projectName,
    ontologyType: selectedOntology.name,
    entities: {},
    relations: [],
    ontology: selectedOntology,
    metadata: { totalEntities: 0, totalRelations: 0, categories: {} },
  };
  const memDir = path.join(knowledgePath, '.memory');
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
  fs.writeFileSync(
    path.join(memDir, 'knowledge-graph.json'),
    JSON.stringify(initialGraph, null, 2),
    'utf8',
  );
  // Seed .memory/ontology.json so the single-source pattern is established from init
  fs.writeFileSync(
    path.join(memDir, 'ontology.json'),
    JSON.stringify(selectedOntology, null, 2),
    'utf8',
  );

  // Write initial README
  const readmeContent = `# ${projectName} Knowledge Base

**Initialized:** ${new Date().toISOString()}

This knowledge base follows the foundational ontology structure.

## Structure

- **strategy/** - Why? Strategic context and objectives
- **delivery/** - What? Capabilities, decisions, processes
- **solution/** - How? Services, architecture, patterns, concepts
- **.ontology/** - Auto-generated diagrams

## Getting Started

1. Define your strategic pillars and objectives in \`strategy/objectives.md\`
2. Document capabilities in \`delivery/capabilities/\`
3. Record architecture decisions in \`delivery/adr/\`
4. Document services in \`solution/services/\`

## Tools

Use mcp-knowledge tools to manage this knowledge base:
- \`knowledge_graph_add_entity\` - Add entities
- \`knowledge_graph_add_relation\` - Create relations
- \`knowledge_model_visualize\` - Generate diagrams
- \`knowledge_graph_validate\` - Validate against ontology

See [.knowledge-foundation](../../.knowledge-foundation/) for more details.
`;
  fs.writeFileSync(path.join(knowledgePath, 'README.md'), readmeContent, 'utf8');

  return {
    path: knowledgePath,
    projectName,
    structure: ['strategy/', 'delivery/', 'solution/', '.ontology/'],
  };
}

// ──────────────────────────────────────────────
// Ontology loading hierarchy
// ──────────────────────────────────────────────

/**
 * Load canonical ontology from .knowledge-foundation on disk.
 * Used during knowledge_init to bootstrap from foundation templates.
 * Falls back to the hardcoded ontology in ontologies.js if no foundation files exist.
 */
function loadFoundationalOntology(ontologyName = 'standard') {
  const schemaPath = path.join(FOUNDATION_PATH, `${ontologyName.toLowerCase()}-ontology.json`);

  if (fs.existsSync(schemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      return {
        entityTypes: schema.entityTypes || [],
        relationTypes: schema.relationTypes || [],
        version: schema.version,
        name: schema.name,
        description: schema.description,
      };
    } catch (err) {
      console.error(`Failed to load foundational ontology from ${schemaPath}:`, err.message);
    }
  }

  // Fallback to hardcoded
  return selectOntology(ontologyName);
}

/**
 * Load ontology from the single canonical source: .memory/ontology.json
 *
 * If the file doesn't exist yet, seed it from the hardcoded default ontology
 * so there is always exactly one source of truth going forward.
 */
function loadOntologyFromMemory() {
  const memoryOntologyPath = path.join(MEMORY_DIR, 'ontology.json');

  if (fs.existsSync(memoryOntologyPath)) {
    try {
      const ontology = JSON.parse(fs.readFileSync(memoryOntologyPath, 'utf8'));
      return ontology;
    } catch (err) {
      console.error('[ONTOLOGY] Failed to parse ontology.json:', err.message);
    }
  }

  // Seed from hardcoded default on first run
  const defaultOntology = selectOntology('standard');
  ensureKnowledgeBaseDirs();
  fs.writeFileSync(memoryOntologyPath, JSON.stringify(defaultOntology, null, 2), 'utf8');
  console.error('[ONTOLOGY] Seeded .memory/ontology.json from default ontology');
  return defaultOntology;
}

/**
 * Persist the current ontology to .memory/ontology.json.
 * Called after ontology_extend to keep the canonical file in sync.
 */
function saveOntologyToMemory(ontology) {
  ensureKnowledgeBaseDirs();
  const memoryOntologyPath = path.join(MEMORY_DIR, 'ontology.json');
  fs.writeFileSync(memoryOntologyPath, JSON.stringify(ontology, null, 2), 'utf8');
}

module.exports = {
  saveOntologyToMemory,
  ensureKnowledgeBaseDirs,
  copyRecursive,
  initializeKnowledgeBase,
  loadFoundationalOntology,
  loadOntologyFromMemory,
};
