#!/usr/bin/env bash
set -euo pipefail

echo "[INFO] Verifying Azure DevOps PAT environment variables"
for VAR in ADO_PAT AZURE_DEVOPS_EXT_PAT AZURE_DEVOPS_PAT; do
  val="${!VAR:-}"; printf "%s length: %s\n" "$VAR" "${#val}";
done

# Pick a token to test (preference order)
TOKEN="${AZURE_DEVOPS_EXT_PAT:-${AZURE_DEVOPS_PAT:-${ADO_PAT:-}}}"
if [ -z "$TOKEN" ]; then
  echo "[ERROR] No PAT found in ADO_PAT / AZURE_DEVOPS_EXT_PAT / AZURE_DEVOPS_PAT" >&2
  exit 1
fi

ORG="yorizon"
PROJECTS_URL="https://dev.azure.com/$ORG/_apis/projects?api-version=7.1-preview.4"
HTTP_CODE=$(curl -s -u :"$TOKEN" -o /dev/null -w "%{http_code}" "$PROJECTS_URL" || true)

echo "[INFO] Projects endpoint HTTP status: $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "[WARN] Non-200 response. Potential causes: invalid/expired PAT, missing scopes (Project and Team Read), wrong organization, IP restrictions, conditional access policy."
fi

# Optional: attempt a work item fetch if an ID supplied
if [ "${1:-}" != "" ]; then
  WI_ID="$1"
  WI_URL="https://dev.azure.com/$ORG/_apis/wit/workitems/$WI_ID?api-version=7.1"
  WI_CODE=$(curl -s -u :"$TOKEN" -o /dev/null -w "%{http_code}" "$WI_URL" || true)
  echo "[INFO] Work item $WI_ID HTTP status: $WI_CODE"
fi

cat <<EOF
[HINTS]
1. Ensure PAT scopes include at least: Work Items (Read), Code (Read), Wiki (Read), Project and Team (Read).
2. If status 203/401/403: regenerate PAT; verify org is '$ORG'; confirm user has project membership.
3. Restart VS Code after exporting PAT so MCP server inherits env vars.
4. For debugging MCP, run: env | grep -E 'ADO_PAT|AZURE_DEVOPS' inside the environment where server starts.
EOF
