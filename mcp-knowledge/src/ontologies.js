/**
 * Ontology definitions — Standard (3-layer) and Nomad (Cultural OS)
 */

function getDefaultOntology() {
  return {
    name: 'standard',
    version: '2.0.0',
    description: 'Standard 3-layer ontology: Strategy, Delivery, Solution',
    entityTypes: [
      // Strategy Layer
      { name: 'Pillar',        layer: 'strategy', description: 'Strategic pillar or business domain' },
      { name: 'Objective',     layer: 'strategy', description: 'Strategic objective or measurable goal' },
      { name: 'Metric',        layer: 'strategy', description: 'Success metric for objectives' },

      // Delivery Layer
      { name: 'CapabilityL1',  layer: 'delivery', description: 'Level 1 capability (high-level)' },
      { name: 'CapabilityL2',  layer: 'delivery', description: 'Level 2 capability (specific)' },
      { name: 'Gap',           layer: 'delivery', description: 'Capability gap or missing functionality' },
      { name: 'Recommendation',layer: 'delivery', description: 'Improvement recommendation' },
      { name: 'Process',       layer: 'delivery', description: 'Operational process or workflow' },
      { name: 'Risk',          layer: 'delivery', description: 'Identified risk or threat' },
      { name: 'Release',       layer: 'delivery', description: 'Timeboxed release container scoping work items, capabilities, and artifacts' },
      { name: 'Workstream',    layer: 'delivery', description: 'Cross-team delivery thread grouping related work items and capabilities' },
      { name: 'WorkItem',      layer: 'delivery', description: 'Trackable work unit (Epic/Feature/PBI/Bug/Task) linked to ALM' },
      { name: 'Artifact',      layer: 'delivery', description: 'Produced document with artifact_kind metadata (scope brief, validation report, release notes, minutes, BOM delta)' },

      // Solution Layer
      { name: 'ADR',           layer: 'solution', description: 'Architecture Decision Record' },
      { name: 'Service',       layer: 'solution', description: 'Software service or component' },
      { name: 'SystemAPI',     layer: 'solution', description: 'External API integration' },
      { name: 'Event',         layer: 'solution', description: 'System event or message' },
      { name: 'Concept',       layer: 'solution', description: 'Core concept abstracted from services' },
      { name: 'Pattern',       layer: 'solution', description: 'Design pattern derived from implementations' },
      { name: 'Practice',      layer: 'solution', description: 'Best practice or standard approach' },
      { name: 'Term',          layer: 'solution', description: 'Glossary term or definition' },
      { name: 'Component',     layer: 'solution', description: 'CMDB/BOM inventory item (hardware, infra, licensed software)' },
      { name: 'BOMSnapshot',   layer: 'solution', description: 'Bill of Materials snapshot capturing component versions at a point in time' },
      { name: 'CMDBSnapshot',  layer: 'solution', description: 'Configuration Management Database snapshot capturing deployment state' },
    ],
    relationTypes: [
      { name: 'supports_objective',  description: 'Pillar supports strategic objective' },
      { name: 'measures',            description: 'Metric measures objective success' },
      { name: 'enables',             description: 'Capability enables objective achievement' },
      { name: 'implements',          description: 'L2 capability implements L1 capability' },
      { name: 'identifies',          description: 'Gap identified in capability' },
      { name: 'addresses',           description: 'Recommendation addresses gap' },
      { name: 'decides',             description: 'ADR decides on recommendation' },
      { name: 'implements_decision', description: 'Service implements decision' },
      { name: 'provides',            description: 'Service provides capability' },
      { name: 'uses_api',            description: 'Service uses external API' },
      { name: 'emits',               description: 'Service emits event' },
      { name: 'follows_pattern',     description: 'Service follows design pattern' },
      { name: 'applies_practice',    description: 'Service applies best practice' },
      { name: 'defines',             description: 'Concept defines pattern foundation' },
      { name: 'relates_to',          description: 'Generic relation (use specific relations when possible)' },
      // Release Overlay
      { name: 'scopes',              description: 'Release scopes work items, capabilities, or decisions' },
      { name: 'delivers',            description: 'Workstream delivers capabilities or work items' },
      { name: 'tracks',              description: 'Work item tracks a gap, risk, or recommendation' },
      { name: 'produces',            description: 'Release produces artifacts' },
      { name: 'documents',           description: 'Artifact documents a decision, service, or process' },
      { name: 'validates',           description: 'Artifact validates a work item, service, or release' },
      { name: 'impacts',             description: 'Work item impacts a service or component' },
      { name: 'depends_on',          description: 'Dependency between work items or services' },
      { name: 'has_version',         description: 'Component version captured in BOM snapshot' },
      { name: 'deployed_in',         description: 'Component deployment state in CMDB snapshot' },
      { name: 'snapshots',           description: 'BOM/CMDB snapshot taken for a specific release' },
    ],
  };
}

function getNomadArchitectureOntology() {
  return {
    name: 'nomad',
    version: '1.0.0',
    description: 'NomadArchitecture: Cultural OS encoding intent, continuity, and meaning in software structure',
    entityTypes: [
      // Strategy Layer: Intent & Culture
      { name: 'Vision',       layer: 'strategy', description: 'Guiding north star' },
      { name: 'Principle',    layer: 'strategy', description: 'Core belief (e.g., humans at center, rotation of roles)' },
      { name: 'Culture',      layer: 'strategy', description: 'Shared worldview and rituals' },
      { name: 'Intent',       layer: 'strategy', description: 'Purpose encoded in system shape' },

      // Delivery Layer: Structure & Continuity
      { name: 'Host',         layer: 'delivery', description: 'Delivery skin (API, CLI, UI, Job)—replaceable' },
      { name: 'Feature',      layer: 'delivery', description: 'Capability module carrying story (README, Map, Traces)' },
      { name: 'Connector',    layer: 'delivery', description: 'Shared mechanism within Features' },
      { name: 'Port',         layer: 'delivery', description: 'Local expression of needs/offers' },
      { name: 'Foundation',   layer: 'delivery', description: 'Hardened, general-purpose mechanism' },
      { name: 'Trail',        layer: 'delivery', description: 'Evidence & proof of life (append-only)' },
      { name: 'Ritual',       layer: 'delivery', description: 'Disciplined practice (placement, rotation)' },
      { name: 'Shaman',       layer: 'delivery', description: 'Rotating steward role (not architect, keeps fire alive)' },

      // Solution Layer: Artifacts, Evidence & Learning
      { name: 'Core',         layer: 'solution', description: 'Emergent contracts, shared language, memory' },
      { name: 'Scar',         layer: 'solution', description: 'Mark left by interaction, decision trace' },
      { name: 'Story',        layer: 'solution', description: 'Narrative explaining why & how' },
      { name: 'Contract',     layer: 'solution', description: 'Agreed interface between entities' },
      { name: 'Evidence',     layer: 'solution', description: 'Proof that something works (test, trace, example)' },
      { name: 'Transmission', layer: 'solution', description: 'Onboarding & literacy encoding' },
      { name: 'Tribe',        layer: 'solution', description: 'Shared community understanding' },
      { name: 'Teaching',     layer: 'solution', description: 'Cultural knowledge transfer' },
      { name: 'Pattern',      layer: 'solution', description: 'Repeatable solution' },
      { name: 'Practice',     layer: 'solution', description: 'Ritual or discipline' },
    ],
    relationTypes: [
      // Emergence Relations
      { name: 'evolves_into',       description: 'Feature → Foundation: Pattern matures when evidence accumulates' },
      { name: 'promoted_to',        description: 'Connector/Port → Core: Language crystallizes after reflection' },
      { name: 'hardens_from',       description: 'Connector → Foundation: Repeated mechanisms stabilize' },
      { name: 'crystallizes_from',  description: 'Evidence → Core: Contracts emerge from scars' },

      // Composition Relations
      { name: 'contains',           description: 'Feature contains Connector: Connectors glue Features internally' },
      { name: 'expresses',          description: 'Feature expresses Port: Features declare needs/offers' },
      { name: 'enables',            description: 'Foundation enables Feature: Foundations serve Features' },
      { name: 'composes',           description: 'Host composes Feature: Delivery skins wrap capabilities' },

      // Documentation Relations
      { name: 'carries_story',      description: 'Feature carries Story: Stories explain why' },
      { name: 'documents',          description: 'Story documents Feature: How-to guides (Map)' },
      { name: 'proves',             description: 'Evidence proves Feature: Shows it works (Traces)' },
      { name: 'teaches',            description: 'Transmission teaches Entity: Onboarding encodes literacy' },

      // Governance Relations
      { name: 'embodies_principle', description: 'Entity embodies Principle: Everything reflects principles' },
      { name: 'guarded_by',         description: 'Core guarded by Shaman: Shaman transmits & interprets' },
      { name: 'rotates_with',       description: 'Shaman rotates with Tribe: Role is fleeting, never owns system' },
      { name: 'traces',             description: 'Trail traces Scar: Trails accumulate evidence' },
      { name: 'scars',              description: 'Interaction scars: Decision traces inform Core' },

      // Teaching & Culture
      { name: 'transmits',          description: 'Transmission transmits Worldview' },
      { name: 'encodes',            description: 'Story encodes Intent' },
      { name: 'reflects',           description: 'Structure reflects Principle' },
    ],
  };
}

function selectOntology(name = 'standard') {
  const availableOntologies = {
    standard: getDefaultOntology,
    nomad: getNomadArchitectureOntology,
  };

  const ontologyFn = availableOntologies[name.toLowerCase()];
  if (!ontologyFn) {
    throw new Error(`Unknown ontology: ${name}. Available: ${Object.keys(availableOntologies).join(', ')}`);
  }

  return ontologyFn();
}

module.exports = {
  getDefaultOntology,
  getNomadArchitectureOntology,
  selectOntology,
};
