#!/usr/bin/env node
/**
 * Quick Token Refresh for mcp-365
 * 
 * Opens Graph Explorer in the browser with required scopes pre-selected,
 * prompts for token paste, validates it, and updates .env.
 * 
 * Usage: node src/quick-token.js
 * Or:    npm run token:quick
 */

import { createInterface } from 'readline';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

// Scopes needed for M365 access (user-consentable in Graph Explorer)
const REQUIRED_SCOPES = [
  'User.Read',
  'Mail.Read',
  'Calendars.Read',
  'Files.Read.All',
  'Sites.Read.All',
];

// Graph Explorer URL — user must consent to scopes in the "Modify permissions" tab
const GRAPH_EXPLORER_URL = 'https://developer.microsoft.com/en-us/graph/graph-explorer';

function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    // Try standard base64 (some tokens don't use base64url)
    try {
      const parts = token.split('.');
      const payload = Buffer.from(parts[1], 'base64').toString('utf8');
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
}

function saveToken(token) {
  let envContent = readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /^MICROSOFT_ACCESS_TOKEN=.*$/m,
    `MICROSOFT_ACCESS_TOKEN=${token}`
  );
  writeFileSync(envPath, envContent, 'utf8');
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'start ""' :
              process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           MCP-365 Quick Token Refresh                      ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                                                            ║');
  console.log('║  Opening Graph Explorer in your browser...                 ║');
  console.log('║                                                            ║');
  console.log('║  Steps:                                                    ║');
  console.log('║  1. Sign in (if not already)                               ║');
  console.log('║  2. Click "Modify permissions" tab                         ║');
  console.log('║  3. Consent to required scopes (see below)                 ║');
  console.log('║  4. Click "Access token" tab                               ║');
  console.log('║  5. Click the copy button                                  ║');
  console.log('║  6. Paste the token here                                   ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Required scopes (consent in "Modify permissions"):');
  REQUIRED_SCOPES.forEach(s => console.log(`  • ${s}`));
  console.log('');

  // Open browser
  openBrowser(GRAPH_EXPLORER_URL);

  // Prompt for token
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const token = await new Promise(resolve => {
    rl.question('Paste access token: ', answer => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!token) {
    console.log('❌ No token provided.');
    process.exit(1);
  }

  // Validate
  const decoded = decodeJwt(token);
  if (!decoded) {
    console.log('❌ Invalid token format (not a JWT).');
    process.exit(1);
  }

  const expiresAt = new Date(decoded.exp * 1000);
  const now = Date.now();
  if (now > decoded.exp * 1000) {
    console.log('⚠  Warning: This token is already expired!');
    console.log(`   Expired: ${expiresAt.toLocaleString()}`);
    process.exit(1);
  }

  const minutesLeft = Math.round((decoded.exp * 1000 - now) / 60000);
  const scopes = decoded.scp?.split(' ') || [];

  // Check for missing scopes
  const missing = REQUIRED_SCOPES.filter(
    req => !scopes.some(s => s.toLowerCase().startsWith(req.toLowerCase().replace('.all', '')))
  );

  console.log('');
  console.log(`✓ User:    ${decoded.upn || decoded.unique_name || 'unknown'}`);
  console.log(`✓ Expires: ${expiresAt.toLocaleString()} (${minutesLeft} min left)`);
  console.log(`✓ Scopes:  ${scopes.length} permissions`);

  if (missing.length > 0) {
    console.log('');
    console.log('⚠  Missing recommended scopes:');
    missing.forEach(s => console.log(`   ✗ ${s}`));
    console.log('   (Some features may not work. Consent in Graph Explorer → Modify permissions)');
  }

  // Save
  saveToken(token);
  console.log('');
  console.log('✓ Token saved to .env');
  console.log('');
  console.log('Next: Restart the MCP server (reload VS Code window) to pick up the new token.');
  console.log('');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
