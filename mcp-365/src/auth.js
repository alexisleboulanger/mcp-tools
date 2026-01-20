/**
 * Authentication provider for Microsoft Graph API
 * Supports multiple auth flows:
 * - Interactive browser login (recommended - uses OAuth 2.0 with PKCE)
 * - Azure CLI (auto-refresh, but limited scopes)
 * - Pre-configured access token (for testing with Graph Explorer)
 * - Device code flow (interactive, delegated permissions)
 * - Client credentials (app-only, for background services)
 */

import { ConfidentialClientApplication, PublicClientApplication } from '@azure/msal-node';
import { exec } from 'child_process';
import { promisify } from 'util';
import { InteractiveAuthProvider } from './auth-interactive.js';

const execAsync = promisify(exec);

/**
 * Creates an authentication provider based on configuration
 * @param {object} config - Configuration from loadConfig()
 * @returns {object} Auth provider with getAccessToken() method
 */
export async function createAuthProvider(config) {
  // Option 1: Pre-configured access token (for testing with Graph Explorer token)
  // This takes priority for quick testing scenarios
  if (config.accessToken) {
    console.error('[mcp-365] Using pre-configured access token');
    return {
      async getAccessToken() {
        return config.accessToken;
      },
      type: 'static',
    };
  }

  // Option 2: Interactive authentication (RECOMMENDED)
  // Uses Graph Explorer's client ID by default - no admin consent needed!
  // Falls back to device code flow which works everywhere
  if (config.useInteractive !== false) {
    const clientId = config.clientId || 'de8bc8b5-d9f9-48b1-a8ad-b748da725064'; // Graph Explorer
    console.error('[mcp-365] Using interactive authentication (Graph Explorer app)');
    const provider = new InteractiveAuthProvider({ ...config, clientId });
    
    // Wrap to match expected interface
    return {
      async getAccessToken(additionalScopes = []) {
        return provider.getAccessToken(additionalScopes);
      },
      async requestAdditionalScopes(scopes) {
        return provider.requestAdditionalScopes(scopes);
      },
      async signOut() {
        return provider.signOut();
      },
      getAccountInfo() {
        return provider.getAccountInfo();
      },
      type: 'interactive',
      provider,
    };
  }

  // Option 3: Azure CLI (handles login & refresh automatically)
  if (config.useAzureCli !== false) {
    const azureCliProvider = await tryAzureCliProvider();
    if (azureCliProvider) {
      return azureCliProvider;
    }
  }

  // Option 4: Client credentials flow (app-only, no user context)
  if (config.clientSecret) {
    console.error('[mcp-365] Using client credentials flow (app-only)');
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });

    let cachedToken = null;

    return {
      async getAccessToken() {
        if (cachedToken && cachedToken.expiresOn > Date.now()) {
          return cachedToken.accessToken;
        }

        const result = await cca.acquireTokenByClientCredential({
          scopes: ['https://graph.microsoft.com/.default'],
        });

        if (!result) {
          throw new Error('Failed to acquire token via client credentials');
        }

        cachedToken = {
          accessToken: result.accessToken,
          expiresOn: result.expiresOn?.getTime() || Date.now() + 3600000,
        };

        return cachedToken.accessToken;
      },
      type: 'client_credentials',
    };
  }

  // Option 5: Device code flow (fallback interactive, delegated permissions)
  if (config.clientId && config.useDeviceCode) {
    console.error('[mcp-365] Using device code flow (interactive)');
    const pca = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });

    let cachedToken = null;
    let account = null;

    return {
      async getAccessToken() {
        if (account) {
          try {
            const silentResult = await pca.acquireTokenSilent({
              scopes: config.scopes,
              account,
            });
            if (silentResult) {
              return silentResult.accessToken;
            }
          } catch {
            // Silent acquisition failed, proceed to interactive
          }
        }

        if (cachedToken && cachedToken.expiresOn > Date.now()) {
          return cachedToken.accessToken;
        }

        const result = await pca.acquireTokenByDeviceCode({
          scopes: config.scopes,
          deviceCodeCallback: (response) => {
            console.error('\n' + '='.repeat(60));
            console.error('[mcp-365] Authentication required');
            console.error(response.message);
            console.error('='.repeat(60) + '\n');
          },
        });

        if (!result) {
          throw new Error('Failed to acquire token via device code');
        }

        account = result.account;
        cachedToken = {
          accessToken: result.accessToken,
          expiresOn: result.expiresOn?.getTime() || Date.now() + 3600000,
        };

        console.error(`[mcp-365] Authenticated as: ${result.account?.username || 'unknown'}`);
        return cachedToken.accessToken;
      },
      type: 'device_code',
    };
  }

  throw new Error(
    'No valid authentication configuration.\n\n' +
    'To authenticate, either:\n' +
    '1. Set MICROSOFT_CLIENT_ID for interactive browser login (recommended)\n' +
    '2. Run "az login" for Azure CLI auth\n' +
    '3. Set MICROSOFT_ACCESS_TOKEN with a Graph Explorer token\n\n' +
    'See README.md for setup instructions.'
  );
}

/**
 * Try to create an Azure CLI-based auth provider
 * Azure CLI is pre-approved in most orgs and handles token refresh
 */
async function tryAzureCliProvider() {
  try {
    // Check if az cli is available and logged in
    const { stdout: accountInfo } = await execAsync('az account show --output json 2>/dev/null');
    const account = JSON.parse(accountInfo);
    
    console.error(`[mcp-365] Using Azure CLI authentication`);
    console.error(`[mcp-365] Logged in as: ${account.user?.name || 'unknown'} (${account.name})`);

    return {
      async getAccessToken() {
        try {
          // Get token for Microsoft Graph - az cli handles refresh automatically
          const { stdout } = await execAsync(
            'az account get-access-token --resource https://graph.microsoft.com --output json'
          );
          const tokenData = JSON.parse(stdout);
          return tokenData.accessToken;
        } catch (error) {
          // Token might be expired, try to refresh
          console.error('[mcp-365] Token expired, please run: az login');
          throw new Error('Azure CLI token expired. Run "az login" to re-authenticate.');
        }
      },
      type: 'azure_cli',
      account: account.user?.name,
    };
  } catch {
    // Azure CLI not available or not logged in
    return null;
  }
}

/**
 * Interactive login via Azure CLI
 * Call this to initiate login if not already authenticated
 */
export async function azureCliLogin() {
  console.error('[mcp-365] Starting Azure CLI login...');
  console.error('[mcp-365] A browser window will open for authentication.');
  
  try {
    await execAsync('az login --output none');
    const { stdout } = await execAsync('az account show --output json');
    const account = JSON.parse(stdout);
    console.error(`[mcp-365] Successfully logged in as: ${account.user?.name}`);
    return true;
  } catch (error) {
    console.error(`[mcp-365] Login failed: ${error.message}`);
    return false;
  }
}
