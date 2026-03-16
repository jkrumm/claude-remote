#!/usr/bin/env bash
# Configure git and gh CLI for the claude-remote user. Idempotent.
set -euo pipefail

USERNAME="claude-remote"
HOSTNAME="$(hostname)"

# Git global config for claude-remote user
sudo -u "$USERNAME" git config --global user.name "claude-remote"
sudo -u "$USERNAME" git config --global user.email "claude-remote@${HOSTNAME}"
sudo -u "$USERNAME" git config --global init.defaultBranch main
sudo -u "$USERNAME" git config --global pull.rebase false
# Use SSH for GitHub instead of HTTPS
sudo -u "$USERNAME" git config --global url."git@github.com:".insteadOf "https://github.com/"
echo "Git global config set for $USERNAME"

# gh CLI auth — use token from Doppler if available
if command -v doppler &>/dev/null; then
  GITHUB_TOKEN=$(doppler secrets get GITHUB_TOKEN --project claude-remote --config prod --plain 2>/dev/null || true)
else
  GITHUB_TOKEN=""
fi

if [[ -n "$GITHUB_TOKEN" ]]; then
  echo "$GITHUB_TOKEN" | sudo -u "$USERNAME" gh auth login --with-token
  echo "gh CLI authenticated for $USERNAME via Doppler token."
else
  echo ""
  echo "============================================================"
  echo "ACTION REQUIRED: gh CLI auth for $USERNAME"
  echo "============================================================"
  echo "1. Create a GitHub PAT with scopes: repo, read:org"
  echo "2. Store it: doppler secrets set GITHUB_TOKEN=<token> --project claude-remote --config prod"
  echo "3. Re-run this script, or run manually:"
  echo "   sudo -u $USERNAME -i gh auth login --with-token"
  echo "============================================================"
fi
