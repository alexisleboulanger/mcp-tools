# MCP Knowledge Server - Quick Start Guide

## Installation (Already Done)

```bash
cd mcp-knowledge
npm install
```

## VS Code Configuration

Add to `.vscode/mcp.json`:

```jsonc
{
  "mcpServers": {
    "knowledge": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/mcp-knowledge/server.js"],
      "env": {
        "KNOWLEDGE_PATH": "${workspaceFolder}/.knowledge"
      }
    }
  }
}
```

## Initialize Knowledge Base

Choose your ontology when initializing:

### Option 1: Standard Ontology (Default)
**Best for:** Traditional business/software architecture modeling
```
"Initialize a knowledge base called MyProject with standard ontology"
```
Uses 3-layer model: Strategy, Delivery, Solution

### Option 2: NomadArchitecture Ontology
**Best for:** Living systems that encode intent, continuity, and culture
```
"Initialize a knowledge base called MyProject with nomad ontology"
```
Uses cultural OS model: Hosts, Features, Foundations, Core, Shamans, Trails

## Test It Out

Ask Copilot any of these:

### 1. View Ontology
```
"Show me the knowledge ontology in markdown format"
```
Copilot will call: `knowledge_ontology_view format=markdown`

### 2. Add an Entity
```
"Add an entity called APIGateway with type Service. Observations: 
Routes all API traffic, implements rate limiting"
```
Copilot will call: `knowledge_graph_add_entity`

### 3. Visualize Structure
```
"Generate a Mermaid diagram of the knowledge ontology showing all layers"
```
Copilot will call: `knowledge_model_visualize type=ontology`

### 4. Validate
```
"Validate the knowledge graph to ensure all entities and relations are correct"
```
Copilot will call: `knowledge_graph_validate mode=all`

### 5. Sync to Docs
```
"Sync the knowledge graph to the .knowledge folder documentation"
```
Copilot will call: `knowledge_docs_sync action=to_docs`

### 6. Get Stats
```
"Show me statistics about the knowledge graph"
```
Copilot will call: `knowledge_graph_stats detailed=true`

## Ontology Comparison

| Aspect | Standard | NomadArchitecture |
|--------|----------|-------------------|
| **Purpose** | Business/architecture modeling | Living systems with embedded culture |
| **Strategy Layer** | Pillar, Objective, Metric | Vision, Principle, Culture, Intent |
| **Delivery Layer** | Capability, Gap, Recommendation, ADR | Host, Feature, Foundation, Trail, Shaman |
| **Solution Layer** | Service, API, Event, Pattern, Practice, Concept, Term | Core, Scar, Story, Contract, Evidence |
| **Key Focus** | "What & How" | "Why & Culture" (Structure + Intent) |
| **Use Case** | Traditional enterprise | Teams, AI-assisted codebases, cultural preservation |

## Key Concepts

**Standard Ontology:**
- **Three Layers:** Strategy (goals), Delivery (capabilities), Solution (services, patterns, concepts)
- **Entities:** Things in your domain (e.g., AuthService, ScalabilityRisk)
- **Relations:** Connections (e.g., "mitigates", "implements", "addresses")

**NomadArchitecture Ontology:**
- **Five Pillars:** Host (delivery), Features (capabilities), Foundations (mechanisms), Core (language), Shamans (stewards)
- **Emergence:** Features → Foundations → Core via evidence & reflection
- **Culture:** Trails, Stories, Transmission encode continuity & human intent

## Example Workflow

```
1. Add entity: "AuthenticationService" (type: Service)
   Observation: "Handles OAuth2 and SAML"

2. Add entity: "SecurityBreach" (type: Risk)

3. Add relation: AuthenticationService → mitigates → SecurityBreach

4. Visualize: See diagram with both entities and connection

5. Sync to docs: Generates knowledge-model.md with Mermaid diagram

6. Validate: Ensures all types are valid

7. Sync to memory: Share with other agents
```

## File Structure After First Use

```
.knowledge/
├── .ontology/
│   ├── knowledge-ontology.md      ← Auto-generated (after sync)
│   └── knowledge-model.md         ← Auto-generated (after sync)
├── solution/                      ← Solution layer folder
├── delivery/                      ← Delivery layer folder
├── knowledge-graph.json           ← Your graph data
├── knowledge-index.json           ← Index metadata
└── INDEX.md                       ← Human-readable index
```

## Next Steps

1. ✅ Configuration done
2. 🎯 Initialize knowledge base with chosen ontology
3. 🔄 Start using Copilot commands
4. 📊 Run `knowledge_model_visualize` to see diagrams
5. 💾 Use `knowledge_sync_memory` to persist across sessions
6. 📝 Use `knowledge_docs_sync` to maintain readable docs
7. 🔍 Use `knowledge_graph_search` to find entities
8. ✔️ Use `knowledge_graph_validate` regularly

## Troubleshooting

**"Invalid entity type" error**
→ Use `knowledge_ontology_view` to see exact type names

**Graph not persisting**
→ Check that `.knowledge/knowledge-graph.json` file is being created

**Memory sync not working**
→ Ensure memory MCP tool is also configured in mcp.json

**Diagrams not rendering**
→ Copy the Mermaid output and paste into a Markdown file to preview

**Not sure which ontology to choose?**
→ Start with **standard** for traditional architecture
→ Use **nomad** if modeling living systems, team culture, or AI-assisted codebases

## Documentation

- Full documentation: [README.md](./README.md)
- Architectural details: [.knowledge/mcp-knowledge/README.md](../.knowledge/mcp-knowledge/README.md)
- Tool parameters: See "Tools" section in main README
- NomadArchitecture details: See section below

## NomadArchitecture: A Living System Approach

NomadArchitecture is not just a data structure—it's a **cultural operating system** that encodes:
- **Human intent** — Why the system exists
- **Continuity** — How knowledge survives when people leave
- **Living proof** — Trails that accumulate evidence

### Key Concepts
- **Host** — Delivery skin (replaceable)
- **Feature** — Capability with embedded story (README, Map, Traces)
- **Trail** — Append-only evidence of life
- **Shaman** — Rotating steward (not architect) who keeps the fire alive
- **Core** — Emergent, shared language & contracts
- **Emergence Rhythm** — Host → Features → Foundations → Core (via evidence)

**Best for:** Teams building systems that must outlive individuals.

## Support

1. Check the main README.md for detailed tool documentation
2. Run `knowledge_graph_stats detailed=true` to understand current state
3. Run `knowledge_graph_validate mode=all` to find issues
4. Review the ontology with `knowledge_ontology_view format=markdown`
