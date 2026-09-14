# Knowledge Model

Instances of the knowledge domain graph.

**Last Updated:** 2026-09-01
**Total Entities:** 31
**Total Relations:** 26

## Entities by Type

- Pillar: 2
- Objective: 2
- CapabilityL1: 3
- CapabilityL2: 2
- Process: 1
- Risk: 2
- Service: 6
- SystemAPI: 3
- ADR: 1
- Concept: 3
- Pattern: 2
- Practice: 2
- Recommendation: 1
- Gap: 1

## All Entities

### ExternalServicesIntegration

**Type:** Pillar

**Observations:**
- Enable AI agents to access external services via MCP
- Strategic pillar for MCP repository

### AIAgentEnhancement

**Type:** Pillar

**Observations:**
- Enhance AI agents (Copilot, Claude) with tool access
- Enable agents to interact with external APIs

### UnifiedMCPInterface

**Type:** Objective

**Observations:**
- Provide standardized MCP interface to diverse APIs
- Simplify integration complexity

### CopilotIntegration

**Type:** Objective

**Observations:**
- Enable GitHub Copilot integration in VS Code
- Support .vscode/mcp.json configuration

### DataIntegrationCapability

**Type:** CapabilityL1

**Observations:**
- Integrate with Microsoft 365 and Azure DevOps
- Provide access to cloud data sources

### SearchDiscoveryCapability

**Type:** CapabilityL1

**Observations:**
- Enable web search and discovery via SerpAPI
- Support multi-engine search

### VisualCollaborationCapability

**Type:** CapabilityL1

**Observations:**
- Integrate with Miro visual collaboration platform
- Real-time board access

### OAuth2Authentication

**Type:** CapabilityL2

**Observations:**
- Handle OAuth2 flows for secure authentication
- Token refresh and credential management
- Implemented in MCP-365

### APIWrappingCapability

**Type:** CapabilityL2

**Observations:**
- Wrap third-party APIs with MCP tools
- Standardize tool interface across providers
- Used by MCP-ADO, MCP-SERP

### MCPServerLifecycle

**Type:** Process

**Observations:**
- Server startup and initialization
- Request handling and tool invocation
- Error handling and graceful shutdown
- stdio and SSE transport modes

### SecurityVulnerabilityRisk

**Type:** Risk

**Observations:**
- Unencrypted API credentials in transit
- OAuth2 token refresh vulnerabilities
- External API dependency risks
- Likelihood: Medium
- Impact: High
- Mitigation: TLS encryption, secure credential storage

### ServiceScalabilityRisk

**Type:** Risk

**Observations:**
- Single MCP server instance may become bottleneck
- Concurrent request handling limits
- Likelihood: Medium (if adoption increases)
- Impact: Medium
- Mitigation: Load balancing, multiple instances, horizontal scaling

### MCP365Service

**Type:** Service

**Observations:**
- Microsoft 365 integration service
- Tools: calendar, mail, files, search, sharepoint, teams
- Location: mcp-365/
- Transport: stdio
- Status: Production

### MCPADOService

**Type:** Service

**Observations:**
- Azure DevOps wrapper service
- Provides 7 major tool groups
- Location: mcp-ado-wrapper/
- Transport: stdio
- Status: Production

### MCPSERPService

**Type:** Service

**Observations:**
- Web search integration service
- Tools: Google, Bing, Images, Videos, Scholar, News
- Location: mcp-serp-wrapper/
- Transport: stdio
- Status: Production

### MCPMiroService

**Type:** Service

**Observations:**
- Miro board integration service
- Real-time board access
- Location: mcp-server-miro/
- Transport: SSE
- Status: Production

### MCPChatBackupService

**Type:** Service

**Observations:**
- Chat conversation backup service
- Persistence for conversation history
- Location: mcp-chat-backup/
- Transport: stdio
- Status: Production

### MCPKnowledgeService

**Type:** Service

**Observations:**
- Domain knowledge graph management
- 3-layer ontology (Strategy, Delivery, Solution)
- Location: mcp-knowledge/
- Transport: stdio
- Status: New

### MicrosoftGraphAPI

**Type:** SystemAPI

**Observations:**
- External: Microsoft Graph API
- Used by MCP-365

### AzureDevOpsAPI

**Type:** SystemAPI

**Observations:**
- External: Azure DevOps REST API
- Used by MCP-ADO-Wrapper

### SerpAPI

**Type:** SystemAPI

**Observations:**
- External: SerpAPI search service
- Used by MCP-SERP-Wrapper

### MCPTransportDecision

**Type:** ADR

**Observations:**
- Decision: Use stdio for local services, SSE for real-time
- Rationale: stdio simpler for Node.js, SSE for persistent connections
- Status: Accepted
- Date: 2026-01

### ModelContextProtocol

**Type:** Concept

**Observations:**
- Standard protocol for AI agent tool integration
- Enables language models to call tools
- Supports stdio and SSE transports

### TransportMechanisms

**Type:** Concept

**Observations:**
- stdio: Standard input/output for local processes
- SSE: Server-Sent Events for real-time connections
- HTTP: Direct HTTP requests

### APIWrapperPattern

**Type:** Pattern

**Observations:**
- Wrap third-party APIs with MCP tool interface
- Standardize tool schema and responses
- Examples: MCP-ADO, MCP-SERP

### AuthenticationIntegrationPattern

**Type:** Pattern

**Observations:**
- Integrate OAuth2 and API key authentication
- Handle token refresh and expiration
- Example: MCP-365 OAuth2 flow

### DocumentEachService

**Type:** Practice

**Observations:**
- Each MCP server should have architecture.md
- Document tools, parameters, authentication
- Include examples and error handling

### APIVersioning

**Type:** Practice

**Observations:**
- Version external API integrations
- Track breaking changes
- Maintain compatibility where possible

### AvailabilityNFRWorkItem10473

**Type:** Concept

**Observations:**
- Derived from Azure DevOps work item 10473 ([NFRs] P0 - Availability)
- Availability definition: system operational time; customer value is high; quantify allowable downtime and define RTO/RPO
- Availability analysis areas: SLA (customer-facing) vs SLO/KPIs (internal); RTO/RPO relationship; data durability & integrity checks; automated backup/restore to meet RTO; redundancy & failover to remove single points of failure
- Risk-level guidance based on RTO windows: 0–8h High, 8–24h Moderate, >24h Low
- Availability-related work items list exported to .knowledge/reports/ado/related-to-10473-availability-2026-02-23.csv

### ReleaseOverlayExtension

**Type:** Recommendation

**Observations:**
- Recommendation to extend ontology with a thin 'Release Overlay' — not a redesign but minimal additions for release scoping, workstreams, work items, PR validations, release notes, and CMDB/BOM traceability
- Current ontology already strong for strategy→delivery→solution alignment. What is under-modeled: release as a timeboxed container, backlog/work items, PR validation reports, release notes, BOM/CMDB snapshots/deltas, meetings/minutes as inputs to scope
- Proposed new entity types (Delivery layer): Release (timeboxed, e.g. R2026.04), Workstream (cross-team thread), WorkItem (ADO Epic/Feature/PBI/Bug/Task), Artifact (scope brief, validation report, release notes, minutes, BOM delta)
- Proposed new entity types (Solution layer, optional): Component (for CMDB/BOM items distinct from Service), BOMSnapshot/CMDBSnapshot (can start as Artifact instead)
- Ultra-minimal start: Release + WorkItem + Artifact + Workstream only. Represent meeting minutes as Artifact with artifact_kind: minutes metadata
- Proposed new relation types: scopes (Release→WorkItem/CapabilityL2/ADR), delivers (Workstream→CapabilityL2/WorkItem), tracks (WorkItem→Gap/Risk/Recommendation), produces (Release→Artifact), documents (Artifact→ADR/Service/Process), validates (Artifact→WorkItem/Service/Release), impacts (WorkItem→Service/Component), depends_on (WorkItem→WorkItem or Service→Service)
- Contract-first approach: use Artifact subtype via frontmatter (artifact_kind: release_scope_brief, pr_validation_report, minutes, bom_delta, etc.) instead of creating separate entity types
- Canonical relation 'Service provides CapabilityL2' enables automatic roll-up: which capabilities impacted → which services involved → which risks/patterns/practices apply → which ADRs constrain the release
- 3 recommended release skills: scope_release_from_ADO (produces scope brief), workstreams_builder (produces workstreams plan), bom_cmdb_delta_generator (produces BOM delta)
- 3-agent orchestration model: Release Planner Agent (reads release+ADO), Architect Synthesizer Agent (writes scope brief+workstreams+diagrams), Gatekeeper Agent (checks risks/NFR gates/missing ADRs)
- Release Scope Pack output convention: .architect/artifacts/release/R2026.04/ with 00-scope-brief.md through 06-release-notes-draft.md
- Key decision needed: WorkItem placement — Delivery Layer recommended (execution context)
- Key decision needed: BOM/CMDB modeling — (A) Artifacts only (simplest) vs (B) First-class graph nodes with Component/has_version/deployed_in_env (more powerful impact analysis)
- Anti-drift rules: Use specific relations over generic relates_to, don't add 20 entity types at once, encode 'kind' as metadata first and promote to entity type only if needed
- DECISION 1 (2026-02-27): WorkItem confirmed as Delivery Layer entity type — aligns with execution/delivery context alongside CapabilityL1/L2, Gap, Recommendation, ADR, Process
- DECISION 2 (2026-02-27): BOM/CMDB modeling chosen as Option B — First-class graph nodes (Component, has_version, deployed_in_env) for more powerful impact analysis, not just Artifacts
- Status: Both decisions made, ready for ontology extension implementation
- IMPLEMENTED (2026-02-27): Ontology v2.0.0 patch applied to ontology-schema.json and server.js embedded standard ontology

### MissingReleaseScopingModel

**Type:** Gap

**Observations:**
- Current ontology lacks support for release scoping as first-class concept
- Under-modeled artifacts: release containers, backlog/work items, PR validation reports, release notes, BOM/CMDB snapshots, meeting minutes as scope inputs
- No way to represent timeboxed delivery cycles or trace work items to capabilities/services
- Cannot generate release scope packs, workstream plans, or CMDB deltas from knowledge graph

## Relations

- ExternalServicesIntegration ---[supports_objective]---> UnifiedMCPInterface
- AIAgentEnhancement ---[supports_objective]---> CopilotIntegration
- DataIntegrationCapability ---[enables]---> UnifiedMCPInterface
- SearchDiscoveryCapability ---[enables]---> UnifiedMCPInterface
- VisualCollaborationCapability ---[enables]---> UnifiedMCPInterface
- OAuth2Authentication ---[implements]---> DataIntegrationCapability
- APIWrappingCapability ---[implements]---> DataIntegrationCapability
- APIWrappingCapability ---[implements]---> SearchDiscoveryCapability
- MCP365Service ---[provides]---> OAuth2Authentication
- MCPADOService ---[provides]---> APIWrappingCapability
- MCPSERPService ---[provides]---> APIWrappingCapability
- MCPMiroService ---[provides]---> VisualCollaborationCapability
- MCP365Service ---[uses_api]---> MicrosoftGraphAPI
- MCPADOService ---[uses_api]---> AzureDevOpsAPI
- MCPSERPService ---[uses_api]---> SerpAPI
- MCPTransportDecision ---[relates_to]---> TransportMechanisms
- MCPADOService ---[follows_pattern]---> APIWrapperPattern
- MCPSERPService ---[follows_pattern]---> APIWrapperPattern
- MCP365Service ---[follows_pattern]---> AuthenticationIntegrationPattern
- MCP365Service ---[applies_practice]---> DocumentEachService
- MCPADOService ---[applies_practice]---> DocumentEachService
- MCPTransportDecision ---[mitigates]---> SecurityVulnerabilityRisk
- DataIntegrationCapability ---[relates_to]---> ServiceScalabilityRisk
- AvailabilityNFRWorkItem10473 ---[relates_to]---> MCPADOService
- ReleaseOverlayExtension ---[addresses]---> MissingReleaseScopingModel
- ReleaseOverlayExtension ---[relates_to]---> MCPKnowledgeService
