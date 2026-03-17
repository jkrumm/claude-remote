#!/usr/bin/env bash
# Start the Docker Compose stack (infra only: postgres + valkey).
# Full stack (api, nanoclaw) requires Doppler prod secrets — see MANUAL_TODOS.md M-03.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v docker &>/dev/null; then
  echo "ERROR: docker not found. Install Docker Engine first." >&2
  exit 1
fi

if ! docker compose version &>/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2 not available ('docker compose' subcommand)." >&2
  exit 1
fi

if ! command -v doppler &>/dev/null; then
  echo "ERROR: doppler CLI not found. Run 04-setup-doppler.sh first." >&2
  exit 1
fi

# Check if Doppler docker config has POSTGRES_PASSWORD
if ! doppler secrets get POSTGRES_PASSWORD --project claude-remote --config prod --plain &>/dev/null 2>&1; then
  echo ""
  echo "  [skip] POSTGRES_PASSWORD not set in Doppler (project: claude-remote, config: prod)"
  echo "  Complete M-03 in MANUAL_TODOS.md to populate Doppler prod secrets, then re-run this script."
  echo ""
  exit 0
fi

echo "Starting postgres and valkey..."
doppler run --project claude-remote --config prod -- \
  docker compose -f "$REPO_ROOT/docker/docker-compose.yml" up -d postgres valkey

echo "Waiting for postgres and valkey to be healthy (up to 60s)..."
for i in $(seq 1 12); do
  PG_STATUS=$(docker inspect --format '{{.State.Health.Status}}' claude-remote-postgres 2>/dev/null || echo "missing")
  VK_STATUS=$(docker inspect --format '{{.State.Health.Status}}' claude-remote-valkey 2>/dev/null || echo "missing")

  if [[ "$PG_STATUS" == "healthy" && "$VK_STATUS" == "healthy" ]]; then
    echo "  [ok] postgres: healthy"
    echo "  [ok] valkey: healthy"
    break
  fi

  if [[ "$i" -eq 12 ]]; then
    echo "  [warn] Health check timed out. Current state:"
    echo "         postgres: $PG_STATUS  valkey: $VK_STATUS"
    echo "  Check: docker compose -f docker/docker-compose.yml ps"
  else
    echo "  [wait] postgres: $PG_STATUS  valkey: $VK_STATUS  (${i}/12)"
    sleep 5
  fi
done

echo ""
echo "Stack status:"
docker compose -f "$REPO_ROOT/docker/docker-compose.yml" ps 2>/dev/null || true

# Build the nanoclaw-agent image (required for NanoClaw to spawn Claude agent containers).
# This is a large image (~5 min on first build — Node 22 + Chromium + Claude CLI).
NANOCLAW_AGENT_CONTEXT="$REPO_ROOT/nanoclaw/container"
if [[ -d "$NANOCLAW_AGENT_CONTEXT" ]]; then
  echo ""
  echo "Building nanoclaw-agent:latest (NanoClaw Claude agent container image)..."
  echo "  This may take ~5 minutes on first build (Chromium install)."
  docker build -t nanoclaw-agent:latest "$NANOCLAW_AGENT_CONTEXT"
  echo "  [ok] nanoclaw-agent:latest built"
else
  echo "  [skip] nanoclaw/container/ not found — skipping nanoclaw-agent build"
fi

echo ""
echo "Docker Compose setup complete."
echo "Note: full stack (api, nanoclaw, vibekanban) requires M-03 (Doppler prod secrets) before starting."
