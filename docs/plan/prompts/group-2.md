# Group 2: User & System Setup Scripts (01-04)

## What You're Doing

Write the first four setup scripts: create the `claude-remote` user, install all required system tools, install Claude Code CLI, and configure Doppler. Each script must be idempotent — safe to run multiple times without side effects.

---

## Research & Exploration First

1. Read `IMPLEMENTATION_PLAN.md` sections 5.2 (create-user), 5.3 (install-deps), 7.1–7.5 (Claude Code install + auth + theme + skills)
2. Read the existing `setup.sh` to understand the expected interface (each script runs standalone with `bash setup/0N-name.sh`)
3. Look up current Doppler CLI install instructions via Tavily Search — install command may have changed since training data
4. Look up current Claude Code CLI install URL via Tavily Search — `https://claude.ai/install.sh` may have changed
5. Check `config/` directory for any existing files before writing

---

## What to Implement

### 1. `setup/01-create-user.sh`

Per IMPLEMENTATION_PLAN.md section 5.2. Key requirements:
- Create user `claude-remote` with `useradd -m -s /bin/bash` (or `/bin/zsh` if zsh is available)
- Lock the password (`passwd -l`) — SSH key only
- Add sudoers entry so the admin user can `su` without a password (idempotent, write to `/etc/sudoers.d/`)
- Validate the sudoers file with `visudo -c -f` after writing
- Create workspace directories: `~/SourceRoot`, `~/.config`, `~/.local/bin`, `~/.npm-global`
- Copy admin's `~/.ssh/authorized_keys` to the new user (with correct ownership + permissions)
- Print what was done or "already exists, skipping" for each step

### 2. `setup/02-install-deps.sh`

Per IMPLEMENTATION_PLAN.md section 5.3. Install all tools as the `claude-remote` user where possible. Each install wrapped in `if ! command -v <tool> &>/dev/null; then ... fi`.

Tools to install (run as the invoking admin user with sudo where needed):
- **tmux**: `sudo apt-get install -y tmux`
- **jq**: `sudo apt-get install -y jq`
- **fzf**: `sudo apt-get install -y fzf`
- **ripgrep**: `sudo apt-get install -y ripgrep`
- **fd-find**: `sudo apt-get install -y fd-find` (note: binary is `fdfind` on Ubuntu, symlink to `fd`)
- **zsh**: `sudo apt-get install -y zsh` (optional but recommended)
- **lazygit**: download latest release from GitHub (use `curl` + `jq` to get latest version tag)
- **gh (GitHub CLI)**: install via GitHub's official apt repository (not snap)
- **nvm + Node.js LTS**: install nvm as `claude-remote` user, then `nvm install --lts`
- **Bun**: `curl -fsSL https://bun.sh/install | bash` as `claude-remote` user

For tools installed as `claude-remote`: use `sudo -u claude-remote -i bash -c '...'` pattern.

Note the `fd`/`fdfind` naming issue on Ubuntu — create a symlink: `sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd`

### 3. `setup/03-install-claude.sh`

Per IMPLEMENTATION_PLAN.md sections 7.1–7.5. Steps:
1. Install Claude Code CLI as `claude-remote` user (idempotent: check `command -v claude` first)
2. Print the installed version
3. Create Claude skills directory: `/home/claude-remote/.claude/skills/`
4. Copy skills from `skills/*.md` to the skills directory (each copy is idempotent via `cp -f`)
5. Copy theme from `config/claude-code-theme.json` if it exists (skip with a note if not found)
6. Print a reminder that OAuth auth must be done manually: `sudo -u claude-remote -i claude auth login`

Do NOT attempt to run the OAuth flow — it requires a browser. Just print the instruction.

### 4. `setup/04-setup-doppler.sh`

Install and configure Doppler CLI. Steps:
1. Install Doppler CLI (check docs for current apt method — do not rely on training data)
2. Configure the project: `doppler configure set project claude-remote`
3. Print instructions for manual token setup (cannot be automated — requires interactive login or a token)
4. Verify Doppler is accessible: `doppler --version`

---

## Validation

```bash
bash -n setup/01-create-user.sh
bash -n setup/02-install-deps.sh
bash -n setup/03-install-claude.sh
bash -n setup/04-setup-doppler.sh
```

---

## Execute on Homelab

```bash
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)

# Pull latest
ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

# Step 1: Create the claude-remote user
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/01-create-user.sh"

# Step 2: Install system dependencies (tmux, jq, fzf, rg, fd, gh, zsh)
# This installs apt packages and user-level tools (nvm, bun) — takes a few minutes
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/02-install-deps.sh"

# Step 3: Install Claude Code CLI (skip the OAuth step — it needs a browser)
# The script should detect and skip interactive OAuth
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/03-install-claude.sh"

# Step 4: Configure Doppler (already installed on homelab)
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/04-setup-doppler.sh"

# Verify user was created
ssh homelab "id claude-remote"
# Verify key tools
ssh homelab "sudo -u claude-remote bash -c 'which tmux && which jq && which gh'"
```

**Expected manual items to add to MANUAL_TODOS.md after running:**
- M-01: Claude Code OAuth (already in MANUAL_TODOS.md)
- Note if any tool installation failed (log the error, mark as pending)

---

## Commit

```
feat(setup): user creation, dependency installation, and Claude Code setup scripts (01-04)
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
