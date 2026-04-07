/**
 * Grafana HTTP API client.
 *
 * Handles authentication (Bearer token), request building,
 * and Prometheus datasource proxy calls via Grafana's unified API.
 */

const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

class GrafanaClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl  - Grafana base URL (e.g. https://grafana.pre1.vienna.yorizon.io)
   * @param {string} [opts.apiKey]   - Grafana API key or service-account token
   * @param {string} [opts.username] - Basic auth username (alternative to apiKey)
   * @param {string} [opts.password] - Basic auth password
   * @param {number} [opts.timeoutMs=30000]
   */
  constructor({ baseUrl, apiKey, username, password, timeoutMs = 30000 }) {
    if (!baseUrl) throw new Error('GRAFANA_URL is required');
    if (!apiKey && !(username && password)) {
      throw new Error(
        'Auth required: set GRAFANA_API_KEY or GRAFANA_USER + GRAFANA_PASSWORD',
      );
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this._datasourceCache = null;

    // Build Authorization header once
    if (apiKey) {
      this._authHeader = `Bearer ${apiKey}`;
    } else {
      const creds = Buffer.from(`${username}:${password}`).toString('base64');
      this._authHeader = `Basic ${creds}`;
    }
  }

  // ─── Low-level HTTP ─────────────────────────────────────────

  /**
   * @param {string} method
   * @param {string} urlPath - path relative to baseUrl (e.g. /api/search)
   * @param {object} [body]
   * @param {URLSearchParams} [query]
   * @returns {Promise<object>}
   */
  _request(method, urlPath, body = null, query = null) {
    return new Promise((resolve, reject) => {
      const fullUrl = new URL(urlPath, this.baseUrl);
      if (query) {
        for (const [k, v] of query.entries()) fullUrl.searchParams.set(k, v);
      }

      const isHttps = fullUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers = {
        Authorization: this._authHeader,
        Accept: 'application/json',
      };
      if (body) headers['Content-Type'] = 'application/json';

      const bodyStr = body ? JSON.stringify(body) : null;
      if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

      const req = lib.request(
        fullUrl,
        { method, headers, timeout: this.timeoutMs },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode >= 400) {
              return reject(new Error(`Grafana ${res.statusCode}: ${raw.slice(0, 500)}`));
            }
            try {
              resolve(JSON.parse(raw));
            } catch {
              resolve({ raw });
            }
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Grafana request timeout after ${this.timeoutMs}ms`));
      });
      req.on('error', reject);

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  _get(path, query) {
    return this._request('GET', path, null, query);
  }
  _post(path, body) {
    return this._request('POST', path, body);
  }

  // ─── Datasource helpers ─────────────────────────────────────

  async listDatasources() {
    const ds = await this._get('/api/datasources');
    this._datasourceCache = ds;
    return ds;
  }

  /**
   * Find a Prometheus-type datasource by UID or auto-detect.
   * @param {string} [uid]
   * @returns {Promise<object>} datasource object
   */
  async getPrometheusDatasource(uid) {
    const all = this._datasourceCache || (await this.listDatasources());
    if (uid) {
      const match = all.find((d) => d.uid === uid || d.name === uid);
      if (!match) throw new Error(`Datasource '${uid}' not found`);
      return match;
    }
    // Auto-detect: prefer type=prometheus
    const prom = all.find(
      (d) => d.type === 'prometheus' || d.type === 'Prometheus',
    );
    if (prom) return prom;
    throw new Error(
      'No Prometheus datasource found. Available: ' +
        all.map((d) => `${d.name} (${d.type})`).join(', '),
    );
  }

  // ─── Prometheus query via datasource proxy ──────────────────

  /**
   * Run an instant PromQL query through Grafana's datasource proxy.
   * @param {string} promql
   * @param {object} [opts]
   * @param {string} [opts.datasourceUid]
   * @param {number} [opts.time] - Unix epoch seconds (defaults to now)
   * @returns {Promise<object>} Prometheus API response
   */
  async queryInstant(promql, opts = {}) {
    const ds = await this.getPrometheusDatasource(opts.datasourceUid);
    const query = new URLSearchParams({ query: promql });
    if (opts.time) query.set('time', String(opts.time));
    return this._get(
      `/api/datasources/proxy/${ds.id}/api/v1/query`,
      query,
    );
  }

  /**
   * Run a range PromQL query through Grafana's datasource proxy.
   * @param {string} promql
   * @param {object} opts
   * @param {string} opts.start  - RFC3339 or Unix epoch
   * @param {string} opts.end    - RFC3339 or Unix epoch
   * @param {string} [opts.step] - Step duration (e.g. '60s', '5m')
   * @param {string} [opts.datasourceUid]
   * @returns {Promise<object>} Prometheus API response
   */
  async queryRange(promql, opts = {}) {
    const ds = await this.getPrometheusDatasource(opts.datasourceUid);
    const now = Math.floor(Date.now() / 1000);
    const query = new URLSearchParams({
      query: promql,
      start: opts.start || String(now - 3600),
      end: opts.end || String(now),
      step: opts.step || '60s',
    });
    return this._get(
      `/api/datasources/proxy/${ds.id}/api/v1/query_range`,
      query,
    );
  }

  // ─── Dashboard API ──────────────────────────────────────────

  /**
   * Search dashboards, optionally filtered by query/tag.
   */
  async searchDashboards(queryStr = '', tag = '') {
    const q = new URLSearchParams({ type: 'dash-db' });
    if (queryStr) q.set('query', queryStr);
    if (tag) q.set('tag', tag);
    return this._get('/api/search', q);
  }

  async getDashboard(uid) {
    return this._get(`/api/dashboards/uid/${encodeURIComponent(uid)}`);
  }

  // ─── Alert API ──────────────────────────────────────────────

  async getAlerts(filters = {}) {
    const q = new URLSearchParams();
    if (filters.state) q.set('state', filters.state);
    if (filters.query) q.set('query', filters.query);
    return this._get('/api/alertmanager/grafana/api/v2/alerts', q);
  }

  // ─── Health check ──────────────────────────────────────────

  async health() {
    return this._get('/api/health');
  }
}

module.exports = { GrafanaClient };
