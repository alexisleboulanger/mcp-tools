# MCP-ADO-Wrapper Knowledge Base

Documentation for the Azure DevOps MCP wrapper server.

## Overview

MCP-ADO-Wrapper is a wrapper around the upstream `@azure-devops/mcp` server that provides preflight PAT validation, environment variable resolution, and protocol-compliant stdio handling.

## Key Features

- **PAT Resolution** - Resolves PAT from multiple env variable names
- **Preflight Validation** - Verifies PAT can list projects before spawning upstream server
- **Protocol Pure** - Keeps stdio protocol-pure while providing debug visibility
- **Domain Filtering** - Enable only specific tool domains (core, work-items, wiki, etc.)

## Quick Reference

### Configuration

```env
AZURE_DEVOPS_PAT=your_personal_access_token
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/yourorg
```

### VS Code Integration

Add to `.vscode/mcp.json`:

```jsonc
"ado-wrapped": {
  "type": "stdio",
  "command": "node",
  "args": ["C:\\dev\\mcp\\mcp-ado-wrapper\\wrapper.js"]
}
```

## Tool Categories (Domains)

| Domain | Description | Key Tools |
|--------|-------------|-----------|
| `core` | Projects and teams | List projects, Get team info |
| `work-items` | Work item management | Create/update work items, Search, Link items |
| `wiki` | Wiki pages | Get/create wiki pages, List wikis |
| `pipelines` | CI/CD pipelines | Run pipeline, Get build logs |
| `repository` | Git operations | Create branches, Get repositories |
| `pull-request` | PR management | Create/update PRs, Manage reviewers |
| `search` | Code and wiki search | Search code, Search wiki |
| `advanced-security` | Security alerts | Get alerts, List vulnerabilities |
| `test` | Test management | Create test plans, Add test cases |

## Related MCP Memory Entities

- `MCPADOWrapper` - Service entity
- `MCPDynamicToolIntegration` - Integration pattern
- `DevOpsPlatform` - Azure DevOps platform integration

## Cross-References

- [Azure DevOps MCP upstream](https://github.com/microsoft/azure-devops-mcp)
- [VS Code MCP integration](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
