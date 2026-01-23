# Recommended Knowledge Base Structure

This document describes the recommended folder organization for knowledge bases created with mcp-knowledge.

## Overview

```
.knowledge/
├── .ontology/              ← Auto-generated diagrams
│   ├── knowledge-ontology.md
│   └── knowledge-model.md
│
├── strategy/               ← WHY? Strategic context
│   ├── objectives.md
│   └── metrics.md
│
├── delivery/               ← WHAT? Capabilities & decisions
│   ├── adr/
│   │   └── decision-index.md
│   ├── capabilities/
│   │   └── README.md
│   └── processes/
│       └── *.md
│
├── solution/               ← HOW? Implementation + abstractions
│   ├── services/
│   │   └── service-name/
│   ├── architecture/
│   │   └── *.md
│   ├── patterns/
│   │   └── design-patterns.md
│   └── concepts/
│       └── core-concepts.md
│
└── knowledge-graph.json    ← Entity-relation graph
```

## Layer Guidelines

### Strategy Layer
**Purpose:** Document WHY the project exists

**Contents:**
- Strategic pillars (business domains)
- Objectives (measurable goals)
- Metrics (success criteria)

**Example:**
```markdown
# Objectives

## Pillar: External Services Integration
Enable seamless integration with external APIs.

## Objective: Unified Interface
Provide consistent tool interface across diverse APIs.

## Metric: Tool Adoption Rate
Target: 80% of AI agent tasks use MCP tools.
```

### Delivery Layer
**Purpose:** Document WHAT capabilities are needed

**Contents:**
- Capabilities (L1 and L2)
- Architecture Decision Records (ADRs)
- Processes (operational workflows)
- Gaps and Recommendations

**ADR Template:**
```markdown
# ADR-NNNN: Decision Title

**Status:** Accepted/Rejected/Superseded
**Date:** YYYY-MM-DD

## Context
What's the situation?

## Options
1. Option A
2. Option B
3. Option C

## Decision
Chosen option and why

## Consequences
✅ Benefits
❌ Drawbacks
```

### Solution Layer
**Purpose:** Document HOW it's implemented, including abstractions

**Contents:**
- Services (actual implementations)
- Architecture documentation
- Patterns (abstracted from services)
- Concepts (abstracted from services)
- Practices (best practices)
- Terms (glossary)

**Service Folder:**
```
services/service-name/
├── README.md           ← Overview
├── architecture.md     ← Technical design
├── authentication.md   ← Auth approach
└── tools.md           ← Tool catalog
```

## File Naming Conventions

- **Markdown files:** kebab-case.md (e.g., `transport-strategy.md`)
- **ADRs:** `ADR-NNNN-kebab-case.md` (e.g., `ADR-0001-transport-strategy.md`)
- **Index files:** `README.md` or `{topic}-index.md`

## Entity Naming Conventions

Follow ontology-schema.json:
- **Strategy entities:** PascalCase (e.g., `UnifiedInterface`)
- **Delivery entities:** PascalCase (e.g., `DataIntegration`, `ADR-0001-transport-strategy`)
- **Solution entities:** PascalCase or kebab-case (e.g., `MCP365`, `mcp-ado-wrapper`)
- **Knowledge entities:** PascalCase (e.g., `APIWrapperPattern`)

## Best Practices

1. **Start with strategy** - Document objectives before implementation
2. **Make decisions explicit** - Use ADRs for all significant decisions
3. **Link entities** - Create relations between related entities
4. **Derive knowledge from solution** - Patterns/concepts should reflect actual implementations
5. **Generate diagrams** - Use visualization tools to show structure
6. **Keep it current** - Update as the project evolves

## Anti-Patterns

❌ **Don't:**
- Create duplicate entities with slight name variations
- Document implementation details in strategy layer
- Skip ADRs for significant decisions
- Create entities without relations
- Mix layers (e.g., putting services in delivery/)

✅ **Do:**
- Search before creating new entities
- Follow naming conventions
- Establish clear relations
- Keep documentation close to code
- Use observations for incremental updates
