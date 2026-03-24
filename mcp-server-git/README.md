# mcp-server-git

<!-- mcp-name: io.github.modelcontextprotocol/server-git -->

A Model Context Protocol server that exposes Git operations as tools for LLMs (GitHub Copilot, Claude, etc.).

## Quick Start

### 1. Install into a local virtual environment

```bash
cd C:\dev\mcp\mcp-server-git
python -m venv .venv
.venv\Scripts\python -m pip install .
```

### 2. Add to your workspace `.vscode/mcp.json`

```json
{
  "servers": {
    "git": {
      "type": "stdio",
      "command": "C:\\dev\\mcp\\mcp-server-git\\.venv\\Scripts\\python.exe",
      "args": [
        "-m",
        "mcp_server_git",
        "--repository",
        "C:\\path\\to\\your\\git-repo"
      ]
    }
  }
}
```

> Change `--repository` to the root of the Git repository you want to work with.

### 3. Start the server

VS Code starts the server automatically when a tool call arrives. To start/restart manually:

- Open the Command Palette (`Ctrl+Shift+P`) → **MCP: List Servers** → select `git` → **Start**

---

## Using with a different repository

Edit the `--repository` value in `.vscode/mcp.json` to point at any Git repo:

```json
"args": ["-m", "mcp_server_git", "--repository", "C:\\dev\\yorizon"]
```

Then restart the server: `MCP: List Servers` → `git` → **Restart**.

---

## Available Tools

| Tool | Description |
|---|---|
| `git_status` | Working tree status |
| `git_diff_unstaged` | Unstaged changes |
| `git_diff_staged` | Staged changes |
| `git_diff` | Diff between branches or commits |
| `git_add` | Stage files |
| `git_reset` | Unstage all changes |
| `git_commit` | Create a commit |
| `git_log` | Commit history (supports date filtering) |
| `git_create_branch` | Create a new branch |
| `git_checkout` | Switch branches |
| `git_show` | Show a commit's contents |
| `git_branch` | List local/remote/all branches |

All tools accept `repo_path` as input — pass the absolute path to any Git repository at call time to override the default.

---

## Debugging

Inspect the server interactively with the MCP inspector:

```bash
cd C:\dev\mcp\mcp-server-git
npx @modelcontextprotocol/inspector .venv\Scripts\python -m mcp_server_git --repository .
```

---

## License

MIT — see [LICENSE](LICENSE).
