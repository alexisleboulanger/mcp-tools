---
entityType: Recommendation
relations:
  - addresses: MissingReleaseScopingModel
  - relates_to: MCPKnowledgeService
---

# ReleaseOverlayExtension

**Type:** Recommendation

## Observations

- Recommendation to extend ontology with a thin 'Release Overlay' — not a redesign but minimal additions for release scoping, workstreams, work items, PR validations, release notes, and CMDB/BOM traceability
- Current ontology already strong for strategy→delivery→solution alignment. What is under-modeled: release as a timeboxed container, backlog/work items, PR validation reports, release notes, BOM/CMDB snapshots/deltas, meetings/minutes as inputs to scope
- Proposed new entity types (Delivery layer): Release (timeboxed, e.g. R2026.04), Workstream (cross-team thread), WorkItem (ADO Epic/Feature/PBI/Bug/Task), Artifact (scope brief, validation report, release notes, minutes, BOM delta)
- Proposed new entity types (Solution layer, optional): Component (for CMDB/BOM items distinct from Service), BOMSnapshot/CMDBSnapshot (can start as Artifact instead)
- Ultra-minimal start: Release + WorkItem + Artifact + Workstream only. Represent meeting minutes as Artifact with artifact_kind: minutes metadata
- Proposed new relation types: scopes (Release→WorkItem/CapabilityL2/ADR), delivers (Workstream→CapabilityL2/WorkItem), tracks (WorkItem→Gap/Risk/Recommendation), produces (Release→Artifact), documents (Artifact→ADR/Service/Process), validates (Artifact→WorkItem/Service/Release), impacts (WorkItem→Service/Component), depends_on (WorkItem→WorkItem or Service→Service)
- Contract-first approach: use Artifact subtype via frontmatter (artifact_kind: release_scope_brief, pr_validation_report, minutes, bom_delta, etc.) instead of creating separate entity types
- Canonical relation 'Service provides CapabilityL2' enables automatic roll-up: which capabilities impacted → which services involved → which risks/patterns/practices apply → which ADRs constrain the release
- 3 recommended release skills: scope_release_from_ADO (produces scope brief), workstreams_builder (produces workstreams plan), bom_cmdb_delta_generator (produces BOM delta)
- 3-agent orchestration model: Release Planner Agent (reads release+ADO), Architect Synthesizer Agent (writes scope brief+workstreams+diagrams), Gatekeeper Agent (checks risks/NFR gates/missing ADRs)
- Release Scope Pack output convention: .architect/artifacts/release/R2026.04/ with 00-scope-brief.md through 06-release-notes-draft.md
- Key decision needed: WorkItem placement — Delivery Layer recommended (execution context)
- Key decision needed: BOM/CMDB modeling — (A) Artifacts only (simplest) vs (B) First-class graph nodes with Component/has_version/deployed_in_env (more powerful impact analysis)
- Anti-drift rules: Use specific relations over generic relates_to, don't add 20 entity types at once, encode 'kind' as metadata first and promote to entity type only if needed
- DECISION 1 (2026-02-27): WorkItem confirmed as Delivery Layer entity type — aligns with execution/delivery context alongside CapabilityL1/L2, Gap, Recommendation, ADR, Process
- DECISION 2 (2026-02-27): BOM/CMDB modeling chosen as Option B — First-class graph nodes (Component, has_version, deployed_in_env) for more powerful impact analysis, not just Artifacts
- Status: Both decisions made, ready for ontology extension implementation
- IMPLEMENTED (2026-02-27): Ontology v2.0.0 patch applied to ontology-schema.json and server.js embedded standard ontology

## Relations

- addresses: MissingReleaseScopingModel
- relates_to: MCPKnowledgeService
