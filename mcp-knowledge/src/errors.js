/**
 * Structured error types for knowledge-graph MCP responses.
 */

class KnowledgeError extends Error {
  constructor(code, message, recovery) {
    super(message);
    this.code = code;
    this.recovery = recovery;
  }

  toMCPResponse() {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: this.code,
          message: this.message,
          recovery: this.recovery,
        }, null, 2),
      }],
      isError: true,
    };
  }
}

module.exports = { KnowledgeError };
