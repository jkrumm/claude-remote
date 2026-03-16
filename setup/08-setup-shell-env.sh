#!/usr/bin/env bash
# Configure shell environment for the claude-remote user. Idempotent.
set -euo pipefail

USERNAME="claude-remote"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLAUDE_REPO="/home/$USERNAME/SourceRoot/claude-remote"
[[ -d "$CLAUDE_REPO" ]] || CLAUDE_REPO="$REPO_DIR"

MARKER="# claude-remote setup"

append_if_missing() {
  local file="$1"
  local content="$2"
  if ! grep -qF "$MARKER" "$file" 2>/dev/null; then
    echo "$content" | sudo -u "$USERNAME" tee -a "$file" > /dev/null
    echo "  [ok] shell config appended to $file"
  else
    echo "  [ok] shell config already in $file"
  fi
}

SHELL_BLOCK="
$MARKER — do not remove this line
# nvm
export NVM_DIR=\"\$HOME/.nvm\"
[ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
[ -s \"\$NVM_DIR/bash_completion\" ] && . \"\$NVM_DIR/bash_completion\"

# Bun
export BUN_INSTALL=\"\$HOME/.bun\"
export PATH=\"\$BUN_INSTALL/bin:\$PATH\"

# npm global (no sudo needed)
export NPM_CONFIG_PREFIX=\"\$HOME/.npm-global\"
export PATH=\"\$HOME/.npm-global/bin:\$PATH\"

# local bin
export PATH=\"\$HOME/.local/bin:\$PATH\"

# Aliases
alias c='claude --dangerously-skip-permissions'
alias g='git'
alias lg='lazygit'
alias ll='ls -la'
alias gw='git worktree'
alias gback='git reset --soft HEAD~1'

# fzf
[ -f /usr/share/doc/fzf/examples/key-bindings.bash ] && source /usr/share/doc/fzf/examples/key-bindings.bash
[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]  && source /usr/share/doc/fzf/examples/key-bindings.zsh
"

# .bashrc
append_if_missing "/home/$USERNAME/.bashrc" "$SHELL_BLOCK"

# .zshrc (if zsh is installed)
if command -v zsh &>/dev/null; then
  sudo -u "$USERNAME" touch "/home/$USERNAME/.zshrc"
  append_if_missing "/home/$USERNAME/.zshrc" "$SHELL_BLOCK"
fi

# tmux.conf
TMUX_SRC="$CLAUDE_REPO/tmux/tmux.conf"
TMUX_DST="/home/$USERNAME/.tmux.conf"
if [[ -f "$TMUX_SRC" ]]; then
  sudo cp "$TMUX_SRC" "$TMUX_DST"
  sudo chown "$USERNAME:$USERNAME" "$TMUX_DST"
  echo "  [ok] .tmux.conf installed"
else
  echo "  [skip] tmux/tmux.conf not yet created"
fi

# Symlink launch script to ~/launch
LAUNCH_SRC="$CLAUDE_REPO/tmux/launch.sh"
LAUNCH_DST="/home/$USERNAME/launch"
if [[ -f "$LAUNCH_SRC" ]]; then
  if [[ ! -L "$LAUNCH_DST" ]]; then
    sudo -u "$USERNAME" ln -sf "$LAUNCH_SRC" "$LAUNCH_DST"
    echo "  [ok] ~/launch symlink created"
  else
    echo "  [ok] ~/launch symlink already exists"
  fi
else
  echo "  [skip] tmux/launch.sh not yet created"
fi

# Clone the claude-remote repo into the claude-remote user's SourceRoot if not there yet
if [[ ! -d "/home/$USERNAME/SourceRoot/claude-remote/.git" ]]; then
  echo "  [clone] claude-remote repo for claude-remote user"
  sudo -u "$USERNAME" git clone https://github.com/jkrumm/claude-remote.git \
    "/home/$USERNAME/SourceRoot/claude-remote" 2>/dev/null || \
    echo "  [skip] repo clone failed — may need deploy key or manual setup"
fi

echo "Shell environment setup complete."
