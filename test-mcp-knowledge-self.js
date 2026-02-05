#!/usr/bin/env node

/**
 * Test mcp-knowledge by populating it with knowledge about itself
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE = path.join(process.cwd(), '.knowledge');
const GRAPH_FILE = path.join(KNOWLEDGE_BASE, 'knowledge-graph.json');

// Ensure directories exist
['', '.ontology', 'solution', 'delivery'].forEach(dir => {
  const dirPath = dir ? path.join(KNOWLEDGE_BASE, dir) : KNOWLEDGE_BASE;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Create initial graph
const graph = {
  version: '1.0.0',
  created: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  entities: {
    MCPKnowledgeServer: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'MCPKnowledgeServer',
      type: 'Service',
      created: new Date().toISOString(),
      observations: [
        'MCP server for managing domain knowledge graphs',
        'Stores graph at .knowledge/knowledge-graph.json',
        'Generates ontology and model documentation',
        'Integrates with Memory MCP tool',
        'Provides 11 tools for graph management'
      ],
      relations: []
    },
    KnowledgeGraphManagement: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'KnowledgeGraphManagement',
      type: 'CapabilityL1',
      created: new Date().toISOString(),
      observations: [
        'CRUD operations on entities and relations',
        'Ontology validation and constraint enforcement',
        'Search and filtering capabilities',
        'Statistics and metadata tracking'
      ],
      relations: []
    },
    DomainKnowledgeOntology: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'DomainKnowledgeOntology',
      type: 'Concept',
      created: new Date().toISOString(),
      observations: [
        '3-layer architecture: Strategy, Delivery, Solution',
        '17 entity types with semantic meaning',
        '11 relation types for typed relationships',
        'Extensible with custom types'
      ],
      relations: []
    },
    FourLayerArchitecture: {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'FourLayerArchitecture',
      type: 'Pattern',
      created: new Date().toISOString(),
      observations: [
        'Strategy Layer: Pillar, Objective, Metric',
        'Delivery Layer: Capability, Gap, Recommendation, Process',
        'Solution Layer: ADR, Service, SystemAPI, Event, Concept, Pattern, Practice, Term'
      ],
      relations: []
    },
    MemoryMCPIntegration: {
      id: '550e8400-e29b-41d4-a716-446655440004',
      name: 'MemoryMCPIntegration',
      type: 'CapabilityL2',
      created: new Date().toISOString(),
      observations: [
        'Bidirectional sync with Memory MCP tool',
        'Enables cross-session persistence',
        'Exports graph in memory-compatible format',
        'Imports knowledge from memory tool'
      ],
      relations: []
    },
    DocumentationSync: {
      id: '550e8400-e29b-41d4-a716-446655440005',
      name: 'DocumentationSync',
      type: 'CapabilityL2',
      created: new Date().toISOString(),
      observations: [
        'Auto-generates knowledge-ontology.md',
        'Auto-generates knowledge-model.md',
        'Creates Mermaid diagrams',
        'Stores in .knowledge/.ontology/ folder'
      ],
      relations: []
    },
    GraphValidation: {
      id: '550e8400-e29b-41d4-a716-446655440006',
      name: 'GraphValidation',
      type: 'Practice',
      created: new Date().toISOString(),
      observations: [
        'Validate entities against ontology',
        'Enforce relation type constraints',
        'Check reference integrity',
        'Provide detailed error messages'
      ],
      relations: []
    },
    StorageStructure: {
      id: '550e8400-e29b-41d4-a716-446655440007',
      name: 'StorageStructure',
      type: 'Concept',
      created: new Date().toISOString(),
      observations: [
        'Root: .knowledge/knowledge-graph.json',
        'Ontology docs: .knowledge/.ontology/',
        'Solution folder: .knowledge/solution/',
        'Delivery folder: .knowledge/delivery/',
        'Index files: knowledge-index.json, INDEX.md'
      ],
      relations: []
    },
    YorizonAlignment: {
      id: '550e8400-e29b-41d4-a716-446655440008',
      name: 'YorizonAlignment',
      type: 'ADR',
      created: new Date().toISOString(),
      observations: [
        'Decision: Follow Yorizon .knowledge structure',
        'Rationale: Organizational consistency',
        'Status: Accepted',
        'Implemented: January 22, 2026',
        'Benefits: Better organization, discoverability, standards alignment'
      ],
      relations: []
    }
  },
  relations: [
    {
      id: '660e8400-e29b-41d4-a716-446655440000',
      from: 'MCPKnowledgeServer',
      to: 'KnowledgeGraphManagement',
      type: 'provides_capability',
      created: new Date().toISOString()
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440001',
      from: 'KnowledgeGraphManagement',
      to: 'DomainKnowledgeOntology',
      type: 'uses_ontology',
      created: new Date().toISOString()
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440002',
      from: 'DomainKnowledgeOntology',
      to: 'FourLayerArchitecture',
      type: 'implements',
      created: new Date().toISOString()
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440003',
      from: 'MCPKnowledgeServer',
      to: 'MemoryMCPIntegration',
      type: 'provides_capability',
      created: new Date().toISOString()
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440004',
      from: 'MCPKnowledgeServer',
      to: 'DocumentationSync',
      type: 'provides_capability',
      created: new Date().toISOString()
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440005',
      from: 'KnowledgeGraphManagement',
      to: 'GraphValidation',
      type: 'uses_practice',
      created: new Date().toISOString()
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440006',
      from: 'DocumentationSync',
      to: 'StorageStructure',
      type: 'organizes',
      created: new Date().toISOString()
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440007',
      from: 'StorageStructure',
      to: 'YorizonAlignment',
      type: 'follows_decision',
      created: new Date().toISOString()
    }
  ],
  ontology: {
    entityTypes: [
      { name: 'Pillar', layer: 'strategy', description: 'Strategic pillar' },
      { name: 'Objective', layer: 'strategy', description: 'Business objective' },
      { name: 'Metric', layer: 'strategy', description: 'KPI or metric' },
      { name: 'CapabilityL1', layer: 'delivery', description: 'Level 1 capability' },
      { name: 'CapabilityL2', layer: 'delivery', description: 'Level 2 capability' },
      { name: 'Gap', layer: 'delivery', description: 'Capability gap' },
      { name: 'Recommendation', layer: 'delivery', description: 'Recommendation' },
      { name: 'Process', layer: 'delivery', description: 'Process' },
      { name: 'ADR', layer: 'solution', description: 'Architecture Decision Record' },
      { name: 'Service', layer: 'solution', description: 'Software service' },
      { name: 'SystemAPI', layer: 'solution', description: 'System API' },
      { name: 'Event', layer: 'solution', description: 'Event' },
      { name: 'Concept', layer: 'solution', description: 'Concept' },
      { name: 'Pattern', layer: 'solution', description: 'Pattern' },
      { name: 'Practice', layer: 'solution', description: 'Best practice' },
      { name: 'Term', layer: 'solution', description: 'Term' },
      { name: 'Risk', layer: 'delivery', description: 'Risk or threat' }
    ],
    relationTypes: [
      { name: 'supports_objective', description: 'Supports an objective' },
      { name: 'measures', description: 'Measures a metric' },
      { name: 'addresses', description: 'Addresses a gap' },
      { name: 'mitigates', description: 'Mitigates a risk' },
      { name: 'references_service', description: 'References a service' },
      { name: 'uses_ontology', description: 'Uses an ontology' },
      { name: 'implements', description: 'Implements' },
      { name: 'provides_capability', description: 'Provides a capability' },
      { name: 'uses_practice', description: 'Uses a practice' },
      { name: 'organizes', description: 'Organizes' },
      { name: 'follows_decision', description: 'Follows a decision' }
    ]
  },
  metadata: {
    totalEntities: 9,
    totalRelations: 8,
    categories: {
      Service: 1,
      CapabilityL1: 1,
      Concept: 1,
      Pattern: 1,
      CapabilityL2: 2,
      Practice: 1,
      ADR: 1
    }
  }
};

// Write graph
fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');

console.log('✅ Knowledge graph populated:\n');
console.log(`   Entities: ${graph.metadata.totalEntities}`);
console.log(`   Relations: ${graph.metadata.totalRelations}`);
console.log(`   File: ${GRAPH_FILE}`);
console.log(`\n📚 Entities created:`);
Object.keys(graph.entities).forEach(name => {
  console.log(`   - ${name} (${graph.entities[name].type})`);
});
