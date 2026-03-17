#!/usr/bin/env bash
# Install and configure Doppler CLI. Idempotent.
set -euo pipefail

USERNAME="claude-remote"

# Install Doppler CLI (system-wide)
if command -v doppler &>/dev/null; then
  echo "Doppler already installed: $(doppler --version)"
else
  echo "Installing Doppler CLI..."
  curl -Ls https://cli.doppler.com/install.sh | sudo sh
  echo "Doppler installed: $(doppler --version)"
fi

# Configure Doppler project for claude-remote user
# The user still needs to authenticate, but we can set the project config
DOPPLER_CONFIG_DIR="/home/$USERNAME/.doppler"
sudo -u "$USERNAME" mkdir -p "$DOPPLER_CONFIG_DIR"

# Write a project-level doppler.yaml so `doppler run` picks up the right project
REPO_DOPPLER_YAML="/home/$USERNAME/SourceRoot/claude-remote/doppler.yaml"
if [[ ! -f "$REPO_DOPPLER_YAML" ]] && [[ -d "/home/$USERNAME/SourceRoot/claude-remote" ]]; then
  sudo -u "$USERNAME" tee "/home/$USERNAME/SourceRoot/claude-remote/doppler.yaml" > /dev/null <<'EOF'
setup:
  - project: claude-remote
    config: prod
EOF
  echo "  [ok] doppler.yaml written for claude-remote project"
fi

echo ""
echo "Doppler is installed."
echo "Only the host sudo user needs Doppler auth — claude-remote user does not."
echo ""
echo "Authenticate on this machine (if not already done):"
echo "  doppler login"
echo "  doppler setup --project claude-remote --config prod"
echo ""
echo "Then populate secrets (see MANUAL_TODOS.md M-03):"
echo "  doppler secrets set POSTGRES_PASSWORD=... NTFY_TOKEN=... etc."
echo "  --project claude-remote --config prod"
