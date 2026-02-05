# Solution - Design Patterns

Proven solution patterns used throughout the MCP service architecture.

## API Wrapper Pattern

**Problem:** Integrate third-party APIs while maintaining consistent tool interface.

**Solution:** Create an MCP server that wraps the external API, translating its interface to MCP tools.

**Structure:**
```
Input: External API (e.g., Azure DevOps REST)
  ↓
Wrapper (Node.js/JavaScript)
  - Authentication handling
  - API call orchestration
  - Error handling & retry logic
  - Schema validation
  ↓
Output: MCP Tools (with consistent schema)
```

**Implementations:**
- **MCP-ADO-Wrapper:** Wraps Azure DevOps REST API
  - 7 tool groups (search, work items, repos, etc.)
  - 30+ individual tools
  
- **MCP-SERP-Wrapper:** Wraps SerpAPI and search engines
  - Google, Bing, Images, Videos, Scholar, News

**Benefits:**
✅ Consistent interface across diverse APIs  
✅ Centralized error handling  
✅ Simplified authentication  
✅ Tool schema validation  

**Drawbacks:**
❌ Wrapper maintenance  
❌ API feature lag  
❌ Translation overhead  

---

## Authentication Integration Pattern

**Problem:** Securely integrate services requiring different auth mechanisms.

**Solution:** Implement auth handling per service type.

**Approaches:**

### OAuth2 Flow (MCP-365)
1. User initiates OAuth2 flow
2. Token exchange with Microsoft
3. Token storage (secure location)
4. Automatic token refresh
5. API calls with fresh token

**Key Components:**
- `auth.js`: OAuth2 flow
- `token-helper.js`: Token management
- `authNchat.json`: Config

### API Key Pattern (MCP-SERP)
1. API key provided in environment
2. Passed with each request
3. No token refresh needed

### PAT Pattern (MCP-ADO)
1. Personal Access Token provided
2. Used for Authorization header
3. Credential management

**Benefits:**
✅ Flexible auth per service  
✅ Secure token storage  
✅ Automatic refresh support  

---

## Local Persistence Pattern

**Problem:** Preserve AI agent conversations and state across sessions.

**Solution:** Implement local file-based persistence.

**Implementation (MCP-Chat-Backup):**
- JSON export of chat history
- Timestamped backup files
- Version controllable
- Human-readable format

**Use Cases:**
- Conversation archive
- Session replay
- Knowledge extraction
- Audit trail

---

## Knowledge Graph Pattern

**Problem:** Make service relationships and capabilities queryable by AI agents.

**Solution:** Create an entity-relation graph with ontology validation.

**Implementation (MCP-Knowledge):**
- Entities: Services, Capabilities, Concepts, Patterns
- Relations: `implements`, `uses_pattern`, `supports_capability`
- Ontology: Entity type validation
- Tools: Query, add, validate, visualize

**Use Cases:**
- Understand service dependencies
- Discover related services
- Map capabilities to services
- Reason about architecture

**Benefits:**
✅ AI-queryable knowledge  
✅ Formal semantics  
✅ Automated consistency checks  

---

## See Also

- [MCP Concepts](../concepts/mcp-concepts.md)
- [Architecture Decisions](../../delivery/adr/decision-index.md)
- [All Services](../services/)
