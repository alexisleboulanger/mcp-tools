# MCP-SERP-Wrapper: Web Search for AI Assistants

> **Model Context Protocol (MCP) wrapper** for the `mcp-serpapi` server.
> Enables AI assistants to search the web via SerpAPI (Google, Bing, and more).

[![MCP Version](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=18-brightgreen)](https://nodejs.org)

## Overview

This wrapper enhances the upstream `mcp-serpapi` server with:

| Feature | Description |
|---------|-------------|
| **Debug Logging** | Visibility when running under VS Code MCP integration |
| **Protocol Injection** | Injects missing initialize fields for compatibility |
| **Environment Loading** | Automatic `.env` file support |
| **Protocol-Pure I/O** | Keeps stdout clean for MCP protocol |

## Quick Start

```bash
# Install dependencies
npm install

# Configure API key
echo "SERPAPI_API_KEY=your-api-key" > .env

# Test wrapper
node serp-wrapper.js
```

## Configuration

### Environment Variables

Create a `.env` file:

```env
# Required
SERPAPI_API_KEY=your-serpapi-api-key
```

Get your API key from [serpapi.com](https://serpapi.com/).

### VS Code Integration

Add to `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "serp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\dev\\mcp\\mcp-serp-wrapper\\serp-wrapper.js"]
    }
  }
}
```

## Tool Reference

This wrapper exposes all tools from `mcp-serpapi`:

### Search Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `google_search` | Google web search | `q` (query), `num` (results) |
| `google_images` | Google image search | `q`, `tbm=isch` |
| `google_news` | Google news search | `q`, `tbm=nws` |
| `google_scholar` | Google Scholar search | `q` |
| `google_maps` | Google Maps / local search | `q`, `location` |
| `bing_search` | Bing web search | `q`, `mkt` (market) |
| `bing_images` | Bing image search | `q` |
| `duckduckgo_search` | DuckDuckGo search | `q` |
| `baidu_search` | Baidu search (Chinese) | `q` |

### Specialized Tools

| Tool | Description |
|------|-------------|
| `google_flights` | Search for flights |
| `google_jobs` | Search job listings |
| `google_shopping` | Product search |
| `google_autocomplete` | Search suggestions |

## Usage Examples

### Basic Web Search

Ask the AI:
```
Search the web for "MCP server best practices"
```

### Image Search

```
Find images of architectural diagrams
```

### Local Search

```
Find coffee shops near Paris
```

## MCP Tool Design Principles

This wrapper follows MCP best practices:

1. **Protocol injection** - Adds missing fields for MCP compatibility
2. **Debug visibility** - Logs to stderr for troubleshooting
3. **Graceful error handling** - Reports API key issues before startup

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  AI Assistant                                       │
└──────────────────────┬──────────────────────────────┘
                       │ MCP Protocol
                       ▼
┌─────────────────────────────────────────────────────┐
│  serp-wrapper.js                                    │
│  ┌─────────────┐  ┌─────────────┐                  │
│  │  Protocol   │  │  Env        │                  │
│  │  Injector   │  │  Loader     │                  │
│  └─────────────┘  └─────────────┘                  │
└──────────────────────┬──────────────────────────────┘
                       │ Spawn child process
                       ▼
┌─────────────────────────────────────────────────────┐
│  mcp-serpapi (upstream)                             │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────┐
│  SerpAPI                                            │
│  ┌────────┐ ┌──────┐ ┌──────┐ ┌───────┐           │
│  │Google  │ │Bing  │ │DDG   │ │Baidu  │ ...       │
│  └────────┘ └──────┘ └──────┘ └───────┘           │
└─────────────────────────────────────────────────────┘
```

## Troubleshooting

### "SERPAPI_API_KEY missing"

Ensure `.env` file exists with your API key:
```bash
echo "SERPAPI_API_KEY=your-key" > .env
```

### "Missing dist/index.js"

Install the upstream package:
```bash
npm install mcp-serpapi
```

### Rate Limits

SerpAPI has rate limits based on your plan. Check your usage at [serpapi.com/dashboard](https://serpapi.com/dashboard).

## References

- [SerpAPI Documentation](https://serpapi.com/search-api)
- [mcp-serpapi (Upstream)](https://www.npmjs.com/package/mcp-serpapi)
- [MCP Specification](https://modelcontextprotocol.io/)

## License

MIT
