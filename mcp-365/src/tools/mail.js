/**
 * Outlook Mail tools
 */

export const mailTools = [
  {
    name: 'm365_mail_search',
    description: `Search emails in user's mailbox by keyword, sender, subject, etc.
Returns email previews with links to open in Outlook.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Can use fields like from:, subject:, hasattachment:true',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum emails to return (1-50)',
          default: 25,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'm365_mail_recent',
    description: `Get recent emails from user's inbox, sorted by date (newest first).
Good for checking latest communications or finding recent threads.`,
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum emails to return (1-50)',
          default: 25,
        },
      },
    },
  },
];

export async function handleMailTool(name, args, client, config) {
  switch (name) {
    case 'm365_mail_search': {
      const messages = await client.searchMail(args.query, args.maxResults || 25);
      return formatMailList(messages, `Search: "${args.query}"`);
    }

    case 'm365_mail_recent': {
      const messages = await client.getRecentMail(args.maxResults || 25);
      return formatMailList(messages, 'Recent Emails');
    }

    default:
      throw new Error(`Unknown mail tool: ${name}`);
  }
}

function formatMailList(messages, title) {
  if (!messages.length) {
    return `No emails found for: ${title}`;
  }

  let output = `## ${title} (${messages.length} emails)\n\n`;

  for (const msg of messages) {
    const from = msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'unknown';
    const date = msg.receivedDateTime 
      ? new Date(msg.receivedDateTime).toLocaleString()
      : 'unknown date';
    const preview = msg.bodyPreview?.slice(0, 150) || '';

    output += `### ${msg.subject || '(No subject)'}\n`;
    output += `- **From:** ${from}\n`;
    output += `- **Date:** ${date}\n`;
    if (msg.webLink) {
      output += `- **Open in Outlook:** ${msg.webLink}\n`;
    }
    if (preview) {
      output += `\n> ${preview}${preview.length >= 150 ? '...' : ''}\n`;
    }
    output += '\n';
  }

  return output;
}
