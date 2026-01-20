# MCP-Server-Miro: Miro Board Integration for AI Assistants

> **Model Context Protocol (MCP) server** for interacting with Miro boards.
> Create sticky notes, shapes, connectors, and extract diagrams as Mermaid.

[![MCP Version](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

## Overview

This MCP server exposes Miro API endpoints as tools for AI assistants:

| Feature | Description |
|---------|-------------|
| **Board Items** | Create, read, update, delete sticky notes, shapes, text, cards |
| **Connectors** | Create and manage connections between items |
| **Frames** | Extract items from frames for analysis |
| **Diagram Export** | Convert visual diagrams to Mermaid flowcharts or ERD |
| **Runtime Board Switch** | Change active board without restart |

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Miro token and board ID

# Start server (development)
npm run dev

# Or build and start (production)
npm run build
npm start
\`\`\`

## Configuration

### Environment Variables

Create a \`.env\` file:

\`\`\`env
# Required
MIRO_API_TOKEN=your_miro_api_token
MIRO_BOARD_ID=your_default_board_id

# Optional
PORT=8899
\`\`\`

**Getting your credentials:**
1. Log in to Miro → Profile → Apps → Personal access tokens
2. Create a token with board read/write permissions
3. Get board ID from URL: \`https://miro.com/app/board/uXyzAbCdEf0=/\` → \`uXyzAbCdEf0=\`

### VS Code Integration

Add to \`.vscode/mcp.json\`:

\`\`\`jsonc
{
  "servers": {
    "miro": {
      "type": "sse",
      "url": "http://localhost:8899/sse"
    }
  }
}
\`\`\`

### Claude Desktop

\`\`\`json
{
  "mcpServers": {
    "miro": {
      "type": "sse", 
      "url": "http://localhost:8899/sse"
    }
  }
}
\`\`\`

## Tool Reference

### Board Operations

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`get_specific_board\` | Get current board metadata | - |
| \`update_board\` | Update board properties | \`name\`, \`description\` |
| \`summarize_board\` | Get item counts and samples | \`includeSamples\`, \`maxSamplesPerType\` |
| \`get_active_board\` | Check current default board | - |
| \`set_active_board\` | Switch active board at runtime | \`board_id\` (required) |

### Frame & Diagram Operations

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`fetch_frame_items\` | Get items within a frame | \`frame_id\` (required) |
| \`frame_to_mermaid\` | Convert frame to Mermaid flowchart | \`frame_id\`, \`board_id\` |
| \`frame_to_erd\` | Convert frame to Mermaid ERD | \`frame_id\`, \`board_id\` |

### Item Operations

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`get_items\` | List items (with filtering) | \`type\`, \`limit\`, \`cursor\` |
| \`update_item_position_or_parent\` | Move or reparent item | \`item_id\`, \`position\` |
| \`delete_item\` | Delete any item | \`item_id\` (required) |

### Sticky Notes

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`create_sticky_note_item\` | Create sticky note | \`data.content\`, \`position\` |
| \`get_sticky_note_item\` | Get sticky note | \`item_id\` (required) |
| \`update_sticky_note_item\` | Update sticky note | \`item_id\`, \`data\` |

### Shapes

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`create_shape_item\` | Create shape | \`data.shape\`, \`position\` |
| \`get_shape_item\` | Get shape | \`item_id\` (required) |
| \`update_shape_item\` | Update shape | \`item_id\`, \`data\` |

### Text

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`create_text_item\` | Create text | \`data.content\`, \`position\` |
| \`get_text_item\` | Get text item | \`item_id\` (required) |
| \`update_text_item\` | Update text | \`item_id\`, \`data\` |

### Cards

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`create_card_item\` | Create card | \`data.title\`, \`data.description\` |
| \`get_card_item\` | Get card | \`item_id\` (required) |
| \`update_card_item\` | Update card | \`item_id\`, \`data\` |

### Connectors

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`create_connector\` | Connect two items | \`startItem\`, \`endItem\` |
| \`get_connectors\` | List all connectors | \`limit\` |
| \`get_connector\` | Get specific connector | \`connector_id\` |
| \`update_connector\` | Update connector | \`connector_id\`, \`data\` |
| \`delete_connector\` | Delete connector | \`connector_id\` |

### Media Operations

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| \`create_image_item_using_url\` | Add image from URL | \`data.url\` |
| \`create_document_item_using_url\` | Add document from URL | \`data.url\` |
| \`create_embed_item\` | Embed external content | \`data.url\` |

## Usage Examples

### Create a Sticky Note

\`\`\`
Create a yellow sticky note on my Miro board saying "TODO: Review API design"
\`\`\`

### Extract ERD from Frame

\`\`\`
Convert the ERD diagram in frame 3458764642234785173 to Mermaid format
\`\`\`

**Response includes:**
\`\`\`mermaid
erDiagram
    User ||--o{ Order : places
    Order ||--|{ LineItem : contains
    Product }|--|| Category : belongs_to
\`\`\`

### Summarize Board

\`\`\`
Give me an overview of what's on my Miro board
\`\`\`

**Returns:**
- Total item counts by type
- Sample snippets from each category
- Board metadata

## MCP Tool Design Principles

This server follows MCP best practices:

1. **SSE Transport** - Uses Server-Sent Events for real-time communication
2. **Runtime configuration** - Switch boards without restart via \`set_active_board\`
3. **Diagram extraction** - Convert visual diagrams to code (Mermaid)
4. **Pagination support** - Handle large boards with cursor-based pagination

## Architecture

\`\`\`
┌─────────────────────────────────────────────────────┐
│  AI Assistant (Claude, VS Code Copilot)             │
└──────────────────────┬──────────────────────────────┘
                       │ SSE / MCP Protocol
                       ▼
┌─────────────────────────────────────────────────────┐
│  mcp-server-miro (FastMCP)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Tools     │  │  OpenAPI    │  │  Mermaid    │ │
│  │   Handler   │  │  Generator  │  │  Converter  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + OAuth
                       ▼
┌─────────────────────────────────────────────────────┐
│  Miro REST API                                      │
│  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ │
│  │Boards  │ │Items    │ │Connectors│ │Frames    │ │
│  └────────┘ └─────────┘ └──────────┘ └──────────┘ │
└─────────────────────────────────────────────────────┘
\`\`\`

## Docker Deployment

\`\`\`bash
# Start with Docker Compose
docker-compose up -d

# Server available at http://localhost:8899/sse
\`\`\`

## Troubleshooting

### "MIRO_API_TOKEN missing"

Create a personal access token in Miro:
1. Profile → Apps → Personal access tokens
2. Create token with required scopes

### "Board not found"

Verify board ID from URL and ensure token has access to that board.

### Pagination

For boards with many items, use \`cursor.after\` from response for pagination:
\`\`\`
get_items cursor="next_page_token"
\`\`\`

## References

- [Miro REST API Documentation](https://developers.miro.com/reference)
- [MCP Specification](https://modelcontextprotocol.io/)
- [FastMCP Framework](https://github.com/jlowin/fastmcp)

## License

MIT
