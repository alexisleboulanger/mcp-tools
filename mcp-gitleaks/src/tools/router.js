/**
 * Tool router — maps tool names to handler functions and registers them on the server.
 */
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const toolDefinitions = require('./definitions');
const createLogger = require('../../../shared/mcp-logger');
const log = createLogger('mcp-gitleaks');

const {
  handleScan,
  handleFindings,
  handleReport,
  handleVersion,
} = require('./handlers/scan');

// ─── Name → Handler map ─────────────────────
const handlers = {
  gitleaks_scan:     handleScan,
  gitleaks_findings: handleFindings,
  gitleaks_report:   handleReport,
  gitleaks_version:  handleVersion,
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
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
        isError: true,
      };
    }
  });
}

module.exports = registerTools;
