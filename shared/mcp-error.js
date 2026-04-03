// Shared MCP error response helper.
// Produces { error, message, recovery, next_steps } JSON matching
// the mcp-knowledge / mcp-agent-registry pattern.

/**
 * Build a standardized MCP error response.
 * @param {string} code     - Machine-readable code (e.g., NOT_FOUND, INVALID_INPUT, TIMEOUT)
 * @param {string} message  - Human-readable error description
 * @param {object} [opts]
 * @param {string} [opts.recovery] - Recovery hint for the agent
 * @param {string[]} [opts.next_steps] - Suggested next actions
 * @param {string} [opts.tool] - Tool name that failed
 * @returns {{ content: Array<{type: string, text: string}>, isError: true }}
 */
function mcpError(code, message, opts = {}) {
  const payload = { error: code, message };
  if (opts.tool) payload.tool = opts.tool;
  if (opts.recovery) payload.recovery = opts.recovery;
  if (opts.next_steps && opts.next_steps.length) payload.next_steps = opts.next_steps;
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

/**
 * Wrap an async tool handler with standardized error catching.
 * @param {string} toolName
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
async function withErrorHandling(toolName, fn) {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Classify common error types
    if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
      return mcpError('CONNECTION_ERROR', message, {
        tool: toolName,
        recovery: 'The downstream service is unreachable.',
        next_steps: ['Check if the service is running', 'Verify the endpoint URL'],
      });
    }
    if (message.includes('timeout') || message.includes('Timeout')) {
      return mcpError('TIMEOUT', message, {
        tool: toolName,
        recovery: 'The operation timed out.',
        next_steps: ['Retry with a simpler query', 'Increase timeout if supported'],
      });
    }
    if (message.includes('401') || message.includes('Unauthorized')) {
      return mcpError('AUTH_ERROR', message, {
        tool: toolName,
        recovery: 'Authentication failed.',
        next_steps: ['Check credentials or token', 'Re-authenticate'],
      });
    }
    if (message.includes('404') || message.includes('not found') || message.includes('Not Found')) {
      return mcpError('NOT_FOUND', message, {
        tool: toolName,
        recovery: 'The requested resource was not found.',
        next_steps: ['Check the identifier or query', 'Use a search/list tool first'],
      });
    }

    return mcpError('INTERNAL_ERROR', message, {
      tool: toolName,
      recovery: 'An unexpected error occurred.',
      next_steps: ['Retry the operation', 'Try a different approach'],
    });
  }
}

module.exports = { mcpError, withErrorHandling };
