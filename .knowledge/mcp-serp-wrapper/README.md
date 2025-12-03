# MCP-SERP-Wrapper Knowledge Base

Documentation for the SerpAPI MCP wrapper server.

## Overview

MCP-SERP-Wrapper is a wrapper launcher for the SerpAPI MCP server (`mcp-serpapi`) that provides debug logging, JSON-RPC compliance, and graceful shutdown handling for VS Code MCP integration.

## Key Features

- **Debug Logging** - Visibility into JSON-RPC frames and child process lifecycle
- **Protocol Compliance** - Injects missing initialize fields (capabilities, clientInfo, protocolVersion)
- **Graceful Shutdown** - Proper signal handling for clean process termination
- **Multi-Engine Search** - Access to Google, Bing, Baidu, DuckDuckGo

## Quick Reference

### Configuration

```env
SERPAPI_API_KEY=your_serpapi_api_key
```

### VS Code Integration

Add to `.vscode/mcp.json`:

```jsonc
"serp-wrapped": {
  "type": "stdio",
  "command": "node",
  "args": ["C:\\dev\\mcp\\mcp-serp-wrapper\\serp-wrapper.js"]
}
```

## Available Tools

### Search Engines

| Tool | Description |
|------|-------------|
| Google Search | Web search with Google |
| Bing Search | Web search with Bing |
| Baidu Search | Web search with Baidu (Chinese) |
| DuckDuckGo Search | Privacy-focused web search |

### Specialized Search

| Tool | Description |
|------|-------------|
| Google Images | Image search |
| Bing Images | Image search via Bing |
| Google Maps Directions | Get driving/walking directions |
| Google Maps Reviews | Get place reviews |
| Google Flights | Flight search |
| Google Jobs | Job search |
| Google News | News articles |
| Google Scholar | Academic papers |
| eBay Search | Product search on eBay |

### Tool Activation

Call `activate_web_search_and_discovery_tools` to access the full search suite.

## Related MCP Memory Entities

- `MCPSerpWrapper` - Service entity
- `MCPDynamicToolIntegration` - Integration pattern

## Cross-References

- [SerpAPI](https://serpapi.com/)
- [mcp-serpapi package](https://www.npmjs.com/package/mcp-serpapi)
