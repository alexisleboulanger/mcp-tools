# Miro MCP Server

An experimental Model Control Protocol (MCP) server for interacting with the Miro API and Miro boards.

## Getting Started

1. **Create a Miro API token**

  - Log in to Miro in your browser.
  - Go to your **Profile → Apps → Personal access tokens** and create a token.
  - Copy the token value.

2. **Create a `.env` file** in the project root (or edit the existing one):

  ```env
  MIRO_API_TOKEN=your_miro_api_token
  # Optional: default board; can be changed later via tools
  MIRO_BOARD_ID=your_miro_board_id

  # Optional: port for the SSE endpoint
  PORT=8899
  ```

  You can find a board ID from the board URL, e.g.: `https://miro.com/app/board/uXyzAbCdEf0=/` → `MIRO_BOARD_ID=uXyzAbCdEf0=`

3. **Install dependencies and start the server**

  ```bash
  npm install
  npm run dev
  # or
  npm run build
  npm start
  ```

  The MCP server will listen on `http://localhost:8899/sse` by default.

4. **Connect from your MCP client** (e.g. Claude Desktop, Cursor, etc.)

  Configure a new MCP server pointing to the SSE endpoint, for example:

  - Transport: `sse`
  - URL: `http://localhost:8899/sse`

5. **Set or switch the active board without restart**

  - To check the current default board:
    - Tool: `get_active_board`
    - Params: `{}`

  - To set a new default board at runtime:
    - Tool: `set_active_board`
    - Params: `{ "board_id": "your_board_id" }`

  - To target a specific board just for one call, add `board_id` to that tool’s parameters, for example:
    - Tool: `create_sticky_note_item`
    - Params: `{ "board_id": "your_board_id", "data": { "content": "Hello from MCP" } }`

Once this is working, you can use all the tools listed below to read and modify your Miro boards.

## Overview

This project provides a FastMCP server that exposes Miro API endpoints as tools that can be used by AI agents. It automatically generates tool definitions from the Miro OpenAPI specification, allowing AI agents to manipulate Miro boards programmatically.

## Features

- Support for all major Miro board item types:
  - Sticky notes
  - Shapes
  - Text
  - Images
  - Cards
  - App cards
  - Documents
  - Embeds
  - Connectors

## Prerequisites

- Node.js
- A Miro account with API access
- A Miro API token
- A Miro board ID

## Installation without Docker

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/mcp-server-miro.git
   cd mcp-server-miro
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   MIRO_API_TOKEN=your_miro_api_token
   MIRO_BOARD_ID=your_miro_board_id

   # Optional, port
   PORT=3000
   ```

### Usage

1. Start the server:
   ```
   npm run dev
   ```

   or

   ```
   npm run build
   npm start
   ```

2. The server will start at `http://localhost:8899/sse`

3. AI agents can now use the exposed Miro API tools through the MCP protocol

## Using with Docker

```
# The exact command depends on your Docker version
docker compose up -d
docker-compose up -d

# Server should be up in default port or the one you chose
```

## API Tools

The server exposes the following Miro API endpoints as tools:

**Board Operations:**

- `get_specific_board`: Retrieves information about the current board.
- `update_board`: Updates the current board.
- `summarize_board`: Aggregates board metadata, counts items by type, and (optionally) includes sample snippets for each type.

**Frame / Diagram Operations:**

- `fetch_frame_items`: Fetches items within a specific frame (and optionally its direct child frames) and returns a plain-text friendly projection.
- `frame_to_mermaid`: Converts diagram elements in a frame (shapes, sticky notes, cards, connectors) into a Mermaid `flowchart` definition.
- `frame_to_erd`: Converts entity-like items (shapes, sticky notes, cards) and their connectors inside a frame into a Mermaid `erDiagram`, using ERD-style stroke caps on connectors for cardinalities when available.

**Generic Item Operations:**

- `get_items`: Retrieves a list of items on the board (supports filtering and pagination).
- `update_item_position_or_parent`: Updates the position or parent of a specific item.
- `delete_item`: Deletes a specific item (covers various types like sticky notes, text, shapes, etc.).

**Sticky Note Operations:**

- `create_sticky_note_item`: Adds a sticky note.
- `get_sticky_note_item`: Retrieves a specific sticky note.
- `update_sticky_note_item`: Updates a specific sticky note.

**Text Operations:**

- `create_text_item`: Adds a text item.
- `get_text_item`: Retrieves a specific text item.
- `update_text_item`: Updates a specific text item.

**Shape Operations:**

- `create_shape_item`: Adds a shape item.
- `get_shape_item`: Retrieves a specific shape item.
- `update_shape_item`: Updates a specific shape item.

**Card Operations:**

- `create_card_item`: Adds a card item.
- `get_card_item`: Retrieves a specific card item.
- `update_card_item`: Updates a specific card item.

**Connector Operations:**

- `create_connector`: Adds a connector between items.
- `get_connectors`: Retrieves a list of connectors.
- `get_connector`: Retrieves a specific connector.
- `update_connector`: Updates a specific connector.
- `delete_connector`: Deletes a specific connector.

**Document Operations:**

- `create_document_item_using_url`: Adds a document item from a URL.
- `update_document_item_using_url`: Updates a document item added from a URL.
  *(Note: Getting specific documents is handled by `get_items`)*

**Embed Operations:**

- `create_embed_item`: Adds an embed item from a URL.
- `update_embed_item`: Updates an embed item.
  *(Note: Getting specific embeds is handled by `get_items`)*

**Image Operations:**

- `create_image_item_using_url`: Adds an image item from a URL.
- `update_image_item_using_url`: Updates an image item added from a URL.
  *(Note: Getting specific images is handled by `get_items`)*

**App Card Operations:**

- `create_app_card_item`: Adds an app card item.
- `update_app_card_item`: Updates an app card item.
  *(Note: Getting specific app cards is handled by `get_items`)*

## Getting a Quick Board Overview

If your MCP client supports calling tools interactively, you can obtain a concise description of the current board with:

```text
Tool: summarize_board
Parameters (optional):
  includeSamples: true
  maxSamplesPerType: 3
```

The response JSON contains:

```json
{
  "board": { "id": "...", "name": "...", "description": "..." },
  "totalItems": 42,
  "counts": { "sticky_note": 10, "text": 5 },
  "samples": { "sticky_note": [{ "id": "...", "snippet": "First note" }] },
  "summary": "Human readable multi-line summary"
}
```

If you prefer raw items:

1. Call `get_items` (optionally with a `type` filter) repeatedly following the `cursor.after` value for pagination.
2. For detailed inspection of a specific sticky note, text, shape, etc., use the type-specific get_* tool (e.g. `get_sticky_note_item`).

### Extracting an ERD from a Miro Frame

If you have an ERD-style diagram drawn inside a Miro frame, you can extract a Mermaid ERD snippet from that frame. For example, to target frame `3458764642234785173` on board `uXjVIlVoIQ8=`:

```text
Tool: frame_to_erd
Parameters:
  {
    "board_id": "uXjVIlVoIQ8=",
    "frame_id": "3458764642234785173"
  }
```

The response contains an `erd` string with a Mermaid `erDiagram` block, plus structured `entities` and `relationships` arrays that describe which Miro items were treated as entities and how connectors were mapped to relationships and cardinalities.

## Pagination Notes

Most list endpoints accept `limit` (10–50). For full enumeration, loop while the response contains a `cursor.after` pointer.

## Error Handling

If a tool call fails, the server returns a structured error string including the HTTP status and underlying Miro API response body to aid troubleshooting.


## License

MIT
