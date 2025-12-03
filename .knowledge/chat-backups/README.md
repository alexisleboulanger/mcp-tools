# Copilot Chat Backups

> ⚠️ **BACKUP YOUR CHATS REGULARLY!** VS Code Copilot chat history is ephemeral and can be lost on restart, update, or crash. Export important conversations immediately.

## Purpose

This folder stores exported GitHub Copilot chat sessions using VS Code's native export feature. Unlike session captures (which are curated summaries), these are **full conversation backups** preserving the complete Q&A exchange.

## Quick Export (Do This NOW!)

### Export Current Chat

1. **In Copilot Chat panel** → Click the `...` menu (top-right)
2. Select **"Export Chat..."** or use Command Palette:
   - `Ctrl+Shift+P` → `Chat: Export Chat...`
3. **Save to this folder:** `.knowledge/chat-backups/YYYY/MM/`
4. **Name format:** `YYYY-MM-DD-HH-MM-[topic].json`

### Import Previous Chat

1. `Ctrl+Shift+P` → `Chat: Import Chat...`
2. Select a `.json` file from this folder
3. Chat session is restored with full history

## Folder Structure

```
chat-backups/
├── README.md                    # This file
├── 2026/
│   ├── 01/
│   │   ├── 2026-01-19-14-30-system-api-analysis.json
│   │   ├── 2026-01-19-16-45-architecture-decisions.json
│   │   └── 2026-01-20-09-00-portal-auth.json
│   └── 02/
│       └── ...
└── _indexed/                    # Backups that have been processed/summarized
```

## VS Code Commands Reference

| Command | Shortcut | Description |
|---------|----------|-------------|
| `Chat: Export Chat...` | - | Export current chat to JSON |
| `Chat: Import Chat...` | - | Import chat from JSON file |
| `Chat: Clear Chat History` | - | Clear current session (⚠️ irreversible) |
| `Chat: Show History` | - | Browse recent sessions |

## Automation Scripts

### Quick Export Script (PowerShell)

Run this to create today's backup folder:

```powershell
# Create today's backup folder
$backupPath = ".knowledge\chat-backups\$(Get-Date -Format 'yyyy')\$(Get-Date -Format 'MM')"
New-Item -ItemType Directory -Force -Path $backupPath
Write-Host "Export your chat to: $backupPath"
Write-Host "Suggested name: $(Get-Date -Format 'yyyy-MM-dd-HH-mm')-[topic].json"
```

### VS Code Task (Automated Reminder)

A task is configured to remind you to backup chats. See `.vscode/tasks.json`.

## Backup Strategy

### When to Export

| Trigger | Action |
|---------|--------|
| **End of work session** | Export any valuable chat before closing VS Code |
| **Before VS Code update** | Export all active chats |
| **After major discovery** | Export immediately—don't wait |
| **Weekly (minimum)** | Export any ongoing research chats |

### Naming Convention

```
YYYY-MM-DD-HH-MM-[service]-[topic].json

Examples:
2026-01-19-14-30-system-api-event-sourcing.json
2026-01-19-16-45-portal-oauth-integration.json
2026-01-20-09-00-architecture-review-session.json
```

### Retention Policy

| Age | Action |
|-----|--------|
| < 1 month | Keep all backups |
| 1-3 months | Keep if contains unique insights |
| > 3 months | Archive to `_indexed/` if summarized, delete if redundant |

## Processing Backups

After exporting, consider:

1. **Quick scan:** Does this chat contain valuable insights?
2. **If yes:** Create a [session capture](delivery/discovery/copilot-sessions/README.md) summary
3. **Move to `_indexed/`** once processed
4. **Update knowledge graph** if new concepts/patterns discovered

## Integration with Session Captures

```
Raw Export (JSON)          →    Curated Summary (Markdown)
─────────────────────────────────────────────────────────
chat-backups/              →    delivery/discovery/copilot-sessions/
  2026/01/file.json        →      2026/01/file.md

Full conversation backup        Key insights extracted
Machine-readable                Human-readable
Large file size                 Concise
```

## Keyboard Shortcut Setup

Add to your `keybindings.json` for quick export:

```json
{
  "key": "ctrl+shift+e ctrl+shift+c",
  "command": "workbench.action.chat.export",
  "when": "chatIsEnabled"
}
```

## See Also

- [Copilot Session Captures](delivery/discovery/copilot-sessions/README.md) - For curated summaries
- [Copilot Session Template](solution/templates/copilot-session-template.md) - Summary template
- [VS Code Chat Documentation](https://code.visualstudio.com/docs/copilot/copilot-chat)

---

## ⚡ Quick Actions

**Export now:** `Ctrl+Shift+P` → `Chat: Export Chat...` → Save here

**Create folder:** Run in terminal:
```bash
mkdir -p .knowledge/chat-backups/2026/01
```
