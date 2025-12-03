#!/usr/bin/env node
/**
 * MCP Chat Backup Server
 * 
 * Provides tools for managing VS Code Copilot chat backups:
 * - chat_backup: Find and backup chat sessions from VS Code storage
 * - chat_import: Read a chat backup file and return its content
 * - chat_list: List available chat backups
 * - chat_search: Search chat backups by keyword
 * - chat_save_summary: Save a markdown summary
 * 
 * This tool reads from VS Code's internal chat storage:
 * %APPDATA%/Code/User/workspaceStorage/{workspace-id}/chatSessions/
 * 
 * And exports in VS Code-compatible format for "Chat: Import Chat..."
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Default backup location
const DEFAULT_BACKUP_BASE = process.env.CHAT_BACKUP_PATH || 
  path.join(process.cwd(), '.knowledge', 'chat-backups');

// VS Code workspace storage location
const VSCODE_STORAGE_BASE = process.env.VSCODE_STORAGE_PATH ||
  path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage');

/**
 * Get the backup folder path (flat structure, no year/month subfolders)
 */
function getBackupFolder(basePath = DEFAULT_BACKUP_BASE) {
  return basePath;
}

/**
 * Generate filename for backup
 */
function generateFilename(topic = 'chat') {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '-')
    .slice(0, 16);
  const safeTopic = topic.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `${timestamp}-${safeTopic}.json`;
}

/**
 * Ensure backup folder exists
 */
function ensureBackupFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
}

/**
 * Find all VS Code workspace storage folders and their associated workspaces
 */
function findWorkspaceStorages() {
  const workspaces = [];
  
  if (!fs.existsSync(VSCODE_STORAGE_BASE)) {
    return workspaces;
  }
  
  const entries = fs.readdirSync(VSCODE_STORAGE_BASE, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const storagePath = path.join(VSCODE_STORAGE_BASE, entry.name);
    const workspaceJsonPath = path.join(storagePath, 'workspace.json');
    const chatSessionsPath = path.join(storagePath, 'chatSessions');
    
    if (fs.existsSync(workspaceJsonPath) && fs.existsSync(chatSessionsPath)) {
      try {
        const workspaceJson = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
        const folder = workspaceJson.folder || workspaceJson.workspace || '';
        // Decode URI-encoded path
        const decodedFolder = decodeURIComponent(folder.replace('file:///', '').replace('file://', ''));
        
        workspaces.push({
          id: entry.name,
          storagePath,
          chatSessionsPath,
          workspaceFolder: decodedFolder,
          workspaceName: path.basename(decodedFolder)
        });
      } catch (e) {
        // Skip invalid workspace.json
      }
    }
  }
  
  return workspaces;
}

/**
 * Find chat sessions for a specific workspace
 */
function findChatSessions(chatSessionsPath) {
  const sessions = [];
  
  if (!fs.existsSync(chatSessionsPath)) {
    return sessions;
  }
  
  const files = fs.readdirSync(chatSessionsPath);
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    const filePath = path.join(chatSessionsPath, file);
    try {
      const stats = fs.statSync(filePath);
      sessions.push({
        id: file.replace('.json', ''),
        path: filePath,
        modified: stats.mtime,
        size: stats.size
      });
    } catch (e) {
      // Skip files we can't stat
    }
  }
  
  // Sort by modified date, newest first
  sessions.sort((a, b) => b.modified - a.modified);
  
  return sessions;
}

/**
 * Convert VS Code internal chat format to export format
 * VS Code export format: array of {prompt: string, response: string}
 */
function convertToExportFormat(internalData) {
  const exchanges = [];
  
  if (!internalData.requests || !Array.isArray(internalData.requests)) {
    return exchanges;
  }
  
  for (const request of internalData.requests) {
    // Extract the user prompt
    const prompt = request.message?.text || '';
    
    // Extract the assistant response
    let response = '';
    if (Array.isArray(request.response)) {
      for (const part of request.response) {
        // Handle different response part types
        if (part.value && typeof part.value === 'string') {
          // Skip thinking blocks and tool invocations for clean export
          if (part.kind === 'thinking' || part.kind === 'toolInvocationSerialized' || 
              part.kind === 'prepareToolInvocation' || part.kind === 'mcpServersStarting') {
            continue;
          }
          response += part.value;
        } else if (part.kind === 'markdownContent' && part.content?.value) {
          response += part.content.value;
        }
      }
    }
    
    if (prompt || response) {
      exchanges.push({
        prompt: prompt.trim(),
        response: response.trim()
      });
    }
  }
  
  return exchanges;
}

/**
 * Read and convert a chat session file
 */
function readAndConvertSession(sessionPath) {
  const content = fs.readFileSync(sessionPath, 'utf8');
  const internalData = JSON.parse(content);
  return convertToExportFormat(internalData);
}

/**
 * Search session content for a keyword
 * Returns true if any prompt or response contains the keyword
 */
function sessionContainsKeyword(sessionPath, keyword) {
  try {
    const content = fs.readFileSync(sessionPath, 'utf8');
    const lowerContent = content.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    return lowerContent.includes(lowerKeyword);
  } catch (e) {
    return false;
  }
}

/**
 * Find sessions matching a keyword across all workspaces
 * Returns array of {session, workspace} objects sorted by relevance
 */
function findSessionsByKeyword(workspaces, keyword) {
  const matches = [];
  
  for (const workspace of workspaces) {
    const sessions = findChatSessions(workspace.chatSessionsPath);
    for (const session of sessions) {
      if (sessionContainsKeyword(session.path, keyword)) {
        matches.push({
          session,
          workspace,
          preview: getSessionPreview(session.path, 150)
        });
      }
    }
  }
  
  // Sort by modification date (most recent first)
  matches.sort((a, b) => b.session.modified - a.session.modified);
  
  return matches;
}

/**
 * Get first prompt text from session for preview
 */
function getSessionPreview(sessionPath, maxLength = 100) {
  try {
    const content = fs.readFileSync(sessionPath, 'utf8');
    const data = JSON.parse(content);
    const firstPrompt = data.requests?.[0]?.message?.text || '';
    return firstPrompt.slice(0, maxLength) + (firstPrompt.length > maxLength ? '...' : '');
  } catch (e) {
    return '(unable to read)';
  }
}

/**
 * Extract a topic/title from session content
 * Uses the first prompt or looks for key terms
 */
function extractTopicFromSession(sessionPath) {
  try {
    const content = fs.readFileSync(sessionPath, 'utf8');
    const data = JSON.parse(content);
    
    // Get the first meaningful prompt
    const firstPrompt = data.requests?.[0]?.message?.text || '';
    
    if (!firstPrompt) return 'chat';
    
    // Clean up the prompt - remove @workspace, markdown, etc.
    let topic = firstPrompt
      .replace(/@\w+/g, '')           // Remove @mentions
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/[#*`\[\]()]/g, '')    // Remove markdown
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .trim();
    
    // Take first few meaningful words (up to 5 words or 40 chars)
    const words = topic.split(' ').filter(w => w.length > 2).slice(0, 5);
    topic = words.join(' ').slice(0, 40);
    
    // Make it URL/filename safe
    topic = topic.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    return topic || 'chat';
  } catch (e) {
    return 'chat';
  }
}

/**
 * Find the most recently modified session across all workspaces
 * This identifies the currently active chat window
 */
function findMostRecentSession(workspaces) {
  let mostRecent = null;
  let mostRecentWorkspace = null;
  
  for (const workspace of workspaces) {
    const sessions = findChatSessions(workspace.chatSessionsPath);
    if (sessions.length > 0) {
      const newest = sessions[0]; // Already sorted by date
      if (!mostRecent || newest.modified > mostRecent.modified) {
        mostRecent = newest;
        mostRecentWorkspace = workspace;
      }
    }
  }
  
  return mostRecent ? { session: mostRecent, workspace: mostRecentWorkspace } : null;
}

/**
 * List all backup files recursively
 */
function listBackups(basePath = DEFAULT_BACKUP_BASE, limit = 20) {
  const backups = [];
  
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.json') && !entry.name.startsWith('.')) {
        try {
          const stats = fs.statSync(fullPath);
          const relativePath = path.relative(basePath, fullPath);
          backups.push({
            name: entry.name,
            path: fullPath,
            relativePath,
            modified: stats.mtime,
            size: stats.size
          });
        } catch (e) {
          // Skip files we can't stat
        }
      }
    }
  }
  
  walkDir(basePath);
  backups.sort((a, b) => b.modified - a.modified);
  return backups.slice(0, limit);
}

/**
 * Format chat content for display (supports both export and internal formats)
 */
function formatChatContent(data) {
  let output = [];
  
  // Handle VS Code export format (array of {prompt, response})
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item.prompt !== undefined || item.response !== undefined) {
        output.push(`### Exchange ${i + 1}\n\n**User:** ${item.prompt || '(no prompt)'}\n\n**Assistant:** ${item.response || '(no response)'}`);
      }
    }
  }
  
  if (output.length === 0) {
    output.push('```json\n' + JSON.stringify(data, null, 2).slice(0, 2000) + '\n```');
  }
  
  return output.join('\n\n---\n\n');
}

/**
 * Search backups for keyword
 */
function searchBackups(basePath, keyword, limit = 10) {
  const allBackups = listBackups(basePath, 100);
  const results = [];
  const searchTerm = keyword.toLowerCase();
  
  for (const backup of allBackups) {
    try {
      const content = fs.readFileSync(backup.path, 'utf8');
      if (content.toLowerCase().includes(searchTerm)) {
        const data = JSON.parse(content);
        const matches = [];
        
        if (Array.isArray(data)) {
          for (const item of data) {
            const text = item.prompt || item.response || '';
            if (text.toLowerCase().includes(searchTerm)) {
              matches.push(text.slice(0, 150));
            }
          }
        }
        
        results.push({
          ...backup,
          matchCount: matches.length || 1,
          preview: matches.slice(0, 2)
        });
      }
    } catch (e) {
      // Skip files we can't read
    }
    
    if (results.length >= limit) break;
  }
  
  return results;
}

// Create MCP server
const server = new Server(
  {
    name: 'mcp-chat-backup',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'chat_backup',
        description: `Backup chat sessions from VS Code's internal storage to the backup folder.
Use this when the user says "mcp chat backup" to export their chat history.
Reads from VS Code's chatSessions folder and converts to VS Code-compatible export format.
Automatically detects the current active chat session and extracts a topic from it.`,
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Specific session ID to backup. If not provided, backs up the most recent session.'
            },
            workspacePath: {
              type: 'string',
              description: 'Workspace folder path to find sessions for (defaults to current workspace)'
            },
            basePath: {
              type: 'string',
              description: 'Custom base path for backups (optional, defaults to .knowledge/chat-backups)'
            }
          },
          required: []
        }
      },
      {
        name: 'chat_list_sessions',
        description: `List available chat sessions from VS Code's internal storage.
Shows recent sessions that can be backed up.`,
        inputSchema: {
          type: 'object',
          properties: {
            workspacePath: {
              type: 'string',
              description: 'Workspace folder path to find sessions for (optional)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of sessions to list (default: 10)'
            }
          },
          required: []
        }
      },
      {
        name: 'chat_import',
        description: `Read a chat backup file and return its contents for context in the current conversation.
Use this when the user says "mcp chat import <filename>" or wants to load a previous conversation.
Returns the formatted chat content that can be referenced in the current session.`,
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'The backup filename or path to import (can be relative or absolute)'
            },
            basePath: {
              type: 'string',
              description: 'Custom base path for backups (optional)'
            }
          },
          required: ['filename']
        }
      },
      {
        name: 'chat_list',
        description: `List available chat backup files, sorted by most recent.
Use this to show the user what backups are available for import.`,
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of backups to list (default: 20)'
            },
            basePath: {
              type: 'string',
              description: 'Custom base path for backups (optional)'
            }
          },
          required: []
        }
      },
      {
        name: 'chat_search',
        description: `Search chat backups for a keyword or phrase.
Use this when the user wants to find a previous conversation about a specific topic.`,
        inputSchema: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: 'Keyword or phrase to search for in backup contents'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)'
            },
            basePath: {
              type: 'string',
              description: 'Custom base path for backups (optional)'
            }
          },
          required: ['keyword']
        }
      },
      {
        name: 'chat_save_summary',
        description: `Save a summary or key insights from the current chat to the backup folder.
Use this to capture important decisions, code snippets, or insights without exporting the full chat.`,
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Topic/title for the summary'
            },
            content: {
              type: 'string',
              description: 'Markdown content to save (summary, decisions, code snippets, etc.)'
            },
            basePath: {
              type: 'string',
              description: 'Custom base path for backups (optional)'
            }
          },
          required: ['topic', 'content']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'chat_backup': {
        const basePath = args?.basePath || DEFAULT_BACKUP_BASE;
        const sessionId = args?.sessionId;
        const workspacePath = args?.workspacePath || process.cwd();
        
        // Find VS Code workspaces
        const allWorkspaces = findWorkspaceStorages();
        
        if (allWorkspaces.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `## ⚠️ No VS Code Workspace Storage Found

**Storage Location:** \`${VSCODE_STORAGE_BASE}\`

Could not find any VS Code workspace storage folders with chat sessions.
Make sure VS Code has been used with Copilot Chat in this workspace.`
            }]
          };
        }
        
        // Filter to current workspace only (unless sessionId is explicitly provided)
        // Prefer EXACT match, or the shortest path that contains the workspace path
        const normalizedWorkspacePath = workspacePath.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
        
        // First try exact match
        let currentWorkspace = allWorkspaces.find(ws => {
          const wsPath = ws.workspaceFolder.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
          return wsPath === normalizedWorkspacePath;
        });
        
        // If no exact match, find workspaces that are parents of the search path
        // and pick the one with the longest path (most specific match)
        if (!currentWorkspace) {
          const matches = allWorkspaces
            .filter(ws => {
              const wsPath = ws.workspaceFolder.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
              return normalizedWorkspacePath.startsWith(wsPath + '/');
            })
            .sort((a, b) => b.workspaceFolder.length - a.workspaceFolder.length);
          currentWorkspace = matches[0];
        }
        
        let targetSession;
        let targetWorkspace;
        let matchMethod;
        
        if (sessionId) {
          // Explicit session ID provided - search across ALL workspaces
          for (const ws of allWorkspaces) {
            const wsSessions = findChatSessions(ws.chatSessionsPath);
            const foundSession = wsSessions.find(s => s.id === sessionId || s.id.startsWith(sessionId));
            if (foundSession) {
              targetSession = foundSession;
              targetWorkspace = ws;
              matchMethod = 'session ID';
              break;
            }
          }
          
          if (!targetSession) {
            return {
              content: [{
                type: 'text',
                text: `## ⚠️ Session Not Found

Could not find session with ID: \`${sessionId}\`
Use \`chat_list_sessions\` to see available sessions.`
              }]
            };
          }
        } else if (currentWorkspace) {
          // Auto-detect: find the most recently modified session in CURRENT workspace only
          const sessions = findChatSessions(currentWorkspace.chatSessionsPath);
          
          if (sessions.length === 0) {
            return {
              content: [{
                type: 'text',
                text: `## ⚠️ No Chat Sessions Found

**Workspace:** \`${currentWorkspace.workspaceFolder}\`

No chat sessions found in this workspace.
Use \`chat_list_sessions\` to see sessions from other workspaces.`
              }]
            };
          }
          
          targetSession = sessions[0]; // Most recent in this workspace
          targetWorkspace = currentWorkspace;
          matchMethod = `auto-detected (most recent in ${currentWorkspace.workspaceName})`;
        } else {
          // Workspace not found - list available workspaces
          const workspaceList = allWorkspaces.slice(0, 5).map(ws => 
            `- \`${ws.workspaceFolder}\``
          ).join('\n');
          
          return {
            content: [{
              type: 'text',
              text: `## ⚠️ Workspace Not Found

Could not find VS Code storage for: \`${workspacePath}\`

**Available workspaces:**
${workspaceList}

Use \`chat_list_sessions\` to see all available sessions.`
            }]
          };
        }
        
        // Read and convert the session
        const exportData = readAndConvertSession(targetSession.path);
        
        if (exportData.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `## ⚠️ Empty Session

The selected session contains no exportable content.
**Session:** \`${targetSession.id}\``
            }]
          };
        }
        
        // Extract topic from the session content
        const topic = extractTopicFromSession(targetSession.path);
        
        // Save the backup
        const folder = getBackupFolder(basePath);
        const filename = generateFilename(topic);
        ensureBackupFolder(folder);
        const fullPath = path.join(folder, filename);
        
        fs.writeFileSync(fullPath, JSON.stringify(exportData, null, 2), 'utf8');
        
        // Get first prompt preview for confirmation
        const preview = getSessionPreview(targetSession.path, 100);
        
        return {
          content: [{
            type: 'text',
            text: `## ✅ Chat Backup Saved

**File:** \`${filename}\`
**Location:** \`${fullPath}\`
**Exchanges:** ${exportData.length} prompt/response pairs

**Source Session:**
- Workspace: \`${targetWorkspace.workspaceName}\`
- Session ID: \`${targetSession.id}\`
- Modified: ${targetSession.modified.toISOString().slice(0, 16).replace('T', ' ')}
- Matched by: ${matchMethod}
- First prompt: "${preview}"

The conversation has been exported in VS Code-compatible format.
To import in VS Code: \`Ctrl+Shift+P\` → \`Chat: Import Chat...\`
Or use: \`mcp chat import ${filename}\``
          }]
        };
      }
      
      case 'chat_list_sessions': {
        const workspacePath = args?.workspacePath || process.cwd();
        const limit = args?.limit || 10;
        
        const workspaces = findWorkspaceStorages();
        
        if (workspaces.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `## ⚠️ No VS Code Workspace Storage Found

**Storage Location:** \`${VSCODE_STORAGE_BASE}\`

No workspaces with chat sessions found.`
            }]
          };
        }
        
        let output = `## 📋 Available Chat Sessions\n\n`;
        
        for (const workspace of workspaces) {
          const sessions = findChatSessions(workspace.chatSessionsPath).slice(0, limit);
          
          if (sessions.length === 0) continue;
          
          output += `### Workspace: ${workspace.workspaceName}\n`;
          output += `Path: \`${workspace.workspaceFolder}\`\n\n`;
          
          for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const preview = getSessionPreview(session.path, 80);
            const date = session.modified.toISOString().slice(0, 16).replace('T', ' ');
            const sizeKB = (session.size / 1024).toFixed(1);
            
            output += `${i + 1}. **${session.id}**\n`;
            output += `   - Modified: ${date}\n`;
            output += `   - Size: ${sizeKB} KB\n`;
            output += `   - Preview: "${preview}"\n\n`;
          }
        }
        
        output += `---\n*To backup a session: \`chat_backup sessionId:SESSION_ID topic:YOUR_TOPIC\`*`;
        
        return {
          content: [{
            type: 'text',
            text: output
          }]
        };
      }
      
      case 'chat_import': {
        const basePath = args?.basePath || DEFAULT_BACKUP_BASE;
        let filename = args.filename;
        
        // Resolve the file path
        let filePath;
        if (path.isAbsolute(filename)) {
          filePath = filename;
        } else if (filename.includes('/') || filename.includes('\\')) {
          filePath = path.join(basePath, filename);
        } else {
          // Search for the file in the backup folder
          const backups = listBackups(basePath, 100);
          const match = backups.find(b => 
            b.name === filename || 
            b.name.includes(filename) ||
            b.relativePath.includes(filename)
          );
          if (match) {
            filePath = match.path;
          } else {
            filePath = path.join(getBackupFolder(basePath), filename);
          }
        }
        
        const data = readBackup(filePath);
        const formattedContent = formatChatContent(data);
        
        return {
          content: [{
            type: 'text',
            text: `## 📥 Imported Chat: ${path.basename(filePath)}

**Source:** \`${filePath}\`

---

### Conversation Content

${formattedContent}

---
*This content has been loaded from a previous chat backup. You can now reference it in your current conversation.*`
          }]
        };
      }
      
      case 'chat_list': {
        const basePath = args?.basePath || DEFAULT_BACKUP_BASE;
        const limit = args?.limit || 20;
        
        const backups = listBackups(basePath, limit);
        
        if (backups.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `## 📋 No Chat Backups Found

**Backup Location:** \`${basePath}\`

No backup files found. To create your first backup:
1. Press \`Ctrl+Shift+P\` → \`Chat: Export Chat...\`
2. Save to \`${getBackupFolder(basePath)}\``
            }]
          };
        }
        
        const listItems = backups.map((b, i) => {
          const date = b.modified.toISOString().slice(0, 16).replace('T', ' ');
          const sizeKB = (b.size / 1024).toFixed(1);
          return `${i + 1}. **${b.name}**\n   - Path: \`${b.relativePath}\`\n   - Modified: ${date}\n   - Size: ${sizeKB} KB`;
        }).join('\n\n');
        
        return {
          content: [{
            type: 'text',
            text: `## 📋 Available Chat Backups

**Location:** \`${basePath}\`
**Found:** ${backups.length} backup(s)

${listItems}

---
*To import a backup, use: \`chat_import\` with the filename*`
          }]
        };
      }
      
      case 'chat_search': {
        const basePath = args?.basePath || DEFAULT_BACKUP_BASE;
        const keyword = args.keyword;
        const limit = args?.limit || 10;
        
        const results = searchBackups(basePath, keyword, limit);
        
        if (results.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `## 🔍 No Results Found

**Search:** "${keyword}"
**Location:** \`${basePath}\`

No backups contain the search term. Try:
- Using different keywords
- Checking if backups exist with \`chat_list\``
            }]
          };
        }
        
        const resultItems = results.map((r, i) => {
          const preview = r.preview?.length > 0 
            ? `\n   - Preview: "${r.preview[0].slice(0, 100)}..."`
            : '';
          return `${i + 1}. **${r.name}** (${r.matchCount} matches)${preview}`;
        }).join('\n\n');
        
        return {
          content: [{
            type: 'text',
            text: `## 🔍 Search Results for "${keyword}"

**Found:** ${results.length} backup(s) with matches

${resultItems}

---
*To import a result, use: \`chat_import\` with the filename*`
          }]
        };
      }
      
      case 'chat_save_summary': {
        const basePath = args?.basePath || DEFAULT_BACKUP_BASE;
        const topic = args.topic;
        const content = args.content;
        
        const folder = getBackupFolder(basePath);
        ensureBackupFolder(folder);
        
        const filename = generateFilename(topic).replace('.json', '.md');
        const fullPath = path.join(folder, filename);
        
        const now = new Date();
        const header = `---
title: ${topic}
date: ${now.toISOString().slice(0, 10)}
type: chat-summary
---

# ${topic}

*Captured: ${now.toISOString()}*

---

`;
        
        fs.writeFileSync(fullPath, header + content, 'utf8');
        
        return {
          content: [{
            type: 'text',
            text: `## ✅ Summary Saved

**File:** \`${filename}\`
**Location:** \`${fullPath}\`

The summary has been saved successfully. You can find it in your chat backups folder.`
          }]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `## ❌ Error

**Tool:** ${name}
**Error:** ${error.message}

Please check the parameters and try again.`
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp-chat-backup] Server started');
}

main().catch((error) => {
  console.error('[mcp-chat-backup] Fatal error:', error);
  process.exit(1);
});
