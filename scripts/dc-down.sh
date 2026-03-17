#!/usr/bin/env bash
# Stop the Docker Compose stack.
# Usage: ./scripts/dc-down.sh [--volumes]  (--volumes removes named volumes too)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

docker compose -f "$REPO_ROOT/docker/docker-compose.yml" down "$@"
