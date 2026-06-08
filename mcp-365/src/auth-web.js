/**
 * Web-based token capture for mcp-365
 * 
 * Opens a local web page where the user can securely paste their
 * Graph Explorer token. The token goes browser→localhost only,
 * never through the AI assistant or chat.
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

const AUTH_PORT = 3847;
const GRAPH_EXPLORER_URL = 'https://developer.microsoft.com/en-us/graph/graph-explorer';

/**
 * Start a local web server that:
 * 1. Opens a page with a link to Graph Explorer
 * 2. Provides a secure form to paste the token
 * 3. Saves the token to .env
 * 4. Shuts down automatically
 * 
 * Returns a promise that resolves when the token is received.
 */
export function startAuthServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/auth')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getAuthPage());
      } else if (req.method === 'POST' && req.url === '/token') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { token } = JSON.parse(body);
            if (!token || token.length < 50) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid token' }));
              return;
            }

            // Validate JWT structure
            const parts = token.split('.');
            if (parts.length !== 3) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not a valid JWT token' }));
              return;
            }

            // Decode and check expiry
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            if (payload.exp * 1000 < Date.now()) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Token is already expired' }));
              return;
            }

            // Save to .env
            saveTokenToEnv(token);

            const minutesLeft = Math.round((payload.exp * 1000 - Date.now()) / 60000);
            const scopes = payload.scp?.split(' ') || [];

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              user: payload.name || payload.upn || 'unknown',
              minutesLeft,
              scopeCount: scopes.length,
            }));

            // Shut down server after short delay
            setTimeout(() => {
              server.close();
              resolve({
                user: payload.name || payload.upn,
                minutesLeft,
                scopes,
              });
            }, 500);
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(AUTH_PORT, () => {
      console.error(`[mcp-365] Auth server running at http://localhost:${AUTH_PORT}`);
      openBrowser(`http://localhost:${AUTH_PORT}`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

function saveTokenToEnv(token) {
  let envContent = readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /^MICROSOFT_ACCESS_TOKEN=.*$/m,
    `MICROSOFT_ACCESS_TOKEN=${token}`
  );
  writeFileSync(envPath, envContent, 'utf8');
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` :
              process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.error('[mcp-365] Could not open browser. Visit:', url);
    }
  });
}

function getAuthPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MCP-365 Authentication</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #1a1a2e; color: #eee; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; }
    .container { max-width: 600px; width: 90%; padding: 40px; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
    .subtitle { color: #888; margin-bottom: 32px; }
    .steps { background: #16213e; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .step { display: flex; align-items: flex-start; margin-bottom: 16px; }
    .step:last-child { margin-bottom: 0; }
    .step-num { background: #0078d4; color: white; width: 28px; height: 28px;
                border-radius: 50%; display: flex; align-items: center; justify-content: center;
                font-weight: bold; font-size: 14px; flex-shrink: 0; margin-right: 12px; margin-top: 2px; }
    .step-text { line-height: 1.5; }
    .step-text a { color: #4fc3f7; text-decoration: none; }
    .step-text a:hover { text-decoration: underline; }
    .token-input { width: 100%; padding: 14px; border: 2px solid #333; border-radius: 8px;
                   background: #0d1117; color: #eee; font-family: monospace; font-size: 13px;
                   resize: vertical; min-height: 80px; margin-bottom: 16px; }
    .token-input:focus { outline: none; border-color: #0078d4; }
    .btn { background: #0078d4; color: white; border: none; padding: 14px 32px;
           border-radius: 8px; font-size: 16px; cursor: pointer; width: 100%; font-weight: 600; }
    .btn:hover { background: #106ebe; }
    .btn:disabled { background: #333; cursor: not-allowed; }
    .status { margin-top: 16px; padding: 12px; border-radius: 8px; display: none; }
    .status.success { display: block; background: #1b4332; color: #95d5b2; }
    .status.error { display: block; background: #3d0000; color: #ff6b6b; }
    .security-note { margin-top: 24px; font-size: 12px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>MCP-365 Authentication</h1>
    <p class="subtitle">Securely connect to Microsoft 365</p>
    
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text">
          Open <a href="${GRAPH_EXPLORER_URL}" target="_blank">Graph Explorer</a> and sign in with your account
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text">Click the <strong>"Access token"</strong> tab</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text">Copy the token and paste it below</div>
      </div>
    </div>

    <textarea class="token-input" id="token" placeholder="Paste your access token here..." autocomplete="off" spellcheck="false"></textarea>
    <button class="btn" id="submit" onclick="submitToken()">Save Token</button>
    
    <div class="status" id="status"></div>
    
    <p class="security-note">
      Your token is sent directly to localhost and saved locally.<br>
      It never passes through the AI assistant or any external server.
    </p>
  </div>

  <script>
    async function submitToken() {
      const token = document.getElementById('token').value.trim();
      const status = document.getElementById('status');
      const btn = document.getElementById('submit');
      
      if (!token) { showError('Please paste a token'); return; }
      
      btn.disabled = true;
      btn.textContent = 'Saving...';
      
      try {
        const res = await fetch('/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        
        if (data.success) {
          status.className = 'status success';
          status.innerHTML = '✓ Authenticated as <strong>' + data.user + '</strong><br>' +
            'Token valid for ' + data.minutesLeft + ' minutes (' + data.scopeCount + ' scopes)<br>' +
            '<br>You can close this page. The MCP server will use the new token.';
          btn.textContent = '✓ Done';
          // Clear the token from the textarea for security
          document.getElementById('token').value = '';
        } else {
          showError(data.error || 'Failed to save token');
          btn.disabled = false;
          btn.textContent = 'Save Token';
        }
      } catch (e) {
        showError('Connection failed: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Save Token';
      }
    }
    
    function showError(msg) {
      const status = document.getElementById('status');
      status.className = 'status error';
      status.textContent = msg;
    }
    
    // Auto-focus the textarea
    document.getElementById('token').focus();
  </script>
</body>
</html>`;
}
