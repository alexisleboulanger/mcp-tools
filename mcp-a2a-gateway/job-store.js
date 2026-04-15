const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_JOB_STORE_PATH = process.env.A2A_JOB_STORE_PATH || path.join(__dirname, 'data', 'jobs.json');
const DEFAULT_MAX_ENTRIES = Number(process.env.A2A_JOB_STORE_MAX_ENTRIES || 5000);

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFromDisk(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.jobs)) return parsed.jobs;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return [];
  }

  return [];
}

function saveToDisk(filePath, jobsArray) {
  ensureDir(filePath);
  const payload = {
    version: 1,
    updated_at: new Date().toISOString(),
    jobs: jobsArray,
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function createJobStore(options = {}) {
  const filePath = options.filePath || DEFAULT_JOB_STORE_PATH;
  const maxEntries = Number(options.maxEntries || DEFAULT_MAX_ENTRIES);

  const map = new Map();
  const initial = loadFromDisk(filePath);
  for (const item of initial) {
    if (item && item.job_id) {
      map.set(item.job_id, item);
    }
  }

  function pruneIfNeeded() {
    if (map.size <= maxEntries) return;
    const values = [...map.values()].sort((a, b) => {
      const at = Date.parse(a.updated_at || a.created_at || 0);
      const bt = Date.parse(b.updated_at || b.created_at || 0);
      return at - bt;
    });

    const removeCount = values.length - maxEntries;
    for (let i = 0; i < removeCount; i += 1) {
      map.delete(values[i].job_id);
    }
  }

  function persist() {
    const jobs = [...map.values()].sort((a, b) => {
      const at = Date.parse(a.created_at || 0);
      const bt = Date.parse(b.created_at || 0);
      return at - bt;
    });
    saveToDisk(filePath, jobs);
  }

  return {
    filePath,
    size() {
      return map.size;
    },
    get(jobId) {
      return map.get(jobId) || null;
    },
    set(job) {
      map.set(job.job_id, job);
      pruneIfNeeded();
      persist();
      return job;
    },
    upsert(jobId, updater) {
      const current = map.get(jobId);
      const next = updater(current);
      if (!next || !next.job_id) {
        throw new Error('upsert updater must return a job with job_id');
      }
      map.set(jobId, next);
      pruneIfNeeded();
      persist();
      return next;
    },
    toArray() {
      return [...map.values()];
    },
  };
}

module.exports = {
  DEFAULT_JOB_STORE_PATH,
  createJobStore,
};
