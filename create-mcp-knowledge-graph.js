#!/usr/bin/env node

/**
 * Initialize .knowledge graph with MCP repository entities and relations
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE = path.join(process.cwd(), '.knowledge');
const GRAPH_FILE = path.join(KNOWLEDGE_BASE, 'knowledge-graph.json');

// Ensure directory exists
if (!fs.existsSync(KNOWLEDGE_BASE)) {
  fs.mkdirSync(KNOWLEDGE_BASE, { recursive: true });
}

// Create comprehensive graph
const graph = {
  version: '1.0.0',
  created: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  entities: {
    // Strategy Layer
    ExternalServicesIntegration: {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'ExternalServicesIntegration',
      type: 'Pillar',
      created: new Date().toISOString(),
      observations: [
        'Enable AI agents to access external services via MCP',
        'Strategic pillar for MCP repository'
      ]
    },
    AIAgentEnhancement: {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'AIAgentEnhancement',
      type: 'Pillar',
      created: new Date().toISOString(),
      observations: [
        'Enhance AI agents (Copilot, Claude) with tool access',
        'Enable agents to interact with external APIs'
      ]
    },
    UnifiedMCPInterface: {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'UnifiedMCPInterface',
      type: 'Objective',
      created: new Date().toISOString(),
      observations: [
        'Provide standardized MCP interface to diverse APIs',
        'Simplify integration complexity'
      ]
    },
    CopilotIntegration: {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'CopilotIntegration',
      type: 'Objective',
      created: new Date().toISOString(),
      observations: [
        'Enable GitHub Copilot integration in VS Code',
        'Support .vscode/mcp.json configuration'
      ]
    },

    // Delivery Layer - Capabilities
    DataIntegrationCapability: {
      id: '20000000-0000-0000-0000-000000000001',
      name: 'DataIntegrationCapability',
      type: 'CapabilityL1',
      created: new Date().toISOString(),
      observations: [
        'Integrate with Microsoft 365 and Azure DevOps',
        'Provide access to cloud data sources'
      ]
    },
    SearchDiscoveryCapability: {
      id: '20000000-0000-0000-0000-000000000002',
      name: 'SearchDiscoveryCapability',
      type: 'CapabilityL1',
      created: new Date().toISOString(),
      observations: [
        'Enable web search and discovery via SerpAPI',
        'Support multi-engine search'
      ]
    },
    VisualCollaborationCapability: {
      id: '20000000-0000-0000-0000-000000000003',
      name: 'VisualCollaborationCapability',
      type: 'CapabilityL1',
      created: new Date().toISOString(),
      observations: [
        'Integrate with Miro visual collaboration platform',
        'Real-time board access'
      ]
    },
    OAuth2Authentication: {
      id: '20000000-0000-0000-0000-000000000004',
      name: 'OAuth2Authentication',
      type: 'CapabilityL2',
      created: new Date().toISOString(),
      observations: [
        'Handle OAuth2 flows for secure authentication',
        'Token refresh and credential management',
        'Implemented in MCP-365'
      ]
    },
    APIWrappingCapability: {
      id: '20000000-0000-0000-0000-000000000005',
      name: 'APIWrappingCapability',
      type: 'CapabilityL2',
      created: new Date().toISOString(),
      observations: [
        'Wrap third-party APIs with MCP tools',
        'Standardize tool interface across providers',
        'Used by MCP-ADO, MCP-SERP'
      ]
    },
    MCPServerLifecycle: {
      id: '20000000-0000-0000-0000-000000000006',
      name: 'MCPServerLifecycle',
      type: 'Process',
      created: new Date().toISOString(),
      observations: [
        'Server startup and initialization',
        'Request handling and tool invocation',
        'Error handling and graceful shutdown',
        'stdio and SSE transport modes'
      ]
    },

    // Solution Layer - Services
    MCP365Service: {
      id: '30000000-0000-0000-0000-000000000001',
      name: 'MCP365Service',
      type: 'Service',
      created: new Date().toISOString(),
      observations: [
        'Microsoft 365 integration service',
        'Tools: calendar, mail, files, search, sharepoint, teams',
        'Location: mcp-365/',
        'Transport: stdio',
        'Status: Production'
      ]
    },
    MCPADOService: {
      id: '30000000-0000-0000-0000-000000000002',
      name: 'MCPADOService',
      type: 'Service',
      created: new Date().toISOString(),
      observations: [
        'Azure DevOps wrapper service',
        'Provides 7 major tool groups',
        'Location: mcp-ado-wrapper/',
        'Transport: stdio',
        'Status: Production'
      ]
    },
    MCPSERPService: {
      id: '30000000-0000-0000-0000-000000000003',
      name: 'MCPSERPService',
      type: 'Service',
      created: new Date().toISOString(),
      observations: [
        'Web search integration service',
        'Tools: Google, Bing, Images, Videos, Scholar, News',
        'Location: mcp-serp-wrapper/',
        'Transport: stdio',
        'Status: Production'
      ]
    },
    MCPMiroService: {
      id: '30000000-0000-0000-0000-000000000004',
      name: 'MCPMiroService',
      type: 'Service',
      created: new Date().toISOString(),
      observations: [
        'Miro board integration service',
        'Real-time board access',
        'Location: mcp-server-miro/',
        'Transport: SSE',
        'Status: Production'
      ]
    },
    MCPChatBackupService: {
      id: '30000000-0000-0000-0000-000000000005',
      name: 'MCPChatBackupService',
      type: 'Service',
      created: new Date().toISOString(),
      observations: [
        'Chat conversation backup service',
        'Persistence for conversation history',
        'Location: mcp-chat-backup/',
        'Transport: stdio',
        'Status: Production'
      ]
    },
    MCPKnowledgeService: {
      id: '30000000-0000-0000-0000-000000000006',
      name: 'MCPKnowledgeService',
      type: 'Service',
      created: new Date().toISOString(),
      observations: [
        'Domain knowledge graph management',
        '3-layer ontology (Strategy, Delivery, Solution)',
        'Location: mcp-knowledge/',
        'Transport: stdio',
        'Status: New'
      ]
    },
    MicrosoftGraphAPI: {
      id: '30000000-0000-0000-0000-000000000010',
      name: 'MicrosoftGraphAPI',
      type: 'SystemAPI',
      created: new Date().toISOString(),
      observations: [
        'External: Microsoft Graph API',
        'Used by MCP-365'
      ]
    },
    AzureDevOpsAPI: {
      id: '30000000-0000-0000-0000-000000000011',
      name: 'AzureDevOpsAPI',
      type: 'SystemAPI',
      created: new Date().toISOString(),
      observations: [
        'External: Azure DevOps REST API',
        'Used by MCP-ADO-Wrapper'
      ]
    },
    SerpAPI: {
      id: '30000000-0000-0000-0000-000000000012',
      name: 'SerpAPI',
      type: 'SystemAPI',
      created: new Date().toISOString(),
      observations: [
        'External: SerpAPI search service',
        'Used by MCP-SERP-Wrapper'
      ]
    },
    MCPTransportDecision: {
      id: '30000000-0000-0000-0000-000000000020',
      name: 'MCPTransportDecision',
      type: 'ADR',
      created: new Date().toISOString(),
      observations: [
        'Decision: Use stdio for local services, SSE for real-time',
        'Rationale: stdio simpler for Node.js, SSE for persistent connections',
        'Status: Accepted',
        'Date: 2026-01'
      ]
    },

    // Solution Layer
    ModelContextProtocol: {
      id: '40000000-0000-0000-0000-000000000001',
      name: 'ModelContextProtocol',
      type: 'Concept',
      created: new Date().toISOString(),
      observations: [
        'Standard protocol for AI agent tool integration',
        'Enables language models to call tools',
        'Supports stdio and SSE transports'
      ]
    },
    TransportMechanisms: {
      id: '40000000-0000-0000-0000-000000000002',
      name: 'TransportMechanisms',
      type: 'Concept',
      created: new Date().toISOString(),
      observations: [
        'stdio: Standard input/output for local processes',
        'SSE: Server-Sent Events for real-time connections',
        'HTTP: Direct HTTP requests'
      ]
    },
    APIWrapperPattern: {
      id: '40000000-0000-0000-0000-000000000010',
      name: 'APIWrapperPattern',
      type: 'Pattern',
      created: new Date().toISOString(),
      observations: [
        'Wrap third-party APIs with MCP tool interface',
        'Standardize tool schema and responses',
        'Examples: MCP-ADO, MCP-SERP'
      ]
    },
    AuthenticationIntegrationPattern: {
      id: '40000000-0000-0000-0000-000000000011',
      name: 'AuthenticationIntegrationPattern',
      type: 'Pattern',
      created: new Date().toISOString(),
      observations: [
        'Integrate OAuth2 and API key authentication',
        'Handle token refresh and expiration',
        'Example: MCP-365 OAuth2 flow'
      ]
    },
    DocumentEachService: {
      id: '40000000-0000-0000-0000-000000000020',
      name: 'DocumentEachService',
      type: 'Practice',
      created: new Date().toISOString(),
      observations: [
        'Each MCP server should have architecture.md',
        'Document tools, parameters, authentication',
        'Include examples and error handling'
      ]
    },
    APIVersioning: {
      id: '40000000-0000-0000-0000-000000000021',
      name: 'APIVersioning',
      type: 'Practice',
      created: new Date().toISOString(),
      observations: [
        'Version external API integrations',
        'Track breaking changes',
        'Maintain compatibility where possible'
      ]
    }
  },
  relations: [
    // Strategy connections
    { id: '50000000-0000-0000-0000-000000000001', from: 'ExternalServicesIntegration', to: 'UnifiedMCPInterface', type: 'supports_objective', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000002', from: 'AIAgentEnhancement', to: 'CopilotIntegration', type: 'supports_objective', created: new Date().toISOString() },

    // Strategy to Delivery
    { id: '50000000-0000-0000-0000-000000000003', from: 'UnifiedMCPInterface', to: 'DataIntegrationCapability', type: 'requires_capability', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000004', from: 'UnifiedMCPInterface', to: 'SearchDiscoveryCapability', type: 'requires_capability', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000005', from: 'CopilotIntegration', to: 'MCPServerLifecycle', type: 'requires_process', created: new Date().toISOString() },

    // Delivery connections
    { id: '50000000-0000-0000-0000-000000000010', from: 'DataIntegrationCapability', to: 'OAuth2Authentication', type: 'requires_capability', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000011', from: 'DataIntegrationCapability', to: 'APIWrappingCapability', type: 'requires_capability', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000012', from: 'SearchDiscoveryCapability', to: 'APIWrappingCapability', type: 'requires_capability', created: new Date().toISOString() },

    // Delivery to Solution
    { id: '50000000-0000-0000-0000-000000000020', from: 'DataIntegrationCapability', to: 'MCP365Service', type: 'implements_via_service', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000021', from: 'DataIntegrationCapability', to: 'MCPADOService', type: 'implements_via_service', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000022', from: 'SearchDiscoveryCapability', to: 'MCPSERPService', type: 'implements_via_service', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000023', from: 'VisualCollaborationCapability', to: 'MCPMiroService', type: 'implements_via_service', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000024', from: 'OAuth2Authentication', to: 'MCP365Service', type: 'implemented_by_service', created: new Date().toISOString() },

    // Service to API
    { id: '50000000-0000-0000-0000-000000000030', from: 'MCP365Service', to: 'MicrosoftGraphAPI', type: 'integrates_with', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000031', from: 'MCPADOService', to: 'AzureDevOpsAPI', type: 'integrates_with', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000032', from: 'MCPSERPService', to: 'SerpAPI', type: 'integrates_with', created: new Date().toISOString() },

    // Solution to Knowledge
    { id: '50000000-0000-0000-0000-000000000040', from: 'MCPTransportDecision', to: 'TransportMechanisms', type: 'references_concept', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000041', from: 'MCPADOService', to: 'APIWrapperPattern', type: 'uses_pattern', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000042', from: 'MCPSERPService', to: 'APIWrapperPattern', type: 'uses_pattern', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000043', from: 'MCP365Service', to: 'AuthenticationIntegrationPattern', type: 'uses_pattern', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000044', from: 'MCP365Service', to: 'DocumentEachService', type: 'follows_practice', created: new Date().toISOString() },
    { id: '50000000-0000-0000-0000-000000000045', from: 'MCPADOService', to: 'DocumentEachService', type: 'follows_practice', created: new Date().toISOString() }
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
      { name: 'Risk', layer: 'delivery', description: 'Risk or threat' },
      { name: 'ADR', layer: 'solution', description: 'Architecture Decision Record' },
      { name: 'Service', layer: 'solution', description: 'Software service' },
      { name: 'SystemAPI', layer: 'solution', description: 'System API' },
      { name: 'Event', layer: 'solution', description: 'Event' },
      { name: 'Concept', layer: 'solution', description: 'Concept' },
      { name: 'Pattern', layer: 'solution', description: 'Pattern' },
      { name: 'Practice', layer: 'solution', description: 'Best practice' },
      { name: 'Term', layer: 'solution', description: 'Term' }
    ],
    relationTypes: [
      { name: 'supports_objective', description: 'Supports an objective' },
      { name: 'requires_capability', description: 'Requires a capability' },
      { name: 'requires_process', description: 'Requires a process' },
      { name: 'implements_via_service', description: 'Implemented via service' },
      { name: 'implemented_by_service', description: 'Implemented by service' },
      { name: 'integrates_with', description: 'Integrates with' },
      { name: 'references_concept', description: 'References a concept' },
      { name: 'uses_pattern', description: 'Uses a pattern' },
      { name: 'follows_practice', description: 'Follows a practice' },
      { name: 'mitigates', description: 'Mitigates a risk' },
      { name: 'measures', description: 'Measures a metric' }
    ]
  },
  metadata: {
    totalEntities: 28,
    totalRelations: 23,
    categories: {
      Pillar: 2,
      Objective: 2,
      CapabilityL1: 3,
      CapabilityL2: 2,
      Process: 1,
      Service: 6,
      SystemAPI: 3,
      ADR: 1,
      Concept: 2,
      Pattern: 2,
      Practice: 2
    }
  }
};

fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');

console.log('✅ Knowledge graph initialized:\n');
console.log(`   Entities: ${graph.metadata.totalEntities}`);
console.log(`   Relations: ${graph.metadata.totalRelations}`);
console.log(`   File: ${GRAPH_FILE}\n`);
console.log('📚 Entity breakdown:\n');
Object.entries(graph.metadata.categories).forEach(([type, count]) => {
  console.log(`   ${type}: ${count}`);
});
