/**
 * Configuration — paths, TTL defaults, constants
 */
const path = require('node:path');

const CACHE_ROOT = process.env.CACHE_PATH ||
  path.join(process.cwd(), '.cache');

// Default TTL (minutes) per source — overridable via cache_write ttl_minutes param
const DEFAULT_TTL = {
  'ado-workitems':     30,
  'ado-repos':         20,
  'ado-wiki':          60,
  'o365-content':      60,
  'meeting-report':    15,
  'miro-board':        30,
  'grafana-reporting': 10,
  'internet-research': 120,
};

// Stale threshold: entries older than this (hours) are treated as expired, not stale
const STALE_THRESHOLD_HOURS = 24;

// Prune limit: max entries per source before oldest are removed
const MAX_ENTRIES_PER_SOURCE = 200;

module.exports = {
  CACHE_ROOT,
  DEFAULT_TTL,
  STALE_THRESHOLD_HOURS,
  MAX_ENTRIES_PER_SOURCE,
};
