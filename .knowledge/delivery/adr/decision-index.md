# Architecture Decision Records

Repository for all architectural decisions made in the MCP project.

## Decision Index

### ADR-0001: Transport Strategy
**Status:** Accepted  
**Date:** 2026-01  
**Decided by:** MCP Team  

**Decision:** Use stdio transport for local services, SSE for real-time services.

**Rationale:**
- stdio: Simpler for Node.js processes, standard for local tool integration
- SSE: Necessary for real-time persistent connections (e.g., Miro)

**Consequences:**
- ✅ Clear transport choice per service type
- ✅ Simplifies configuration in .vscode/mcp.json
- ❌ Requires different client handling for stdio vs SSE

**Affected Services:**
- stdio: MCP-365, MCP-ADO, MCP-SERP, MCP-Chat-Backup, MCP-Knowledge
- SSE: MCP-Server-Miro

---

### ADR-0002: API Wrapper Pattern
**Status:** Accepted  
**Date:** 2026-01  

**Decision:** Wrap third-party APIs using MCP tool interface for standardization.

**Rationale:**
- Consistent interface across diverse API providers
- Easier for AI agents to understand tool schema
- Simplifies error handling and authentication centralization

**Examples:**
- MCP-ADO-Wrapper: Azure DevOps REST API
- MCP-SERP-Wrapper: SerpAPI and search engines

**Consequences:**
- ✅ Uniform tool interface
- ❌ Wrapper maintenance overhead
- ⚠️ Some API features may not be exposed

---

### ADR-0003: Authentication Strategy
**Status:** Accepted  
**Date:** 2026-01  

**Decision:** Use OAuth2 for cloud services, API keys for external services.

**Rationale:**
- OAuth2: Secure for Microsoft/Azure ecosystem
- API Keys: Simpler for third-party services

**Implementation:**
- MCP-365: OAuth2 (Microsoft Graph)
- MCP-ADO: PAT (Personal Access Token)
- MCP-SERP: API Key

---

## See Also

- [Capability Map](../../strategy/objectives.md)
- [Design Patterns](../../solution/patterns/design-patterns.md)
- [MCP Concepts](../../solution/concepts/mcp-concepts.md)
- [Technology Stack](../../solution/architecture/technology-stack.md)
