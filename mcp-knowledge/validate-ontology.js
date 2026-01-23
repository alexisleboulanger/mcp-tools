#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read server.js to extract ontology
const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extract entity types from getDefaultOntology() function
const match = serverCode.match(/entityTypes:\s*\[([\s\S]+?)\],\s*relationTypes:/);
if (!match) {
  console.error('Could not extract entity types from server.js');
  process.exit(1);
}

const entityTypeLines = match[1].split('\n').filter(line => line.includes("name:"));
const entityTypes = entityTypeLines.map(line => {
  const nameMatch = line.match(/name:\s*'([^']+)'/);
  const layerMatch = line.match(/layer:\s*'([^']+)'/);
  return nameMatch && layerMatch ? { name: nameMatch[1], layer: layerMatch[1] } : null;
}).filter(Boolean);

console.log('=== STANDARD ONTOLOGY FROM server.js ===\n');

const byLayer = {};
entityTypes.forEach(e => {
  if (!byLayer[e.layer]) byLayer[e.layer] = [];
  byLayer[e.layer].push(e.name);
});

Object.keys(byLayer).sort().forEach(layer => {
  console.log(`${layer.toUpperCase()} (${byLayer[layer].length}):`);
  console.log('  ' + byLayer[layer].join(', '));
  console.log();
});

console.log(`Total: ${entityTypes.length} types\n`);

// Read knowledge-graph.json
const graphPath = path.join(__dirname, '..', '.knowledge', 'knowledge-graph.json');
if (fs.existsSync(graphPath)) {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  console.log('=== ONTOLOGY IN knowledge-graph.json ===\n');
  
  const graphByLayer = {};
  graph.ontology.entityTypes.forEach(e => {
    if (!graphByLayer[e.layer]) graphByLayer[e.layer] = [];
    graphByLayer[e.layer].push(e.name);
  });
  
  Object.keys(graphByLayer).sort().forEach(layer => {
    console.log(`${layer.toUpperCase()} (${graphByLayer[layer].length}):`);
    console.log('  ' + graphByLayer[layer].join(', '));
    console.log();
  });
  
  console.log(`Total: ${graph.ontology.entityTypes.length} types\n`);
  
  // Check for mismatches
  console.log('=== VALIDATION ===\n');
  
  const serverEntityNames = new Set(entityTypes.map(e => e.name));
  const graphEntityNames = new Set(graph.ontology.entityTypes.map(e => e.name));
  
  const missingInGraph = entityTypes.filter(e => !graphEntityNames.has(e.name));
  const missingInServer = graph.ontology.entityTypes.filter(e => !serverEntityNames.has(e.name));
  
  if (missingInGraph.length > 0) {
    console.log('❌ Types in server.js but NOT in knowledge-graph.json:');
    missingInGraph.forEach(e => console.log(`   - ${e.name} (${e.layer})`));
    console.log();
  }
  
  if (missingInServer.length > 0) {
    console.log('❌ Types in knowledge-graph.json but NOT in server.js:');
    missingInServer.forEach(e => console.log(`   - ${e.name} (${e.layer})`));
    console.log();
  }
  
  // Check layer assignments match
  const layerMismatches = [];
  entityTypes.forEach(serverType => {
    const graphType = graph.ontology.entityTypes.find(g => g.name === serverType.name);
    if (graphType && graphType.layer !== serverType.layer) {
      layerMismatches.push({
        name: serverType.name,
        serverLayer: serverType.layer,
        graphLayer: graphType.layer
      });
    }
  });
  
  if (layerMismatches.length > 0) {
    console.log('❌ Layer assignment mismatches:');
    layerMismatches.forEach(m => console.log(`   - ${m.name}: server.js="${m.serverLayer}" vs graph="${m.graphLayer}"`));
    console.log();
  }
  
  if (missingInGraph.length === 0 && missingInServer.length === 0 && layerMismatches.length === 0) {
    console.log('✅ server.js and knowledge-graph.json are ALIGNED!');
    console.log('✅ All entity types match');
    console.log('✅ All layer assignments match');
  }
} else {
  console.log('⚠️  knowledge-graph.json not found');
}
