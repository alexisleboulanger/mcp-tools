/**
 * Outlook Calendar tools
 */

export const calendarTools = [
  {
    name: 'm365_calendar_events',
    description: `Get calendar events within a date range.
Useful for finding meetings, checking availability, or reviewing scheduled events.`,
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date in ISO format (e.g., "2025-01-20") or relative like "today", "tomorrow"',
        },
        endDate: {
          type: 'string',
          description: 'End date in ISO format. Default: 7 days from start',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum events to return (1-100)',
          default: 50,
        },
      },
      required: ['startDate'],
    },
  },
  {
    name: 'm365_calendar_today',
    description: `Get today's calendar events. Quick way to see today's schedule.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'm365_calendar_week',
    description: `Get this week's calendar events (Monday to Sunday).`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleCalendarTool(name, args, client, config) {
  switch (name) {
    case 'm365_calendar_events': {
      const start = parseDate(args.startDate);
      const end = args.endDate 
        ? parseDate(args.endDate)
        : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const events = await client.getCalendarEvents(start, end, args.maxResults || 50);
      return formatCalendarEvents(events, start, end);
    }

    case 'm365_calendar_today': {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      
      const events = await client.getCalendarEvents(start, end, 50);
      return formatCalendarEvents(events, start, end, "Today's Schedule");
    }

    case 'm365_calendar_week': {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      
      const events = await client.getCalendarEvents(monday, sunday, 100);
      return formatCalendarEvents(events, monday, sunday, "This Week's Schedule");
    }

    default:
      throw new Error(`Unknown calendar tool: ${name}`);
  }
}

function parseDate(input) {
  if (!input) return new Date();
  
  const lower = input.toLowerCase();
  const now = new Date();
  
  if (lower === 'today') {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  
  if (lower === 'tomorrow') {
    now.setDate(now.getDate() + 1);
    now.setHours(0, 0, 0, 0);
    return now;
  }
  
  if (lower === 'yesterday') {
    now.setDate(now.getDate() - 1);
    now.setHours(0, 0, 0, 0);
    return now;
  }
  
  // Try parsing as ISO date
  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${input}. Use ISO format (YYYY-MM-DD) or "today", "tomorrow".`);
  }
  
  return parsed;
}

function formatCalendarEvents(events, start, end, title) {
  const dateRange = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  const heading = title || `Calendar Events`;
  
  if (!events.length) {
    return `## ${heading}\n\n*No events scheduled for ${dateRange}*`;
  }

  // Group events by date
  const byDate = {};
  for (const event of events) {
    const eventStart = new Date(event.start?.dateTime || event.start?.date);
    const dateKey = eventStart.toLocaleDateString();
    if (!byDate[dateKey]) {
      byDate[dateKey] = [];
    }
    byDate[dateKey].push(event);
  }

  let output = `## ${heading}\n\n`;
  output += `*${dateRange} · ${events.length} events*\n\n`;

  for (const [date, dayEvents] of Object.entries(byDate)) {
    output += `### 📅 ${date}\n\n`;
    
    for (const event of dayEvents) {
      const startTime = formatEventTime(event.start);
      const endTime = formatEventTime(event.end);
      const location = event.location?.displayName || '';
      const organizer = event.organizer?.emailAddress?.name || '';
      
      output += `- **${startTime} - ${endTime}** | ${event.subject || '(No title)'}\n`;
      if (location) {
        output += `  - 📍 ${location}\n`;
      }
      if (organizer) {
        output += `  - 👤 Organized by: ${organizer}\n`;
      }
      if (event.webLink) {
        output += `  - [Open in Outlook](${event.webLink})\n`;
      }
    }
    output += '\n';
  }

  return output;
}

function formatEventTime(timeObj) {
  if (!timeObj) return '?';
  
  // All-day events have date only
  if (timeObj.date) {
    return 'All day';
  }
  
  const date = new Date(timeObj.dateTime);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
