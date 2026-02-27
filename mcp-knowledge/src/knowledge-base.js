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
  const selectedOntology = selectOntology(ontology);
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
  fs.writeFileSync(
    path.join(knowledgePath, 'knowledge-graph.json'),
    JSON.stringify(initialGraph, null, 2),
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

  // Fallback to embedded
  return selectOntology(ontologyName);
}

/**
 * Load ontology using the priority chain:
 *   1. .memory/ontology.json (synced from Memory MCP)
 *   2. Embedded in knowledge-graph.json
 *   3. .knowledge-foundation reference schemas
 *   4. Hardcoded default
 */
function loadOntologyFromMemory() {
  // 1. Memory ontology file
  const memoryOntologyPath = path.join(MEMORY_DIR, 'ontology.json');
  if (fs.existsSync(memoryOntologyPath)) {
    try {
      const ontology = JSON.parse(fs.readFileSync(memoryOntologyPath, 'utf8'));
      console.error(`[ONTOLOGY] Loaded from memory: ${ontology.name} v${ontology.version}`);
      return ontology;
    } catch (err) {
      console.error('Failed to load memory ontology:', err.message);
    }
  }

  // 2. Graph-embedded ontology
  if (fs.existsSync(GRAPH_FILE)) {
    try {
      const graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
      if (graph.ontology) {
        console.error(`[ONTOLOGY] Loaded from graph.json: ${graph.ontology.name} v${graph.ontology.version}`);
        return graph.ontology;
      }
      if (graph.ontologyType) {
        console.error(`[ONTOLOGY] Graph references ontology: ${graph.ontologyType}`);
        return loadFoundationalOntology(graph.ontologyType);
      }
    } catch (err) {
      console.error('Failed to load ontology from graph:', err.message);
    }
  }

  // 3. Foundation reference
  console.error('[ONTOLOGY] Loading from foundation reference');
  return loadFoundationalOntology('standard');
}

module.exports = {
  ensureKnowledgeBaseDirs,
  copyRecursive,
  initializeKnowledgeBase,
  loadFoundationalOntology,
  loadOntologyFromMemory,
};
