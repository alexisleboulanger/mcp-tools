# Knowledge Ontology

## 3-Layer Architecture

```mermaid
graph TD
    subgraph Strategy["Strategy Layer"]
        Pillar["Pillar"]
        Objective["Objective"]
        Metric["Metric"]
    end
    subgraph Delivery["Delivery Layer"]
        CapL1["CapabilityL1"]
        CapL2["CapabilityL2"]
        Gap["Gap"]
        Rec["Recommendation"]
        Process["Process"]
    end
    subgraph Solution["Solution Layer"]
        ADR["ADR"]
        Service["Service"]
        API["SystemAPI"]
        Event["Event"]
        Concept["Concept"]
        Pattern["Pattern"]
        Practice["Practice"]
        Term["Term"]
        Risk["Risk"]
    end
    
    Pillar -->|supports| Objective
    Objective -->|requires| CapL1
    CapL1 -->|contains| CapL2
    CapL1 -->|implements| Service
    Service -->|integrates| API
    ADR -->|guides| Service
    Service -->|uses| Pattern
    Pattern -->|teaches| Practice
    Pattern -->|defines| Concept
    
    classDef strategyStyle fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef deliveryStyle fill:#F5A623,stroke:#B8790E,color:#fff
    classDef solutionStyle fill:#7ED321,stroke:#5A9B18,color:#fff
    
    class Pillar,Objective,Metric strategyStyle
    class CapL1,CapL2,Gap,Rec,Process deliveryStyle
    class ADR,Service,API,Event,Concept,Pattern,Practice,Term,Risk solutionStyle
```

## Entity Types by Layer

### Strategy Layer
- **Pillar**: Strategic pillar (Vision/Strategy layer)
- **Objective**: Measurable business objective
- **Metric**: Key performance indicator

### Delivery Layer
- **CapabilityL1**: Level 1 capability
- **CapabilityL2**: Level 2 capability
- **Gap**: Capability gap or deficiency
- **Recommendation**: Recommended action
- **Process**: Operational or technical process

### Solution Layer
- **ADR**: Architecture Decision Record
- **Service**: Software service
- **SystemAPI**: API or system interface
- **Event**: System event or trigger
- **Concept**: Principle or concept
- **Pattern**: Solution pattern
- **Practice**: Best practice
- **Term**: Glossary term
- **Risk**: Risk or threat

## Relation Types

- **supports_objective**: Supports an objective
- **requires_capability**: Requires a capability
- **requires_process**: Requires a process
- **implements_via_service**: Implemented via service
- **implemented_by_service**: Implemented by service
- **integrates_with**: Integrates with
- **references_concept**: References a concept
- **uses_pattern**: Uses a pattern
- **follows_practice**: Follows a practice
- **mitigates**: Mitigates a risk
- **measures**: Measures a metric

---

Generated: 2026-01-22
