/**
 * Microsoft Teams Tools for MCP-365
 * 
 * This module provides MCP tools for interacting with Microsoft Teams, including:
 * - Team membership and channel listing
 * - Channel message retrieval
 * - Meeting recordings (via Files API - no special permissions needed)
 * - Meeting transcripts (VTT/DOCX parsing)
 * 
 * @module tools/teams
 * @requires Files.Read.All - For recordings and transcripts
 * @requires Team.ReadBasic.All - For Teams listing
 * @requires ChannelMessage.Read.All - For channel messages (admin consent)
 */

export const teamsTools = [
  // ============================================
  // Teams & Channels Tools
  // ============================================
  {
    name: 'm365_teams_list',
    description: `List all Microsoft Teams the current user is a member of.

**Use when:** You need to find a Team ID for further queries (channels, messages).

**Returns:** Team names, IDs, descriptions, and visibility settings.

**Permissions:** Team.ReadBasic.All`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'm365_teams_channels',
    description: `List all channels in a specific Microsoft Team.

**Use when:** You need to find a Channel ID after getting a Team ID from m365_teams_list.

**Returns:** Channel names, IDs, descriptions, and membership types.

**Permissions:** Team.ReadBasic.All`,
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Team ID (get from m365_teams_list)',
        },
      },
      required: ['teamId'],
    },
  },
  {
    name: 'm365_teams_messages',
    description: `Get recent messages from a Teams channel.

**Use when:** You need to catch up on channel discussions or find specific conversations.

**Returns:** Messages with sender, timestamp, content, and reply counts.

**Permissions:** ChannelMessage.Read.All (requires admin consent)

**Note:** This requires elevated permissions that many tenants restrict.`,
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Team ID',
        },
        channelId: {
          type: 'string',
          description: 'Channel ID',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum messages to return (1-50, default: 25)',
          default: 25,
        },
      },
      required: ['teamId', 'channelId'],
    },
  },
  // ============================================
  // Recording Tools - Using Files API (No Special Permissions!)
  // ============================================
  {
    name: 'm365_recordings_search',
    description: `Search for Teams meeting recordings in your OneDrive.

**Use when:** Looking for recordings you personally have stored.

**How it works:** Searches OneDrive for MP4 files matching the query.

**Returns:** Recording name, date, size, Drive ID, and Item ID for each result.

**Next step:** Use m365_recording_download with driveId and itemId to get download link.

**Permissions:** Files.Read.All (no special Teams permissions needed!)`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "Sprint Review", "Workshop", "20250120")',
          default: 'Meeting Recording',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results (1-50, default: 20)',
          default: 20,
        },
      },
    },
  },
  {
    name: 'm365_recordings_recent',
    description: `List most recent Teams meeting recordings from your OneDrive.

**Use when:** You want to see what recordings you have without searching.

**Returns:** Recent recordings sorted by date with metadata.

**Permissions:** Files.Read.All`,
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum results (1-20, default: 10)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'm365_recording_download',
    description: `Get a download link for a specific recording file.

**Use when:** You have a driveId and itemId from a recording search and want to download it.

**Returns:** Pre-authenticated download URL (valid for ~1 hour).

**Permissions:** Files.Read.All`,
    inputSchema: {
      type: 'object',
      properties: {
        driveId: {
          type: 'string',
          description: 'Drive ID (from recording search results)',
        },
        itemId: {
          type: 'string',
          description: 'Recording file Item ID (from recording search results)',
        },
      },
      required: ['driveId', 'itemId'],
    },
  },
  {
    name: 'm365_recordings_all',
    description: `Search ALL accessible meeting recordings across the entire organization.

**Use when:** You need to find recordings that might be in SharePoint, shared OneDrives, or Teams channels you have access to.

**How it works:** Uses Microsoft Search API to search across:
- Your OneDrive
- SharePoint team sites you have access to
- Other users' shared OneDrive content
- Channel recordings from Teams you're a member of

**Returns:** Recordings grouped by location with Drive ID and Item ID for each.

**This is the most comprehensive way to find meeting recordings.**

**Permissions:** Files.Read.All (uses Microsoft Search API)`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to filter recordings (e.g., "Yorizon", "Sprint Review", "Architecture")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results (1-50, default: 25)',
          default: 25,
        },
      },
    },
  },
  // ============================================
  // Transcript Tools - Using Microsoft Search API
  // ============================================
  {
    name: 'm365_transcripts_search',
    description: `Search for meeting transcripts across the organization.

**Use when:** You need to find transcripts from meetings - useful for reviewing discussions, finding decisions, or searching for specific topics discussed.

**How it works:** Uses Microsoft Search API to find VTT and DOCX transcript files.

**Returns:** Transcript files grouped by location with Drive ID and Item ID.

**Next step:** Use m365_transcript_read with driveId and itemId to read the content.

**Supported formats:**
- .vtt - WebVTT format (parsed with speaker identification)
- .docx - Word documents (download link provided)

**Permissions:** Files.Read.All (uses Microsoft Search API)`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "Yorizon", "Sprint Review", meeting topic)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results (1-25, default: 15)',
          default: 15,
        },
      },
    },
  },
  {
    name: 'm365_transcript_read',
    description: `Read the full content of a meeting transcript.

**Use when:** You have a transcript's driveId and itemId from search results and want to read its content.

**Returns:**
- For VTT files: Formatted transcript with speaker names and dialogue
- For DOCX files: Download URL (binary format cannot be displayed as text)

**Example output for VTT:**
\`\`\`
**John Smith:** Welcome everyone to the sprint review.

**Jane Doe:** Thanks John. Let me share the demo...
\`\`\`

**Permissions:** Files.Read.All`,
    inputSchema: {
      type: 'object',
      properties: {
        driveId: {
          type: 'string',
          description: 'Drive ID (from transcript search results)',
        },
        itemId: {
          type: 'string',
          description: 'Transcript file Item ID (from transcript search results)',
        },
      },
      required: ['driveId', 'itemId'],
    },
  },
];

export async function handleTeamsTool(name, args, client, config) {
  switch (name) {
    case 'm365_teams_list': {
      const result = await client.getMyTeams();
      return formatTeamsList(result.value || []);
    }

    case 'm365_teams_channels': {
      const result = await client.getTeamChannels(args.teamId);
      return formatChannelsList(result.value || [], args.teamId);
    }

    case 'm365_teams_messages': {
      try {
        const messages = await client.getChannelMessages(
          args.teamId,
          args.channelId,
          args.maxResults || 25
        );
        return formatTeamsMessages(messages);
      } catch (error) {
        if (error.message?.includes('403') || error.message?.includes('Authorization')) {
          return `⚠️ **Permission Denied**

Reading Teams channel messages requires the \`ChannelMessage.Read.All\` permission, which needs admin consent in most organizations.

**Alternatives:**
- Ask your IT admin to grant consent for this permission
- Use Microsoft Teams directly to view channel messages
- The other Teams tools (list teams, list channels) should work fine`;
        }
        throw error;
      }
    }

    // ============================================
    // Recording Tools - Using Files API (works with Files.ReadWrite.All!)
    // ============================================

    case 'm365_recordings_search': {
      const query = args.query || 'Meeting Recording';
      const maxResults = Math.min(args.maxResults || 20, 50);
      
      try {
        // Search OneDrive for recording files
        const searchQuery = query.includes('.mp4') ? query : `${query} .mp4`;
        const results = await client.get(`/me/drive/root/search(q='${encodeURIComponent(searchQuery)}')?$top=${maxResults}&$select=id,name,size,webUrl,lastModifiedDateTime,parentReference,@microsoft.graph.downloadUrl`);
        
        return formatRecordingsFromFiles(results.value || [], query);
      } catch (error) {
        if (error.message?.includes('403')) {
          return `⚠️ **Permission Denied** - Cannot search recordings

This requires \`Files.ReadWrite.All\` or \`Files.Read.All\` permission.
Current token may not have file access permissions.`;
        }
        throw error;
      }
    }

    case 'm365_recordings_recent': {
      const maxResults = Math.min(args.maxResults || 10, 20);
      
      try {
        // Search for recent Meeting Recordings in OneDrive
        const results = await client.get(`/me/drive/root/search(q='Meeting Recording')?$top=${maxResults}&$orderby=lastModifiedDateTime desc&$select=id,name,size,webUrl,lastModifiedDateTime,parentReference,@microsoft.graph.downloadUrl`);
        
        // Filter to only .mp4 files and sort by date
        const recordings = (results.value || [])
          .filter(item => item.name?.toLowerCase().endsWith('.mp4'))
          .sort((a, b) => new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime))
          .slice(0, maxResults);
        
        return formatRecentRecordings(recordings);
      } catch (error) {
        if (error.message?.includes('403')) {
          return `⚠️ **Permission Denied** - Cannot list recordings

This requires \`Files.ReadWrite.All\` or \`Files.Read.All\` permission.`;
        }
        throw error;
      }
    }

    case 'm365_recording_download': {
      try {
        // Get file metadata with download URL
        const item = await client.get(`/drives/${args.driveId}/items/${args.itemId}?$select=id,name,size,webUrl,@microsoft.graph.downloadUrl`);
        
        if (item['@microsoft.graph.downloadUrl']) {
          return `## 🎥 Recording Download

**File:** ${item.name}
**Size:** ${formatFileSize(item.size)}

### Download Link (valid for ~1 hour):
\`\`\`
${item['@microsoft.graph.downloadUrl']}
\`\`\`

**Note:** This is a pre-authenticated URL that will expire. Copy and use it in a browser or download tool.`;
        }
        
        return `## Recording Info

**File:** ${item.name}
**Web URL:** ${item.webUrl}

No direct download URL available. Use the web URL to access the file in SharePoint.`;
      } catch (error) {
        if (error.message?.includes('404')) {
          return `❌ Recording not found. The file may have been moved or deleted.`;
        }
        throw error;
      }
    }

    case 'm365_recordings_all': {
      const query = args.query || '';
      const maxResults = Math.min(args.maxResults || 25, 50);
      
      try {
        // Build search query for Microsoft Search API
        const searchQuery = query 
          ? `filetype:mp4 ${query} (Meeting Recording OR Enregistrement OR recording)`
          : 'filetype:mp4 (Meeting Recording OR Enregistrement)';
        
        const searchRes = await client.post('/search/query', {
          requests: [{
            entityTypes: ['driveItem'],
            query: { queryString: searchQuery },
            from: 0,
            size: maxResults
          }]
        });
        
        const hits = searchRes.value?.[0]?.hitsContainers?.[0]?.hits || [];
        const total = searchRes.value?.[0]?.hitsContainers?.[0]?.total || hits.length;
        
        return formatAllRecordings(hits, total, query);
      } catch (error) {
        if (error.message?.includes('403')) {
          return `⚠️ **Permission Denied** - Cannot search recordings

Microsoft Search requires search permissions. Try using \`m365_recordings_search\` for OneDrive-only search.`;
        }
        throw error;
      }
    }

    // ============================================
    // Transcript Tools - Using Microsoft Search API
    // ============================================

    case 'm365_transcripts_search': {
      const query = args.query || '';
      const maxResults = Math.min(args.maxResults || 15, 25);
      
      try {
        // Search for transcript files (VTT, DOCX) using Microsoft Search
        const searchQuery = query 
          ? `(filetype:vtt OR filetype:docx) ${query} (transcript OR Transcript)`
          : '(filetype:vtt OR filetype:docx) (transcript OR Transcript)';
        
        const searchRes = await client.post('/search/query', {
          requests: [{
            entityTypes: ['driveItem'],
            query: { queryString: searchQuery },
            from: 0,
            size: maxResults
          }]
        });
        
        const hits = searchRes.value?.[0]?.hitsContainers?.[0]?.hits || [];
        const total = searchRes.value?.[0]?.hitsContainers?.[0]?.total || hits.length;
        
        return formatTranscriptResults(hits, total, query);
      } catch (error) {
        if (error.message?.includes('403')) {
          return `⚠️ **Permission Denied** - Cannot search transcripts

Microsoft Search requires search permissions.`;
        }
        throw error;
      }
    }

    case 'm365_transcript_read': {
      try {
        // First get file metadata - don't use $select to ensure @microsoft.graph.downloadUrl is included
        const item = await client.get(`/drives/${args.driveId}/items/${args.itemId}`);
        
        const fileName = item.name?.toLowerCase() || '';
        const isVtt = fileName.endsWith('.vtt');
        const isDocx = fileName.endsWith('.docx');
        const isTxt = fileName.endsWith('.txt');
        
        if (!isVtt && !isDocx && !isTxt) {
          return `⚠️ Unsupported file type. Expected .vtt, .docx, or .txt transcript file.

**File:** ${item.name}`;
        }
        
        // Get download URL and fetch content
        const downloadUrl = item['@microsoft.graph.downloadUrl'];
        if (!downloadUrl) {
          return `## Transcript Info

**File:** ${item.name}
**Web URL:** ${item.webUrl}

Could not get direct download URL. Open the web URL to view the transcript.`;
        }
        
        // Fetch the file content
        const response = await fetch(downloadUrl);
        
        if (isVtt || isTxt) {
          // VTT and TXT are plain text
          const content = await response.text();
          if (isVtt) {
            return formatVttTranscript(item.name, content);
          }
          return `## 📝 Transcript: ${item.name}

**Format:** Plain Text
**Size:** ${formatFileSize(item.size)}

---

${content}`;
        } else if (isDocx) {
          // DOCX needs special handling - return download link instead
          return `## 📝 Transcript: ${item.name}

**Format:** Word Document (.docx)
**Size:** ${formatFileSize(item.size)}

DOCX files cannot be read as plain text. Use the download link or web URL:

**Download URL (valid ~1 hour):**
\`\`\`
${downloadUrl}
\`\`\`

**Web URL:**
${item.webUrl}`;
        }
      } catch (error) {
        if (error.message?.includes('404')) {
          return `❌ Transcript not found. The file may have been moved or deleted.`;
        }
        throw error;
      }
    }

    default:
      throw new Error(`Unknown teams tool: ${name}`);
  }
}

// ============================================
// Formatting Functions
// ============================================

function formatTeamsList(teams) {
  if (!teams.length) {
    return 'You are not a member of any Teams.';
  }

  let output = `## My Teams (${teams.length})\n\n`;

  for (const team of teams) {
    output += `### ${team.displayName}\n`;
    output += `- **ID:** \`${team.id}\`\n`;
    if (team.description) {
      output += `- **Description:** ${team.description}\n`;
    }
    output += `- **Visibility:** ${team.visibility || 'unknown'}\n`;
    output += '\n';
  }

  output += '\n*Use the Team ID with `m365_teams_channels` to list channels.*';
  return output;
}

function formatChannelsList(channels, teamId) {
  if (!channels.length) {
    return 'No channels found in this Team.';
  }

  let output = `## Channels (${channels.length})\n\n`;

  for (const channel of channels) {
    const isGeneral = channel.displayName === 'General';
    output += `### ${isGeneral ? '📌 ' : ''}${channel.displayName}\n`;
    output += `- **ID:** \`${channel.id}\`\n`;
    if (channel.description) {
      output += `- **Description:** ${channel.description}\n`;
    }
    output += `- **Membership:** ${channel.membershipType || 'standard'}\n`;
    if (channel.webUrl) {
      output += `- [Open in Teams](${channel.webUrl})\n`;
    }
    output += '\n';
  }

  output += `\n*Use Team ID \`${teamId}\` and Channel ID with \`m365_teams_messages\` to read messages.*`;
  return output;
}

function formatTeamsMessages(messages) {
  if (!messages.length) {
    return 'No messages found in this channel.';
  }

  let output = `## Channel Messages (${messages.length})\n\n`;

  for (const msg of messages) {
    const from = msg.from?.user?.displayName || msg.from?.application?.displayName || 'System';
    const date = msg.createdDateTime 
      ? new Date(msg.createdDateTime).toLocaleString()
      : 'unknown';
    
    // Extract text content from HTML body
    let content = msg.body?.content || '';
    if (msg.body?.contentType === 'html') {
      content = content.replace(/<[^>]*>/g, '').trim();
    }
    content = content.slice(0, 300);

    output += `---\n`;
    output += `**${from}** · ${date}\n\n`;
    if (content) {
      output += `${content}${content.length >= 300 ? '...' : ''}\n`;
    }
    if (msg.attachments?.length > 0) {
      output += `\n📎 ${msg.attachments.length} attachment(s)\n`;
    }
    if (msg.reactions?.length > 0) {
      const reactionSummary = msg.reactions.map(r => r.reactionType).join(', ');
      output += `💬 Reactions: ${reactionSummary}\n`;
    }
    output += '\n';
  }

  return output;
}

// ============================================
// Recording Formatting Functions (Files API based)
// ============================================

function formatFileSize(bytes) {
  if (!bytes) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatRecordingsFromFiles(items, query) {
  // Filter to only video files that look like recordings
  const recordings = items.filter(item => {
    const name = item.name?.toLowerCase() || '';
    return name.endsWith('.mp4') && 
           (name.includes('recording') || name.includes('meeting'));
  });

  if (!recordings.length) {
    return `## 🎥 Meeting Recordings

No recordings found matching "${query}".

**Tips:**
- Try a different search term (meeting name, date, or participant)
- Meeting recordings are stored in OneDrive as MP4 files
- Use \`m365_recordings_recent\` to see recent recordings

*This search uses your existing Files.ReadWrite.All permission - no special Teams permissions needed!*`;
  }

  let output = `## 🎥 Meeting Recordings (${recordings.length} found)\n`;
  output += `**Search:** "${query}"\n\n`;

  for (const item of recordings) {
    const date = item.lastModifiedDateTime 
      ? new Date(item.lastModifiedDateTime).toLocaleDateString()
      : 'unknown';
    const time = item.lastModifiedDateTime
      ? new Date(item.lastModifiedDateTime).toLocaleTimeString()
      : '';
    
    // Extract meeting name from filename
    const meetingName = item.name
      .replace(/-\d{8}_\d{6}-Meeting Recording\.mp4$/i, '')
      .replace(/\.mp4$/i, '');
    
    output += `### 🎥 ${meetingName}\n`;
    output += `- **File:** ${item.name}\n`;
    output += `- **Date:** ${date} ${time}\n`;
    output += `- **Size:** ${formatFileSize(item.size)}\n`;
    output += `- **Drive ID:** \`${item.parentReference?.driveId}\`\n`;
    output += `- **Item ID:** \`${item.id}\`\n`;
    if (item.webUrl) {
      output += `- [📺 Open in Browser](${item.webUrl})\n`;
    }
    output += '\n';
  }

  output += '\n*Use `m365_recording_download` with Drive ID and Item ID to get a download link.*';
  return output;
}

function formatRecentRecordings(recordings) {
  if (!recordings.length) {
    return `## 🎥 Recent Recordings

No recent meeting recordings found in your OneDrive.

Meeting recordings are typically stored in:
- OneDrive > Recordings folder
- SharePoint > Teams site > Recordings

*Use \`m365_recordings_search\` with a specific meeting name to search.*`;
  }

  let output = `## 🎥 Recent Meeting Recordings (${recordings.length})\n\n`;

  for (const item of recordings) {
    const date = item.lastModifiedDateTime 
      ? new Date(item.lastModifiedDateTime).toLocaleDateString()
      : 'unknown';
    const time = item.lastModifiedDateTime
      ? new Date(item.lastModifiedDateTime).toLocaleTimeString()
      : '';
    
    // Extract meeting name from filename
    const meetingName = item.name
      .replace(/-\d{8}_\d{6}-Meeting Recording\.mp4$/i, '')
      .replace(/\.mp4$/i, '');
    
    output += `### 🎥 ${meetingName}\n`;
    output += `- **Date:** ${date} ${time}\n`;
    output += `- **Size:** ${formatFileSize(item.size)}\n`;
    output += `- **Drive ID:** \`${item.parentReference?.driveId}\`\n`;
    output += `- **Item ID:** \`${item.id}\`\n`;
    if (item.webUrl) {
      output += `- [📺 Open in Browser](${item.webUrl})\n`;
    }
    output += '\n';
  }

  output += '\n*Use `m365_recording_download` with Drive ID and Item ID to get a download link.*';
  return output;
}
// ============================================
// Microsoft Search - All Recordings Formatting
// ============================================

function formatAllRecordings(hits, total, query) {
  if (!hits.length) {
    return `## 🎥 Organization Recordings

No recordings found${query ? ` matching "${query}"` : ''}.

**Tips:**
- Try a broader search term
- Use \`m365_recordings_search\` to search only your OneDrive
- Check that you have access to the SharePoint sites containing recordings`;
  }

  // Group by location
  const byLocation = {};
  hits.forEach(hit => {
    const r = hit.resource;
    const url = r.webUrl || '';
    let location = 'Other SharePoint Sites';
    
    // Detect location from URL
    if (url.includes('-my.sharepoint.com')) {
      const match = url.match(/personal\/([^/]+)/);
      if (match) {
        const user = match[1].replace(/_/g, ' ').replace(/ insight com$/, '');
        location = `OneDrive: ${user}`;
      } else {
        location = 'OneDrive (Shared)';
      }
    } else if (url.toLowerCase().includes('yorizon')) {
      location = 'Yorizon Team';
    } else if (url.includes('LDProjects')) {
      location = 'Learning & Development';
    } else if (url.toLowerCase().includes('emea')) {
      location = 'EMEA Teams';
    }
    
    if (!(location in byLocation)) byLocation[location] = [];
    byLocation[location].push(r);
  });

  let output = `## 🎥 Organization Recordings\n`;
  output += `**Total available:** ${total}${query ? ` matching "${query}"` : ''}\n`;
  output += `**Showing:** ${hits.length}\n\n`;

  // Sort locations alphabetically
  const sortedLocations = Object.keys(byLocation).sort();

  for (const location of sortedLocations) {
    const items = byLocation[location];
    output += `### 📁 ${location} (${items.length})\n\n`;
    
    for (const item of items) {
      // Clean up meeting name
      const name = (item.name || 'Unknown')
        .replace(/-\d{8}_\d+.*-Meeting Recording\.mp4$/i, '')
        .replace(/-Meeting Recording\.mp4$/i, '')
        .replace(/-Enregistrement.*\.mp4$/i, '')
        .replace(/\.mp4$/i, '')
        .slice(0, 70);
      
      const driveId = item.parentReference?.driveId || '';
      const itemId = item.id || '';
      
      output += `- **${name}**\n`;
      output += `  Drive: \`${driveId}\` | Item: \`${itemId}\`\n`;
      if (item.webUrl) {
        output += `  [Open](${item.webUrl})\n`;
      }
    }
    output += '\n';
  }

  output += `---\n`;
  output += `*Use Drive ID and Item ID to search for transcript: \`m365_transcripts_search query="meeting name"\`*`;
  
  return output;
}

// ============================================
// Transcript Formatting Functions
// ============================================

function formatTranscriptResults(hits, total, query) {
  if (!hits.length) {
    return `## 📝 Meeting Transcripts

No transcripts found${query ? ` matching "${query}"` : ''}.

**Tips:**
- Try a different search term
- Transcripts are stored as .vtt or .docx files
- Not all meetings have transcripts enabled`;
  }

  // Group by location
  const byLocation = {};
  hits.forEach(hit => {
    const r = hit.resource;
    const url = r.webUrl || '';
    let location = 'Other SharePoint Sites';
    
    if (url.includes('-my.sharepoint.com')) {
      const match = url.match(/personal\/([^/]+)/);
      if (match) {
        const user = match[1].replace(/_/g, ' ').replace(/ insight com$/, '');
        location = `OneDrive: ${user}`;
      } else {
        location = 'OneDrive (Shared)';
      }
    } else if (url.toLowerCase().includes('yorizon')) {
      location = 'Yorizon Team';
    } else if (url.includes('LDProjects')) {
      location = 'Learning & Development';
    } else if (url.toLowerCase().includes('emea')) {
      location = 'EMEA Teams';
    }
    
    if (!(location in byLocation)) byLocation[location] = [];
    byLocation[location].push(r);
  });

  let output = `## 📝 Meeting Transcripts\n`;
  output += `**Total available:** ${total}${query ? ` matching "${query}"` : ''}\n`;
  output += `**Showing:** ${hits.length}\n\n`;

  const sortedLocations = Object.keys(byLocation).sort();

  for (const location of sortedLocations) {
    const items = byLocation[location];
    output += `### 📁 ${location} (${items.length})\n\n`;
    
    for (const item of items) {
      // Clean up transcript name
      const name = (item.name || 'Unknown')
        .replace(/-\d{8}_\d+.*-Transcript\.vtt$/i, '')
        .replace(/-Transcript\.vtt$/i, '')
        .replace(/\.vtt$/i, '')
        .replace(/\.docx$/i, '')
        .slice(0, 70);
      
      const ext = item.name?.split('.').pop()?.toUpperCase() || '?';
      const driveId = item.parentReference?.driveId || '';
      const itemId = item.id || '';
      
      output += `- **${name}** (${ext})\n`;
      output += `  Drive: \`${driveId}\` | Item: \`${itemId}\`\n`;
      if (item.webUrl) {
        output += `  [Open](${item.webUrl})\n`;
      }
    }
    output += '\n';
  }

  output += `---\n`;
  output += `*Use \`m365_transcript_read driveId="..." itemId="..."\` to read transcript content.*`;
  
  return output;
}

function formatVttTranscript(fileName, content) {
  // Parse VTT content to make it more readable
  const lines = content.split('\n');
  let output = `## 📝 Transcript: ${fileName}\n\n`;
  
  // Extract meeting name from filename
  const meetingName = fileName
    .replace(/-\d{8}_\d+.*-Transcript\.vtt$/i, '')
    .replace(/-Transcript\.vtt$/i, '')
    .replace(/\.vtt$/i, '');
  
  if (meetingName !== fileName) {
    output += `**Meeting:** ${meetingName}\n\n`;
  }
  
  output += `---\n\n`;
  
  // Parse VTT format - extract speaker and text
  let currentSpeaker = '';
  let transcriptText = [];
  let hasStructuredContent = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip WEBVTT header, empty lines, and cue identifiers
    if (line === 'WEBVTT' || line === '' || /^\d+$/.test(line)) {
      continue;
    }
    
    // Skip timestamp lines (00:00:00.000 --> 00:00:05.000)
    if (/^\d{2}:\d{2}:\d{2}/.test(line)) {
      continue;
    }
    
    // Skip cue identifier lines (UUID/segment format)
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/\d+-\d+$/i.test(line)) {
      continue;
    }
    
    // Check for speaker tag <v Speaker Name>text</v>
    const speakerMatch = line.match(/<v ([^>]+)>(.+)$/);
    if (speakerMatch) {
      hasStructuredContent = true;
      const speaker = speakerMatch[1];
      // Clean up the text - remove </v> and embedded cue IDs
      let text = speakerMatch[2]
        .replace(/<\/v>/g, '')
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/\d+-\d+/gi, '')
        .trim();
      
      if (text) {
        if (speaker !== currentSpeaker) {
          // Output previous speaker's accumulated text
          if (currentSpeaker && transcriptText.length > 0) {
            output += `**${currentSpeaker}:** ${transcriptText.join(' ')}\n\n`;
          }
          currentSpeaker = speaker;
          transcriptText = [text];
        } else {
          transcriptText.push(text);
        }
      }
    } else if (line && !line.startsWith('<')) {
      // Plain text line - clean up cue IDs and add to current text
      const cleanLine = line
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/\d+-\d+/gi, '')
        .replace(/<\/v>/g, '')
        .trim();
      if (cleanLine) {
        transcriptText.push(cleanLine);
      }
    }
  }
  
  // Output last speaker's text
  if (currentSpeaker && transcriptText.length > 0) {
    output += `**${currentSpeaker}:** ${transcriptText.join(' ')}\n\n`;
    hasStructuredContent = true;
  } else if (transcriptText.length > 0 && !hasStructuredContent) {
    // No speaker tags - just output the accumulated text
    output += transcriptText.join(' ') + '\n\n';
  }
  
  // If no structured content was found, show raw content (truncated)
  if (!hasStructuredContent) {
    output += `### Raw Content\n\n\`\`\`\n${content.slice(0, 5000)}${content.length > 5000 ? '\n...(truncated)' : ''}\n\`\`\``;
  }
  
  return output;
}