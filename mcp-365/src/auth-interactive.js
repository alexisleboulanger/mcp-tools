/**
 * Interactive Authentication for Microsoft Graph API
 * 
 * Implements OAuth 2.0 Authorization Code Flow with PKCE
 * - Opens browser for user login and consent
 * - Handles OAuth callback via local HTTP server
 * - Caches tokens with automatic refresh
 * - Supports incremental consent for new scopes
 * 
 * Uses a client application registered for this MCP server. The redirect URI and
 * requested delegated permissions must be permitted by the tenant administrator.
 */

import { PublicClientApplication, CryptoProvider } from '@azure/msal-node';
import { createServer } from 'http';
import { URL } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_CACHE_PATH = join(__dirname, '..', '.token-cache.json');

// Default scopes for M365 access
// These scopes can still require tenant-admin consent under enterprise policy.
const DEFAULT_SCOPES = [
  'User.Read',
  'Files.Read.All',
  'Sites.Read.All',
  'Mail.Read',
  'Calendars.Read',
  'offline_access', // Required for refresh tokens
];

/**
 * Interactive Authentication Provider
 * Uses Authorization Code Flow with PKCE for secure user authentication
 */
export class InteractiveAuthProvider {
  constructor(config) {
    this.config = config;
    this.clientId = config.clientId;
    this.tenantId = config.tenantId || 'common';
    // Always use localhost redirect for auth code + PKCE flow
    // Azure AD supports localhost for public clients per RFC 8252
    this.redirectUri = config.redirectUri || 'http://localhost:3847';
    this.scopes = config.scopes || DEFAULT_SCOPES;
    
    // Ensure offline_access is included for refresh tokens
    if (!this.scopes.includes('offline_access')) {
      this.scopes.push('offline_access');
    }
    
    this.pca = new PublicClientApplication({
      auth: {
        clientId: this.clientId,
        authority: `https://login.microsoftonline.com/${this.tenantId}`,
      },
      cache: {
        cachePlugin: this.createCachePlugin(),
      },
    });
    
    this.cryptoProvider = new CryptoProvider();
    this.account = null;
    this.tokenCache = this.loadTokenCache();
  }

  /**
   * Create MSAL cache plugin for persistence
   */
  createCachePlugin() {
    const cachePath = TOKEN_CACHE_PATH;
    
    return {
      beforeCacheAccess: async (cacheContext) => {
        if (existsSync(cachePath)) {
          try {
            const cache = readFileSync(cachePath, 'utf8');
            cacheContext.tokenCache.deserialize(cache);
          } catch (e) {
            console.error('[mcp-365] Failed to load token cache:', e.message);
          }
        }
      },
      afterCacheAccess: async (cacheContext) => {
        if (cacheContext.cacheHasChanged) {
          try {
            writeFileSync(cachePath, cacheContext.tokenCache.serialize(), 'utf8');
          } catch (e) {
            console.error('[mcp-365] Failed to save token cache:', e.message);
          }
        }
      },
    };
  }

  /**
   * Load custom token cache (for refresh tokens)
   */
  loadTokenCache() {
    try {
      if (existsSync(TOKEN_CACHE_PATH)) {
        return JSON.parse(readFileSync(TOKEN_CACHE_PATH, 'utf8'));
      }
    } catch {
      // Ignore errors
    }
    return {};
  }

  /**
   * Save token cache
   */
  saveTokenCache() {
    try {
      const dir = dirname(TOKEN_CACHE_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(this.tokenCache, null, 2), 'utf8');
    } catch (e) {
      console.error('[mcp-365] Failed to save token cache:', e.message);
    }
  }

  /**
   * Get access token - tries silent acquisition first, then interactive
   */
  async getAccessToken(additionalScopes = []) {
    const scopes = [...new Set([...this.scopes, ...additionalScopes])];
    
    // Try silent acquisition first
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      this.account = accounts[0];
      try {
        const silentResult = await this.pca.acquireTokenSilent({
          scopes,
          account: this.account,
        });
        if (silentResult?.accessToken) {
          console.error(`[mcp-365] Token acquired silently for: ${this.account.username}`);
          return silentResult.accessToken;
        }
      } catch (e) {
        // Silent acquisition failed, need interactive login
        console.error('[mcp-365] Silent token acquisition failed, initiating login...');
      }
    }

    return this.acquireTokenViaBrowser(scopes);
  }

  /**
   * Auth code flow using the redirect URI registered for this MCP application.
   */
  async acquireTokenViaBrowser(scopes) {
    const { verifier, challenge } = await this.cryptoProvider.generatePkceCodes();
    const authCodeUrl = await this.pca.getAuthCodeUrl({
      scopes,
      redirectUri: this.redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    });
    const authCode = await this.startCallbackServer(authCodeUrl);

    const tokenResponse = await this.pca.acquireTokenByCode({
      code: authCode,
      scopes,
      redirectUri: this.redirectUri,
      codeVerifier: verifier,
    });

    if (!tokenResponse) {
      throw new Error('Failed to exchange authorization code for token');
    }

    this.account = tokenResponse.account;
    console.error('');
    console.error('═'.repeat(60));
    console.error(`[mcp-365] ✓ Authenticated as: ${this.account?.username || 'unknown'}`);
    console.error(`[mcp-365] ✓ Token expires: ${tokenResponse.expiresOn?.toLocaleString()}`);
    console.error('[mcp-365] Session cached for silent renewal when the tenant permits it');
    console.error('═'.repeat(60) + '\n');

    return tokenResponse.accessToken;
  }

  /**
   * Read a line from stdin (for paste-back auth flow)
   */
  readLineFromStdin(prompt) {
    return new Promise((resolve) => {
      process.stderr.write(prompt);
      
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.resume();
      
      const onData = (chunk) => {
        data += chunk;
        if (data.includes('\n')) {
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          resolve(data.split('\n')[0]);
        }
      };
      
      process.stdin.on('data', onData);
    });
  }

  /**
   * Start local HTTP server to handle OAuth callback
   */
  startCallbackServer(authCodeUrl) {
    return new Promise((resolve, reject) => {
      const redirectUrl = new URL(this.redirectUri);
      const port = redirectUrl.port || 3847;
      const expectedPath = redirectUrl.pathname || '/';
      
      const server = createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        
        // Accept both the exact path and /auth/callback for flexibility
        if (url.pathname === expectedPath || url.pathname === '/auth/callback' || url.pathname === '/') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.getErrorPage(error, errorDescription));
            server.close();
            reject(new Error(`Authentication error: ${error} - ${errorDescription}`));
            return;
          }
          
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getSuccessPage());
            server.close();
            resolve(code);
            return;
          }
          
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.getErrorPage('missing_code', 'No authorization code received'));
          server.close();
          reject(new Error('No authorization code received'));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(port, () => {
        console.error(`[mcp-365] Callback server listening on port ${port}`);
        console.error('[mcp-365] Opening browser for authentication...\n');
        
        // Open browser
        this.openBrowser(authCodeUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout - no response received within 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Open URL in default browser
   */
  openBrowser(url) {
    const platform = process.platform;
    let command;
    
    switch (platform) {
      case 'darwin':
        command = `open "${url}"`;
        break;
      case 'win32':
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
    }
    
    exec(command, (err) => {
      if (err) {
        console.error('[mcp-365] Could not open browser automatically.');
        console.error('[mcp-365] Please open this URL manually:');
        console.error(`\n${url}\n`);
      }
    });
  }

  /**
   * HTML page shown on successful authentication
   */
  getSuccessPage() {
    return `<!DOCTYPE html>
<html>
<head>
  <title>MCP-365 Authentication</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
           display: flex; justify-content: center; align-items: center; height: 100vh;
           margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .card { background: white; padding: 40px 60px; border-radius: 16px; text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    h1 { color: #2d3748; margin-bottom: 16px; }
    p { color: #718096; margin-bottom: 24px; }
    .icon { font-size: 64px; margin-bottom: 16px; }
    .close-hint { font-size: 14px; color: #a0aec0; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Authentication Successful!</h1>
    <p>You have successfully signed in to MCP-365.</p>
    <p>You can now use Microsoft 365 features in GitHub Copilot.</p>
    <p class="close-hint">You can close this window.</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`;
  }

  /**
   * HTML page shown on authentication error
   */
  getErrorPage(error, description) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>MCP-365 Authentication Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
           display: flex; justify-content: center; align-items: center; height: 100vh;
           margin: 0; background: linear-gradient(135deg, #f56565 0%, #c53030 100%); }
    .card { background: white; padding: 40px 60px; border-radius: 16px; text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 500px; }
    h1 { color: #c53030; margin-bottom: 16px; }
    p { color: #718096; margin-bottom: 16px; }
    .error-code { background: #fed7d7; color: #c53030; padding: 8px 16px; 
                  border-radius: 8px; font-family: monospace; margin: 16px 0; }
    .icon { font-size: 64px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Authentication Failed</h1>
    <div class="error-code">${error}</div>
    <p>${description || 'An error occurred during authentication.'}</p>
    <p>Please close this window and try again.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Request additional scopes (incremental consent)
   */
  async requestAdditionalScopes(newScopes) {
    console.error(`[mcp-365] Requesting additional permissions: ${newScopes.join(', ')}`);
    
    const allScopes = [...new Set([...this.scopes, ...newScopes])];
    return this.acquireTokenInteractive(allScopes);
  }

  /**
   * Sign out - clear cached tokens
   */
  async signOut() {
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    
    for (const account of accounts) {
      await this.pca.getTokenCache().removeAccount(account);
    }
    
    // Clear custom cache
    this.tokenCache = {};
    this.saveTokenCache();
    this.account = null;
    
    console.error('[mcp-365] Signed out successfully');
  }

  /**
   * Get current account info
   */
  getAccountInfo() {
    return this.account ? {
      username: this.account.username,
      name: this.account.name,
      tenantId: this.account.tenantId,
      homeAccountId: this.account.homeAccountId,
    } : null;
  }
}

/**
 * Create interactive auth provider from config
 * If no client ID is provided, uses Graph Explorer's client ID (Microsoft pre-consented app)
 */
export function createInteractiveAuthProvider(config) {
  // No client ID required - we'll use Graph Explorer's pre-consented app
  return new InteractiveAuthProvider(config);
}

/**
 * CLI: Interactive login command
 */
export async function interactiveLogin(config) {
  const provider = createInteractiveAuthProvider(config);
  
  const usingGraphExplorer = provider.clientId === GRAPH_EXPLORER_CLIENT_ID;
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         MCP-365 Interactive Login                          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  if (usingGraphExplorer) {
    console.log('║ Using Graph Explorer (Microsoft pre-consented app)         ║');
    console.log('║ No admin consent required!                                 ║');
  } else {
    console.log('║ This will open a browser window for Microsoft sign-in.    ║');
  }
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('Requested permissions:');
  provider.scopes.filter(s => s !== 'offline_access').forEach(scope => {
    console.log(`  • ${scope}`);
  });
  console.log('');
  
  try {
    const token = await provider.getAccessToken();
    const accountInfo = provider.getAccountInfo();
    
    console.log('\n✓ Successfully authenticated!');
    if (accountInfo) {
      console.log(`  User: ${accountInfo.username}`);
      console.log(`  Name: ${accountInfo.name || 'N/A'}`);
    }
    console.log('\nYou can now use all MCP-365 features.\n');
    
    return token;
  } catch (e) {
    console.error('\n✗ Authentication failed:', e.message);
    throw e;
  }
}
