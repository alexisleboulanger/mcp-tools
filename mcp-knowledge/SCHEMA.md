# Knowledge Graph Schema

Canonical schema for entity types and relationships in the MCP Knowledge Server domain knowledge graph.

**Version:** 1.0.0  
**Last Updated:** 2026-01-22

## Overview

The knowledge graph uses a 3-layer architecture that maps from strategic vision through delivery capabilities to technical solutions and abstractions. Each layer builds on the previous, creating a complete model of organizational knowledge.

## Entity Types

### Strategy Layer

Strategic vision and objectives that drive the organization.

#### Pillar
- **Description**: Strategic pillar or strategic initiative
- **Layer**: strategy
- **Purpose**: Represents major strategic thrusts
- **Example**: "DataDrivenTransformation", "CustomerObsession"
- **Relations**: Supported by Objectives
- **Observations**: Context, vision, timeline

#### Objective
- **Description**: Measurable business objective aligned to pillars
- **Layer**: strategy
- **Purpose**: Concrete goals that support strategy
- **Example**: "IncreaseCustomerSatisfaction", "ReduceOperationalCost"
- **Relations**: Supported by Metrics, CapabilityL1
- **Observations**: Target metrics, success criteria, timeline

#### Metric
- **Description**: Key performance indicator or success metric
- **Layer**: strategy
- **Purpose**: Quantifiable measurement of progress
- **Example**: "CustomerNPS", "SystemUptime", "TimeToMarket"
- **Relations**: Measures Objectives, CapabilityL2
- **Observations**: Formula, target value, collection method

### Delivery Layer

Organizational capabilities and the gaps that need addressing.

#### CapabilityL1
- **Description**: Level 1 (business) capability
- **Layer**: delivery
- **Purpose**: Major business capability at high level
- **Example**: "UserManagement", "OrderProcessing", "PaymentHandling"
- **Relations**: Breaks down to CapabilityL2, Supports Objectives
- **Observations**: Current maturity, owned by team, dependencies

#### CapabilityL2
- **Description**: Level 2 (technical) capability
- **Layer**: delivery
- **Purpose**: Technical implementation of L1 capability
- **Example**: "OAuthAuthentication", "JWTTokenManagement", "MFASupport"
- **Relations**: Implements CapabilityL1, Measured by Metric
- **Observations**: Technology stack, owner, current state

#### Gap
- **Description**: Capability gap or deficiency
- **Layer**: delivery
- **Purpose**: Missing or inadequate capability
- **Example**: "NoHorizontalScaling", "SinglePointOfFailure", "ManualDeployment"
- **Relations**: Identifies missing CapabilityL2, Addressed by Recommendation
- **Observations**: Impact assessment, urgency, affected services

#### Recommendation
- **Description**: Recommended action or solution
- **Layer**: delivery
- **Purpose**: Proposed way to address gaps
- **Example**: "ImplementMicroservices", "AddCaching", "AutomateDeployment"
- **Relations**: Addresses Gap, Implements Pattern, Implemented by ADR
- **Observations**: Rationale, estimated effort, dependencies

#### Process
- **Description**: Operational or technical process
- **Layer**: delivery
- **Purpose**: Documented procedure or workflow
- **Example**: "OnboardingProcess", "DeploymentProcedure", "IncidentResponse"
- **Relations**: Implements Practice, Supports Capability
- **Observations**: Steps, owners, frequency, SLAs

#### Risk
- **Description**: Identified risk or threat
- **Layer**: delivery
- **Purpose**: Known challenge or vulnerability requiring mitigation
- **Example**: "VendorLockIn", "DataLoss", "SecurityBreach", "PerformanceDegradation"
- **Relations**: Related to Capability, Mitigated by ADR/Service, Addressed by Recommendation
- **Observations**: Description, likelihood, impact, existing controls, mitigation strategy

### Solution Layer

Architectural decisions and technical implementations.

#### ADR
- **Description**: Architecture Decision Record
- **Layer**: solution
- **Purpose**: Document major technical decisions
- **Example**: "UseKubernetes", "AdoptMicroservices", "ChooseReact"
- **Relations**: Implements Recommendation, Mitigates Risk, References Service
- **Observations**: Context, decision, consequences, alternatives

#### Service
- **Description**: Software service or application component
- **Layer**: solution
- **Purpose**: Deployable unit of software
- **Example**: "AuthenticationService", "OrderService", "PaymentGateway"
- **Relations**: Implements CapabilityL2, References SystemAPI, Handles Event
- **Observations**: Tech stack, owner team, deployment target, SLO

#### SystemAPI
- **Description**: API or system interface
- **Layer**: solution
- **Purpose**: Published interface for service communication
- **Example**: "OrderAPI", "PaymentAPI", "NotificationAPI"
- **Relations**: Exposed by Service, Consumed by Service
- **Observations**: Protocol (REST/gRPC), versioning, authentication, rate limits

#### Event
- **Description**: System event or trigger
- **Layer**: solution
- **Purpose**: Asynchronous communication pattern
- **Example**: "OrderCreated", "PaymentProcessed", "UserRegistered"
- **Relations**: Published by Service, Consumed by Service, Triggers Process
- **Observations**: Schema, topic/channel, publishing service, consuming services

#### Concept
- **Description**: Core concept or principle
- **Layer**: solution
- **Purpose**: Fundamental technical or architectural idea
- **Example**: "Microservices", "CQRS", "EventSourcing", "ZeroTrust"
- **Relations**: Related to other Concepts, Implemented by Pattern
- **Observations**: Definition, context, pros/cons, when to apply
- **Recommended Location**: solution/architecture/concepts/

#### Pattern
- **Description**: Reusable solution pattern
- **Layer**: solution
- **Purpose**: Proven solution to recurring technical problem
- **Example**: "CircuitBreaker", "RetryPattern", "SagaPattern", "CQRS"
- **Relations**: Implements Concept, Used by Service, References Practice
- **Observations**: Problem, solution, consequences, examples, alternatives
- **Recommended Location**: solution/architecture/patterns/

#### Practice
- **Description**: Operational or engineering best practice
- **Layer**: solution
- **Purpose**: Recommended way of building/operating systems
- **Example**: "CodeReview", "PairProgramming", "DocumentAsYouGo", "TestDrivenDevelopment"
- **Relations**: Implements Concept, Used by Process
- **Observations**: Purpose, guidelines, benefits, when to apply, tools
- **Recommended Location**: solution/architecture/practices/

#### Term
- **Description**: Glossary term or domain-specific definition
- **Layer**: solution
- **Purpose**: Establish common vocabulary and documentation
- **Example**: "Availability", "RTO", "RPO", "MTTR", "SLA"
- **Relations**: Related to other Terms, Defines Metric/Capability
- **Observations**: Definition, synonyms, context, related concepts
- **Recommended Location**: solution/glossary/

## Relationship Types

### Structural Relationships

#### supports_objective
- **From**: CapabilityL1 → To: Objective
- **Description**: Capability supports achieving an objective
- **Example**: AuthenticationService supports SecureUserAccess objective

#### measures
- **From**: Metric → To: Objective OR Metric → To: CapabilityL2
- **Description**: Metric measures the achievement or quality
- **Example**: SystemUptime metric measures Availability capability

#### related_to
- **From**: Any → To: Any (same layer preferred)
- **Description**: General relationship between entities
- **Example**: Concept related_to other Concept
- **Used When**: Specific relationship type doesn't apply

### Solution Relationships

#### mitigates
- **From**: ADR OR Service OR Recommendation → To: Risk
- **Description**: Solution reduces or eliminates risk
- **Example**: CircuitBreaker pattern mitigates CascadingFailures risk

#### addresses
- **From**: Recommendation OR ADR → To: Gap
- **Description**: Solution addresses or closes a capability gap
- **Example**: MicroservicesADR addresses Scalability gap

#### resolves
- **From**: Any Solution → To: Problem/Issue
- **Description**: Resolves a known problem or issue
- **Example**: CachingService resolves HighLatency issue

#### references_service
- **From**: ADR OR Pattern OR Concept → To: Service
- **Description**: References a specific service implementation
- **Example**: MicroservicesADR references-service OrderService

#### implements
- **From**: CapabilityL2 OR ADR OR Service → To: Pattern OR Concept OR Practice
- **Description**: Implements a pattern, concept, or practice
- **Example**: AuthService implements OAuth2Pattern

#### defines
- **From**: Term OR Concept → To: Metric OR Capability
- **Description**: Defines the meaning of another entity
- **Example**: "SLA" term defines the concept of service level

### Dependency Relationships

#### depends_on
- **From**: CapabilityL2 OR Service → To: CapabilityL2 OR Service OR SystemAPI
- **Description**: Requires another capability or service
- **Example**: OrderService depends_on PaymentService

#### requires
- **From**: Any → To: Any
- **Description**: General dependency relationship
- **Example**: Microservices pattern requires MessageQueue capability

### Communication Relationships

#### consumes
- **From**: Service → To: SystemAPI OR Event
- **Description**: Service uses an API or subscribes to event
- **Example**: NotificationService consumes OrderCreatedEvent

#### publishes
- **From**: Service → To: Event OR SystemAPI
- **Description**: Service publishes events or exposes API
- **Example**: OrderService publishes OrderCreated event

#### exposes
- **From**: Service → To: SystemAPI
- **Description**: Service exposes an API
- **Example**: PaymentService exposes PaymentAPI

## Naming Conventions

### Entity Names

- **Format**: PascalCase (CapitalizedWords)
- **Length**: 2-50 characters
- **Characters**: Alphanumeric only (no spaces, hyphens, underscores)
- **Uniqueness**: Must be unique within graph
- **Examples**: 
  - AuthenticationService ✓
  - UserManagement ✓
  - API_Gateway ✗ (underscore)
  - api-gateway ✗ (lowercase, hyphen)
  - "Auth Service" ✗ (space)

### Type Names (Entity Types)

- **Format**: PascalCase
- **Scope**: Predefined in ontology
- **Custom**: Can extend but follow same format
- **Examples**: Service, ADR, Gap, Recommendation, Pattern

### Relation Type Names

- **Format**: snake_case (lowercase_with_underscores)
- **Length**: 2-30 characters
- **Examples**: supports_objective, references_service, depends_on

### Observation Content

- **Format**: Plain English sentences
- **Length**: 1-500 characters per observation
- **Style**: Concise, factual, actionable
- **Examples**:
  - "Handles OAuth2 and SAML authentication flows"
  - "Deployed on Kubernetes cluster in prod, staging, dev"
  - "Critical path for user registration flow"

## Validation Rules

### Entity Validation

1. **Name**: Must be non-empty string in PascalCase
2. **Type**: Must match one of defined entity types in ontology
3. **Observations**: Optional, each must be non-empty string
4. **Uniqueness**: Entity name must be unique (no duplicates)

### Relation Validation

1. **From Entity**: Must exist in graph
2. **To Entity**: Must exist in graph
3. **Type**: Must match one of defined relation types in ontology
4. **No Self-loops**: From and To must be different entities (unless explicitly allowed)
5. **No Duplicates**: Same (from, to, type) triple cannot exist twice

### Graph Validation

1. **Referential Integrity**: All relations must reference existing entities
2. **Type Consistency**: All entities must have valid types
3. **Layer Hierarchy**: Ensure proper flows from Strategy → Delivery → Solution
4. **Acyclic** (Optional): Depending on design, may require no cycles in certain relation types

## File Format

### knowledge-graph.json

Location: `.knowledge/knowledge-graph.json`

```json
{
  "version": "1.0.0",
  "created": "ISO8601-timestamp",
  "lastUpdated": "ISO8601-timestamp",
  "entities": {
    "EntityName": {
      "id": "UUID",
      "name": "EntityName",
      "type": "EntityType",
      "created": "ISO8601-timestamp",
      "observations": ["observation1", "observation2"],
      "relations": ["rel-id-1", "rel-id-2"]
    }
  },
  "relations": [
    {
      "id": "unique-id",
      "from": "SourceEntity",
      "to": "TargetEntity",
      "type": "relation_type",
      "created": "ISO8601-timestamp"
    }
  ],
  "ontology": {
    "entityTypes": [
      {"name": "Type1", "layer": "strategy", "description": "..."}
    ],
    "relationTypes": [
      {"name": "relation_type", "description": "..."}
    ]
  },
  "metadata": {
    "totalEntities": 0,
    "totalRelations": 0,
    "categories": {}
  }
}
```

### Generated Documentation Files

- `.knowledge/.ontology/knowledge-ontology.md`: Auto-generated ontology (entity types, relation types, 3-layer architecture)
- `.knowledge/.ontology/knowledge-model.md`: Auto-generated model with Mermaid diagrams and instance documentation

## Extension Points

### Custom Entity Types

Add to ontology.entityTypes:
```json
{
  "name": "CustomType",
  "layer": "solution",
  "description": "Description of custom type"
}
```

### Custom Relation Types

Add to ontology.relationTypes:
```json
{
  "name": "custom_relation",
  "description": "Description of relation"
}
```

### Custom Observations

Observations are free-form strings - design your own content format:
- Key-value pairs: "key:value"
- Structured: "Property: value"
- Timeline: "2026-01: implemented"
- Links: "See: AnotherEntity"

## Examples

### Example 1: Microservices Architecture Decision

```json
{
  "entities": {
    "MicroservicesArchitecture": {
      "type": "ADR",
      "observations": [
        "Decision: Move from monolith to microservices",
        "Context: Monolith cannot scale horizontally",
        "Date: 2026-01-15",
        "Status: Accepted"
      ]
    },
    "MonolithService": {
      "type": "Service",
      "observations": ["Current: Single Rails application", "Status: Being deprecated"]
    },
    "OrderService": {
      "type": "Service",
      "observations": ["New microservice", "Tech: Node.js", "Owner: Platform team"]
    },
    "PaymentService": {
      "type": "Service",
      "observations": ["New microservice", "Tech: Go", "Owner: Payments team"]
    },
    "Scalability": {
      "type": "Gap",
      "observations": ["Current monolith cannot handle load spikes", "Blocking growth"]
    }
  },
  "relations": [
    {"from": "MicroservicesArchitecture", "to": "Scalability", "type": "addresses"},
    {"from": "OrderService", "to": "MonolithService", "type": "replaces"},
    {"from": "PaymentService", "to": "MonolithService", "type": "replaces"}
  ]
}
```

### Example 2: Risk Mitigation

```json
{
  "entities": {
    "DataBreach": {
      "type": "Risk",
      "observations": ["Unencrypted data in transit", "Likelihood: Medium", "Impact: Critical"]
    },
    "TLSEncryption": {
      "type": "ADR",
      "observations": ["Implement TLS for all data in transit", "Accepted: 2026-01-20"]
    },
    "ZeroTrust": {
      "type": "Concept",
      "observations": ["Never trust, always verify"]
    }
  },
  "relations": [
    {"from": "TLSEncryption", "to": "DataBreach", "type": "mitigates"},
    {"from": "TLSEncryption", "to": "ZeroTrust", "type": "implements"}
  ]
}
```

## Migration Path

To migrate from existing documentation:

1. **Identify entities** in existing docs (ADRs, architecture docs, runbooks)
2. **Map to types** using this schema
3. **Extract observations** from documentation
4. **Identify relationships** between entities
5. **Create graph** using knowledge_graph_add_entity and knowledge_graph_add_relation
6. **Validate** using knowledge_graph_validate
7. **Sync to memory** for persistence
8. **Generate docs** to maintain readability

## References

- [MCP Knowledge Server README](../README.md)
- [Knowledge Ontology](knowledge-ontology.md)
- [Knowledge Model](knowledge-model.md)
- [Copilot Instructions](../../../.github/copilot-instructions.md)
