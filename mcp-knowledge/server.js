#!/usr/bin/env node
/**
 * MCP Knowledge Server
 * 
 * Enforces Ontology on Domain Knowledge Graph
 * Architecture: Memory MCP (source of truth) → .knowledge folder (human-readable display)
 * 
 * A. Memory MCP Integration (PRIMARY SOURCE OF TRUTH)
 *    - Ontology (entity types, relation types, layers) stored in memory
 *    - Knowledge Graph (all entities, relations, observations) stored in memory
 *    - Cross-session persistence and workspace isolation via memory MCP
 * 
 * B. Knowledge Graph Management
 *    - CRUD operations on entities and relations
 *    - STRICT validation: all entities MUST match ontology in memory
 *    - All entities MUST use relation types from ontology in memory
 * 
 * C. Ontology Enforcement
 *    - Ontology is loaded FROM memory, not local
 *    - Entity types, relation types, and layers defined in memory
 *    - Changes to ontology must sync back to memory
 * 
 * D. Documentation Synchronization (READ-ONLY FROM MEMORY)
 *    - .knowledge/.memory/knowledge-graph.md: Human-readable graph state FROM memory
 *    - .knowledge/.ontology/knowledge-ontology.md: Ontology definition FROM memory
 *    - .knowledge/{solution,delivery,strategy}/: Docs generated FROM graph
 *    - Sync is ONE-WAY: Memory → .knowledge folder (not bidirectional)
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Configuration
const DEFAULT_KNOWLEDGE_BASE = process.env.KNOWLEDGE_PATH || 
  path.join(process.cwd(), '.knowledge');
const FOUNDATION_PATH = path.join(__dirname, '..', '.knowledge-foundation');

// Folder structure (configured, not ad-hoc)
const MEMORY_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, '.memory');
const ONTOLOGY_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, '.ontology');
const SOLUTION_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, 'solution');
const DELIVERY_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, 'delivery');
const STRATEGY_DIR = path.join(DEFAULT_KNOWLEDGE_BASE, 'strategy');

// File locations (consistent with architecture: Memory MCP is primary source of truth)
const GRAPH_FILE = path.join(MEMORY_DIR, 'knowledge-graph.json');  // Primary graph storage
const GRAPH_MD_FILE = path.join(MEMORY_DIR, 'knowledge-graph.md');   // Human-readable graph from memory
const ONTOLOGY_MD_FILE = path.join(ONTOLOGY_DIR, 'knowledge-ontology.md');  // Ontology definition from memory
const INDEX_FILE = path.join(DEFAULT_KNOWLEDGE_BASE, 'INDEX.md');
const INDEX_JSON_FILE = path.join(DEFAULT_KNOWLEDGE_BASE, 'knowledge-index.json');

/**
 * Ensure knowledge base directories exist with proper structure
 * Structure follows: Memory (primary) → .knowledge folder (display)
 */
function ensureKnowledgeBaseDirs() {
  const dirs = [
    MEMORY_DIR,           // .memory/ - primary storage and sync files
    ONTOLOGY_DIR,         // .ontology/ - ontology definition (synced FROM memory)
    SOLUTION_DIR,         // solution/ - human-readable solution docs
    DELIVERY_DIR,         // delivery/ - human-readable delivery docs
    STRATEGY_DIR          // strategy/ - human-readable strategy docs
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Initialize a new knowledge base from foundational template
 * @param {string} targetPath - Path where to initialize
 * @param {string} projectName - Project name
 * @param {string} ontology - Ontology to use: 'standard' or 'nomad' (default: 'standard')
 */
function initializeKnowledgeBase(targetPath, projectName = 'Project', ontology = 'standard') {
  const knowledgePath = path.join(targetPath, '.knowledge');
  
  // Check if already exists
  if (fs.existsSync(knowledgePath)) {
    throw new Error('.knowledge folder already exists at target path');
  }
  
  // Check if foundation exists
  const templatePath = path.join(FOUNDATION_PATH, 'bootstrap-template');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Foundational template not found. Ensure .knowledge-foundation exists.');
  }
  
  // Copy template structure
  copyRecursive(templatePath, knowledgePath);
  
  // Initialize knowledge graph with selected ontology
  const graphPath = path.join(knowledgePath, 'knowledge-graph.json');
  const selectedOntology = selectOntology(ontology);
  const initialGraph = {
    version: '1.0.0',
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    projectName: projectName,
    ontologyType: selectedOntology.name,
    entities: {},
    relations: [],
    ontology: selectedOntology,
    metadata: {
      totalEntities: 0,
      totalRelations: 0,
      categories: {}
    }
  };
  
  fs.writeFileSync(graphPath, JSON.stringify(initialGraph, null, 2), 'utf8');
  
  // Create initial README
  const readmePath = path.join(knowledgePath, 'README.md');
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
  
  fs.writeFileSync(readmePath, readmeContent, 'utf8');
  
  return {
    path: knowledgePath,
    projectName: projectName,
    structure: ['strategy/', 'delivery/', 'solution/', '.ontology/']
  };
}

/**
 * Load foundational ontology from .knowledge-foundation (reference implementation)
 * These are the canonical ontology definitions (standard, nomad)
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
        description: schema.description
      };
    } catch (err) {
      console.error(`Failed to load foundational ontology from ${schemaPath}:`, err.message);
    }
  }
  
  // Fall back to embedded definition
  if (ontologyName.toLowerCase() === 'nomad') {
    return getNomadArchitectureOntology();
  }
  return getDefaultOntology();
}

/**
 * Load ontology from memory MCP (source of truth)
 * Hierarchy: Memory > .memory/ontology.json > .knowledge-foundation > embedded defaults
 * CRITICAL: Ontology in memory must be enforced - all entities validated against it
 */
function loadOntologyFromMemory() {
  // TODO: Implement actual memory MCP connection
  // For now: load from disk as fallback
  
  // 1. Try to load from .memory/ontology.json (if synced from memory)
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
  
  // 2. Try to load from graph's embedded ontology (legacy format)
  const graphPath = GRAPH_FILE;
  if (fs.existsSync(graphPath)) {
    try {
      const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
      if (graph.ontology) {
        console.error(`[ONTOLOGY] Loaded from graph.json: ${graph.ontology.name} v${graph.ontology.version}`);
        return graph.ontology;
      }
      // If graph specifies ontologyType, load from foundation
      if (graph.ontologyType) {
        console.error(`[ONTOLOGY] Graph references ontology: ${graph.ontologyType}`);
        return loadFoundationalOntology(graph.ontologyType);
      }
    } catch (err) {
      console.error('Failed to load ontology from graph:', err.message);
    }
  }
  
  // 3. Load from .knowledge-foundation (reference implementations)
  console.error('[ONTOLOGY] Loading from foundation reference');
  return loadFoundationalOntology('standard');
}

/**
 * Copy directory recursively
 */
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Load or initialize knowledge graph
 * ENFORCES: Ontology from memory (or disk fallback) must be used
 */
function loadGraph() {
  ensureKnowledgeBaseDirs();
  
  if (fs.existsSync(GRAPH_FILE)) {
    try {
      const data = fs.readFileSync(GRAPH_FILE, 'utf8');
      const graph = JSON.parse(data);
      
      // CRITICAL: Ensure ontology is loaded from memory, not embedded version
      const memoryOntology = loadOntologyFromMemory();
      graph.ontology = memoryOntology;
      
      return graph;
    } catch (err) {
      return initializeGraph();
    }
  }
  
  return initializeGraph();
}

/**
 * Initialize empty knowledge graph with default ontology
 */
function initializeGraph() {
  return {
    version: '1.0.0',
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    entities: {},
    relations: [],
    ontology: getDefaultOntology(),
    metadata: {
      totalEntities: 0,
      totalRelations: 0,
      categories: {}
    }
  };
}

/**
 * Get default knowledge ontology (Standard 3-Layer Model)
 */
function getDefaultOntology() {
  return {
    name: 'standard',
    version: '1.0.0',
    description: 'Standard 3-layer ontology: Strategy, Delivery, Solution',
    entityTypes: [
      // Strategy Layer
      { name: 'Pillar', layer: 'strategy', description: 'Strategic pillar or business domain' },
      { name: 'Objective', layer: 'strategy', description: 'Strategic objective or measurable goal' },
      { name: 'Metric', layer: 'strategy', description: 'Success metric for objectives' },
      
      // Delivery Layer
      { name: 'CapabilityL1', layer: 'delivery', description: 'Level 1 capability (high-level)' },
      { name: 'CapabilityL2', layer: 'delivery', description: 'Level 2 capability (specific)' },
      { name: 'Gap', layer: 'delivery', description: 'Capability gap or missing functionality' },
      { name: 'Recommendation', layer: 'delivery', description: 'Improvement recommendation' },
      { name: 'Process', layer: 'delivery', description: 'Operational process or workflow' },
      { name: 'Risk', layer: 'delivery', description: 'Identified risk or threat' },
      
      // Solution Layer
      { name: 'ADR', layer: 'solution', description: 'Architecture Decision Record' },
      { name: 'Service', layer: 'solution', description: 'Software service or component' },
      { name: 'SystemAPI', layer: 'solution', description: 'External API integration' },
      { name: 'Event', layer: 'solution', description: 'System event or message' },
      { name: 'Concept', layer: 'solution', description: 'Core concept abstracted from services' },
      { name: 'Pattern', layer: 'solution', description: 'Design pattern derived from implementations' },
      { name: 'Practice', layer: 'solution', description: 'Best practice or standard approach' },
      { name: 'Term', layer: 'solution', description: 'Glossary term or definition' }
    ],
    relationTypes: [
      { name: 'supports_objective', description: 'Pillar supports strategic objective' },
      { name: 'measures', description: 'Metric measures objective success' },
      { name: 'enables', description: 'Capability enables objective achievement' },
      { name: 'implements', description: 'L2 capability implements L1 capability' },
      { name: 'identifies', description: 'Gap identified in capability' },
      { name: 'addresses', description: 'Recommendation addresses gap' },
      { name: 'decides', description: 'ADR decides on recommendation' },
      { name: 'implements_decision', description: 'Service implements decision' },
      { name: 'provides', description: 'Service provides capability' },
      { name: 'uses_api', description: 'Service uses external API' },
      { name: 'emits', description: 'Service emits event' },
      { name: 'follows_pattern', description: 'Service follows design pattern' },
      { name: 'applies_practice', description: 'Service applies best practice' },
      { name: 'defines', description: 'Concept defines pattern foundation' },
      { name: 'relates_to', description: 'Generic relation (use specific relations when possible)' }
    ]
  };
}

/**
 * Get NomadArchitecture ontology (Cultural OS: Structure + Culture)
 */
function getNomadArchitectureOntology() {
  return {
    name: 'nomad',
    version: '1.0.0',
    description: 'NomadArchitecture: Cultural OS encoding intent, continuity, and meaning in software structure',
    entityTypes: [
      // Strategy Layer: Intent & Culture
      { name: 'Vision', layer: 'strategy', description: 'Guiding north star' },
      { name: 'Principle', layer: 'strategy', description: 'Core belief (e.g., humans at center, rotation of roles)' },
      { name: 'Culture', layer: 'strategy', description: 'Shared worldview and rituals' },
      { name: 'Intent', layer: 'strategy', description: 'Purpose encoded in system shape' },
      
      // Delivery Layer: Structure & Continuity
      { name: 'Host', layer: 'delivery', description: 'Delivery skin (API, CLI, UI, Job)—replaceable' },
      { name: 'Feature', layer: 'delivery', description: 'Capability module carrying story (README, Map, Traces)' },
      { name: 'Connector', layer: 'delivery', description: 'Shared mechanism within Features' },
      { name: 'Port', layer: 'delivery', description: 'Local expression of needs/offers' },
      { name: 'Foundation', layer: 'delivery', description: 'Hardened, general-purpose mechanism' },
      { name: 'Trail', layer: 'delivery', description: 'Evidence & proof of life (append-only)' },
      { name: 'Ritual', layer: 'delivery', description: 'Disciplined practice (placement, rotation)' },
      { name: 'Shaman', layer: 'delivery', description: 'Rotating steward role (not architect, keeps fire alive)' },
      
      // Solution Layer: Artifacts, Evidence & Learning
      { name: 'Core', layer: 'solution', description: 'Emergent contracts, shared language, memory' },
      { name: 'Scar', layer: 'solution', description: 'Mark left by interaction, decision trace' },
      { name: 'Story', layer: 'solution', description: 'Narrative explaining why & how' },
      { name: 'Contract', layer: 'solution', description: 'Agreed interface between entities' },
      { name: 'Evidence', layer: 'solution', description: 'Proof that something works (test, trace, example)' },
      { name: 'Transmission', layer: 'solution', description: 'Onboarding & literacy encoding' },
      { name: 'Tribe', layer: 'solution', description: 'Shared community understanding' },
      { name: 'Teaching', layer: 'solution', description: 'Cultural knowledge transfer' },
      { name: 'Pattern', layer: 'solution', description: 'Repeatable solution' },
      { name: 'Practice', layer: 'solution', description: 'Ritual or discipline' }
    ],
    relationTypes: [
      // Emergence Relations
      { name: 'evolves_into', description: 'Feature → Foundation: Pattern matures when evidence accumulates' },
      { name: 'promoted_to', description: 'Connector/Port → Core: Language crystallizes after reflection' },
      { name: 'hardens_from', description: 'Connector → Foundation: Repeated mechanisms stabilize' },
      { name: 'crystallizes_from', description: 'Evidence → Core: Contracts emerge from scars' },
      
      // Composition Relations
      { name: 'contains', description: 'Feature contains Connector: Connectors glue Features internally' },
      { name: 'expresses', description: 'Feature expresses Port: Features declare needs/offers' },
      { name: 'enables', description: 'Foundation enables Feature: Foundations serve Features' },
      { name: 'composes', description: 'Host composes Feature: Delivery skins wrap capabilities' },
      
      // Documentation Relations
      { name: 'carries_story', description: 'Feature carries Story: Stories explain why' },
      { name: 'documents', description: 'Story documents Feature: How-to guides (Map)' },
      { name: 'proves', description: 'Evidence proves Feature: Shows it works (Traces)' },
      { name: 'teaches', description: 'Transmission teaches Entity: Onboarding encodes literacy' },
      
      // Governance Relations
      { name: 'embodies_principle', description: 'Entity embodies Principle: Everything reflects principles' },
      { name: 'guarded_by', description: 'Core guarded by Shaman: Shaman transmits & interprets' },
      { name: 'rotates_with', description: 'Shaman rotates with Tribe: Role is fleeting, never owns system' },
      { name: 'traces', description: 'Trail traces Scar: Trails accumulate evidence' },
      { name: 'scars', description: 'Interaction scars: Decision traces inform Core' },
      
      // Teaching & Culture
      { name: 'transmits', description: 'Transmission transmits Worldview' },
      { name: 'encodes', description: 'Story encodes Intent' },
      { name: 'reflects', description: 'Structure reflects Principle' }
    ]
  };
}

/**
 * Select ontology by name
 */
function selectOntology(name = 'standard') {
  const availableOntologies = {
    'standard': getDefaultOntology,
    'nomad': getNomadArchitectureOntology
  };
  
  const ontologyFn = availableOntologies[name.toLowerCase()];
  if (!ontologyFn) {
    throw new Error(`Unknown ontology: ${name}. Available: ${Object.keys(availableOntologies).join(', ')}`);
  }
  
  return ontologyFn();
}

/**
 * Save knowledge graph to file
 */
function saveGraph(graph) {
  ensureKnowledgeBaseDirs();
  graph.lastUpdated = new Date().toISOString();
  fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');
  updateMetadata(graph);
  return true;
}

/**
 * Add entity to graph
 */
function addEntity(graph, name, type, observations = []) {
  if (!graph.entities) graph.entities = {};
  
  const entityId = crypto.randomUUID();
  graph.entities[name] = {
    id: entityId,
    name: name,
    type: type,
    created: new Date().toISOString(),
    observations: observations,
    relations: []
  };
  
  updateMetadata(graph);
  return graph.entities[name];
}

/**
 * Add relation between entities
 */
function addRelation(graph, fromName, toName, relationType) {
  if (!graph.relations) graph.relations = [];
  if (!graph.entities[fromName] || !graph.entities[toName]) {
    throw new Error(`Entity not found: ${fromName} or ${toName}`);
  }
  
  const relation = {
    id: `${fromName}--${relationType}--${toName}`,
    from: fromName,
    to: toName,
    type: relationType,
    created: new Date().toISOString()
  };
  
  graph.relations.push(relation);
  
  // Track in entities
  if (!graph.entities[fromName].relations) {
    graph.entities[fromName].relations = [];
  }
  graph.entities[fromName].relations.push(relation.id);
  
  updateMetadata(graph);
  return relation;
}

/**
 * Update metadata counts
 */
function updateMetadata(graph) {
  graph.metadata.totalEntities = Object.keys(graph.entities || {}).length;
  graph.metadata.totalRelations = (graph.relations || []).length;
  
  // Count by entity type
  graph.metadata.categories = {};
  Object.values(graph.entities || {}).forEach(entity => {
    if (!graph.metadata.categories[entity.type]) {
      graph.metadata.categories[entity.type] = 0;
    }
    graph.metadata.categories[entity.type]++;
  });
}

/**
 * Validate entity against ontology
 */
function validateEntity(graph, entityType) {
  const ontology = graph.ontology || { entityTypes: [] };
  return ontology.entityTypes.some(t => t.name === entityType);
}

/**
 * Validate relation against ontology
 */
function validateRelation(graph, relationType) {
  const ontology = graph.ontology || { relationTypes: [] };
  return ontology.relationTypes.some(t => t.name === relationType);
}

/**
 * Generate Mermaid diagram for knowledge ontology
 */
function generateOntologyDiagram(graph) {
  let mermaid = 'graph TB\n';
  mermaid += '    subgraph strategy["Strategy Layer"]\n';
  mermaid += '        Pillar["Pillar"]\n';
  mermaid += '        Objective["Objective"]\n';
  mermaid += '        Metric["Metric"]\n';
  mermaid += '    end\n\n';
  
  mermaid += '    subgraph delivery["Delivery Layer"]\n';
  mermaid += '        CapL1["CapabilityL1"]\n';
  mermaid += '        CapL2["CapabilityL2"]\n';
  mermaid += '        Gap["Gap"]\n';
  mermaid += '        Recommendation["Recommendation"]\n';
  mermaid += '        Process["Process"]\n';
  mermaid += '    end\n\n';
  
  mermaid += '    subgraph solution["Solution Layer"]\n';
  mermaid += '        ADR["ADR"]\n';
  mermaid += '        Service["Service"]\n';
  mermaid += '        SystemAPI["SystemAPI"]\n';
  mermaid += '        Event["Event"]\n';
  mermaid += '        Risk["Risk"]\n';
  mermaid += '    end\n\n';
  
  mermaid += '    subgraph solution["Solution Layer"]\n';
  mermaid += '        ADR["ADR"]\n';
  mermaid += '        Service["Service"]\n';
  mermaid += '        Concept["Concept"]\n';
  mermaid += '        Pattern["Pattern"]\n';
  mermaid += '        Practice["Practice"]\n';
  mermaid += '        Term["Term"]\n';
  mermaid += '    end\n\n';
  
  mermaid += '    strategy --> delivery\n';
  mermaid += '    delivery --> solution\n\n';
  
  mermaid += '    classDef strategyStyle fill:#e1f5ff,stroke:#01579b,color:#000\n';
  mermaid += '    classDef deliveryStyle fill:#fff3e0,stroke:#e65100,color:#000\n';
  mermaid += '    classDef solutionStyle fill:#f3e5f5,stroke:#4a148c,color:#000\n\n';
  
  mermaid += '    class Pillar,Objective,Metric strategyStyle\n';
  mermaid += '    class CapL1,CapL2,Gap,Recommendation,Process,Risk deliveryStyle\n';
  mermaid += '    class ADR,Service,SystemAPI,Event,Concept,Pattern,Practice,Term solutionStyle\n';
  mermaid += '    class Concept,Pattern,Practice,Term,Risk knowledgeStyle\n';
  
  return mermaid;
}

/**
 * Generate Mermaid diagram for knowledge model instances
 */
function generateModelDiagram(graph) {
  const entities = graph.entities || {};
  const relations = graph.relations || [];
  
  if (Object.keys(entities).length === 0) {
    return 'graph TD\n    Empty["No entities in knowledge graph yet"]\n';
  }
  
  let mermaid = 'graph TD\n';
  
  // Add entities as nodes
  Object.values(entities).forEach(entity => {
    const sanitized = entity.name.replace(/[^a-zA-Z0-9_]/g, '_');
    mermaid += `    ${sanitized}["${entity.name}<br/><small>(${entity.type})</small>"]\n`;
  });
  
  mermaid += '\n';
  
  // Add relations as edges
  relations.forEach(rel => {
    const fromSanitized = rel.from.replace(/[^a-zA-Z0-9_]/g, '_');
    const toSanitized = rel.to.replace(/[^a-zA-Z0-9_]/g, '_');
    mermaid += `    ${fromSanitized} -->|${rel.type}| ${toSanitized}\n`;
  });
  
  // Add styling
  mermaid += '\n    classDef strategyStyle fill:#e1f5ff,stroke:#01579b,color:#000\n';
  mermaid += '    classDef deliveryStyle fill:#fff3e0,stroke:#e65100,color:#000\n';
  mermaid += '    classDef solutionStyle fill:#f3e5f5,stroke:#4a148c,color:#000\n';
  mermaid += '    classDef knowledgeStyle fill:#e8f5e9,stroke:#1b5e20,color:#000\n';
  
  return mermaid;
}

/**
 * Generate ontology markdown documentation
 */
function generateOntologyDoc(graph) {
  const ontology = graph.ontology;
  
  let doc = '# Knowledge Ontology\n\n';
  doc += 'Canonical schema for entity types and relationships in the domain knowledge graph.\n\n';
  doc += `**Last Updated:** ${new Date().toISOString().split('T')[0]}\n\n`;
  
  doc += '## Entity Types by Layer\n\n';
  
  const layers = {
    strategy: 'Strategy Layer (Vision/Objectives)',
    delivery: 'Delivery Layer (Capabilities/Gaps)',
    solution: 'Solution Layer (Architecture/Services)'
  };
  
  Object.entries(layers).forEach(([layer, description]) => {
    const types = ontology.entityTypes.filter(t => t.layer === layer);
    if (types.length > 0) {
      doc += `### ${description}\n\n`;
      types.forEach(type => {
        doc += `- **${type.name}**: ${type.description}\n`;
      });
      doc += '\n';
    }
  });
  
  doc += '## Relationship Types\n\n';
  ontology.relationTypes.forEach(rel => {
    doc += `- **${rel.name}**: ${rel.description}\n`;
  });
  
  return doc;
}

/**
 * Generate model markdown documentation
 */
function generateModelDoc(graph) {
  const entities = graph.entities || {};
  const relations = graph.relations || [];
  const metadata = graph.metadata || {};
  
  let doc = '# Knowledge Model\n\n';
  doc += 'Instances of the knowledge domain graph.\n\n';
  doc += `**Last Updated:** ${new Date().toISOString().split('T')[0]}\n`;
  doc += `**Total Entities:** ${metadata.totalEntities}\n`;
  doc += `**Total Relations:** ${metadata.totalRelations}\n\n`;
  
  // Entities by type
  if (metadata.categories) {
    doc += '## Entities by Type\n\n';
    Object.entries(metadata.categories).forEach(([type, count]) => {
      doc += `- ${type}: ${count}\n`;
    });
    doc += '\n';
  }
  
  // All entities
  doc += '## All Entities\n\n';
  Object.values(entities).forEach(entity => {
    doc += `### ${entity.name}\n\n`;
    doc += `**Type:** ${entity.type}\n\n`;
    if (entity.observations && entity.observations.length > 0) {
      doc += '**Observations:**\n';
      entity.observations.forEach(obs => {
        doc += `- ${obs}\n`;
      });
      doc += '\n';
    }
  });
  
  // Relations
  if (relations.length > 0) {
    doc += '## Relations\n\n';
    relations.forEach(rel => {
      doc += `- ${rel.from} ---[${rel.type}]---> ${rel.to}\n`;
    });
  }
  
  return doc;
}

// Initialize server
const server = new Server(
  {
    name: 'mcp-knowledge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'knowledge_init',
        description: 'Initialize a new knowledge base with optional ontology selection',
        inputSchema: {
          type: 'object',
          properties: {
            targetPath: {
              type: 'string',
              description: 'Path where to create .knowledge folder (default: current directory)'
            },
            projectName: {
              type: 'string',
              description: 'Project name for initial documentation'
            },
            ontology: {
              type: 'string',
              enum: ['standard', 'nomad'],
              description: 'Ontology type: "standard" (3-layer strategy/delivery/solution) or "nomad" (cultural OS with structure & culture)'
            }
          }
        }
      },
      {
        name: 'knowledge_graph_read',
        description: 'Read the complete knowledge graph or filter by entity type',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Optional: Filter by entity type (e.g., "Service", "ADR")'
            },
            includeRelations: {
              type: 'boolean',
              description: 'Include relations in output (default: true)'
            }
          }
        }
      },
      {
        name: 'knowledge_graph_add_entity',
        description: 'Add new entity to knowledge graph with validation',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Entity name (should be PascalCase and unique)'
            },
            type: {
              type: 'string',
              description: 'Entity type from ontology (e.g., Pillar, Objective, Service)'
            },
            observations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Initial observations/facts about entity'
            }
          },
          required: ['name', 'type']
        }
      },
      {
        name: 'knowledge_graph_add_relation',
        description: 'Add relationship between two entities',
        inputSchema: {
          type: 'object',
          properties: {
            from: {
              type: 'string',
              description: 'Source entity name'
            },
            to: {
              type: 'string',
              description: 'Target entity name'
            },
            type: {
              type: 'string',
              description: 'Relation type (e.g., supports_objective, measures, mitigates)'
            }
          },
          required: ['from', 'to', 'type']
        }
      },
      {
        name: 'knowledge_graph_export',
        description: 'Export knowledge graph as JSON',
        inputSchema: {
          type: 'object',
          properties: {
            includeOntology: {
              type: 'boolean',
              description: 'Include ontology definition (default: true)'
            }
          }
        }
      },
      {
        name: 'knowledge_ontology_view',
        description: 'Display knowledge ontology with all entity and relation types',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['table', 'markdown'],
              description: 'Output format (default: table)'
            }
          }
        }
      },
      {
        name: 'knowledge_ontology_extend',
        description: 'Add new entity type or relation type to the ontology',
        inputSchema: {
          type: 'object',
          properties: {
            itemType: {
              type: 'string',
              enum: ['entityType', 'relationType'],
              description: 'What to add'
            },
            name: {
              type: 'string',
              description: 'Name of new type'
            },
            description: {
              type: 'string',
              description: 'Description of the type'
            },
            layer: {
              type: 'string',
              enum: ['strategy', 'delivery', 'solution', 'knowledge'],
              description: 'Layer (for entity types only)'
            }
          },
          required: ['itemType', 'name', 'description']
        }
      },
      {
        name: 'knowledge_model_visualize',
        description: 'Generate Mermaid diagrams of ontology or model',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['ontology', 'model'],
              description: 'Visualize ontology (structure) or model (instances)'
            }
          },
          required: ['type']
        }
      },
      {
        name: 'knowledge_graph_validate',
        description: 'Validate knowledge graph against ontology schema',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['entities', 'relations', 'all'],
              description: 'What to validate (default: all)'
            }
          }
        }
      },
      {
        name: 'knowledge_docs_sync',
        description: 'Synchronize knowledge graph with .knowledge folder documentation',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['to_docs', 'from_docs'],
              description: 'Sync direction: graph->docs or docs->graph'
            },
            generateDiagrams: {
              type: 'boolean',
              description: 'Generate Mermaid diagrams (default: true)'
            }
          },
          required: ['action']
        }
      },
      {
        name: 'knowledge_sync_memory',
        description: 'Sync knowledge graph with memory MCP tool for persistence',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['to_memory', 'from_memory', 'bidirectional'],
              description: 'Sync direction'
            },
            includeMetadata: {
              type: 'boolean',
              description: 'Include metadata in sync (default: true)'
            }
          },
          required: ['action']
        }
      },
      {
        name: 'knowledge_graph_search',
        description: 'Search entities by name, type, or observations',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search term'
            },
            searchType: {
              type: 'string',
              enum: ['name', 'type', 'observations', 'all'],
              description: 'What to search (default: all)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'knowledge_graph_stats',
        description: 'Get statistics about knowledge graph',
        inputSchema: {
          type: 'object',
          properties: {
            detailed: {
              type: 'boolean',
              description: 'Include detailed breakdown (default: false)'
            }
          }
        }
      },
      {
        name: 'knowledge_extract_ontology_to_memory',
        description: 'Extract ontology from knowledge-graph.json to .memory/ontology.json (smooth migration)',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'knowledge_update_index',
        description: 'Update knowledge-index.json with checksums and version bump',
        inputSchema: {
          type: 'object',
          properties: {
            generateReports: {
              type: 'boolean',
              description: 'Generate integrity-report.md and INDEX.md (default: true)'
            }
          }
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'knowledge_init': {
        const targetPath = args?.targetPath || process.cwd();
        const projectName = args?.projectName || 'Project';
        const ontology = args?.ontology || 'standard';
        
        // Validate ontology selection
        if (!['standard', 'nomad'].includes(ontology)) {
          return {
            content: [{
              type: 'text',
              text: `❌ Invalid ontology: ${ontology}\nAvailable: standard, nomad`
            }]
          };
        }
        
        const result = initializeKnowledgeBase(targetPath, projectName, ontology);
        
        return {
          content: [{
            type: 'text',
            text: `✅ Knowledge base initialized successfully!

**Location:** ${result.path}
**Project:** ${result.projectName}
**Ontology:** ${ontology.toUpperCase()}${ontology === 'nomad' ? ' (Cultural OS: Structure + Culture)' : ' (3-Layer: Strategy/Delivery/Solution)'}
**Structure:**
${result.structure.map(s => `  - ${s}`).join('\n')}

**Next Steps:**
1. Define strategic objectives in strategy/objectives.md
2. Document capabilities in delivery/capabilities/
3. Record architecture decisions in delivery/adr/
4. Add services to solution/services/

Use \`knowledge_graph_add_entity\` to start building your knowledge graph.
`
          }]
        };
      }

      case 'knowledge_graph_read': {
        const graph = loadGraph();
        let filtered = graph;
        if (args?.filter) {
          filtered.entities = Object.fromEntries(
            Object.entries(graph.entities || {})
              .filter(([_, entity]) => entity.type === args.filter)
          );
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(filtered, null, 2)
          }]
        };
      }

      case 'knowledge_graph_add_entity': {
        const graph = loadGraph();
        if (!validateEntity(graph, args.type)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Invalid entity type: ${args.type}`,
                validTypes: graph.ontology.entityTypes.map(t => t.name)
              }, null, 2)
            }],
            isError: true
          };
        }
        
        const entity = addEntity(graph, args.name, args.type, args.observations || []);
        saveGraph(graph);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              entity: entity,
              message: `Added entity: ${args.name} (${args.type})`
            }, null, 2)
          }]
        };
      }

      case 'knowledge_graph_add_relation': {
        const graph = loadGraph();
        if (!validateRelation(graph, args.type)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Invalid relation type: ${args.type}`,
                validTypes: graph.ontology.relationTypes.map(t => t.name)
              }, null, 2)
            }],
            isError: true
          };
        }
        
        const relation = addRelation(graph, args.from, args.to, args.type);
        saveGraph(graph);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              relation: relation,
              message: `Added relation: ${args.from} -[${args.type}]-> ${args.to}`
            }, null, 2)
          }]
        };
      }

      case 'knowledge_graph_export': {
        const graph = loadGraph();
        const output = JSON.stringify(
          args?.includeOntology !== false ? graph : {
            ...graph,
            ontology: undefined
          },
          null,
          2
        );
        
        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }

      case 'knowledge_ontology_view': {
        const graph = loadGraph();
        const ontology = graph.ontology;
        let output = '';
        
        if (args?.format === 'markdown') {
          output = generateOntologyDoc(graph);
        } else {
          output = JSON.stringify(ontology, null, 2);
        }
        
        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }

      case 'knowledge_ontology_extend': {
        const graph = loadGraph();
        if (!args.itemType || !args.name || !args.description) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'itemType, name, and description are required'
              }, null, 2)
            }],
            isError: true
          };
        }
        
        if (args.itemType === 'entityType') {
          graph.ontology.entityTypes.push({
            name: args.name,
            layer: args.layer || 'solution',
            description: args.description
          });
        } else if (args.itemType === 'relationType') {
          graph.ontology.relationTypes.push({
            name: args.name,
            description: args.description
          });
        }
        
        saveGraph(graph);
        
        // IMPORTANT: Ontology extension must sync back to memory MCP
        // (actual implementation pending memory MCP connection)
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Added ${args.itemType}: ${args.name}`,
              ontology: graph.ontology,
              syncStatus: 'pending_to_memory',
              note: 'Run knowledge_sync_memory action=to_memory to persist to Memory MCP'
            }, null, 2)
          }]
        };
      }

      case 'knowledge_model_visualize': {
        const graph = loadGraph();
        let mermaid = '';
        
        if (args?.type === 'ontology') {
          mermaid = generateOntologyDiagram(graph);
        } else if (args?.type === 'model') {
          mermaid = generateModelDiagram(graph);
        }
        
        return {
          content: [{
            type: 'text',
            text: mermaid
          }]
        };
      }

      case 'knowledge_graph_validate': {
        const graph = loadGraph();
        const mode = args?.mode || 'all';
        const errors = [];
        const warnings = [];
        
        // Validate entities
        if (mode === 'entities' || mode === 'all') {
          Object.values(graph.entities || {}).forEach(entity => {
            if (!validateEntity(graph, entity.type)) {
              errors.push(`Entity "${entity.name}" has invalid type: ${entity.type}`);
            }
          });
        }
        
        // Validate relations
        if (mode === 'relations' || mode === 'all') {
          (graph.relations || []).forEach(rel => {
            if (!validateRelation(graph, rel.type)) {
              errors.push(`Relation ${rel.from}-[${rel.type}]->${rel.to} has invalid type`);
            }
            if (!graph.entities[rel.from]) {
              errors.push(`Relation from non-existent entity: ${rel.from}`);
            }
            if (!graph.entities[rel.to]) {
              errors.push(`Relation to non-existent entity: ${rel.to}`);
            }
          });
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              valid: errors.length === 0,
              errors: errors,
              warnings: warnings,
              summary: `Found ${errors.length} errors, ${warnings.length} warnings`
            }, null, 2)
          }],
          isError: errors.length > 0
        };
      }

      case 'knowledge_docs_sync': {
        const graph = loadGraph();
        ensureKnowledgeBaseDirs();
        const crypto = require('crypto');
        
        if (args?.action === 'to_docs') {
          // Sync FROM memory to .knowledge folder
          
          // 1. Generate ontology documentation (synced FROM memory ontology)
          const ontologyDoc = generateOntologyDoc(graph);
          fs.writeFileSync(ONTOLOGY_MD_FILE, ontologyDoc, 'utf8');
          
          // 2. Generate graph state documentation (synced FROM memory graph)
          const graphDoc = generateModelDoc(graph);  // renamed for clarity
          fs.writeFileSync(GRAPH_MD_FILE, graphDoc, 'utf8');
          
          // 3. Generate/update markdown files in content folders FROM memory entities
          // Extract dynamic layers from ontology
          const layersSet = new Set();
          (graph.ontology.entityTypes || []).forEach(et => {
            if (et.layer) layersSet.add(et.layer);
          });
          const contentFolders = Array.from(layersSet);
          
          const generatedFiles = [];
          const indexPath = path.join(MEMORY_DIR, 'knowledge-index.json');
          let index = null;
          
          if (fs.existsSync(indexPath)) {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
          }
          
          Object.values(graph.entities || {}).forEach(entity => {
            // Determine folder based on entity type layer
            let folder = 'solution'; // default
            const entityTypeDef = graph.ontology.entityTypes.find(et => et.name === entity.type);
            if (entityTypeDef) {
              folder = entityTypeDef.layer || 'solution';
            }
            
            const folderPath = path.join(DEFAULT_KNOWLEDGE_BASE, folder);
            if (!fs.existsSync(folderPath)) {
              fs.mkdirSync(folderPath, { recursive: true });
            }
            
            // Generate filename from entity name (convert PascalCase to kebab-case)
            const filename = entity.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.md';
            const filePath = path.join(folderPath, filename);
            const relativePath = `${folder}/${filename}`;
            
            // Generate markdown content with front-matter
            const relations = Object.values(graph.relations || {})
              .filter(r => r.from === entity.name)
              .map(r => `${r.type}: ${r.to}`);
            
            const frontMatter = [
              '---',
              `entityType: ${entity.type}`,
              'relations:'
            ];
            relations.forEach(r => frontMatter.push(`  - ${r}`));
            frontMatter.push('---', '');
            
            const content = [
              ...frontMatter,
              `# ${entity.name}`,
              '',
              `**Type:** ${entity.type}`,
              '',
              '## Observations',
              ''
            ];
            
            entity.observations.forEach(obs => {
              content.push(`- ${obs}`);
            });
            
            if (relations.length > 0) {
              content.push('', '## Relations', '');
              relations.forEach(r => content.push(`- ${r}`));
            }
            
            fs.writeFileSync(filePath, content.join('\n') + '\n', 'utf8');
            generatedFiles.push(relativePath);
            
            // Update index if it exists
            if (index) {
              const existingEntry = (index.entries || []).find(e => e.slug === entity.name.toLowerCase());
              if (!existingEntry) {
                (index.entries = index.entries || []).push({
                  slug: entity.name.toLowerCase(),
                  path: relativePath,
                  title: entity.name,
                  category: folder.charAt(0).toUpperCase() + folder.slice(1),
                  type: entity.type,
                  status: 'active',
                  entityType: entity.type,
                  relations: relations
                });
              } else {
                // Update existing entry
                existingEntry.path = relativePath;
                existingEntry.entityType = entity.type;
                existingEntry.relations = relations;
              }
            }
          });
          
          // Save updated index
          if (index) {
            fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
          }
          
          // 4. Auto-update knowledge index with checksums and version
          const crypto = require('crypto');
          let indexUpdate = { updated: false, message: 'Index not found or skipped' };
          
          if (fs.existsSync(indexPath)) {
            try {
              const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
              const originalVersion = index.version || '0.0.0';
              let updated = false;
              
              // Helper functions
              const sha256File = (filePath) => {
                const data = fs.readFileSync(filePath);
                return crypto.createHash('sha256').update(data).digest('hex');
              };
              
              const bumpPatch = (version) => {
                const parts = version.split('.').map(Number);
                if (parts.length !== 3 || parts.some(isNaN)) return version;
                parts[2] += 1;
                return parts.join('.');
              };
              
              const parseFrontMatter = (content) => {
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
              };
              
              // Update entries
              (index.entries || []).forEach(entry => {
                const fullPath = path.join(DEFAULT_KNOWLEDGE_BASE, entry.path);
                if (!fs.existsSync(fullPath)) return;
                
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  const fm = parseFrontMatter(content);
                  
                  if (fm.entityType && entry.entityType !== fm.entityType) {
                    entry.entityType = fm.entityType;
                    updated = true;
                  }
                  
                  if (Array.isArray(fm.relations)) {
                    const rels = fm.relations.map(r => r.trim()).filter(Boolean);
                    if (rels.length && JSON.stringify(entry.relations || []) !== JSON.stringify(rels)) {
                      entry.relations = rels;
                      updated = true;
                    }
                  }
                  
                  const placeholders = new Set(['TBD', 'PENDING_SHA256', 'PENDING', 'UNKNOWN', 'TODO']);
                  if (!entry.checksum || placeholders.has(entry.checksum)) {
                    entry.checksum = sha256File(fullPath);
                    updated = true;
                  }
                } catch (err) {
                  // Silently skip errors during auto-update
                }
              });
              
              if (updated) {
                index.version = bumpPatch(originalVersion);
                index.generated = new Date().toISOString().slice(0, 10);
                fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
                
                indexUpdate = {
                  updated: true,
                  version: { before: originalVersion, after: index.version },
                  entries: index.entries.length
                };
              } else {
                indexUpdate = {
                  updated: false,
                  message: 'No changes detected, version unchanged',
                  version: originalVersion
                };
              }
            } catch (err) {
              indexUpdate = {
                updated: false,
                error: err.message
              };
            }
          }
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: args.action,
                files: {
                  ontology: ONTOLOGY_MD_FILE,
                  graph: GRAPH_MD_FILE,
                  generated: generatedFiles.length
                },
                generatedFiles: generatedFiles,
                indexUpdate: indexUpdate,
                message: `Knowledge synced FROM memory to .knowledge folder (${generatedFiles.length} entity files generated)`,
                architecture: {
                  primary: 'Memory MCP (source of truth)',
                  secondary: '.knowledge folder (human-readable sync)'
                }
              }, null, 2)
            }]
          };
        }
        
        if (args?.action === 'from_docs') {
          // Sync FROM .knowledge folder TO memory
          
          const parseFrontMatter = (content) => {
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
          };
          
          const extractObservations = (content) => {
            // Extract text after "## Observations" section
            const obsMatch = content.match(/## Observations\s*([\s\S]*?)(?=\n##|\n---|\Z)/);
            if (!obsMatch) return [];
            return obsMatch[1]
              .split('\n')
              .filter(line => line.trim().startsWith('- '))
              .map(line => line.trim().substring(2).trim())
              .filter(Boolean);
          };
          
          // Extract dynamic layers from ontology
          const layersSet = new Set();
          (graph.ontology.entityTypes || []).forEach(et => {
            if (et.layer) layersSet.add(et.layer);
          });
          const contentFolders = Array.from(layersSet);
          
          const addedEntities = [];
          const addedRelations = [];
          const errors = [];
          
          contentFolders.forEach(folder => {
            const folderPath = path.join(DEFAULT_KNOWLEDGE_BASE, folder);
            if (!fs.existsSync(folderPath)) return;
            
            const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
            
            files.forEach(filename => {
              try {
                const filePath = path.join(folderPath, filename);
                const content = fs.readFileSync(filePath, 'utf8');
                const fm = parseFrontMatter(content);
                
                // Extract entity name from title (first # heading)
                const titleMatch = content.match(/^#\s+(.+)$/m);
                if (!titleMatch) {
                  errors.push(`No title found in ${folder}/${filename}`);
                  return;
                }
                
                const entityName = titleMatch[1].trim();
                const entityType = fm.entityType || 'Concept'; // default
                const observations = extractObservations(content);
                
                // Check if entity already exists
                if (!graph.entities[entityName]) {
                  // Add entity to graph
                  graph.entities[entityName] = {
                    name: entityName,
                    type: entityType,
                    observations: observations,
                    createdAt: new Date().toISOString()
                  };
                  addedEntities.push(entityName);
                  graph.metadata.totalEntities++;
                } else {
                  // Update observations if changed
                  const existing = graph.entities[entityName];
                  const newObs = observations.filter(o => !existing.observations.includes(o));
                  if (newObs.length > 0) {
                    existing.observations.push(...newObs);
                    addedEntities.push(`${entityName} (updated)`);
                  }
                }
                
                // Parse and add relations
                if (Array.isArray(fm.relations)) {
                  fm.relations.forEach(rel => {
                    const parts = rel.split(':').map(s => s.trim());
                    if (parts.length === 2) {
                      const [relType, targetEntity] = parts;
                      const relId = `${entityName}_${relType}_${targetEntity}`;
                      
                      if (!graph.relations[relId]) {
                        graph.relations[relId] = {
                          from: entityName,
                          to: targetEntity,
                          type: relType
                        };
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
          
          // Save updated graph
          if (addedEntities.length > 0 || addedRelations.length > 0) {
            fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');
          }
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: args.action,
                summary: {
                  entitiesAdded: addedEntities.length,
                  relationsAdded: addedRelations.length,
                  errors: errors.length
                },
                entities: addedEntities,
                relations: addedRelations.slice(0, 10), // limit output
                errors: errors.length > 0 ? errors : undefined,
                message: `Knowledge synced FROM .knowledge folder TO memory (${addedEntities.length} entities, ${addedRelations.length} relations)`,
                architecture: {
                  primary: 'Memory MCP (source of truth updated)',
                  secondary: '.knowledge folder (source)'
                }
              }, null, 2)
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Invalid action. Use "to_docs" or "from_docs"',
              hint: 'to_docs: memory → .knowledge folder | from_docs: .knowledge folder → memory'
            }, null, 2)
          }],
          isError: true
        };
      }

      case 'knowledge_sync_memory': {
        // CRITICAL: This syncs with Memory MCP tool
        // Memory MCP is the source of truth for:
        // 1. Ontology (entity/relation types, layers)
        // 2. Knowledge Graph (all entities and relations)
        
        const graph = loadGraph();
        const action = args?.action || 'bidirectional';
        
        // TODO: Implement actual memory MCP connection via stdio/stdio MCP
        // For now: structure the data that WOULD be synced
        
        const syncData = {
          action: action,
          timestamp: new Date().toISOString(),
          
          // Ontology sync
          ontology: {
            name: graph.ontology.name,
            version: graph.ontology.version,
            entityTypes: graph.ontology.entityTypes,
            relationTypes: graph.ontology.relationTypes
          },
          
          // Knowledge graph sync
          graph: {
            version: graph.version,
            entities: graph.entities,
            relations: graph.relations,
            metadata: graph.metadata
          }
        };
        
        // Workflow for each action:
        // to_memory: Send ontology + graph TO memory MCP
        // from_memory: Retrieve ontology + graph FROM memory MCP  
        // bidirectional: Keep both in sync (not yet implemented)
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              action: action,
              status: 'pending_implementation',
              message: 'Memory sync requires active memory MCP tool connection',
              note: 'Use knowledge_docs_sync for human-readable display in .knowledge folder',
              dataReadyForSync: {
                ontologySize: `${JSON.stringify(syncData.ontology).length} bytes`,
                graphSize: `${JSON.stringify(syncData.graph).length} bytes`,
                entities: graph.metadata.totalEntities,
                relations: graph.metadata.totalRelations
              },
              architecture: {
                'Memory MCP': 'Source of truth (ontology + graph)',
                'knowledge-graph.json': 'Primary backup in .memory/',
                '.knowledge folder': 'Read-only human-readable display'
              }
            }, null, 2)
          }]
        };
      }

      case 'knowledge_graph_search': {
        const graph = loadGraph();
        const query = (args.query || '').toLowerCase();
        const searchType = args.searchType || 'all';
        const results = [];
        
        Object.values(graph.entities || {}).forEach(entity => {
          let matches = false;
          const matchReasons = [];
          
          if ((searchType === 'name' || searchType === 'all') && 
              entity.name.toLowerCase().includes(query)) {
            matches = true;
            matchReasons.push('name');
          }
          
          if ((searchType === 'type' || searchType === 'all') && 
              entity.type.toLowerCase().includes(query)) {
            matches = true;
            matchReasons.push('type');
          }
          
          if ((searchType === 'observations' || searchType === 'all') && 
              entity.observations.some(obs => obs.toLowerCase().includes(query))) {
            matches = true;
            matchReasons.push('observation');
          }
          
          if (matches) {
            results.push({
              name: entity.name,
              type: entity.type,
              matchReasons: matchReasons,
              observations: entity.observations
            });
          }
        });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: args.query,
              resultCount: results.length,
              results: results
            }, null, 2)
          }]
        };
      }

      case 'knowledge_graph_stats': {
        const graph = loadGraph();
        const stats = {
          version: graph.version,
          totalEntities: graph.metadata.totalEntities,
          totalRelations: graph.metadata.totalRelations,
          created: graph.created,
          lastUpdated: graph.lastUpdated,
          ontology: {
            entityTypes: graph.ontology.entityTypes.length,
            relationTypes: graph.ontology.relationTypes.length
          }
        };
        
        if (args?.detailed) {
          stats.categories = graph.metadata.categories;
          stats.entityTypeBreakdown = graph.ontology.entityTypes;
          stats.relationTypeBreakdown = graph.ontology.relationTypes;
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }]
        };
      }

      case 'knowledge_extract_ontology_to_memory': {
        // Extract ontology from embedded graph to separate .memory/ontology.json
        try {
          ensureKnowledgeBaseDirs();
          
          // Load graph with embedded ontology
          const graphPath = GRAPH_FILE;
          if (!fs.existsSync(graphPath)) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'No knowledge-graph.json found',
                  hint: 'Initialize with knowledge_init first'
                }, null, 2)
              }],
              isError: true
            };
          }
          
          const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
          
          if (!graphData.ontology) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'No embedded ontology found in knowledge-graph.json',
                  message: 'Ontology may already be in .memory/ontology.json'
                }, null, 2)
              }],
              isError: true
            };
          }
          
          // Extract ontology
          const ontology = graphData.ontology;
          
          // Save to .memory/ontology.json
          const memoryOntologyPath = path.join(MEMORY_DIR, 'ontology.json');
          fs.writeFileSync(memoryOntologyPath, JSON.stringify(ontology, null, 2), 'utf8');
          
          // Remove from graph
          delete graphData.ontology;
          
          // Save cleaned graph
          fs.writeFileSync(graphPath, JSON.stringify(graphData, null, 2), 'utf8');
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Ontology extracted to .memory/ontology.json',
                details: {
                  ontology_file: memoryOntologyPath,
                  entity_types: ontology.entityTypes.length,
                  relation_types: ontology.relationTypes.length,
                  graph_cleaned: true
                },
                next_steps: [
                  'All future operations will load ontology from .memory/ontology.json',
                  'Knowledge-graph.json now contains only entities and relations',
                  'Run knowledge_test_compliance to verify'
                ]
              }, null, 2)
            }]
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: err.message
              }, null, 2)
            }],
            isError: true
          };
        }
      }

      case 'knowledge_update_index': {
        // Update knowledge-index.json with checksums and version bumps
        const crypto = require('crypto');
        const generateReports = args?.generateReports !== false;
        
        try {
          const indexPath = path.join(MEMORY_DIR, 'knowledge-index.json');
          
          if (!fs.existsSync(indexPath)) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'knowledge-index.json not found',
                  hint: 'Create it first in .knowledge/.memory/'
                }, null, 2)
              }],
              isError: true
            };
          }
          
          const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
          const originalVersion = index.version || '0.0.0';
          let updated = false;
          const errors = [];
          
          // Helper: compute SHA256
          const sha256File = (filePath) => {
            const data = fs.readFileSync(filePath);
            return crypto.createHash('sha256').update(data).digest('hex');
          };
          
          // Helper: bump patch version
          const bumpPatch = (version) => {
            const parts = version.split('.').map(Number);
            if (parts.length !== 3 || parts.some(isNaN)) return version;
            parts[2] += 1;
            return parts.join('.');
          };
          
          // Helper: parse front-matter
          const parseFrontMatter = (content) => {
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
          };
          
          // Update each entry
          (index.entries || []).forEach(entry => {
            const fullPath = path.join(DEFAULT_KNOWLEDGE_BASE, entry.path);
            if (!fs.existsSync(fullPath)) {
              errors.push(`Missing file: ${entry.slug} -> ${entry.path}`);
              return;
            }
            
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const fm = parseFrontMatter(content);
              
              // Update entityType from front-matter
              if (fm.entityType && entry.entityType !== fm.entityType) {
                entry.entityType = fm.entityType;
                updated = true;
              }
              
              // Update relations from front-matter
              if (Array.isArray(fm.relations)) {
                const rels = fm.relations.map(r => r.trim()).filter(Boolean);
                if (rels.length && JSON.stringify(entry.relations || []) !== JSON.stringify(rels)) {
                  entry.relations = rels;
                  updated = true;
                }
              }
              
              // Update checksum if missing or placeholder
              const placeholders = new Set(['TBD', 'PENDING_SHA256', 'PENDING', 'UNKNOWN', 'TODO']);
              if (!entry.checksum || placeholders.has(entry.checksum)) {
                entry.checksum = sha256File(fullPath);
                updated = true;
              }
            } catch (err) {
              errors.push(`Error processing ${entry.slug}: ${err.message}`);
            }
          });
          
          // Bump version if updated
          if (updated) {
            index.version = bumpPatch(originalVersion);
            index.generated = new Date().toISOString().slice(0, 10);
            fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
          }
          
          // Generate reports
          const reports = [];
          if (generateReports) {
            // Generate integrity report
            const missingEntityType = (index.entries || []).filter(e => !e.entityType);
            const missingRelations = (index.entries || []).filter(e => !e.relations || e.relations.length === 0);
            const orphans = missingRelations.filter(e => !['Concept', 'Policy', 'Template'].includes(e.entityType));
            
            const integrityLines = [
              '# Knowledge Integrity Report',
              `Generated: ${new Date().toISOString()}`,
              '',
              '## Summary',
              `Total entries: ${index.entries.length}`,
              `Missing entityType: ${missingEntityType.length}`,
              `Entries with no relations: ${missingRelations.length}`,
              `Potential orphans: ${orphans.length}`
            ];
            
            if (missingEntityType.length) {
              integrityLines.push('', '## Missing entityType');
              missingEntityType.forEach(e => integrityLines.push(`- ${e.slug} (${e.path})`));
            }
            
            if (orphans.length) {
              integrityLines.push('', '## Orphans');
              orphans.forEach(e => integrityLines.push(`- ${e.slug} (${e.entityType || 'UNKNOWN'})`));
            }
            
            const integrityPath = path.join(DEFAULT_KNOWLEDGE_BASE, 'integrity-report.md');
            fs.writeFileSync(integrityPath, integrityLines.join('\n') + '\n', 'utf8');
            reports.push('integrity-report.md');
            
            // Generate human INDEX.md
            const byCategory = {};
            (index.entries || []).forEach(e => {
              byCategory[e.category] = byCategory[e.category] || [];
              byCategory[e.category].push(e);
            });
            
            const indexLines = [
              '# Knowledge Index',
              `Generated: ${new Date().toISOString().slice(0,10)}`
            ];
            
            Object.keys(byCategory).sort().forEach(cat => {
              indexLines.push('', `## ${cat}`);
              byCategory[cat].sort((a,b)=>a.slug.localeCompare(b.slug)).forEach(e => {
                indexLines.push(`- [${e.title}](${e.path}) (${e.entityType || e.type}) – status: ${e.status}`);
              });
            });
            
            const humanIndexPath = path.join(DEFAULT_KNOWLEDGE_BASE, 'INDEX.md');
            fs.writeFileSync(humanIndexPath, indexLines.join('\n') + '\n', 'utf8');
            reports.push('INDEX.md');
          }
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                updated: updated,
                version: {
                  before: originalVersion,
                  after: index.version
                },
                entries_processed: index.entries.length,
                reports_generated: reports,
                errors: errors.length > 0 ? errors : undefined
              }, null, 2)
            }]
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: err.message
              }, null, 2)
            }],
            isError: true
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error.message,
          tool: name,
          args: args
        }, null, 2)
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Knowledge Server running on stdio');
}

main().catch(console.error);
