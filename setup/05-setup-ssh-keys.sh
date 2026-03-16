#!/usr/bin/env bash
# Generate SSH deploy key for the claude-remote user. Idempotent.
set -euo pipefail

USERNAME="claude-remote"
KEY_FILE="/home/$USERNAME/.ssh/id_ed25519"

if [[ -f "$KEY_FILE" ]]; then
  echo "SSH key already exists: $KEY_FILE"
else
  sudo -u "$USERNAME" ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "claude-remote@$(hostname)"
  echo "Generated SSH key: $KEY_FILE"
fi

# SSH config for GitHub
SSH_CONFIG="/home/$USERNAME/.ssh/config"
if ! grep -q "github.com" "$SSH_CONFIG" 2>/dev/null; then
  sudo -u "$USERNAME" tee -a "$SSH_CONFIG" > /dev/null <<'EOF'

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking accept-new
EOF
  sudo chmod 600 "$SSH_CONFIG"
  sudo chown "$USERNAME:$USERNAME" "$SSH_CONFIG"
  echo "GitHub SSH config written."
else
  echo "GitHub SSH config already present."
fi

echo ""
echo "============================================================"
echo "ACTION REQUIRED: Add this deploy key to your GitHub repos"
echo "============================================================"
sudo -u "$USERNAME" cat "${KEY_FILE}.pub"
echo ""
echo "GitHub → repo Settings → Deploy keys → Add deploy key"
echo "Title: claude-remote@$(hostname)"
echo "Allow write access: yes"
echo "============================================================"
