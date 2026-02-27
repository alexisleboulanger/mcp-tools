/**
 * Handler — knowledge_model_visualize
 */
const { loadGraph } = require('../../graph');
const { generateOntologyDiagram, generateModelDiagram } = require('../../generators');

function handleModelVisualize(args) {
  const graph = loadGraph();

  const mermaid = args?.type === 'ontology'
    ? generateOntologyDiagram(graph)
    : generateModelDiagram(graph);

  return { content: [{ type: 'text', text: mermaid }] };
}

module.exports = handleModelVisualize;
