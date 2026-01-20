#!/usr/bin/env node
/**
 * Interactive token helper for mcp-365
 * Supports both Graph Explorer tokens and interactive browser login
 */

import { createInterface } from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig } from './config.js';
import { interactiveLogin } from './auth-interactive.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const tokenCachePath = join(__dirname, '..', '.token-cache.json');

/**
 * Decode JWT to check expiration
 */
function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Check if token is expired or about to expire (within 5 minutes)
 */
function isTokenExpired(token) {
  if (!token) return true;
  
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return true;
  
  const expiresAt = decoded.exp * 1000;
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
  
  return Date.now() > (expiresAt - bufferMs);
}

/**
 * Get token info for display
 */
function getTokenInfo(token) {
  const decoded = decodeJwt(token);
  if (!decoded) return null;
  
  return {
    user: decoded.upn || decoded.unique_name || decoded.name || 'Unknown',
    expiresAt: new Date(decoded.exp * 1000),
    scopes: decoded.scp?.split(' ') || [],
    app: decoded.app_displayname || 'Unknown App',
  };
}

/**
 * Read current token from .env
 */
function getCurrentToken() {
  try {
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/^MICROSOFT_ACCESS_TOKEN=(.*)$/m);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

/**
 * Save token to .env
 */
function saveToken(token) {
  try {
    let envContent = readFileSync(envPath, 'utf8');
    
    if (envContent.includes('MICROSOFT_ACCESS_TOKEN=')) {
      envContent = envContent.replace(
        /^MICROSOFT_ACCESS_TOKEN=.*$/m,
        `MICROSOFT_ACCESS_TOKEN=${token}`
      );
    } else {
      envContent += `\nMICROSOFT_ACCESS_TOKEN=${token}\n`;
    }
    
    writeFileSync(envPath, envContent, 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to save token:', e.message);
    return false;
  }
}

/**
 * Prompt user for new token
 */
async function promptForToken() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Microsoft Graph Explorer Token Required            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║ 1. Go to: https://developer.microsoft.com/graph/graph-explorer');
  console.log('║ 2. Sign in with your Microsoft account');
  console.log('║ 3. Click "Access token" tab and copy the token');
  console.log('║ 4. Paste it below (it will be hidden)');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  return new Promise((resolve) => {
    rl.question('Paste token: ', (token) => {
      rl.close();
      resolve(token.trim());
    });
  });
}

/**
 * Main: Check token and prompt if needed
 */
export async function ensureValidToken() {
  const currentToken = getCurrentToken();
  
  if (currentToken && !isTokenExpired(currentToken)) {
    const info = getTokenInfo(currentToken);
    if (info) {
      const timeLeft = Math.round((info.expiresAt - Date.now()) / 60000);
      console.log(`✓ Token valid for ${timeLeft} minutes (${info.user})`);
      return currentToken;
    }
  }

  // Token missing or expired
  if (currentToken) {
    const info = getTokenInfo(currentToken);
    console.log('⚠ Token expired' + (info ? ` (was: ${info.user})` : ''));
  } else {
    console.log('⚠ No token configured');
  }

  const newToken = await promptForToken();
  
  if (!newToken) {
    console.log('No token provided. Some features will be unavailable.');
    return null;
  }

  // Validate new token
  if (isTokenExpired(newToken)) {
    console.log('⚠ Warning: The provided token appears to be expired.');
  }

  const info = getTokenInfo(newToken);
  if (info) {
    console.log(`\n✓ Token accepted for: ${info.user}`);
    console.log(`  App: ${info.app}`);
    console.log(`  Expires: ${info.expiresAt.toLocaleString()}`);
    console.log(`  Scopes: ${info.scopes.length} permissions`);
  }

  if (saveToken(newToken)) {
    console.log('✓ Token saved to .env\n');
  }

  return newToken;
}

/**
 * CLI: Show current token status
 */
export function showTokenStatus() {
  const token = getCurrentToken();
  
  console.log('\n=== MCP-365 Token Status ===\n');
  
  if (!token) {
    console.log('Status: ❌ No token configured');
    console.log('\nRun: node src/token-helper.js refresh');
    return;
  }

  const info = getTokenInfo(token);
  const expired = isTokenExpired(token);
  
  if (!info) {
    console.log('Status: ⚠ Invalid token format');
    return;
  }

  console.log(`Status: ${expired ? '❌ Expired' : '✓ Valid'}`);
  console.log(`User: ${info.user}`);
  console.log(`App: ${info.app}`);
  console.log(`Expires: ${info.expiresAt.toLocaleString()}`);
  
  if (!expired) {
    const timeLeft = Math.round((info.expiresAt - Date.now()) / 60000);
    console.log(`Time left: ${timeLeft} minutes`);
  }
  
  console.log(`\nScopes (${info.scopes.length}):`);
  
  // Group important scopes
  const importantScopes = ['Mail.Read', 'Files.Read', 'Sites.Read', 'Calendars.Read', 'User.Read'];
  importantScopes.forEach(scope => {
    const hasScope = info.scopes.some(s => s.toLowerCase().startsWith(scope.toLowerCase()));
    console.log(`  ${hasScope ? '✓' : '✗'} ${scope}`);
  });
}

// CLI mode
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  
  if (command === 'login') {
    // Interactive login using Graph Explorer's client ID (no admin consent needed!)
    try {
      const config = loadConfig();
      // No client ID needed - we use Graph Explorer's pre-consented app
      await interactiveLogin(config);
      process.exit(0);
    } catch (e) {
      console.error('Login failed:', e.message);
      process.exit(1);
    }
  } else if (command === 'logout') {
    // Clear cached tokens
    try {
      if (existsSync(tokenCachePath)) {
        writeFileSync(tokenCachePath, '{}', 'utf8');
      }
      // Also clear static token from .env
      let envContent = readFileSync(envPath, 'utf8');
      envContent = envContent.replace(/^MICROSOFT_ACCESS_TOKEN=.*$/m, 'MICROSOFT_ACCESS_TOKEN=');
      writeFileSync(envPath, envContent, 'utf8');
      console.log('✓ Logged out - cached tokens cleared.\n');
    } catch (e) {
      console.error('Logout failed:', e.message);
    }
  } else if (command === 'refresh' || command === 'update') {
    ensureValidToken().then(() => process.exit(0));
  } else if (command === 'status') {
    showTokenStatus();
    showCacheStatus();
  } else {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              MCP-365 Token Helper                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('Commands:');
    console.log('  login     - Interactive browser login (recommended)');
    console.log('  logout    - Clear cached tokens');
    console.log('  status    - Show current authentication status');
    console.log('  refresh   - Manually enter a Graph Explorer token\n');
    console.log('Usage:');
    console.log('  npm run token:login   - Sign in via browser');
    console.log('  npm run token:status  - Check auth status');
    console.log('  npm run token:refresh - Enter Graph Explorer token\n');
    showTokenStatus();
    showCacheStatus();
  }
}

/**
 * Show status of cached interactive tokens
 */
function showCacheStatus() {
  console.log('\n=== Interactive Auth Cache ===\n');
  
  if (!existsSync(tokenCachePath)) {
    console.log('Status: No cached session');
    console.log('Run: npm run token:login\n');
    return;
  }
  
  try {
    const cache = JSON.parse(readFileSync(tokenCachePath, 'utf8'));
    
    // Check for MSAL cache structure
    if (cache.Account) {
      const accounts = Object.values(cache.Account);
      if (accounts.length > 0) {
        const account = accounts[0];
        console.log('Status: ✓ Session cached');
        console.log(`User: ${account.username || 'Unknown'}`);
        console.log(`Name: ${account.name || 'N/A'}`);
        console.log(`Tenant: ${account.realm || account.tenant_id || 'N/A'}`);
      } else {
        console.log('Status: No active session');
      }
    } else {
      console.log('Status: No active session');
    }
  } catch {
    console.log('Status: Cache invalid or empty');
  }
  console.log('');
}
