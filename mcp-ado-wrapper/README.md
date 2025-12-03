# ADO MCP Wrapper

## Reference

[VSCode MCP integration](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)  
[Github MCP registry](https://github.com/mcp?utm_source=vscode-website&utm_campaign=mcp-registry-server-launch-2025)  
[azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp)  

## Intro

Wrapper around the upstream `@azure-devops/mcp` server that:

* Resolves a PAT from common env variable names (AZURE_DEVOPS_PAT, ADO_PAT, AZURE_DEVOPS_EXT_PAT, SYSTEM_ACCESSTOKEN) and `.env.local`.
* Performs a preflight REST call to verify the PAT can list projects (can be skipped with `--no-preflight`).
* Spawns the upstream MCP server via `npx` while standard I/O remains protocol-pure.

## Usage

```bash
node mcp-ado-wrapper/wrapper.js [domains...] [--no-preflight]
```

The organization URL and PAT are taken from `.env` next to `wrapper.js`.
If no domains are supplied, all upstream domains are enabled.

## Environment Variables

The wrapper now expects configuration via `.env` next to `wrapper.js`:

* `AZURE_DEVOPS_PAT` – PAT with access to your organization
* `AZURE_DEVOPS_ORG_URL` – e.g. `https://dev.azure.com/yourorg`

Other legacy variables (`ADO_PAT`, `AZURE_DEVOPS_EXT_PAT`, `SYSTEM_ACCESSTOKEN`) are still honored if present, but are no longer required.

## .env Support

If a `.env` file exists alongside `wrapper.js`, its variables are loaded on startup (without overriding already-present variables).

## Integration

Add to `.vscode/mcp.json` (already added as `ado-wrapped`). Use that server instead of the plain `ado` entry to obtain preflight validation with virtually zero overhead.

Minimal working configuration:

```jsonc
"ado-wrapped": {
  "type": "stdio",
  "command": "node",
  "args": [
    "C:\\dev\\mcp\\mcp-ado-wrapper\\wrapper.js"
  ]
}
```

### Legacy configuration example

For reference, the previous direct configuration for the upstream server looked like this:

```jsonc
// "ado": {
//    "type": "stdio",
//    "command": "npx",
//    "args": ["-y", "@azure-devops/mcp", "${input:ado_org}", "-d", "core", "work-items", "wiki"],
//    "env": {
//       "AZURE_DEVOPS_EXT_PAT": "${env:ADO_PAT}",
//       "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/${input:ado_org}"
//    }
// },
```
