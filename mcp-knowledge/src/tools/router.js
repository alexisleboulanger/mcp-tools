/**
 * Tool router — maps tool names to handler functions and registers them on the server.
 *
 * This is the single place that connects definitions (schema) with handlers (logic).
 */
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const toolDefinitions = require('./definitions');

// Handler imports
const handleInit = require('./handlers/init');
const {
  handleGraphRead,
  handleGraphAddEntity,
  handleGraphAddRelation,
  handleGraphDeleteRelation,
  handleGraphExport,
  handleGraphSearch,
  handleGraphStats,
  handleGraphValidate,
} = require('./handlers/graph');
const {
  handleOntologyView,
  handleOntologyExtend,
  handleExtractOntologyToMemory,
} = require('./handlers/ontology');
const handleModelVisualize = require('./handlers/visualize');
const { handleDocsSync, handleSyncMemory } = require('./handlers/sync');
const handleUpdateIndex = require('./handlers/index');

// ─── Name → Handler map ─────────────────────
const handlers = {
  knowledge_init:                       handleInit,
  knowledge_graph_read:                 handleGraphRead,
  knowledge_graph_add_entity:           handleGraphAddEntity,
  knowledge_graph_add_relation:         handleGraphAddRelation,
  knowledge_graph_delete_relation:      handleGraphDeleteRelation,
  knowledge_graph_export:               handleGraphExport,
  knowledge_graph_search:               handleGraphSearch,
  knowledge_graph_stats:                handleGraphStats,
  knowledge_graph_validate:             handleGraphValidate,
  knowledge_ontology_view:              handleOntologyView,
  knowledge_ontology_extend:            handleOntologyExtend,
  knowledge_extract_ontology_to_memory: handleExtractOntologyToMemory,
  knowledge_model_visualize:            handleModelVisualize,
  knowledge_docs_sync:                  handleDocsSync,
  knowledge_sync_memory:                handleSyncMemory,
  knowledge_update_index:               handleUpdateIndex,
};

/**
 * Register ListTools and CallTool request handlers on the given MCP server.
 */
function registerTools(server) {
  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  // Dispatch tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];

    if (!handler) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2) }],
        isError: true,
      };
    }

    try {
      return await handler(args);
    } catch (error) {
      if (error.toMCPResponse) return error.toMCPResponse();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message, tool: name }, null, 2),
        }],
        isError: true,
      };
    }
  });
}

module.exports = registerTools;
