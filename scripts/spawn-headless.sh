#!/usr/bin/env bash
# Spawn a headless Claude agent in a git worktree.
# Usage: spawn-headless.sh <repo> "<prompt>" [--no-worktree]
set -euo pipefail

REPO="${1:?Usage: spawn-headless.sh <repo> <prompt> [--no-worktree]}"
PROMPT="${2:?Prompt is required}"
USE_WORKTREE=true

[[ "${3:-}" == "--no-worktree" ]] && USE_WORKTREE=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="$(cd "$SCRIPT_DIR/../agents" && pwd)"

cd "$AGENTS_DIR"
exec bun run src/trigger-handler.ts \
  --repo "$REPO" \
  --prompt "$PROMPT" \
  --worktree "$USE_WORKTREE"
