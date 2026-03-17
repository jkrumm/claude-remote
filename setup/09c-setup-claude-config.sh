#!/usr/bin/env bash
# Install Claude Code config for the claude-remote user. Idempotent.
# Creates ~/.claude/skills/ as a symlink to the repo so skills stay in sync with git.
set -euo pipefail

USERNAME="claude-remote"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLAUDE_REPO="/home/$USERNAME/SourceRoot/claude-remote"
[[ -d "$CLAUDE_REPO" ]] || CLAUDE_REPO="$REPO_DIR"

CLAUDE_DIR="/home/$USERNAME/.claude"

# Create ~/.claude if it doesn't exist
if [[ ! -d "$CLAUDE_DIR" ]]; then
  sudo -u "$USERNAME" mkdir -p "$CLAUDE_DIR"
  echo "  [ok] created $CLAUDE_DIR"
else
  echo "  [ok] $CLAUDE_DIR already exists"
fi

# Symlink skills/ → repo/skills/
# This means `git pull` in the repo immediately updates available skills.
SKILLS_SRC="$CLAUDE_REPO/skills"
SKILLS_DST="$CLAUDE_DIR/skills"
if [[ -L "$SKILLS_DST" ]]; then
  echo "  [ok] $SKILLS_DST symlink already exists"
elif [[ -d "$SKILLS_DST" ]]; then
  echo "  [warn] $SKILLS_DST is a real directory, not a symlink — leaving it"
else
  sudo -u "$USERNAME" ln -sf "$SKILLS_SRC" "$SKILLS_DST"
  echo "  [ok] $SKILLS_DST → $SKILLS_SRC"
fi

# Symlink CLAUDE.md → repo CLAUDE.md as the user-level Claude Code config.
# This gives all tmux/vibekanban sessions the server environment context.
CLAUDE_MD_SRC="$CLAUDE_REPO/CLAUDE.md"
CLAUDE_MD_DST="$CLAUDE_DIR/CLAUDE.md"
if [[ -L "$CLAUDE_MD_DST" ]]; then
  echo "  [ok] $CLAUDE_MD_DST symlink already exists"
elif [[ -f "$CLAUDE_MD_DST" ]]; then
  echo "  [warn] $CLAUDE_MD_DST is a real file — leaving it"
else
  sudo -u "$USERNAME" ln -sf "$CLAUDE_MD_SRC" "$CLAUDE_MD_DST"
  echo "  [ok] $CLAUDE_MD_DST → $CLAUDE_MD_SRC"
fi

echo "Claude Code config setup complete."
