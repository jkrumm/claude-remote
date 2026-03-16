# claude-remote

An isolated, agnostic remote agent environment for any headless Ubuntu server. Runs Claude Code interactive sessions via tmux, headless Agent SDK agents triggered via API, a NanoClaw Telegram bot, and a bridge API — all sandboxed from the rest of the host.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for full architecture details.

---

## Prerequisites

**Already in place on the host:**
- Ubuntu (headless, no GUI)
- Docker + Docker Compose v2
- Tailscale (configured, SSH access working)
- Git
- A user with sudo access

**Installed by `setup.sh`:**
- nvm + Node.js LTS, Bun
- Claude Code CLI
- GitHub CLI (`gh`)
- tmux, jq, fzf, ripgrep, fd-find, lazygit
- Doppler CLI
- zsh (optional)

---

## Quick Start

```bash
git clone https://github.com/<your-username>/claude-remote.git
cd claude-remote

# Edit config/repos.json to add your repos
# Then run setup (idempotent — safe to re-run):
./setup.sh
```

---

## Manual Steps After Setup

These cannot be automated — complete them in order:

1. **Claude Code OAuth** — `sudo -u claude-remote -i claude auth login`
2. **GitHub deploy key** — copy `~/.ssh/id_ed25519.pub` from the `claude-remote` user, add to each repo in GitHub settings
3. **gh CLI auth** — create a GitHub PAT, then `sudo -u claude-remote -i gh auth login --with-token`
4. **Doppler service tokens** — create tokens for the `docker`, `api`, and `nanoclaw` Doppler configs
5. **Start Docker stack** — `./scripts/dc-up.sh`
6. **Verify** — `./setup/10-verify.sh`

See [MANUAL_TODOS.md](MANUAL_TODOS.md) for the full checklist with exact commands.

---

## Daily Usage

```bash
# SSH into the server and start a coding session
ssh claude-remote@<homelab>
launch <project-name>

# Trigger a headless agent
curl -X POST http://localhost:4000/api/agents/trigger \
  -d '{"repo": "my-repo", "prompt": "Fix the failing tests"}'

# Send a notification
./scripts/notify.sh "Task complete"
```

---

## Security Model

The `claude-remote` user has no sudo, no docker socket access, and a restricted PATH. Docker services run on an isolated `agent-net` network with no access to other host services. Headless agents always run in git worktrees to avoid conflicts with active sessions. All secrets are managed via Doppler — no `.env` files anywhere.

---

## Customization

- **Add repos**: edit `config/repos.json`, re-run `setup/07-clone-repos.sh`
- **Add skills**: add `.md` files to `skills/`, re-run `setup/03-install-claude.sh`
- **Replace theme**: `claude theme export > config/claude-code-theme.json`, re-run `setup/03-install-claude.sh`
