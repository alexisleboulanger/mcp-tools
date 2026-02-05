# Solution - Core Concepts

Core concepts and principles underlying the MCP service architecture.

## Model Context Protocol (MCP)

**Definition:** Standard protocol enabling AI agents to call tools on external systems.

**Key Properties:**
- Language model agnostic (works with Claude, GPT, etc.)
- Transport flexible (stdio, SSE, HTTP)
- Tool schema driven
- Request-response pattern

**Use in MCP Repo:**
- All servers implement MCP protocol
- Tools are primary interface to external APIs
- Schema validation ensures consistency

---

## Transport Mechanisms

### Standard Input/Output (stdio)
**Use Case:** Local tool integration  
**How it works:**
- Tool accepts input on stdin
- Produces output on stdout
- Process lifecycle tied to client connection

**Services using stdio:**
- MCP-365
- MCP-ADO-Wrapper
- MCP-SERP-Wrapper
- MCP-Chat-Backup
- MCP-Knowledge

### Server-Sent Events (SSE)
**Use Case:** Real-time persistent connections  
**How it works:**
- Server sends events to client
- Client maintains long-lived connection
- Better for bidirectional real-time communication

**Services using SSE:**
- MCP-Server-Miro

### HTTP
**Use Case:** Standard web requests  
**Status:** Not currently used in repo

---

## Tool Schema

**Pattern:** Each service implements tools with:
- `name`: Unique identifier (e.g., "knowledge_graph_read")
- `description`: Human-readable purpose
- `inputSchema`: JSON Schema for parameters
- `implementation`: Validation and execution logic

**Example:**
```json
{
  "name": "knowledge_graph_add_entity",
  "description": "Add an entity to knowledge graph",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "type": { "type": "string" },
      "observations": { "type": "array" }
    }
  }
}
```

---

## See Also

- [Design Patterns](../patterns/design-patterns.md)
- [Transport Strategy ADR](../../delivery/adr/decision-index.md)
- [MCP-365 Service](../services/mcp-365/)
- [MCP-ADO-Wrapper Service](../services/mcp-ado-wrapper/)
