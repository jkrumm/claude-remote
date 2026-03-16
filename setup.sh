#!/usr/bin/env bash
# setup.sh — Run as a user with sudo. Idempotent: safe to re-run at any time.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=================================="
echo "  claude-remote setup"
echo "  All steps are idempotent."
echo "  Safe to re-run."
echo "=================================="
echo ""

# Must be run as non-root with sudo access
if [[ "$EUID" -eq 0 ]]; then
  echo "ERROR: Do not run as root. Run as a user with sudo access." >&2
  exit 1
fi

if ! sudo -n true 2>/dev/null; then
  echo "ERROR: This script requires passwordless sudo or an active sudo session." >&2
  echo "Run: sudo -v" >&2
  exit 1
fi

for step in "$SCRIPT_DIR"/setup/[0-9]*.sh; do
  [[ -f "$step" ]] || continue
  echo "--- $(basename "$step") ---"
  bash "$step"
  echo ""
done

echo "=================================="
echo "  Setup complete."
echo ""
echo "  Manual steps still required:"
echo "  See MANUAL_TODOS.md"
echo "=================================="
