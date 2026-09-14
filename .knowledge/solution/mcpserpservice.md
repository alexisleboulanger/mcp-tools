---
entityType: Service
relations:
  - provides: APIWrappingCapability
  - uses_api: SerpAPI
  - follows_pattern: APIWrapperPattern
---

# MCPSERPService

**Type:** Service

## Observations

- Web search integration service
- Tools: Google, Bing, Images, Videos, Scholar, News
- Location: mcp-serp-wrapper/
- Transport: stdio
- Status: Production

## Relations

- provides: APIWrappingCapability
- uses_api: SerpAPI
- follows_pattern: APIWrapperPattern
