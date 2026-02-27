/**
 * Generators — Mermaid diagrams and markdown documentation
 */

// ──────────────────────────────────────────────
// Mermaid diagrams
// ──────────────────────────────────────────────

function generateOntologyDiagram(graph) {
  const ontology = graph.ontology || { entityTypes: [], relationTypes: [] };
  const layers = {};

  // Group entity types by layer
  ontology.entityTypes.forEach(et => {
    const layer = et.layer || 'other';
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(et.name);
  });

  const layerMeta = {
    strategy: { label: 'Strategy Layer', style: 'strategyStyle', fill: '#e1f5ff', stroke: '#01579b' },
    delivery: { label: 'Delivery Layer', style: 'deliveryStyle', fill: '#fff3e0', stroke: '#e65100' },
    solution: { label: 'Solution Layer', style: 'solutionStyle', fill: '#f3e5f5', stroke: '#4a148c' },
  };

  let mermaid = 'graph TB\n';

  // Subgraphs per layer
  Object.entries(layers).forEach(([layer, types]) => {
    const meta = layerMeta[layer] || { label: layer, style: 'defaultStyle', fill: '#f5f5f5', stroke: '#666' };
    const sanitize = n => n.replace(/[^a-zA-Z0-9_]/g, '_');
    mermaid += `    subgraph ${sanitize(layer)}["${meta.label}"]\n`;
    types.forEach(t => {
      mermaid += `        ${sanitize(t)}["${t}"]\n`;
    });
    mermaid += '    end\n\n';
  });

  // Inter-layer arrows
  const layerOrder = Object.keys(layers);
  for (let i = 0; i < layerOrder.length - 1; i++) {
    mermaid += `    ${layerOrder[i]} --> ${layerOrder[i + 1]}\n`;
  }
  mermaid += '\n';

  // Class definitions
  Object.values(layerMeta).forEach(meta => {
    mermaid += `    classDef ${meta.style} fill:${meta.fill},stroke:${meta.stroke},color:#000\n`;
  });
  mermaid += '\n';

  // Assign styles
  Object.entries(layers).forEach(([layer, types]) => {
    const meta = layerMeta[layer];
    if (meta) {
      const sanitize = n => n.replace(/[^a-zA-Z0-9_]/g, '_');
      mermaid += `    class ${types.map(sanitize).join(',')} ${meta.style}\n`;
    }
  });

  return mermaid;
}

function generateModelDiagram(graph) {
  const entities  = graph.entities || {};
  const relations = graph.relations || [];

  if (Object.keys(entities).length === 0) {
    return 'graph TD\n    Empty["No entities in knowledge graph yet"]\n';
  }

  let mermaid = 'graph TD\n';
  const sanitize = n => n.replace(/[^a-zA-Z0-9_]/g, '_');

  Object.values(entities).forEach(entity => {
    mermaid += `    ${sanitize(entity.name)}["${entity.name}<br/><small>(${entity.type})</small>"]\n`;
  });
  mermaid += '\n';

  relations.forEach(rel => {
    mermaid += `    ${sanitize(rel.from)} -->|${rel.type}| ${sanitize(rel.to)}\n`;
  });

  mermaid += '\n    classDef strategyStyle fill:#e1f5ff,stroke:#01579b,color:#000\n';
  mermaid += '    classDef deliveryStyle fill:#fff3e0,stroke:#e65100,color:#000\n';
  mermaid += '    classDef solutionStyle fill:#f3e5f5,stroke:#4a148c,color:#000\n';
  mermaid += '    classDef knowledgeStyle fill:#e8f5e9,stroke:#1b5e20,color:#000\n';

  return mermaid;
}

// ──────────────────────────────────────────────
// Markdown documentation
// ──────────────────────────────────────────────

function generateOntologyDoc(graph) {
  const ontology = graph.ontology;
  let doc = '# Knowledge Ontology\n\n';
  doc += 'Canonical schema for entity types and relationships in the domain knowledge graph.\n\n';
  doc += `**Last Updated:** ${new Date().toISOString().split('T')[0]}\n\n`;
  doc += '## Entity Types by Layer\n\n';

  // Group dynamically
  const layerLabels = {
    strategy: 'Strategy Layer (Vision/Objectives)',
    delivery: 'Delivery Layer (Capabilities/Gaps)',
    solution: 'Solution Layer (Architecture/Services)',
  };

  const layers = {};
  ontology.entityTypes.forEach(t => {
    const l = t.layer || 'other';
    if (!layers[l]) layers[l] = [];
    layers[l].push(t);
  });

  Object.entries(layers).forEach(([layer, types]) => {
    const heading = layerLabels[layer] || layer;
    doc += `### ${heading}\n\n`;
    types.forEach(t => { doc += `- **${t.name}**: ${t.description}\n`; });
    doc += '\n';
  });

  doc += '## Relationship Types\n\n';
  ontology.relationTypes.forEach(rel => {
    doc += `- **${rel.name}**: ${rel.description}\n`;
  });

  return doc;
}

function generateModelDoc(graph) {
  const entities  = graph.entities || {};
  const relations = graph.relations || [];
  const metadata  = graph.metadata || {};

  let doc = '# Knowledge Model\n\n';
  doc += 'Instances of the knowledge domain graph.\n\n';
  doc += `**Last Updated:** ${new Date().toISOString().split('T')[0]}\n`;
  doc += `**Total Entities:** ${metadata.totalEntities}\n`;
  doc += `**Total Relations:** ${metadata.totalRelations}\n\n`;

  if (metadata.categories) {
    doc += '## Entities by Type\n\n';
    Object.entries(metadata.categories).forEach(([type, count]) => {
      doc += `- ${type}: ${count}\n`;
    });
    doc += '\n';
  }

  doc += '## All Entities\n\n';
  Object.values(entities).forEach(entity => {
    doc += `### ${entity.name}\n\n`;
    doc += `**Type:** ${entity.type}\n\n`;
    if (entity.observations?.length) {
      doc += '**Observations:**\n';
      entity.observations.forEach(obs => { doc += `- ${obs}\n`; });
      doc += '\n';
    }
  });

  if (relations.length) {
    doc += '## Relations\n\n';
    relations.forEach(rel => {
      doc += `- ${rel.from} ---[${rel.type}]---> ${rel.to}\n`;
    });
  }

  return doc;
}

module.exports = {
  generateOntologyDiagram,
  generateModelDiagram,
  generateOntologyDoc,
  generateModelDoc,
};
