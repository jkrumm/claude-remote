#!/usr/bin/env bash
# Install Claude Code CLI, copy skills and theme. Idempotent.
set -euo pipefail

USERNAME="claude-remote"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Install Claude Code CLI
if sudo -u "$USERNAME" bash -c 'command -v claude &>/dev/null'; then
  echo "Claude Code already installed: $(sudo -u "$USERNAME" bash -c 'claude --version 2>/dev/null || echo unknown')"
else
  echo "Installing Claude Code CLI..."
  sudo -u "$USERNAME" bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
  echo "Claude Code installed."
fi

# Skills directory
SKILLS_DST="/home/$USERNAME/.claude/skills"
sudo -u "$USERNAME" mkdir -p "$SKILLS_DST"

SKILLS_SRC="$REPO_DIR/skills"
if [[ -d "$SKILLS_SRC" ]] && compgen -G "$SKILLS_SRC/*.md" > /dev/null; then
  for skill in "$SKILLS_SRC"/*.md; do
    sudo cp "$skill" "$SKILLS_DST/$(basename "$skill")"
    sudo chown "$USERNAME:$USERNAME" "$SKILLS_DST/$(basename "$skill")"
    echo "  [ok] skill: $(basename "$skill")"
  done
else
  echo "  No skills found in $SKILLS_SRC — skipping"
fi

# CLAUDE.md — install as the user's global Claude context
CLAUDE_MD_SRC="$REPO_DIR/CLAUDE.md"
CLAUDE_MD_DST="/home/$USERNAME/.claude/CLAUDE.md"
sudo -u "$USERNAME" mkdir -p "/home/$USERNAME/.claude"
if [[ -f "$CLAUDE_MD_SRC" ]]; then
  sudo cp "$CLAUDE_MD_SRC" "$CLAUDE_MD_DST"
  sudo chown "$USERNAME:$USERNAME" "$CLAUDE_MD_DST"
  echo "  [ok] CLAUDE.md installed"
fi

# Theme
THEME_SRC="$REPO_DIR/config/claude-code-theme.json"
THEME_DST="/home/$USERNAME/.claude/theme.json"
if [[ -f "$THEME_SRC" ]]; then
  # Only install if it's not the placeholder
  if ! grep -q '"_comment"' "$THEME_SRC"; then
    sudo cp "$THEME_SRC" "$THEME_DST"
    sudo chown "$USERNAME:$USERNAME" "$THEME_DST"
    echo "  [ok] theme installed"
  else
    echo "  [skip] theme.json is a placeholder — replace config/claude-code-theme.json first"
  fi
fi

echo ""
echo "ACTION REQUIRED: Claude Code OAuth"
echo "  ssh homelab"
echo "  sudo -u $USERNAME -i"
echo "  claude auth login"
echo ""
echo "Claude Code setup complete (OAuth still required)."
