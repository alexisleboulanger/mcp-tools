---
entityType: Service
relations:
  - provides: APIWrappingCapability
  - uses_api: AzureDevOpsAPI
  - follows_pattern: APIWrapperPattern
  - applies_practice: DocumentEachService
---

# MCPADOService

**Type:** Service

## Observations

- Azure DevOps wrapper service
- Provides 7 major tool groups
- Location: mcp-ado-wrapper/
- Transport: stdio
- Status: Production

## Relations

- provides: APIWrappingCapability
- uses_api: AzureDevOpsAPI
- follows_pattern: APIWrapperPattern
- applies_practice: DocumentEachService
