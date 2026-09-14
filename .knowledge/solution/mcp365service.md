---
entityType: Service
relations:
  - provides: OAuth2Authentication
  - uses_api: MicrosoftGraphAPI
  - follows_pattern: AuthenticationIntegrationPattern
  - applies_practice: DocumentEachService
---

# MCP365Service

**Type:** Service

## Observations

- Microsoft 365 integration service
- Tools: calendar, mail, files, search, sharepoint, teams
- Location: mcp-365/
- Transport: stdio
- Status: Production

## Relations

- provides: OAuth2Authentication
- uses_api: MicrosoftGraphAPI
- follows_pattern: AuthenticationIntegrationPattern
- applies_practice: DocumentEachService
