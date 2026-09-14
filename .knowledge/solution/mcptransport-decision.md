---
entityType: ADR
relations:
  - relates_to: TransportMechanisms
  - mitigates: SecurityVulnerabilityRisk
---

# MCPTransportDecision

**Type:** ADR

## Observations

- Decision: Use stdio for local services, SSE for real-time
- Rationale: stdio simpler for Node.js, SSE for persistent connections
- Status: Accepted
- Date: 2026-01

## Relations

- relates_to: TransportMechanisms
- mitigates: SecurityVulnerabilityRisk
