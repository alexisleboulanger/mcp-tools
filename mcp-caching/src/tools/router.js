/**
 * Tool router — maps tool names to handler functions and registers them on the server.
 */
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const toolDefinitions = require('./definitions');
const createLogger = require('../../../shared/mcp-logger');
const log = createLogger('mcp-caching');

const {
  handleCacheRead,
  handleCacheWrite,
  handleCacheInvalidate,
  handleCacheStats,
  handleCacheList,
  handleCachePrune,
} = require('./handlers/cache');

// ─── Name → Handler map ─────────────────────
const handlers = {
  cache_read:       handleCacheRead,
  cache_write:      handleCacheWrite,
  cache_invalidate: handleCacheInvalidate,
  cache_stats:      handleCacheStats,
  cache_list:       handleCacheList,
  cache_prune:      handleCachePrune,
};

/**
 * Register ListTools and CallTool request handlers on the given MCP server.
 */
function registerTools(server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];

    if (!handler) {
      log.warn('Unknown tool requested', { tool: name });
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2) }],
        isError: true,
      };
    }

    const start = Date.now();
    try {
      const result = await handler(args || {});
      log.toolCall(name, args, Date.now() - start);
      return result;
    } catch (error) {
      log.toolCall(name, args, Date.now() - start, { success: false, error: error.message });
      if (error.toMCPResponse) return error.toMCPResponse();
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
        isError: true,
      };
    }
  });
}

module.exports = registerTools;
