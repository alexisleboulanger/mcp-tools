// MCP Response Filter — intercepts JSON-RPC responses and strips
// unnecessary ADO work item fields to reduce token consumption.
//
// ADO work items return 40+ fields per item. Agents typically need 10-15.
// Stripping the rest reduces token usage by 60-90% on work item queries.

const { Transform } = require('node:stream');

// Fields to KEEP in ADO work item responses.
// Everything else (System.Watermark, System.Rev, System.AuthorizedAs, etc.) is stripped.
const KEEP_FIELDS = new Set([
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.IterationPath',
  'System.AreaPath',
  'System.Tags',
  'System.Description',
  'System.CreatedDate',
  'System.ChangedDate',
  'System.TeamProject',
  'System.Reason',
  'System.Parent',
  'System.Priority',
  'System.CommentCount',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Common.StateChangeDate',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
]);

// Max length for Description / AcceptanceCriteria text before truncation.
const MAX_TEXT_FIELD_LENGTH = 2000;
const TRUNCATE_FIELDS = new Set([
  'System.Description',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
]);

/**
 * Transform stream that intercepts MCP JSON-RPC messages (Content-Length framed)
 * and filters ADO work item response fields.
 */
class McpResponseFilter extends Transform {
  constructor(options) {
    super(options);
    this._buffer = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    this._drain();
    callback();
  }

  _flush(callback) {
    // Forward any remaining bytes that didn't form a complete message.
    if (this._buffer.length > 0) {
      this.push(this._buffer);
      this._buffer = Buffer.alloc(0);
    }
    callback();
  }

  /** Parse and forward as many complete Content-Length messages as possible. */
  _drain() {
    while (true) {
      const headerEnd = this._buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headerStr = this._buffer.slice(0, headerEnd).toString('utf8');
      const match = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Not a content-length header — forward verbatim up to separator.
        this.push(this._buffer.slice(0, headerEnd + 4));
        this._buffer = this._buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this._buffer.length < bodyEnd) break; // Incomplete body — wait for more.

      const rawBody = this._buffer.slice(bodyStart, bodyEnd).toString('utf8');
      this._buffer = this._buffer.slice(bodyEnd);

      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        // Not valid JSON: forward as-is.
        this.push(Buffer.from(`${headerStr}\r\n\r\n${rawBody}`));
        continue;
      }

      // Only filter tool/call results (method responses with content array).
      if (body.result && Array.isArray(body.result.content)) {
        this._filterContent(body.result.content);
      }

      const filteredStr = JSON.stringify(body);
      const len = Buffer.byteLength(filteredStr, 'utf8');
      this.push(Buffer.from(`Content-Length: ${len}\r\n\r\n${filteredStr}`));
    }
  }

  /** Walk content array and filter work-item data in text items. */
  _filterContent(content) {
    for (const item of content) {
      if (item.type !== 'text' || typeof item.text !== 'string') continue;

      let data;
      try {
        data = JSON.parse(item.text);
      } catch {
        continue; // Not JSON text — leave as-is.
      }

      if (_isWorkItemPayload(data)) {
        item.text = JSON.stringify(_filterWorkItems(data));
      }
    }
  }
}

// ── Detection ────────────────────────────────────────────────

function _hasFields(obj) {
  return obj && typeof obj.fields === 'object' && 'System.Id' in obj.fields;
}

function _isWorkItemPayload(data) {
  if (_hasFields(data)) return true;
  const arr = Array.isArray(data) ? data : (data && Array.isArray(data.value) ? data.value : null);
  return arr !== null && arr.length > 0 && _hasFields(arr[0]);
}

// ── Filtering ────────────────────────────────────────────────

function _filterFields(fields) {
  const out = {};
  for (const key of Object.keys(fields)) {
    if (!KEEP_FIELDS.has(key)) continue;
    let val = fields[key];
    // Truncate long text fields.
    if (TRUNCATE_FIELDS.has(key) && typeof val === 'string' && val.length > MAX_TEXT_FIELD_LENGTH) {
      val = val.slice(0, MAX_TEXT_FIELD_LENGTH) + '… [truncated]';
    }
    // Flatten identity objects (e.g., AssignedTo has displayName + uniqueName + _links).
    if (val && typeof val === 'object' && val.displayName) {
      val = val.displayName;
    }
    out[key] = val;
  }
  return out;
}

function _filterItem(item) {
  if (!item || !item.fields) return item;
  const { _links, relations, ...rest } = item;
  return { ...rest, fields: _filterFields(item.fields) };
}

function _filterWorkItems(data) {
  if (_hasFields(data)) return _filterItem(data);
  if (Array.isArray(data)) return data.map(_filterItem);
  if (data.value && Array.isArray(data.value)) {
    return { ...data, count: data.value.length, value: data.value.map(_filterItem) };
  }
  return data;
}

module.exports = { McpResponseFilter, KEEP_FIELDS };
