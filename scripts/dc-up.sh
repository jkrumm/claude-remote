#!/usr/bin/env bash
# Start the Docker Compose stack with secrets from Doppler.
# Usage: ./scripts/dc-up.sh [service...]  (no args = all services)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

doppler run --project claude-remote --config docker -- \
  docker compose -f "$REPO_ROOT/docker/docker-compose.yml" up -d "$@"
