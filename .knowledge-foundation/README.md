# Knowledge Foundation - Reference Ontology

**Purpose:** Foundational structure and best practices for knowledge graphs using mcp-knowledge.

This folder contains the **reference ontology** that mcp-knowledge uses to bootstrap new knowledge bases.

## What Is This?

This is NOT an instance of a knowledge base. It's the **template and reference** for creating knowledge bases.

- **ontology-schema.json** - Defines all entity types and relation types
- **recommended-structure.md** - Folder organization guidance
- **bootstrap-template/** - Empty structure for new projects
- **examples/** - Sample entities showing proper usage

## Using This

When you call the `knowledge_init` MCP tool, it scaffolds your project using this foundation.

```javascript
// In MCP client:
await callTool('knowledge_init', {
  targetPath: '/path/to/your/project/.knowledge'
})
```

## Layers

### Strategy Layer
- **Pillar** - Strategic pillar (business domain)
- **Objective** - Strategic objective (measurable goal)
- **Metric** - Success metric

### Delivery Layer
- **CapabilityL1** - Level 1 capability (high-level)
- **CapabilityL2** - Level 2 capability (specific)
- **Gap** - Capability gap
- **Recommendation** - Improvement recommendation
- **ADR** - Architecture Decision Record
- **Process** - Operational process

### Solution Layer
- **Service** - Software service/component
- **SystemAPI** - External API integration
- **Event** - System event
- **Concept** - Core concept (abstracted from services)
- **Pattern** - Design pattern (derived from implementations)
- **Practice** - Best practice
- **Term** - Glossary term

## Relation Types

- **supports_objective** - Pillar → Objective
- **measures** - Metric → Objective
- **enables** - CapabilityL1 → Objective
- **implements** - CapabilityL2 → CapabilityL1
- **addresses** - Recommendation → Gap
- **decides** - ADR → Recommendation
- **implements_decision** - Service → ADR
- **uses_api** - Service → SystemAPI
- **follows_pattern** - Service → Pattern
- **applies_practice** - Service → Practice

## See Also

- [Ontology Schema](ontology-schema.json) - Formal definition
- [Bootstrap Template](bootstrap-template/) - Empty structure
- [Examples](examples/) - Sample entities
