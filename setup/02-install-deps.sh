#!/usr/bin/env bash
# Install system dependencies. Idempotent.
set -euo pipefail

USERNAME="claude-remote"

echo "Updating apt package list..."
sudo apt-get update -qq

# System packages
APT_PACKAGES=(tmux jq fzf ripgrep fd-find zsh curl wget unzip git)

for pkg in "${APT_PACKAGES[@]}"; do
  if dpkg -s "$pkg" &>/dev/null; then
    echo "  [ok] $pkg"
  else
    echo "  [install] $pkg"
    sudo apt-get install -y -qq "$pkg"
  fi
done

# fd-find ships as 'fdfind' on Ubuntu — symlink to 'fd'
if command -v fdfind &>/dev/null && ! command -v fd &>/dev/null; then
  sudo ln -sf "$(command -v fdfind)" /usr/local/bin/fd
  echo "  [ok] fd symlink created"
fi

# lazygit
if ! command -v lazygit &>/dev/null; then
  echo "  [install] lazygit"
  LAZYGIT_VERSION=$(curl -s https://api.github.com/repos/jesseduffield/lazygit/releases/latest \
    | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
  curl -sL "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz" \
    | sudo tar -xz -C /usr/local/bin lazygit
  echo "  [ok] lazygit $LAZYGIT_VERSION"
else
  echo "  [ok] lazygit"
fi

# GitHub CLI
if ! command -v gh &>/dev/null; then
  echo "  [install] gh (GitHub CLI)"
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq gh
  echo "  [ok] gh $(gh --version | head -1)"
else
  echo "  [ok] gh"
fi

# nvm + Node.js LTS (installed as claude-remote user)
if sudo -u "$USERNAME" bash -c 'command -v node &>/dev/null'; then
  echo "  [ok] node ($(sudo -u "$USERNAME" bash -c 'node --version'))"
else
  echo "  [install] nvm + Node.js LTS"
  sudo -u "$USERNAME" bash -c '
    export NVM_DIR="$HOME/.nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
    source "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm alias default node
  '
  echo "  [ok] nvm + Node.js"
fi

# Bun (installed as claude-remote user)
if sudo -u "$USERNAME" bash -c 'command -v bun &>/dev/null'; then
  echo "  [ok] bun ($(sudo -u "$USERNAME" bash -c 'bun --version'))"
else
  echo "  [install] bun"
  sudo -u "$USERNAME" bash -c 'curl -fsSL https://bun.sh/install | bash'
  echo "  [ok] bun"
fi

echo "Dependency installation complete."
