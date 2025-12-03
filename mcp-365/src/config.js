/**
 * Configuration loader for mcp-365
 * Loads from environment variables and .env file
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadConfig() {
  // Load .env from package root
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    dotenvConfig({ path: envPath });
  }
  
  // Also check for .env.local (higher priority)
  const envLocalPath = join(__dirname, '..', '.env.local');
  if (existsSync(envLocalPath)) {
    dotenvConfig({ path: envLocalPath, override: true });
  }

  const config = {
    // Entra ID / Azure AD configuration
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || undefined,
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    
    // Pre-configured tokens (optional, for testing or service accounts)
    accessToken: process.env.MICROSOFT_ACCESS_TOKEN || undefined,
    refreshToken: process.env.MICROSOFT_REFRESH_TOKEN || undefined,
    
    // Scopes
    scopes: (process.env.MICROSOFT_SCOPES || 
      'User.Read Files.Read.All Sites.Read.All Mail.Read Calendars.Read Team.ReadBasic.All'
    ).split(/\s+/).filter(Boolean),
    
    // Optional SharePoint site scope
    sharePointSiteUrl: process.env.SHAREPOINT_SITE_URL || undefined,
    
    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // Graph API base URL
    graphBaseUrl: 'https://graph.microsoft.com/v1.0',
    graphBetaUrl: 'https://graph.microsoft.com/beta',
  };

  // Validation
  if (!config.clientId && !config.accessToken) {
    console.error('[mcp-365] Warning: No MICROSOFT_CLIENT_ID or MICROSOFT_ACCESS_TOKEN configured');
    console.error('[mcp-365] Set up authentication in .env file. See .env.example');
  }

  return config;
}
