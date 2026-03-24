# mcp-agent-runtime-bridge

MCP server that bridges VS Code Copilot Chat to the Yorizon Python agent runtime (FastAPI + AutoGen + LangGraph).

## Overview

This server forwards MCP tool calls from VS Code to the Yorizon `yorizon-agent-runtime` FastAPI service. It lets you trigger multi-agent AutoGen teams and LangGraph workflows directly from Copilot Chat without leaving VS Code.

## Tools

| Tool | Description |
| ---- | ----------- |
| `agent_health` | Check whether the Yorizon agent runtime is reachable and healthy |
| `agent_list_available` | List all agents, teams, and workflows available in the runtime |
| `agent_run_task` | Run a single named agent with a task description |
| `agent_run_team` | Run an AutoGen multi-agent team against a topic (`nfr-audit` or `maintenance`) |
| `agent_run_workflow` | Start a LangGraph workflow (returns `workflow_id` if human review is required) |
| `agent_resume_workflow` | Resume a paused LangGraph workflow after human review |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_RUNTIME_URL` | `http://localhost:8000` | Base URL of the FastAPI agent runtime |
| `AGENT_RUNTIME_AUTOSTART` | `true` | Auto-start the Python runtime if health check fails at bridge startup |
| `AGENT_RUNTIME_WORKDIR` | `C:\\dev\\yorizon\\yorizon-agent-runtime` (Windows) | Runtime project directory (where `yorizon_agents` is importable) |
| `AGENT_RUNTIME_PYTHON` | `<workdir>/.venv/Scripts/python.exe` (Windows) | Python executable used for launching uvicorn |
| `AGENT_RUNTIME_APP_MODULE` | `yorizon_agents.server:app` | ASGI app module passed to uvicorn |
| `AGENT_RUNTIME_HOST` | `0.0.0.0` | Host used when launching uvicorn |
| `AGENT_RUNTIME_PORT` | Parsed from `AGENT_RUNTIME_URL` | Port used when launching uvicorn |
| `AGENT_RUNTIME_HEALTH_TIMEOUT_MS` | `25000` | Maximum time to wait for runtime health after auto-start |
| `AGENT_RUNTIME_HEALTH_INTERVAL_MS` | `1000` | Polling interval for health checks |

## Setup

```bash
cd C:\dev\mcp\mcp-agent-runtime-bridge
npm install
```

## VS Code MCP Configuration

Already registered in `.vscode/mcp.json` as `"agent-runtime"`:

```json
{
  "agent-runtime": {
    "type": "stdio",
    "command": "node",
    "args": ["C:\\dev\\mcp\\mcp-agent-runtime-bridge\\server.js"],
    "env": {
      "AGENT_RUNTIME_URL": "http://localhost:8000"
    }
  }
}
```

To reload MCP servers after changes: open VS Code Command Palette (`Ctrl+Shift+P`) → **MCP: Restart Server** → select `agent-runtime`.

## Usage

### Prerequisites

By default, bridge startup checks `AGENT_RUNTIME_URL` and auto-starts the Python runtime in the background if needed.

If you prefer manual control, set `AGENT_RUNTIME_AUTOSTART=false` and start the FastAPI runtime yourself:

```bash
cd C:\dev\yorizon\yorizon-agent-runtime
.venv\Scripts\activate
uvicorn yorizon_agents.server:app --host 0.0.0.0 --port 8000
```

### Ways of Working

Once the runtime is up, invoke the bridge tools from VS Code Chat — for example, ask an agent to call `agent_run_team` with `nfr-audit` and a category (e.g. `security`, `availability`, `performance`). You may need to reload VS Code's MCP servers for the `agent-runtime` entry to appear the first time.

**Check the runtime is up:**

```text
Use agent_health to verify the runtime is reachable.
```

**Run an NFR audit team:**

```text
Use agent_run_team with team=nfr-audit and category=security.
```

**Run a workflow with human review:**

```text
1. Use agent_run_workflow with workflow=nfr-audit and category=availability.
   → Runtime pauses at human-in-the-loop step; returns a workflow_id.
2. Review the audit result.
3. Use agent_resume_workflow with workflow_id=<id> and decision=approve.
```

**List what's available:**

```text
Use agent_list_available to see all registered agents, teams, and active workflows.
```

## Architecture

```text
VS Code Copilot Chat
  └─ MCP tool call
       └─ mcp-agent-runtime-bridge (Node.js, this server)
            └─ HTTP POST → FastAPI (localhost:8000)
                 └─ AutoGen team  (NFR_Auditor + Security_Reviewer + Knowledge_Curator)
                 └─ LangGraph workflow (with optional human-in-the-loop)
```

## Available Teams & Workflows

| Name | Type | Agents | Human-in-loop |
| ---- | ---- | ------ | ------------- |
| `nfr-audit` | Team | NFR_Auditor, Security_Reviewer, Knowledge_Curator | No |
| `maintenance` | Team | Knowledge_Curator, Graph_Validator | No |
| `nfr-audit` | Workflow (LangGraph) | NFR_Auditor → Security_Reviewer | Yes |
