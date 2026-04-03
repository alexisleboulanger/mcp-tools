/**
 * Input validation & normalization for knowledge-graph tool arguments.
 * Throws KnowledgeError on invalid input so callers get structured error responses.
 */
const { KnowledgeError } = require('./errors');

const METADATA_KEYS = new Set([
  'artifact_kind',
  'date',
  'date_range',
  'organizer',
  'participants',
  'key_topics',
  'title',
  'location',
  'start',
  'end',
  'meeting_link',
]);

const SUBSTANCE_MARKERS = [
  /\bdecision\b/i,
  /\bdecided\b/i,
  /\bapproved\b/i,
  /\brejected\b/i,
  /\bagreed\b/i,
  /\baction\b/i,
  /\bowner\b/i,
  /\bdeadline\b/i,
  /\bdue\b/i,
  /\brisk\b/i,
  /\bgap\b/i,
  /\bblocked\b/i,
  /\bdependency\b/i,
  /\bmetric\b/i,
  /\bkpi\b/i,
  /\bsla\b/i,
  /\btarget\b/i,
  /\boutcome\b/i,
  /\bnext step\b/i,
  /\bfollow-up\b/i,
  /\bmitigation\b/i,
  /\bescalat/i,
];

function isMetadataKeyValue(observation) {
  const match = observation.match(/^\s*([a-zA-Z_]+)\s*:\s*(.+)$/);
  if (!match) return false;
  const key = match[1].trim().toLowerCase();
  return METADATA_KEYS.has(key);
}

function hasSubstance(text) {
  return SUBSTANCE_MARKERS.some(rx => rx.test(text));
}

function hasSourceContextFormat(text) {
  return /^(Meeting|Email|Document|Wiki|Repo|ADO|Transcript|Notes?)\s*\(.+\)\s*:/i.test(text.trim());
}

function detectMeetingArtifactKind(observations) {
  for (const obs of observations) {
    const match = obs.match(/^\s*artifact_kind\s*:\s*(.+)$/i);
    if (match) return match[1].trim().toLowerCase();
  }
  return null;
}

function validateObservationQuality({ name, type, observations }) {
  if (!observations.length) return;

  const trimmed = observations
    .map(o => String(o || '').trim())
    .filter(Boolean);

  if (!trimmed.length) return;

  const metadataKeyValueCount = trimmed.filter(isMetadataKeyValue).length;
  const substantiveCount = trimmed.filter(hasSubstance).length;
  const sourceFormattedCount = trimmed.filter(hasSourceContextFormat).length;
  const meetingKind = detectMeetingArtifactKind(trimmed);
  const isMeetingArtifact =
    type === 'Artifact' &&
    (meetingKind === 'meeting-minutes' || meetingKind === 'meeting-cluster');

  // Hard fail for metadata-only meeting artifacts (stub pattern)
  if (isMeetingArtifact && substantiveCount === 0) {
    throw new KnowledgeError(
      'INSUFFICIENT_SUBSTANCE',
      `Entity "${name}" looks like a meeting stub (metadata without findings)`,
      'Provide at least one substantive observation with decisions/risks/gaps/actions, e.g. "Meeting (YYYY-MM-DD, Organizer): Decision ... Gap ... Action ...". If content is unavailable, do not create a new entity; add a stub observation to a related existing entity and create a backlog item to fetch transcript/notes.',
    );
  }

  // Generic guardrail: mostly metadata and no substantive signal
  const metadataRatio = metadataKeyValueCount / trimmed.length;
  if (substantiveCount === 0 && metadataRatio >= 0.6) {
    throw new KnowledgeError(
      'INSUFFICIENT_SUBSTANCE',
      `Entity "${name}" contains mostly metadata and no strategic findings`,
      'Add substantive context: decision rationale, risks, gaps, metrics, owners, deadlines, dependencies, or outcomes. Metadata fields alone (date/organizer/key_topics) are not knowledge.',
    );
  }

  // For meeting artifacts, require at least one well-formed contextual observation
  if (isMeetingArtifact && sourceFormattedCount === 0) {
    throw new KnowledgeError(
      'OBSERVATION_FORMAT_INVALID',
      `Entity "${name}" is missing a contextual observation`,
      'Add at least one observation in the form: "Meeting (YYYY-MM-DD, Organizer): [substantive finding]. [data]. [action/implication]."',
    );
  }
}

function validateAddEntity(args) {
  if (!args.name || typeof args.name !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'name is required and must be a string', 'Provide name as a PascalCase string');
  if (!args.type || typeof args.type !== 'string')
    throw new KnowledgeError('INVALID_INPUT', 'type is required and must be a string', 'Use knowledge_ontology_view to see valid types');
  if (args.observations && !Array.isArray(args.observations)) {
    args.observations = [String(args.observations)]; // coerce string -> array
  }
  args.observations = args.observations || [];

  validateObservationQuality({
    name: args.name,
    type: args.type,
    observations: args.observations,
  });

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
