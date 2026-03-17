# claude-remote

An isolated, agnostic remote coding agent environment for any headless Ubuntu server. Provides Claude Code interactive sessions via tmux, headless Agent SDK agents triggered via API, a NanoClaw Telegram bot for chat-based control, and a bridge API for notifications and task management — all sandboxed from the rest of the host.

---

## What This Is

**claude-remote** turns a headless Ubuntu server into a full coding agent environment. You SSH in and run Claude Code interactively in a tmux session, or trigger headless agents via HTTP to work on repos autonomously. NanoClaw lets you dispatch tasks from Telegram when you're away from a keyboard. Everything runs as an isolated `claude-remote` user with no sudo, no Docker socket, and no access to other host services.

The setup is fully agnostic — fork the repo, edit `config/repos.json`, and run `./setup.sh` to replicate it on your own machine.

---

## Prerequisites

**Already in place on the host:**
- Ubuntu (headless, no GUI required)
- Docker + Docker Compose v2
- Tailscale (configured, SSH access working)
- Git
- A user with sudo access (e.g., your regular login user)

**Installed by `setup.sh`:**
- nvm + Node.js LTS
- Bun
- Claude Code CLI
- GitHub CLI (`gh`)
- tmux, jq, fzf, ripgrep, fd-find, lazygit
- Doppler CLI
- zsh (optional)

---

## Quick Start

### 1. Clone onto the host server

```bash
git clone https://github.com/<your-username>/claude-remote.git
cd claude-remote
```

### 2. Run setup (as a user with sudo, not root)

```bash
./setup.sh
```

The script is idempotent — safe to re-run at any time. It runs all `setup/0*.sh` scripts in order and prints a summary of what each step does. Expect it to take 5–10 minutes on a clean machine.

### 3. Complete the manual steps

These require browser access or external services and cannot be automated:

| Step | Command / Action |
|-|-|
| **Claude Code OAuth** | `sudo -u claude-remote -i claude auth login` |
| **Doppler auth** | `doppler login` then `doppler setup` |
| **GitHub deploy key** | Get key: `sudo cat /home/claude-remote/.ssh/id_ed25519.pub` → add to each repo in GitHub Settings → Deploy keys |
| **gh CLI auth** | `sudo -u claude-remote -i gh auth login --with-token` (see MANUAL_TODOS.md) |
| **Add repos** | Edit `config/repos.json`, then re-run `./setup/07-clone-repos.sh` |
| **Doppler service tokens** | Create tokens for `api` and `nanoclaw` configs (see MANUAL_TODOS.md M-05) |
| **NanoClaw Telegram bot** | Create via @BotFather, store token in Doppler (see MANUAL_TODOS.md M-06) |

See [MANUAL_TODOS.md](MANUAL_TODOS.md) for the full checklist with exact commands.

### 4. Start the Docker stack

```bash
./scripts/dc-up.sh
```

This starts: Postgres, Valkey, claude-remote-api, NanoClaw, and Watchtower.

### 5. Verify

```bash
./setup/10-verify.sh
```

Checks user isolation, installed tools, Docker stack health, API connectivity, GitHub SSH, gh CLI auth, and Doppler connection.

### 6. Launch your first session

```bash
ssh claude-remote@<hostname>
launch <repo-name>
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  HOST MACHINE (headless Ubuntu + Tailscale)          │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Existing host services (NTFY, Plex, etc.)   │   │
│  │  ← unreachable from agent-net →              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ════════════════ network isolation ════════════════  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  AGENT SANDBOX                               │   │
│  │                                              │   │
│  │  claude-remote user (no sudo, no docker)     │   │
│  │  ├── Claude Code interactive (tmux)          │   │
│  │  ├── Headless agents (Agent SDK, worktrees)  │   │
│  │  └── ~/SourceRoot/<repos>                    │   │
│  │                                              │   │
│  │  Docker (agent-net):                         │   │
│  │  ├── claude-remote-api  :4000                │   │
│  │  ├── nanoclaw (Telegram bot)                 │   │
│  │  ├── postgres           :5432 (localhost)    │   │
│  │  └── valkey             :6379 (localhost)    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  External: GitHub (SSH deploy keys), Doppler         │
│            Telegram Bot API, NTFY push               │
└──────────────────────────────────────────────────────┘
```

Ports 4000, 5432, and 6379 are bound to `127.0.0.1` only — not exposed to the network. The `claude-remote-api` container is dual-homed (agent-net + homelab network) so it can reach NTFY on the host network; NanoClaw is on agent-net only.

---

## Daily Usage

### Interactive coding session (SSH + tmux)

```bash
ssh claude-remote@<hostname>
launch <repo-name>        # starts a tmux session with Claude Code + terminal + dev pane
```

Inside tmux (prefix: `Ctrl+A`):
- `hjkl` — navigate panes
- `y` — open a per-directory Claude popup (persistent session)

### Trigger a headless agent

```bash
curl -X POST http://localhost:4000/api/agents/trigger \
  -H "Content-Type: application/json" \
  -d '{"repo": "my-repo", "prompt": "Fix the failing tests in the auth module", "worktree": true}'
```

The agent runs in a git worktree, pushes a branch, creates a PR, and sends an NTFY notification when done.

### NanoClaw (Telegram)

Message `@<your-bot>` on Telegram to:
- Get a task summary from TickTick
- Trigger headless agents on a repo
- Ask questions about repo status

### Send a notification

```bash
./scripts/notify.sh "Deployment complete" "my-repo" 3
# or via curl:
curl -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Task done", "title": "ClaudeRemote", "priority": 3}'
```

---

## Security Model

| Concern | Mitigation |
|-|-|
| Agent modifies host services | Separate Docker network; no Docker socket for agents |
| Agent pushes to protected branches | GitHub branch protection + per-repo deploy key |
| Agent installs system packages | No sudo, restricted PATH |
| Agent accesses host filesystem | claude-remote user sees only `~/SourceRoot/` and `~/` |
| Agent manages Docker | `docker` not in PATH; no socket access |
| Agent reads other services' secrets | Doppler scoping: each service gets its own service token |
| NanoClaw escapes container | No Docker socket, no host mounts, agent-net only |
| Simultaneous agent conflicts | Git worktrees for all headless runs |
| Runaway token usage | Max subscription rate limits + `--max-turns` on headless |

---

## Secrets Management

All secrets are managed via [Doppler](https://doppler.com) — no `.env` files anywhere.

**Project**: `claude-remote`

| Config | Used by |
|-|-|
| `prod` | Everything — shell, setup scripts, and docker-compose stack |

See [docs/doppler.md](docs/doppler.md) for the full secrets reference.

---

## Customization

| Task | How |
|-|-|
| Add repos | Edit `config/repos.json`, re-run `./setup/07-clone-repos.sh` |
| Add Claude Code skills | Add `.md` files to `skills/`, re-run `./setup/03-install-claude.sh` |
| Replace Claude theme | `claude theme export > config/claude-code-theme.json`, re-run `./setup/03-install-claude.sh` |
| Add tmux layouts | Add scripts to `tmux/layouts/`, reference in `tmux/launch.sh` |
| Add headless prompt templates | Add `.md` files to `agents/src/prompts/` |

---

## Project Structure

```
claude-remote/
├── setup.sh                  # Main entry point — runs all setup/ scripts
├── CLAUDE.md                 # Claude Code global context for the claude-remote user
├── MANUAL_TODOS.md           # Steps requiring human intervention
├── config/
│   ├── repos.json            # Repos to clone for the claude-remote user
│   └── claude-code-theme.json # Claude Code theme (replace with your export)
├── docker/
│   └── docker-compose.yml   # Postgres, Valkey, api, nanoclaw, watchtower
├── agents/
│   ├── src/
│   │   ├── trigger-handler.ts  # Agent SDK runner (worktree, PR, notify)
│   │   └── prompts/            # Prompt templates (generic-fix, pr-review, daily-triage)
│   └── package.json
├── skills/                   # Claude Code skills (copied to ~/.claude/skills/)
│   ├── api-bridge.md
│   ├── notify.md
│   ├── trigger-agent.md
│   ├── commit.md
│   └── pr.md
├── scripts/
│   ├── spawn-headless.sh     # CLI wrapper for trigger-handler.ts
│   ├── notify.sh             # Quick NTFY notification sender
│   ├── dc-up.sh              # Docker Compose up
│   └── dc-down.sh            # Docker Compose down
├── setup/
│   ├── 01-create-user.sh     # Create claude-remote system user
│   ├── 02-install-deps.sh    # nvm, Bun, tools (per-user for claude-remote)
│   ├── 03-install-claude.sh  # Claude Code CLI + skills + theme
│   ├── 04-setup-doppler.sh   # Doppler CLI
│   ├── 05-setup-ssh-keys.sh  # SSH key for claude-remote user
│   ├── 06-setup-gh-cli.sh    # gh CLI
│   ├── 07-clone-repos.sh     # Clone repos from config/repos.json
│   ├── 08-setup-shell-env.sh # zsh, tmux config, shell aliases
│   ├── 09-docker-compose.sh  # Pull Docker images
│   └── 10-verify.sh          # Verification checks
└── tmux/
    ├── tmux.conf             # tmux config (Ctrl+A prefix, hjkl nav, Claude popup)
    ├── launch.sh             # Session launcher (symlinked to ~/launch)
    └── layouts/
        └── default.sh        # 75/25 split: Claude Code + terminal + dev server
```

---

## Full Architecture Details

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the complete design, decisions, and rationale behind each component.
