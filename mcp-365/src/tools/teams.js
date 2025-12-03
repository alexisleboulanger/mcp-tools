/**
 * Microsoft Teams tools
 */

export const teamsTools = [
  {
    name: 'm365_teams_list',
    description: `List all Teams the current user is a member of.
Returns team names, IDs, and descriptions.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'm365_teams_channels',
    description: `List channels in a specific Team.
Requires the Team ID from m365_teams_list.`,
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Team ID to list channels for',
        },
      },
      required: ['teamId'],
    },
  },
  {
    name: 'm365_teams_messages',
    description: `Get recent messages from a Teams channel.
Useful for catching up on channel discussions or finding specific conversations.
NOTE: Requires ChannelMessage.Read.All permission which may need admin consent.`,
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
          description: 'Maximum messages to return (1-50)',
          default: 25,
        },
      },
      required: ['teamId', 'channelId'],
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

    default:
      throw new Error(`Unknown teams tool: ${name}`);
  }
}

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
