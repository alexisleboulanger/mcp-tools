const path = require('node:path');

function entityLayer(graph, entity) {
  const definition = (graph.ontology?.entityTypes || []).find(type => type.name === entity.type);
  return definition?.layer || 'solution';
}

function entityProjectionPath(graph, entity) {
  const filename = entity.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.md';
  return path.posix.join(entityLayer(graph, entity), filename);
}

module.exports = { entityLayer, entityProjectionPath };