/**
 * Input validation & normalization for knowledge-graph tool arguments.
 * Throws KnowledgeError on invalid input so callers get structured error responses.
 */
const { KnowledgeError } = require('./errors');

function validateAddEntity(args) {
  if (!args.name || typeof args.name !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'name is required and must be a string', 'Provide name as a PascalCase string');
  if (!args.type || typeof args.type !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'type is required and must be a string', 'Use knowledge_ontology_view to see valid types');
  if (args.observations && !Array.isArray(args.observations)) {
    args.observations = [String(args.observations)]; // coerce string → array
  }
  args.observations = args.observations || [];
  return args;
}

function validateAddRelation(args) {
  if (!args.from || typeof args.from !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'from is required', 'Provide the source entity name');
  if (!args.to || typeof args.to !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'to is required', 'Provide the target entity name');
  if (!args.type || typeof args.type !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'type is required', 'Use knowledge_ontology_view to see valid relation types');
  return args;
}

function validateSearch(args) {
  if (!args.query || typeof args.query !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'query is required', 'Provide a search term');
  const validTypes = ['name', 'type', 'observations', 'all'];
  if (args.searchType && !validTypes.includes(args.searchType))
    throw new KnowledgeError('INVALID_INPUT', `searchType must be one of: ${validTypes.join(', ')}`, 'Omit searchType to search all fields');
  return args;
}

module.exports = { validateAddEntity, validateAddRelation, validateSearch };
