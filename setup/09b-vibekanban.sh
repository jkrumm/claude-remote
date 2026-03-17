#!/usr/bin/env bash
# Setup Vibekanban: clone repo, create database, configure MCP for claude-remote user.
# Requires: M-06 GitHub OAuth secrets to be set in Doppler before running.
# Usage: sudo bash setup/09b-vibekanban.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLAUDE_REMOTE_HOME="/home/claude-remote"
SOURCROOT="$CLAUDE_REMOTE_HOME/SourceRoot"
VK_REPO="$SOURCROOT/vibe-kanban"

# --- preflight checks ---

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root: sudo bash setup/09b-vibekanban.sh" >&2
  exit 1
fi

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
  sudo -u claude-remote git -C "$VK_REPO" pull --ff-only || echo "  [warn] pull failed — proceeding with existing checkout"
else
  echo "  Cloning BloopAI/vibe-kanban..."
  sudo -u claude-remote git clone https://github.com/BloopAI/vibe-kanban.git "$VK_REPO"
  echo "  [ok] cloned to $VK_REPO"
fi

# --- Step 2: Create vibekanban database ---

echo ""
echo "=== Step 2: vibekanban database ==="

PG_STATUS=$(docker inspect --format '{{.State.Health.Status}}' claude-remote-postgres 2>/dev/null || echo "not running")

if [[ "$PG_STATUS" != "healthy" ]]; then
  echo "  [warn] claude-remote-postgres is not healthy ($PG_STATUS) — skipping DB creation"
  echo "  Run 09-docker-compose.sh first to start postgres, then re-run this script."
else
  if docker exec claude-remote-postgres psql -U claude-remote -tc "SELECT 1 FROM pg_database WHERE datname='vibekanban'" | grep -q 1; then
    echo "  [ok] vibekanban database already exists"
  else
    docker exec claude-remote-postgres psql -U claude-remote -c "CREATE DATABASE vibekanban;"
    echo "  [ok] vibekanban database created"
  fi
fi

# --- Step 3: Configure Claude Code MCP for claude-remote user ---

echo ""
echo "=== Step 3: Claude Code MCP configuration ==="

MCP_DIR="$CLAUDE_REMOTE_HOME/.claude"
MCP_FILE="$MCP_DIR/mcp-servers.json"

sudo -u claude-remote mkdir -p "$MCP_DIR"

if [[ -f "$MCP_FILE" ]]; then
  # Check if vibe-kanban MCP is already configured
  if grep -q "vibe-kanban" "$MCP_FILE" 2>/dev/null; then
    echo "  [ok] vibe-kanban MCP already in $MCP_FILE"
  else
    echo "  [warn] $MCP_FILE exists but has no vibe-kanban entry."
    echo "  Add manually:"
    cat <<'MCPEOF'
  {
    "vibe-kanban": {
      "command": "npx",
      "args": ["-y", "vibe-kanban@latest", "--mcp"],
      "env": { "VIBEKANBAN_URL": "http://localhost:3000" }
    }
  }
MCPEOF
  fi
else
  sudo -u claude-remote tee "$MCP_FILE" > /dev/null <<'MCPEOF'
{
  "vibe-kanban": {
    "command": "npx",
    "args": ["-y", "vibe-kanban@latest", "--mcp"],
    "env": { "VIBEKANBAN_URL": "http://localhost:3000" }
  }
}
MCPEOF
  chown claude-remote:claude-remote "$MCP_FILE"
  echo "  [ok] MCP config written to $MCP_FILE"
fi

# --- Step 4: Start full Docker stack ---

echo ""
echo "=== Step 4: Start Docker stack ==="
echo "  Starting full stack (first vibekanban build takes ~10 minutes — Rust + Node.js)..."
echo "  Watch progress: docker logs -f claude-remote-vibekanban"
echo ""

doppler run --project claude-remote --config prod -- \
  docker compose -f "$REPO_ROOT/docker/docker-compose.yml" up -d

echo ""
echo "=== Vibekanban setup complete ==="
echo ""
echo "  UI:     SSH tunnel → ssh -L 3000:localhost:3000 homelab"
echo "          then open http://localhost:3000"
echo "  Logs:   docker logs -f claude-remote-vibekanban"
echo "  Health: curl http://localhost:3000/v1/health"
echo ""
