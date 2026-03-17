#!/usr/bin/env bash
# Start the Docker Compose stack (infra only: postgres + valkey).
# Full stack (api, nanoclaw) requires Doppler service tokens — see MANUAL_TODOS.md M-05.
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
if ! doppler secrets get POSTGRES_PASSWORD --project claude-remote --config docker --plain &>/dev/null 2>&1; then
  echo ""
  echo "  [skip] POSTGRES_PASSWORD not set in Doppler (project: claude-remote, config: docker)"
  echo "  Complete M-05 in MANUAL_TODOS.md to populate Docker secrets, then re-run this script."
  echo ""
  exit 0
fi

echo "Starting postgres and valkey..."
doppler run --project claude-remote --config docker -- \
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
echo ""
echo "Docker Compose setup complete."
echo "Note: claude-remote-api and nanoclaw require M-05 (Doppler service tokens) before starting."
