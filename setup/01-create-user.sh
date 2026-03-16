#!/usr/bin/env bash
# Create the claude-remote user. Idempotent.
set -euo pipefail

USERNAME="claude-remote"

if id "$USERNAME" &>/dev/null; then
  echo "User $USERNAME already exists, skipping creation."
else
  sudo useradd -m -s /bin/bash "$USERNAME"
  sudo passwd -l "$USERNAME"  # lock password — SSH key only
  echo "Created user $USERNAME"
fi

# Allow the invoking admin user to su without password (idempotent)
SUDOERS_FILE="/etc/sudoers.d/claude-remote-su"
ADMIN_USER="$(whoami)"
if [[ ! -f "$SUDOERS_FILE" ]]; then
  echo "$ADMIN_USER ALL=($USERNAME) NOPASSWD: ALL" | sudo tee "$SUDOERS_FILE" > /dev/null
  sudo chmod 440 "$SUDOERS_FILE"
  sudo visudo -c -f "$SUDOERS_FILE"
  echo "Sudoers entry created: $ADMIN_USER can su to $USERNAME without password"
else
  echo "Sudoers entry already exists."
fi

# Workspace directories
sudo -u "$USERNAME" mkdir -p \
  "/home/$USERNAME/SourceRoot" \
  "/home/$USERNAME/.config" \
  "/home/$USERNAME/.local/bin" \
  "/home/$USERNAME/.npm-global" \
  "/home/$USERNAME/.ssh"

sudo chmod 700 "/home/$USERNAME/.ssh"

# Copy admin's authorized_keys for SSH fallback access
ADMIN_KEYS="$HOME/.ssh/authorized_keys"
CLAUDE_KEYS="/home/$USERNAME/.ssh/authorized_keys"
if [[ -f "$ADMIN_KEYS" ]]; then
  sudo cp "$ADMIN_KEYS" "$CLAUDE_KEYS"
  sudo chown "$USERNAME:$USERNAME" "$CLAUDE_KEYS"
  sudo chmod 600 "$CLAUDE_KEYS"
  echo "Copied authorized_keys from $ADMIN_USER"
else
  echo "No authorized_keys found for $ADMIN_USER — skipping (Tailscale SSH will handle access)"
  sudo touch "$CLAUDE_KEYS"
  sudo chown "$USERNAME:$USERNAME" "$CLAUDE_KEYS"
  sudo chmod 600 "$CLAUDE_KEYS"
fi

echo "User setup complete: $USERNAME"
