# MCP-Server-Miro Knowledge Base

Documentation for the Miro API MCP server.

## Overview

MCP-Server-Miro is a Model Context Protocol server for interacting with Miro boards. It exposes Miro API endpoints as tools that AI agents can use to read, create, and manipulate board items programmatically.

## Key Features

- **Board Operations** - Read/update board metadata, summarize board contents
- **Item CRUD** - Create/read/update/delete sticky notes, shapes, text, cards, connectors
- **Diagram Extraction** - Convert Miro frames to Mermaid flowcharts and ERD diagrams
- **Runtime Board Switching** - Change active board without server restart
- **Docker Support** - Containerized deployment option

## Quick Reference

### Configuration

```env
MIRO_API_TOKEN=your_miro_api_token
MIRO_BOARD_ID=your_default_board_id  # Optional
PORT=8899  # Optional, default is 8899
```

### Connection

Transport: SSE  
Endpoint: `http://localhost:8899/sse`

### VS Code Integration

Configure MCP client to connect via SSE transport to the server endpoint.

## Tool Categories

### Board Operations

| Tool | Description |
|------|-------------|
| `get_specific_board` | Get current board info |
| `update_board` | Update board metadata |
| `summarize_board` | Get board summary with item counts and samples |
| `get_active_board` | Check current default board |
| `set_active_board` | Switch to a different board |

### Frame/Diagram Operations

| Tool | Description |
|------|-------------|
| `fetch_frame_items` | Get items within a frame |
| `frame_to_mermaid` | Convert frame diagram to Mermaid flowchart |
| `frame_to_erd` | Convert frame entities to Mermaid ERD |

### Item Operations

| Item Type | Create | Get | Update | Delete |
|-----------|--------|-----|--------|--------|
| Sticky Note | ✓ | ✓ | ✓ | ✓ |
| Text | ✓ | ✓ | ✓ | ✓ |
| Shape | ✓ | ✓ | ✓ | ✓ |
| Card | ✓ | ✓ | ✓ | ✓ |
| Connector | ✓ | ✓ | ✓ | ✓ |
| Image | ✓ | via get_items | ✓ | ✓ |
| Document | ✓ | via get_items | ✓ | ✓ |
| Embed | ✓ | via get_items | ✓ | ✓ |
| App Card | ✓ | via get_items | ✓ | ✓ |

### Generic Operations

| Tool | Description |
|------|-------------|
| `get_items` | List all items (with filtering/pagination) |
| `update_item_position_or_parent` | Move or reparent items |
| `delete_item` | Delete any item type |

## Example Usage

### Extract ERD from Frame

```json
{
  "tool": "frame_to_erd",
  "params": {
    "board_id": "uXjVIlVoIQ8=",
    "frame_id": "3458764642234785173"
  }
}
```

Returns Mermaid `erDiagram` with entities and relationships extracted from Miro shapes/connectors.

### Summarize Board

```json
{
  "tool": "summarize_board",
  "params": {
    "includeSamples": true,
    "maxSamplesPerType": 3
  }
}
```

Returns board metadata, item counts by type, and sample snippets.

## Related MCP Memory Entities

- `MCPServerMiro` - Service entity
- `MCPDynamicToolIntegration` - Integration pattern
- `MiroArchitectureGovernancePrompt` - Architecture discovery support

## Cross-References

- [Miro API Documentation](https://developers.miro.com/)
- [FastMCP Framework](https://github.com/jlowin/fastmcp)
