# Knowledge Ontology

Canonical schema for entity types and relationships in the domain knowledge graph.

**Last Updated:** 2026-09-01

## Entity Types by Layer

### Strategy Layer (Vision/Objectives)

- **Pillar**: Strategic pillar or business domain
- **Objective**: Strategic objective or measurable goal
- **Metric**: Success metric for objectives

### Delivery Layer (Capabilities/Gaps)

- **CapabilityL1**: Level 1 capability (high-level)
- **CapabilityL2**: Level 2 capability (specific)
- **Gap**: Capability gap or missing functionality
- **Recommendation**: Improvement recommendation
- **Process**: Operational process or workflow
- **Risk**: Identified risk or threat
- **Release**: Timeboxed release container scoping work items, capabilities, and artifacts
- **Workstream**: Cross-team delivery thread grouping related work items and capabilities
- **WorkItem**: Trackable work unit (Epic/Feature/PBI/Bug/Task) linked to ALM
- **Artifact**: Produced document with artifact_kind metadata (scope brief, validation report, release notes, minutes, BOM delta)

### Solution Layer (Architecture/Services)

- **ADR**: Architecture Decision Record
- **Service**: Software service or component
- **SystemAPI**: External API integration
- **Event**: System event or message
- **Concept**: Core concept abstracted from services
- **Pattern**: Design pattern derived from implementations
- **Practice**: Best practice or standard approach
- **Term**: Glossary term or definition
- **Component**: CMDB/BOM inventory item (hardware, infra, licensed software)
- **BOMSnapshot**: Bill of Materials snapshot capturing component versions at a point in time
- **CMDBSnapshot**: Configuration Management Database snapshot capturing deployment state

## Relationship Types

- **supports_objective**: Pillar supports strategic objective
- **measures**: Metric measures objective success
- **enables**: Capability enables objective achievement
- **implements**: L2 capability implements L1 capability
- **identifies**: Gap identified in capability
- **addresses**: Recommendation addresses gap
- **decides**: ADR decides on recommendation
- **implements_decision**: Service implements decision
- **provides**: Service provides capability
- **uses_api**: Service uses external API
- **emits**: Service emits event
- **follows_pattern**: Service follows design pattern
- **applies_practice**: Service applies best practice
- **defines**: Concept defines pattern foundation
- **relates_to**: Generic relation (use specific relations when possible)
- **scopes**: Release scopes work items, capabilities, or decisions
- **delivers**: Workstream delivers capabilities or work items
- **tracks**: Work item tracks a gap, risk, or recommendation
- **produces**: Release produces artifacts
- **documents**: Artifact documents a decision, service, or process
- **validates**: Artifact validates a work item, service, or release
- **impacts**: Work item impacts a service or component
- **depends_on**: Dependency between work items or services
- **has_version**: Component version captured in BOM snapshot
- **deployed_in**: Component deployment state in CMDB snapshot
- **snapshots**: BOM/CMDB snapshot taken for a specific release
