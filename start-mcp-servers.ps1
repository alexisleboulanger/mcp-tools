# Start all MCP servers in parallel
# Each server runs in its own terminal window

$servers = @(
    @{
        Name    = "mcp-agent-registry"
        Command = "npm"
        Args    = "start"
        WorkDir = "C:\dev\mcp\mcp-agent-registry"
    },
    @{
        Name    = "mcp-knowledge"
        Command = "npm"
        Args    = "start"
        WorkDir = "C:\dev\mcp\mcp-knowledge"
    },
    @{
        Name    = "mcp-agent-runtime-bridge"
        Command = "npm"
        Args    = "start"
        WorkDir = "C:\dev\mcp\mcp-agent-runtime-bridge"
    },
    @{
        Name    = "mcp-server-git"
        Command = "C:\dev\mcp\mcp-server-git\.venv\Scripts\python.exe"
        Args    = "-m mcp_server_git --repository C:\dev\yorizon\.knowledge"
        WorkDir = "C:\dev\mcp\mcp-server-git"
    }
)

Write-Host ""
Write-Host "Starting MCP servers..." -ForegroundColor Cyan
Write-Host ""

foreach ($server in $servers) {
    Write-Host "  -> $($server.Name)" -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$($server.WorkDir)'; Write-Host '[$($server.Name)]' -ForegroundColor Cyan; & '$($server.Command)' $($server.Args)" -WindowStyle Normal
}

Write-Host ""
Write-Host "All MCP servers launched." -ForegroundColor Green
Write-Host ""
