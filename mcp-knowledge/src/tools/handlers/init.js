/**
 * Handler — knowledge_init
 */
const { initializeKnowledgeBase } = require('../../knowledge-base');

function handleInit(args) {
  const targetPath  = args?.targetPath || process.cwd();
  const projectName = args?.projectName || 'Project';
  const ontology    = args?.ontology || 'standard';

  if (!['standard', 'nomad'].includes(ontology)) {
    return {
      content: [{ type: 'text', text: `❌ Invalid ontology: ${ontology}\nAvailable: standard, nomad` }],
    };
  }

  const result = initializeKnowledgeBase(targetPath, projectName, ontology);

  return {
    content: [{
      type: 'text',
      text: `✅ Knowledge base initialized successfully!

**Location:** ${result.path}
**Project:** ${result.projectName}
**Ontology:** ${ontology.toUpperCase()}${ontology === 'nomad' ? ' (Cultural OS: Structure + Culture)' : ' (3-Layer: Strategy/Delivery/Solution)'}
**Structure:**
${result.structure.map(s => `  - ${s}`).join('\n')}

**Next Steps:**
1. Define strategic objectives in strategy/objectives.md
2. Document capabilities in delivery/capabilities/
3. Record architecture decisions in delivery/adr/
4. Add services to solution/services/

Use \`knowledge_graph_add_entity\` to start building your knowledge graph.
`,
    }],
  };
}

module.exports = handleInit;
