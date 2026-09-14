---
entityType: Concept
relations:
  - relates_to: MCPADOService
---

# AvailabilityNFRWorkItem10473

**Type:** Concept

## Observations

- Derived from Azure DevOps work item 10473 ([NFRs] P0 - Availability)
- Availability definition: system operational time; customer value is high; quantify allowable downtime and define RTO/RPO
- Availability analysis areas: SLA (customer-facing) vs SLO/KPIs (internal); RTO/RPO relationship; data durability & integrity checks; automated backup/restore to meet RTO; redundancy & failover to remove single points of failure
- Risk-level guidance based on RTO windows: 0–8h High, 8–24h Moderate, >24h Low
- Availability-related work items list exported to .knowledge/reports/ado/related-to-10473-availability-2026-02-23.csv

## Relations

- relates_to: MCPADOService
