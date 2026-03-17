#!/usr/bin/env bash
# Setup Vibekanban: clone repo, create database, start full stack.
# Requires: M-06 GitHub OAuth secrets to be set in Doppler before running.
# Usage: bash setup/09b-vibekanban.sh  (no sudo needed)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# vibe-kanban cloned as sibling to claude-remote (docker-compose context: ../../vibe-kanban)
VK_REPO="$(cd "$REPO_ROOT/.." && pwd)/vibe-kanban"

# --- preflight checks ---

if ! command -v doppler &>/dev/null; then
  echo "ERROR: doppler CLI not found. Run 04-setup-doppler.sh first." >&2
  exit 1
fi

if ! doppler secrets get VIBEKANBAN_JWT_SECRET --project claude-remote --config prod --plain &>/dev/null 2>&1; then
  echo ""
  echo "  [skip] VIBEKANBAN_JWT_SECRET not set in Doppler."
  echo "  Complete M-06 (GitHub OAuth app creation + doppler secrets set) first, then re-run."
  echo ""
  exit 0
fi

if ! doppler secrets get VIBEKANBAN_GITHUB_OAUTH_CLIENT_ID --project claude-remote --config prod --plain &>/dev/null 2>&1; then
  echo ""
  echo "  [skip] VIBEKANBAN_GITHUB_OAUTH_CLIENT_ID not set in Doppler."
  echo "  Complete M-06 (GitHub OAuth app creation + doppler secrets set) first, then re-run."
  echo ""
  exit 0
fi

# --- Step 1: Clone vibe-kanban repo ---

echo ""
echo "=== Step 1: vibe-kanban repository ==="

if [[ -d "$VK_REPO/.git" ]]; then
  echo "  [ok] vibe-kanban already cloned at $VK_REPO"
  echo "  Pulling latest..."
  git -C "$VK_REPO" pull --ff-only || echo "  [warn] pull failed — proceeding with existing checkout"
else
  echo "  Cloning BloopAI/vibe-kanban to $VK_REPO..."
  git clone https://github.com/BloopAI/vibe-kanban.git "$VK_REPO"
  echo "  [ok] cloned"
fi

# --- Step 2: Create vibekanban database ---

echo ""
echo "=== Step 2: vibekanban database ==="

PG_STATUS=$(docker inspect --format '{{.State.Health.Status}}' claude-remote-postgres 2>/dev/null || echo "not running")

if [[ "$PG_STATUS" != "healthy" ]]; then
  echo "  [warn] claude-remote-postgres is not healthy ($PG_STATUS) — starting it first..."
  doppler run --project claude-remote --config prod -- \
    docker compose -f "$REPO_ROOT/docker/docker-compose.yml" up -d postgres
  echo "  Waiting for postgres..."
  for i in $(seq 1 12); do
    PG_STATUS=$(docker inspect --format '{{.State.Health.Status}}' claude-remote-postgres 2>/dev/null || echo "missing")
    [[ "$PG_STATUS" == "healthy" ]] && break
    [[ "$i" -eq 12 ]] && { echo "  ERROR: postgres did not become healthy." >&2; exit 1; }
    echo "  [wait] $PG_STATUS (${i}/12)"; sleep 5
  done
fi

if docker exec claude-remote-postgres psql -U claude-remote -tc \
   "SELECT 1 FROM pg_database WHERE datname='vibekanban'" | grep -q 1; then
  echo "  [ok] vibekanban database already exists"
else
  docker exec claude-remote-postgres psql -U claude-remote -c "CREATE DATABASE vibekanban;"
  echo "  [ok] vibekanban database created"
fi

# --- Step 3: MCP config hint for claude-remote user ---

echo ""
echo "=== Step 3: Claude Code MCP ==="
echo "  To connect Claude Code (claude-remote user) to vibekanban:"
echo "  As the claude-remote user, add to ~/.claude/mcp-servers.json:"
cat <<'MCPEOF'
  {
    "vibe-kanban": {
      "command": "npx",
      "args": ["-y", "vibe-kanban@latest", "--mcp"],
      "env": { "VIBEKANBAN_URL": "http://localhost:3000" }
    }
  }
MCPEOF

# --- Step 4: Start full Docker stack ---

echo ""
echo "=== Step 4: Start Docker stack ==="
echo "  Starting full stack..."
echo "  First vibekanban build takes ~10 minutes (Rust + Node.js)."
echo "  Watch progress: docker logs -f claude-remote-vibekanban"
echo ""

doppler run --project claude-remote --config prod -- \
  docker compose -f "$REPO_ROOT/docker/docker-compose.yml" up -d

echo ""
echo "=== Vibekanban setup complete ==="
echo ""
echo "  UI:     ssh -L 3000:localhost:3000 homelab → http://localhost:3000"
echo "  Logs:   docker logs -f claude-remote-vibekanban"
echo "  Health: curl http://localhost:3000/v1/health"
echo ""
