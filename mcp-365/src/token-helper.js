#!/usr/bin/env node
/**
 * Interactive token helper for mcp-365
 * Prompts for Graph Explorer token when needed
 */

import { createInterface } from 'readline';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

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
  
  if (command === 'refresh' || command === 'update') {
    ensureValidToken().then(() => process.exit(0));
  } else if (command === 'status') {
    showTokenStatus();
  } else {
    console.log('MCP-365 Token Helper');
    console.log('Usage:');
    console.log('  node src/token-helper.js status   - Show current token status');
    console.log('  node src/token-helper.js refresh  - Prompt for new token');
    showTokenStatus();
  }
}
