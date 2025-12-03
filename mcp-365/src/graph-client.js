/**
 * Microsoft Graph API client wrapper
 * Handles authenticated requests to Graph API endpoints
 * Includes graceful degradation for missing permissions
 */

// Permission requirements by API endpoint pattern
const ENDPOINT_PERMISSIONS = {
  '/me/messages': ['Mail.Read', 'Mail.ReadWrite'],
  '/me/mailFolders': ['Mail.Read', 'Mail.ReadWrite'],
  '/me/calendar': ['Calendars.Read', 'Calendars.ReadWrite'],
  '/me/events': ['Calendars.Read', 'Calendars.ReadWrite'],
  '/me/drive': ['Files.Read', 'Files.ReadWrite', 'Files.Read.All', 'Files.ReadWrite.All'],
  '/drives': ['Files.Read', 'Files.ReadWrite', 'Files.Read.All', 'Files.ReadWrite.All'],
  '/sites': ['Sites.Read.All', 'Sites.ReadWrite.All'],
  '/teams': ['Team.ReadBasic.All', 'TeamSettings.Read.All'],
  '/search/query': ['Files.Read.All', 'Mail.Read', 'Calendars.Read'],
};

export class GraphClient {
  constructor(authProvider, config) {
    this.authProvider = authProvider;
    this.config = config;
    this.baseUrl = config.graphBaseUrl;
    this.betaUrl = config.graphBetaUrl;
    this.permissionCache = null; // Cache detected permissions
    this.failedEndpoints = new Set(); // Track endpoints that failed with 403
  }

  /**
   * Check which permissions are likely available based on past failures
   */
  getRequiredPermission(endpoint) {
    for (const [pattern, perms] of Object.entries(ENDPOINT_PERMISSIONS)) {
      if (endpoint.includes(pattern)) {
        return { pattern, permissions: perms };
      }
    }
    return null;
  }

  /**
   * Check if an endpoint has previously failed with permission error
   */
  isEndpointBlocked(endpoint) {
    const req = this.getRequiredPermission(endpoint);
    if (req) {
      return this.failedEndpoints.has(req.pattern);
    }
    return false;
  }

  /**
   * Make an authenticated request to Graph API with graceful degradation
   * @param {string} endpoint - API endpoint (e.g., '/me', '/sites')
   * @param {object} options - Fetch options
   * @param {boolean} useBeta - Use beta API endpoint
   */
  async request(endpoint, options = {}, useBeta = false) {
    // Check if this endpoint type previously failed
    if (this.isEndpointBlocked(endpoint)) {
      const req = this.getRequiredPermission(endpoint);
      throw new PermissionError(
        `Access denied: This API requires ${req.permissions.join(' or ')} permission. ` +
        `Use Graph Explorer token with these scopes or request admin consent.`,
        req.permissions,
        endpoint
      );
    }

    const token = await this.authProvider.getAccessToken();
    const baseUrl = useBeta ? this.betaUrl : this.baseUrl;
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'ConsistencyLevel': 'eventual', // Required for advanced queries
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      
      // Handle permission errors gracefully
      if (response.status === 403 || response.status === 401) {
        const req = this.getRequiredPermission(endpoint);
        if (req) {
          this.failedEndpoints.add(req.pattern);
        }
        
        // Parse error for better message
        let errorDetail = 'Access denied';
        try {
          const parsed = JSON.parse(errorBody);
          errorDetail = parsed.error?.message || errorDetail;
        } catch {}
        
        throw new PermissionError(
          `${errorDetail}. Required permissions: ${req?.permissions?.join(' or ') || 'unknown'}. ` +
          `Try using a Graph Explorer token with broader scopes.`,
          req?.permissions || [],
          endpoint
        );
      }
      
      throw new Error(`Graph API error ${response.status}: ${errorBody}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  /**
   * Safe request that returns null instead of throwing on permission errors
   * Use for optional data that can gracefully degrade
   */
  async safeRequest(endpoint, options = {}, useBeta = false) {
    try {
      return await this.request(endpoint, options, useBeta);
    } catch (e) {
      if (e instanceof PermissionError) {
        console.error(`[mcp-365] ${e.message}`);
        return null;
      }
      throw e;
    }
  }

  /**
   * Get available capabilities based on detected permissions
   */
  async checkCapabilities() {
    const capabilities = {
      user: false,
      mail: false,
      calendar: false,
      files: false,
      sites: false,
      teams: false,
      search: false,
    };

    // Always try user first (most basic permission)
    try {
      await this.get('/me?$select=id');
      capabilities.user = true;
    } catch {}

    // Check other capabilities in parallel
    const checks = [
      { key: 'mail', endpoint: '/me/messages?$top=1&$select=id' },
      { key: 'calendar', endpoint: '/me/events?$top=1&$select=id' },
      { key: 'files', endpoint: '/me/drive?$select=id' },
      { key: 'sites', endpoint: '/sites?$top=1&$select=id' },
      { key: 'teams', endpoint: '/me/joinedTeams?$top=1&$select=id' },
    ];

    await Promise.all(
      checks.map(async ({ key, endpoint }) => {
        try {
          await this.request(endpoint, { method: 'GET' });
          capabilities[key] = true;
        } catch {
          capabilities[key] = false;
        }
      })
    );

    // Search requires at least one content permission
    capabilities.search = capabilities.mail || capabilities.files || capabilities.calendar;

    return capabilities;
  }

  /**
   * GET request helper
   */
  async get(endpoint, useBeta = false) {
    return this.request(endpoint, { method: 'GET' }, useBeta);
  }

  /**
   * POST request helper
   */
  async post(endpoint, body, useBeta = false) {
    return this.request(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      useBeta
    );
  }

  /**
   * Get all pages of a paginated response
   */
  async getAllPages(endpoint, maxItems = 100, useBeta = false) {
    const items = [];
    let nextLink = endpoint;

    while (nextLink && items.length < maxItems) {
      const response = await this.get(nextLink, useBeta);
      if (response.value) {
        items.push(...response.value);
      }
      nextLink = response['@odata.nextLink'] || null;
    }

    return items.slice(0, maxItems);
  }

  // ============================================
  // SharePoint / Sites API
  // ============================================

  /**
   * Search SharePoint sites
   */
  async searchSites(query) {
    const encoded = encodeURIComponent(query);
    return this.get(`/sites?search=${encoded}`);
  }

  /**
   * Get a specific site by URL or ID
   */
  async getSite(siteIdOrUrl) {
    if (siteIdOrUrl.includes('sharepoint.com')) {
      // Parse SharePoint URL to site path
      const url = new URL(siteIdOrUrl);
      const hostName = url.hostname;
      const sitePath = url.pathname;
      return this.get(`/sites/${hostName}:${sitePath}`);
    }
    return this.get(`/sites/${siteIdOrUrl}`);
  }

  /**
   * List document libraries in a site
   */
  async getSiteDrives(siteId) {
    return this.get(`/sites/${siteId}/drives`);
  }

  /**
   * Search within a site's content
   */
  async searchSiteContent(siteId, query, maxResults = 25) {
    const response = await this.post('/search/query', {
      requests: [
        {
          entityTypes: ['driveItem', 'listItem'],
          query: {
            queryString: query,
          },
          from: 0,
          size: maxResults,
          fields: [
            'name',
            'webUrl',
            'lastModifiedDateTime',
            'lastModifiedBy',
            'summary',
            'path',
          ],
          // Scope to specific site
          ...(siteId && {
            sharePointOneDriveOptions: {
              includeContent: 'privateContent,sharedContent',
            },
          }),
        },
      ],
    });

    return response.value?.[0]?.hitsContainers?.[0]?.hits || [];
  }

  // ============================================
  // OneDrive / Files API
  // ============================================

  /**
   * Get current user's OneDrive root
   */
  async getMyDrive() {
    return this.get('/me/drive');
  }

  /**
   * List files in OneDrive folder
   */
  async listDriveItems(driveId, folderId = 'root', maxItems = 50) {
    return this.getAllPages(
      `/drives/${driveId}/items/${folderId}/children?$top=50`,
      maxItems
    );
  }

  /**
   * Get file content (for small text files)
   */
  async getFileContent(driveId, itemId) {
    const token = await this.authProvider.getAccessToken();
    const response = await fetch(
      `${this.baseUrl}/drives/${driveId}/items/${itemId}/content`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        redirect: 'follow',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(driveId, itemId) {
    return this.get(`/drives/${driveId}/items/${itemId}`);
  }

  // ============================================
  // Microsoft Search API
  // ============================================

  /**
   * Unified search across Microsoft 365 content
   * Note: Some entity types can't be combined, so we search compatible groups
   */
  async search(query, entityTypes = ['driveItem', 'listItem', 'message', 'event'], maxResults = 25) {
    // Group compatible entity types
    const fileTypes = entityTypes.filter(t => ['driveItem', 'listItem', 'site'].includes(t));
    const messageTypes = entityTypes.filter(t => t === 'message');
    const eventTypes = entityTypes.filter(t => t === 'event');
    
    const allHits = [];
    
    // Search files/sites
    if (fileTypes.length > 0) {
      try {
        const response = await this.post('/search/query', {
          requests: [{
            entityTypes: fileTypes,
            query: { queryString: query },
            from: 0,
            size: maxResults,
          }],
        });
        const hits = response.value?.[0]?.hitsContainers?.[0]?.hits || [];
        allHits.push(...hits);
      } catch (e) {
        // Ignore search errors for specific entity types
      }
    }
    
    // Search messages
    if (messageTypes.length > 0) {
      try {
        const response = await this.post('/search/query', {
          requests: [{
            entityTypes: ['message'],
            query: { queryString: query },
            from: 0,
            size: maxResults,
          }],
        });
        const hits = response.value?.[0]?.hitsContainers?.[0]?.hits || [];
        allHits.push(...hits);
      } catch (e) {
        // Ignore search errors
      }
    }
    
    // Search events
    if (eventTypes.length > 0) {
      try {
        const response = await this.post('/search/query', {
          requests: [{
            entityTypes: ['event'],
            query: { queryString: query },
            from: 0,
            size: maxResults,
          }],
        });
        const hits = response.value?.[0]?.hitsContainers?.[0]?.hits || [];
        allHits.push(...hits);
      } catch (e) {
        // Ignore search errors
      }
    }
    
    return allHits.slice(0, maxResults);
  }

  // ============================================
  // Mail API
  // ============================================

  /**
   * Search emails
   */
  async searchMail(query, maxResults = 25) {
    const encoded = encodeURIComponent(query);
    return this.getAllPages(
      `/me/messages?$search="${encoded}"&$top=${maxResults}&$select=subject,from,receivedDateTime,bodyPreview,webLink`,
      maxResults
    );
  }

  /**
   * Get recent emails
   */
  async getRecentMail(maxResults = 25) {
    return this.getAllPages(
      `/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,bodyPreview,webLink`,
      maxResults
    );
  }

  // ============================================
  // Calendar API
  // ============================================

  /**
   * Get calendar events in a date range
   */
  async getCalendarEvents(startDate, endDate, maxResults = 50) {
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    return this.getAllPages(
      `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=50&$select=subject,start,end,location,organizer,webLink`,
      maxResults
    );
  }

  // ============================================
  // Teams API
  // ============================================

  /**
   * List user's Teams
   */
  async getMyTeams() {
    return this.get('/me/joinedTeams');
  }

  /**
   * Get channels in a team
   */
  async getTeamChannels(teamId) {
    return this.get(`/teams/${teamId}/channels`);
  }

  /**
   * Get recent messages from a channel
   */
  async getChannelMessages(teamId, channelId, maxResults = 25) {
    return this.getAllPages(
      `/teams/${teamId}/channels/${channelId}/messages?$top=50`,
      maxResults
    );
  }

  // ============================================
  // User API
  // ============================================

  /**
   * Get current user profile
   */
  async getMe() {
    return this.get('/me');
  }

  /**
   * Search users in directory
   */
  async searchUsers(query, maxResults = 25) {
    const encoded = encodeURIComponent(query);
    return this.getAllPages(
      `/users?$filter=startswith(displayName,'${encoded}') or startswith(mail,'${encoded}')&$top=25`,
      maxResults
    );
  }
}

/**
 * Custom error for permission/scope issues
 * Provides helpful context for resolution
 */
export class PermissionError extends Error {
  constructor(message, requiredPermissions = [], endpoint = '') {
    super(message);
    this.name = 'PermissionError';
    this.requiredPermissions = requiredPermissions;
    this.endpoint = endpoint;
    this.isPermissionError = true;
  }

  /**
   * Get help text for resolving the permission issue
   */
  getHelpText() {
    return `
To resolve this permission issue:

1. Graph Explorer (Quick fix):
   - Go to https://developer.microsoft.com/graph/graph-explorer
   - Sign in and consent to: ${this.requiredPermissions.join(', ')}
   - Copy the access token to your .env file

2. Azure CLI (Limited scopes):
   - Azure CLI tokens have predefined scopes
   - Cannot access: Mail, Calendar, Files content
   - Can access: User info, Groups, Directory

3. Admin Consent (Permanent fix):
   - Request IT to grant admin consent to your app
   - Permissions needed: ${this.requiredPermissions.join(', ')}
`;
  }
}
