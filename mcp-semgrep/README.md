# mcp-semgrep

> MCP server for Semgrep CE SAST scanning — OWASP/CWE-focused static analysis.

## Tools

| Tool | Description |
|------|-------------|
| `semgrep_scan` | Run a Semgrep scan against a target directory. Returns severity summary, top CWEs, top rules, hotspot files. |
| `semgrep_findings` | Retrieve detailed findings from a previous scan with filtering by severity, CWE, rule, or file. |
| `semgrep_report` | Generate a comprehensive markdown SAST report with executive summary, CWE breakdown, and detailed findings. |
| `semgrep_version` | Health check — returns installed version and binary path. |

## Prerequisites

- **Node.js** >= 18
- **Semgrep CE** installed: `pip install semgrep`
- Binary location: auto-detected at `%APPDATA%/Python/Python311/Scripts/semgrep.exe` or set via `SEMGREP_BIN` env var.

## Installation

```bash
cd C:\dev\mcp\mcp-semgrep
npm install
```

## VS Code MCP Configuration

Add to `.vscode/mcp.json`:

```json
"semgrep": {
  "type": "stdio",
  "command": "node",
  "args": ["C:\\dev\\mcp\\mcp-semgrep\\server.js"]
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMGREP_BIN` | `%APPDATA%\Python\Python311\Scripts\semgrep.exe` | Path to semgrep binary |
| `SEMGREP_CONFIG` | `auto` | Default ruleset |
| `SEMGREP_TIMEOUT_MS` | `300000` | Scan timeout (5 min) |
| `SEMGREP_MAX_FINDINGS` | `500` | Max findings per response |

## Usage Examples

### Scan a repository
```
semgrep_scan { "target": "C:\\dev\\yorizon\\yorizon-portal", "repo_name": "yorizon-portal" }
```

### Get high-severity findings
```
semgrep_findings { "target": "C:\\dev\\yorizon\\yorizon-portal", "severity": "ERROR" }
```

### Generate markdown report
```
semgrep_report { "target": "C:\\dev\\yorizon\\yorizon-portal", "repo_name": "yorizon-portal" }
```

## ADR Reference

This tool implements the **Week 1 — One-Shot Baseline Assessment** from [ADR: OWASP-Aligned Continuous Assessment for Yorizon](../yorizon/Yorizon%20Nexus.wiki/[General]-Yorizon-Nexus/Release-Management/Release-Management-Process/Ways-of-Working/17.-ADR-OWASP-Tooling-for-Continuous-Assessment.md).
