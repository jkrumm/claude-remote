#!/usr/bin/env bash
# tmux/launch.sh — symlinked to ~/launch
# Usage: launch <project-name> [layout]
set -euo pipefail

PROJECT="${1:?Usage: launch <project-name> [layout]}"
LAYOUT="${2:-default}"
SESSION="dev-${PROJECT}"
REPO_DIR="$HOME/SourceRoot/${PROJECT}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAYOUT_SCRIPT="${SCRIPT_DIR}/layouts/${LAYOUT}.sh"

if [ ! -d "$REPO_DIR" ]; then
  echo "Error: repo not found at $REPO_DIR"
  echo "Available repos:"
  ls "$HOME/SourceRoot/"
  exit 1
fi

if [ ! -f "$LAYOUT_SCRIPT" ]; then
  echo "Error: layout not found: $LAYOUT"
  echo "Available layouts:"
  ls "${SCRIPT_DIR}/layouts/"
  exit 1
fi

# Attach if session already exists
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Attaching to existing session: $SESSION"
  tmux attach-session -t "$SESSION"
  exit 0
fi

# Create session and apply layout
source "$LAYOUT_SCRIPT"
