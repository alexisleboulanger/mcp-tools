#!/usr/bin/env bash
# Start all MCP servers — each in its own dedicated VS Code terminal panel
# Requires VS Code CLI (code) to be on PATH

WORKSPACE="C:/dev/mcp"

echo ""
echo "Opening MCP servers in VS Code terminals..."
echo ""

# Ensure the workspace is open in VS Code
code "$WORKSPACE"

# Small delay to let VS Code initialise if it was not already open
sleep 2

# Trigger the compound task — opens dedicated terminal panels in parallel:
#   🟢 Start: mcp-agent-registry  (npm start)
#   🟢 Start: mcp-knowledge        (npm start)
#   🟢 Start: mcp-agent-runtime-bridge (npm start)
#   🟢 Start: mcp-server-git       (python venv)
code --folder-uri "file:///$WORKSPACE" \
     --command "workbench.action.tasks.runTask" \
     "\U0001F680 Start All MCP Servers" 2>/dev/null \
|| {
  # Fallback: run as background shell jobs if VS Code CLI task trigger fails
  echo "VS Code task trigger unavailable — starting servers as background jobs..."
  echo ""

  (cd "C:/dev/mcp/mcp-agent-registry" && npm start) &
  PID_REGISTRY=$!
  echo "  [mcp-agent-registry] pid $PID_REGISTRY"

  (cd "C:/dev/mcp/mcp-knowledge" && npm start) &
  PID_KNOWLEDGE=$!
  echo "  [mcp-knowledge]       pid $PID_KNOWLEDGE"

  (cd "C:/dev/mcp/mcp-agent-runtime-bridge" && npm start) &
  PID_BRIDGE=$!
  echo "  [mcp-agent-runtime-bridge] pid $PID_BRIDGE"

  ("C:/dev/mcp/mcp-server-git/.venv/Scripts/python.exe" \
    -m mcp_server_git \
    --repository "C:/dev/yorizon/.knowledge") &
  PID_GIT=$!
  echo "  [mcp-server-git]      pid $PID_GIT"

  echo ""
  echo "All servers running in background. Press Ctrl+C to stop all."
  wait
}
