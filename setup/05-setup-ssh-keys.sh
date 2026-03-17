#!/usr/bin/env bash
# Generate SSH key for the claude-remote user. Idempotent.
# Note: Git operations use HTTPS authenticated via gh CLI (see 06-setup-gh-cli.sh).
# This key is for general-purpose SSH use (other servers, future needs).
set -euo pipefail

USERNAME="claude-remote"
KEY_FILE="/home/$USERNAME/.ssh/id_ed25519"

if [[ -f "$KEY_FILE" ]]; then
  echo "SSH key already exists: $KEY_FILE"
else
  sudo -u "$USERNAME" ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "claude-remote@$(hostname)"
  echo "Generated SSH key: $KEY_FILE"
fi

sudo chmod 700 "/home/$USERNAME/.ssh"
sudo chown -R "$USERNAME:$USERNAME" "/home/$USERNAME/.ssh"
echo "SSH key ready: $KEY_FILE"
