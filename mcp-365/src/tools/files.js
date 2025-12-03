/**
 * OneDrive and file management tools
 */

export const filesTools = [
  {
    name: 'm365_files_my_drive',
    description: `Get information about the current user's OneDrive, including storage quota.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'm365_files_list',
    description: `List files and folders in a OneDrive or SharePoint document library.
Can navigate into subfolders by providing a folder ID.`,
    inputSchema: {
      type: 'object',
      properties: {
        driveId: {
          type: 'string',
          description: 'Drive ID (from m365_files_my_drive or m365_sharepoint_list_libraries)',
        },
        folderId: {
          type: 'string',
          description: 'Folder ID to list contents of. Default: root folder',
          default: 'root',
        },
        maxItems: {
          type: 'number',
          description: 'Maximum items to return (1-100)',
          default: 50,
        },
      },
      required: ['driveId'],
    },
  },
  {
    name: 'm365_files_get_metadata',
    description: `Get detailed metadata about a specific file including size, author, and sharing info.`,
    inputSchema: {
      type: 'object',
      properties: {
        driveId: {
          type: 'string',
          description: 'Drive ID containing the file',
        },
        itemId: {
          type: 'string',
          description: 'File or folder item ID',
        },
      },
      required: ['driveId', 'itemId'],
    },
  },
  {
    name: 'm365_files_read_content',
    description: `Read the text content of a file. Works best with text files, markdown, code, CSV, etc.
For binary files (images, PDFs), returns an error - use metadata or download link instead.`,
    inputSchema: {
      type: 'object',
      properties: {
        driveId: {
          type: 'string',
          description: 'Drive ID containing the file',
        },
        itemId: {
          type: 'string',
          description: 'File item ID',
        },
        maxSize: {
          type: 'number',
          description: 'Maximum characters to return (to avoid huge responses)',
          default: 50000,
        },
      },
      required: ['driveId', 'itemId'],
    },
  },
];

export async function handleFilesTool(name, args, client, config) {
  switch (name) {
    case 'm365_files_my_drive': {
      const drive = await client.getMyDrive();
      return formatDriveInfo(drive);
    }

    case 'm365_files_list': {
      const items = await client.listDriveItems(
        args.driveId,
        args.folderId || 'root',
        args.maxItems || 50
      );
      return formatFilesList(items);
    }

    case 'm365_files_get_metadata': {
      const item = await client.getFileMetadata(args.driveId, args.itemId);
      return formatFileMetadata(item);
    }

    case 'm365_files_read_content': {
      // First get metadata to check file type and size
      const meta = await client.getFileMetadata(args.driveId, args.itemId);
      
      // Check if it's a text-readable file
      const textExtensions = ['.txt', '.md', '.json', '.xml', '.csv', '.html', '.css', '.js', '.ts', '.py', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.log', '.sql'];
      const fileName = meta.name || '';
      const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
      
      if (!textExtensions.includes(ext) && !meta.file?.mimeType?.startsWith('text/')) {
        return `Cannot read binary file content directly. File: ${meta.name} (${meta.file?.mimeType || 'unknown type'})\n\nDownload link: ${meta['@microsoft.graph.downloadUrl'] || meta.webUrl}`;
      }

      // Check size
      const maxSize = args.maxSize || 50000;
      if (meta.size > maxSize * 2) {
        return `File too large to read (${(meta.size / 1024).toFixed(1)} KB). Use download link instead:\n${meta['@microsoft.graph.downloadUrl'] || meta.webUrl}`;
      }

      const content = await client.getFileContent(args.driveId, args.itemId);
      const truncated = content.length > maxSize;
      const output = truncated ? content.slice(0, maxSize) : content;

      return `## File: ${meta.name}\n\n\`\`\`\n${output}\n\`\`\`${truncated ? '\n\n*(Content truncated)*' : ''}`;
    }

    default:
      throw new Error(`Unknown files tool: ${name}`);
  }
}

function formatDriveInfo(drive) {
  const usedGB = drive.quota?.used ? (drive.quota.used / 1073741824).toFixed(2) : 'unknown';
  const totalGB = drive.quota?.total ? (drive.quota.total / 1073741824).toFixed(2) : 'unknown';
  const percentUsed = drive.quota?.used && drive.quota?.total 
    ? ((drive.quota.used / drive.quota.total) * 100).toFixed(1)
    : 'unknown';

  return `## My OneDrive

- **Drive ID:** \`${drive.id}\`
- **Owner:** ${drive.owner?.user?.displayName || 'unknown'}
- **URL:** ${drive.webUrl}
- **Storage Used:** ${usedGB} GB / ${totalGB} GB (${percentUsed}%)
- **Drive Type:** ${drive.driveType}

Use the Drive ID with \`m365_files_list\` to browse contents.`;
}

function formatFilesList(items) {
  if (!items.length) {
    return 'No files or folders found.';
  }

  // Separate folders and files
  const folders = items.filter(i => i.folder);
  const files = items.filter(i => !i.folder);

  let output = `## Contents (${items.length} items)\n\n`;

  if (folders.length > 0) {
    output += `### Folders (${folders.length})\n\n`;
    for (const folder of folders) {
      output += `📁 **${folder.name}** (ID: \`${folder.id}\`)\n`;
      output += `   - ${folder.folder.childCount || 0} items\n`;
    }
    output += '\n';
  }

  if (files.length > 0) {
    output += `### Files (${files.length})\n\n`;
    for (const file of files) {
      const sizeKB = file.size ? (file.size / 1024).toFixed(1) : '?';
      const modified = file.lastModifiedDateTime 
        ? new Date(file.lastModifiedDateTime).toLocaleDateString()
        : 'unknown';
      output += `📄 **${file.name}** (ID: \`${file.id}\`)\n`;
      output += `   - Size: ${sizeKB} KB | Modified: ${modified}\n`;
    }
  }

  return output;
}

function formatFileMetadata(item) {
  let output = `## ${item.folder ? '📁 Folder' : '📄 File'}: ${item.name}\n\n`;
  
  output += `- **ID:** \`${item.id}\`\n`;
  output += `- **URL:** ${item.webUrl}\n`;
  
  if (item.size) {
    output += `- **Size:** ${(item.size / 1024).toFixed(1)} KB\n`;
  }
  
  output += `- **Created:** ${new Date(item.createdDateTime).toLocaleString()}\n`;
  output += `- **Modified:** ${new Date(item.lastModifiedDateTime).toLocaleString()}\n`;
  
  if (item.createdBy?.user?.displayName) {
    output += `- **Created by:** ${item.createdBy.user.displayName}\n`;
  }
  
  if (item.lastModifiedBy?.user?.displayName) {
    output += `- **Modified by:** ${item.lastModifiedBy.user.displayName}\n`;
  }

  if (item.file?.mimeType) {
    output += `- **MIME Type:** ${item.file.mimeType}\n`;
  }

  if (item.shared) {
    output += `- **Sharing:** Shared (scope: ${item.shared.scope || 'unknown'})\n`;
  }

  if (item['@microsoft.graph.downloadUrl']) {
    output += `\n**Download URL:** ${item['@microsoft.graph.downloadUrl']}\n`;
  }

  if (item.parentReference) {
    output += `\n**Location:**\n`;
    output += `- Drive ID: \`${item.parentReference.driveId}\`\n`;
    output += `- Path: ${item.parentReference.path || '/'}\n`;
  }

  return output;
}
