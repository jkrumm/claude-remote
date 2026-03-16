# Group 3: Auth, Repos & Shell Setup Scripts (05-08, 10)

## What You're Doing

Write the remaining setup scripts: SSH deploy keys for GitHub, gh CLI auth, repo cloning, shell environment configuration, and the verification script. Also create `config/repos.json` as the authoritative list of repos to clone.

---

## Research & Exploration First

1. Read `IMPLEMENTATION_PLAN.md` sections 5.4 (shell env), 14.1 (verification script) in full
2. Read existing scripts in `setup/` to understand the coding patterns used in Groups 1-2
3. Read `IMPLEMENTATION_PLAN.md` section 17 (open questions) — specifically item 1 about `basalt-ui` as the test repo
4. Look up `wtp` (satococoa/tap/wtp) install method for Linux — it's a Homebrew tap on macOS but may not have a Linux binary; check GitHub releases

---

## What to Implement

### 1. `config/repos.json`

Authoritative list of repos to clone. Structure:

```json
{
  "repos": [
    {
      "name": "basalt-ui",
      "ssh_url": "git@github.com:<your-github-username>/basalt-ui.git",
      "description": "Test repo — first project to clone for validation"
    }
  ]
}
```

Use `<your-github-username>` as a placeholder — the user fills in their actual username. Include a comment at the top level (as a `_comment` key) explaining the format.

### 2. `setup/05-setup-ssh-keys.sh`

Generate a GitHub deploy key for the `claude-remote` user. Steps:
1. Generate ED25519 key at `/home/claude-remote/.ssh/id_ed25519` (idempotent: skip if exists)
2. Set correct permissions (600 for key, 644 for pub)
3. Configure `~/.ssh/config` with GitHub host entry (idempotent: only add if not present)
4. Print the public key and clear instructions for the user: add it as a deploy key in GitHub repo settings
5. Print a note: this key is per-machine; each repo in `config/repos.json` needs it added

### 3. `setup/06-setup-gh-cli.sh`

Configure the GitHub CLI. Steps:
1. Verify `gh` is installed (exit with error if not — should have been installed in Group 2)
2. Configure git global settings as `claude-remote` user:
   - `user.email` — use a placeholder `claude-remote@<hostname>`
   - `user.name` — use `claude-remote`
3. Configure git to use SSH for GitHub pushes: `git config --global url."git@github.com:".insteadOf "https://github.com/"`
4. Print instructions for manual gh auth: `sudo -u claude-remote -i gh auth login --with-token`
5. Note: gh auth requires a PAT with `repo` and `read:org` scopes

### 4. `setup/07-clone-repos.sh`

Clone all repos listed in `config/repos.json` into `~/SourceRoot/`. Steps:
1. Read `config/repos.json` using `jq`
2. For each repo: clone if not already cloned, otherwise `git fetch` (idempotent)
3. Install dependencies if a `package.json` exists (`bun install`)
4. Print status for each repo

### 5. `setup/08-setup-shell-env.sh`

Per IMPLEMENTATION_PLAN.md section 5.4. Configure the shell environment for `claude-remote`. Steps:
1. Write `/home/claude-remote/.bashrc` additions (idempotent: check for marker comment before appending)
2. If zsh is installed, also write `/home/claude-remote/.zshrc` additions
3. Copy `tmux/tmux.conf` to `/home/claude-remote/.tmux.conf`
4. Symlink `tmux/launch.sh` to `/home/claude-remote/launch` (idempotent)

Shell config must include (per IMPLEMENTATION_PLAN.md section 5.4):
- nvm initialization
- Bun PATH
- npm global PATH
- ~/.local/bin PATH
- Aliases: `c='claude --dangerously-skip-permissions'`, `g='git'`, `lg='lazygit'`, `ll='ls -la'`, `gw='git worktree'`
- Restricted PATH (no docker, no systemctl, no apt, no sudo in PATH)
- Doppler eval
- fzf key bindings

### 6. `setup/10-verify.sh`

Per IMPLEMENTATION_PLAN.md section 14.1. Copy the exact verification script from the spec. It checks:
- User isolation (docker blocked, sudo blocked, SourceRoot accessible)
- Tool presence (claude, gh, bun, node, npm, tmux, jq, fzf, rg, fd, lazygit, doppler)
- Docker stack (container status)
- Connectivity (claude-remote-api health, postgres)
- Git auth (GitHub SSH, gh CLI)
- Doppler connection
- Network isolation (nanoclaw → api works, nanoclaw → NTFY blocked)

---

## Validation

```bash
bash -n setup/05-setup-ssh-keys.sh
bash -n setup/06-setup-gh-cli.sh
bash -n setup/07-clone-repos.sh
bash -n setup/08-setup-shell-env.sh
bash -n setup/10-verify.sh
```

---

## Execute on Homelab

```bash
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)
ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

# Step 5: Generate SSH deploy key for claude-remote user
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/05-setup-ssh-keys.sh"

# Print the generated public key — needed for GitHub deploy key setup (M-02)
echo "=== DEPLOY KEY (add to GitHub repos) ==="
ssh homelab "sudo cat /home/claude-remote/.ssh/id_ed25519.pub"
echo "========================================="

# Step 6: Set up git config for claude-remote
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/06-setup-gh-cli.sh"

# Check if GITHUB_TOKEN is available in Doppler to automate gh auth
GITHUB_TOKEN=$(doppler secrets get GITHUB_TOKEN --project claude-remote --config prod --plain 2>/dev/null || echo "")
if [[ -n "$GITHUB_TOKEN" ]]; then
  ssh homelab "echo '$GITHUB_TOKEN' | sudo -u claude-remote gh auth login --with-token"
  echo "gh CLI authenticated for claude-remote"
else
  echo "GITHUB_TOKEN not in Doppler — adding M-03 to MANUAL_TODOS.md"
  # Append M-03 reminder if not already there
fi

# Step 7: Clone repos (will likely fail until deploy key is added to GitHub — that's OK)
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/07-clone-repos.sh" \
  || echo "WARNING: repo cloning failed — deploy key not yet added (M-02). Continuing."

# Step 8: Set up shell environment (copies tmux.conf, sets up .zshrc/.bashrc, symlinks launch)
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/08-setup-shell-env.sh"

# Verify shell env
ssh homelab "sudo -u claude-remote bash -c 'source ~/.bashrc && echo \$PATH'"
```

**Items to update in MANUAL_TODOS.md after running:**
- M-02: Add the printed public key to GitHub repos (still pending)
- M-03: If GITHUB_TOKEN was not found, gh auth is still pending
- Check output for any failed steps and log them

---

## Commit

```
feat(setup): SSH keys, gh CLI, repo cloning, shell environment, and verification scripts (05-08, 10)
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
