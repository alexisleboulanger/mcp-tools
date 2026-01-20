# MCP-ADO-Wrapper: Azure DevOps Integration for AI Assistants

> **Model Context Protocol (MCP) wrapper** for the official `@azure-devops/mcp` server.
> Adds preflight validation, PAT resolution, and environment configuration.

[![MCP Version](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=18-brightgreen)](https://nodejs.org)

## Overview

This wrapper enhances the upstream [@azure-devops/mcp](https://github.com/microsoft/azure-devops-mcp) server with:

| Feature | Description |
|---------|-------------|
| **PAT Resolution** | Resolves PAT from multiple env variable names |
| **Preflight Validation** | Verifies PAT can list projects before spawning |
| **Environment Loading** | Automatic `.env` file support |
| **Protocol-Pure I/O** | Keeps stdio clean for MCP protocol |

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your PAT and org URL

# Test wrapper
node wrapper.js --no-preflight
```

## Configuration

### Environment Variables

Create a `.env` file next to `wrapper.js`:

```env
# Required
AZURE_DEVOPS_PAT=your-personal-access-token
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/yourorg

# Optional: Project scope (if not specified, all projects accessible)
AZURE_DEVOPS_PROJECT=your-project-name
```

**PAT Resolution Order:**
1. `AZURE_DEVOPS_PAT`
2. `ADO_PAT`
3. `AZURE_DEVOPS_EXT_PAT`
4. `SYSTEM_ACCESSTOKEN`

### VS Code Integration

Add to `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "ado-wrapped": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\dev\\mcp\\mcp-ado-wrapper\\wrapper.js"]
    }
  }
}
```

## Tool Reference

This wrapper exposes all tools from `@azure-devops/mcp`. Tools are organized by domain:

### Core Domain

| Tool | Description |
|------|-------------|
| `get_projects` | List all accessible projects |
| `get_teams` | List teams in a project |

### Work Items Domain

| Tool | Description |
|------|-------------|
| `create_work_item` | Create a new work item (Bug, Task, User Story, etc.) |
| `update_work_item` | Update fields on an existing work item |
| `get_work_item` | Get details of a specific work item |
| `search_work_items` | Search work items by query |
| `link_work_items` | Create links between work items |

### Pipelines Domain

| Tool | Description |
|------|-------------|
| `run_pipeline` | Trigger a pipeline run |
| `get_build` | Get build details and status |
| `get_build_logs` | Retrieve build logs |

### Wiki Domain

| Tool | Description |
|------|-------------|
| `get_wiki_page` | Get wiki page content |
| `create_wiki_page` | Create or update a wiki page |
| `list_wiki_pages` | List pages in a wiki |

### Test Plans Domain

| Tool | Description |
|------|-------------|
| `create_test_case` | Create a new test case |
| `get_test_plans` | List test plans |
| `update_test_case_steps` | Update test case steps |

## Usage Examples

### Select Specific Domains

```bash
# Only enable work-items and wiki
node wrapper.js work-items wiki
```

### Skip Preflight Check

```bash
# Faster startup, skip PAT validation
node wrapper.js --no-preflight
```

## MCP Tool Design Principles

This wrapper follows MCP best practices:

1. **Clear error messages** - Preflight validation reports issues before protocol starts
2. **Environment flexibility** - Multiple PAT resolution paths for different CI/CD contexts
3. **Domain selection** - Enable only the domains you need
4. **Protocol purity** - Debug output goes to stderr, keeping stdout for MCP protocol

## Troubleshooting

### "PAT not found"

Ensure one of these is set:
- `AZURE_DEVOPS_PAT` in `.env`
- Or any of the fallback variables

### "Preflight failed"

The PAT cannot list projects. Check:
1. PAT has correct scopes (read access to projects)
2. Organization URL is correct
3. PAT is not expired

### Verify PAT manually

```bash
./scripts/verify_azure_devops_pat.sh
```

## References

- [VS Code MCP Integration](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [GitHub MCP Registry](https://github.com/mcp)
- [Azure DevOps MCP (Upstream)](https://github.com/microsoft/azure-devops-mcp)
- [Azure DevOps REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/)

## License

MIT
