# claude-remote

An isolated, agnostic remote coding agent environment for any headless Ubuntu server. Provides Claude Code interactive sessions via tmux, Vibekanban for AI agent orchestration and kanban-style task tracking, a NanoClaw Telegram bot for chat-based control, and a bridge API for notifications and task management — all sandboxed from the rest of the host.

---

## What This Is

**claude-remote** turns a headless Ubuntu server into a full coding agent environment. You SSH in and run Claude Code interactively in a tmux session, or use Vibekanban to orchestrate headless Claude agents across repos with a kanban UI, worktrees, and automatic PR creation. NanoClaw lets you dispatch tasks from Telegram when you're away from a keyboard. Everything runs as an isolated `claude-remote` user with no sudo, no Docker socket, and no access to other host services.

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
| **Claude Code OAuth** | `ssh cr` then `claude auth login` |
| **Doppler auth** | On the host: `doppler login` then populate secrets (see MANUAL_TODOS.md M-03) |
| **gh CLI auth** | Run `sudo bash setup/06-setup-gh-cli.sh` — guided PAT setup (see MANUAL_TODOS.md M-02) |
| **Add repos** | Edit `config/repos.json`, then re-run `./setup/07-clone-repos.sh` |
| **NanoClaw Telegram bot** | Create via @BotFather, store token in Doppler, then register channel (see MANUAL_TODOS.md M-04, M-07) |
| **Vibekanban** | Clone repo, create GitHub OAuth app, add Doppler secrets (see MANUAL_TODOS.md M-06) |

See [MANUAL_TODOS.md](MANUAL_TODOS.md) for the full checklist with exact commands.

### 4. Start the Docker stack

```bash
./scripts/dc-up.sh
```

This starts: Postgres, Valkey, claude-remote-api, NanoClaw, docker-proxy, Vibekanban, ElectricSQL, and Azurite.

### 5. Verify

```bash
./setup/10-verify.sh
```

Checks user isolation, installed tools, Docker stack health, API connectivity, gh CLI auth, and Claude Code auth.

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
│  │  ├── Headless agents (Vibekanban, worktrees) │   │
│  │  └── ~/SourceRoot/<repos>                    │   │
│  │                                              │   │
│  │  Docker (agent-net):                         │   │
│  │  ├── claude-remote-api  :4000                │   │
│  │  ├── vibekanban          :3000               │   │
│  │  ├── electric (sync engine)                  │   │
│  │  ├── azurite (blob store)                    │   │
│  │  ├── nanoclaw (Telegram bot) :3001 (proxy)  │   │
│  │  ├── docker-proxy (socket limiter)           │   │
│  │  ├── postgres           :5432 (localhost)    │   │
│  │  └── valkey             :6379 (localhost)    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  External: GitHub (HTTPS + PAT), Doppler             │
│            Telegram Bot API, NTFY push               │
└──────────────────────────────────────────────────────┘
```

Ports 4000, 5432, and 6379 are bound to `127.0.0.1` only. Port 3000 (vibekanban) is localhost-only — access via SSH tunnel (`ssh -L 3000:localhost:3000 homelab`) or a reverse proxy if you have one (see Optional DNS setup below).

`claude-remote-api` and `vibekanban` are dual-homed (agent-net + homelab network) so a Caddy instance on the homelab network can reverse-proxy them with TLS. All other containers are on agent-net only.

**NanoClaw Docker-in-Docker note:** NanoClaw runs inside Docker but spawns Claude agent containers via the host Docker daemon through a socket proxy. Its data directory is a bind mount (not a named volume) at `/home/claude-remote/nanoclaw-data` so that the host Docker daemon can resolve bind mount paths. Port 3001 is the credential proxy — published so that spawned agent containers (on the default bridge) can reach it via `host.docker.internal:3001`. Agent containers receive only a placeholder token; the proxy injects the real OAuth token on each request, reading it fresh from the mounted credentials file so token auto-refreshes are picked up without restarting NanoClaw.

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

### Vibekanban (agent orchestration)

Access the kanban UI via SSH tunnel:
```bash
ssh -L 3000:localhost:3000 homelab
# then open http://localhost:3000 in your browser
```

Or expose it via a reverse proxy with Tailscale DNS (see Optional DNS Setup below).

Create tasks in the UI and Vibekanban launches Claude Code in a git worktree. When done, it pushes a branch and creates a PR. You can also connect Claude Code in your tmux session to Vibekanban via MCP (see MANUAL_TODOS.md M-06).

### NanoClaw (Telegram)

NanoClaw is a **personal assistant** bot — not a coding agent. It runs Claude in ephemeral containers (one per message) and is good at:
- Answering questions, summaries, reminders
- Looking things up and reasoning about tasks
- Delegating coding work to Vibekanban (create a task, which Vibekanban picks up)

Trigger it by starting your message with `@<ASSISTANT_NAME>` (default: `@Andy`).

Before it responds, you must register your Telegram chat as the main channel. Send `/chatid` to the bot — it replies with your chat ID in the format `tg:XXXXXXXXX`. Then register it:
```bash
# Inside the nanoclaw container
docker exec -it claude-remote-nanoclaw node dist/index.js register tg:XXXXXXXXX Johannes main
```
Or use the `/setup` Claude Code skill inside the nanoclaw source directory.

NanoClaw skills live in `nanoclaw/container/skills/` — intentionally separate from the tmux/Vibekanban skills in `skills/`. NanoClaw agents should not commit code or manage repos directly.

### Send a notification

```bash
./scripts/notify.sh "Deployment complete" "my-repo" 3
# or via curl (bearer token required):
curl -X POST http://localhost:4000/api/notify \
  -H "Authorization: Bearer <CLAUDE_REMOTE_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Task done", "title": "ClaudeRemote", "priority": 3}'
```

---

## Optional: DNS + Reverse Proxy

If your homelab runs Caddy (or another reverse proxy) on a shared Docker network, you can expose `vibekanban` and `claude-remote-api` via clean HTTPS URLs accessible only over Tailscale.

**Pattern:**
1. Add a Tailscale-only DNS A record for `<service>.<your-domain>` pointing to your Tailscale IP
2. Add a Caddy block on the homelab network:
   ```
   <service>.<your-domain> {
       reverse_proxy <container-name>:<port>
   }
   ```
3. Caddy uses DNS-01 challenge (Cloudflare plugin) to issue certs for private subdomains

The `vibekanban` and `claude-remote-api` containers are already on both `agent-net` and the `homelab` external network in docker-compose.yml, so Caddy can reach them by container name without further changes. No public exposure — DNS records point to the Tailscale IP only.

---

## Security Model

| Concern | Mitigation |
|-|-|
| Agent modifies host services | Separate Docker network; no Docker socket for agents |
| Agent pushes to protected branches | GitHub branch protection rules |
| Agent installs system packages | No sudo, restricted PATH |
| Agent accesses host filesystem | claude-remote user sees only `~/SourceRoot/` and `~/` |
| Agent manages Docker | `docker` not in PATH; no socket access |
| Agent reads other services' secrets | Secrets injected only into Docker containers at startup, not exposed to the claude-remote user |
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
| Add tmux/Vibekanban skills | Add `.md` files to `skills/` — symlinked to `~/.claude/skills/`, active immediately |
| Add NanoClaw agent skills | Add `.md` files to `nanoclaw/container/skills/` — synced into each group's session on next agent run |
| Replace Claude theme | `claude theme export > config/claude-code-theme.json`, re-run `./setup/03-install-claude.sh` |
| Add tmux layouts | Add scripts to `tmux/layouts/`, reference in `tmux/launch.sh` |
| Change NanoClaw trigger word | Set `ASSISTANT_NAME=<name>` in Doppler and restart nanoclaw |

**Two skill sets, intentionally separate:**
- `skills/` — for tmux sessions and Vibekanban agents (coding skills: `/commit`, `/pr`, etc.)
- `nanoclaw/container/skills/` — for NanoClaw agents (assistant skills: `/debug`, `/setup`)

`skills/` is symlinked to `/home/claude-remote/.claude/skills/` by `setup/09c-setup-claude-config.sh`, so a `git pull` in the repo is all it takes to update available skills for live sessions. `CLAUDE.md` is similarly symlinked to `~/.claude/CLAUDE.md`.

---

## Project Structure

```
claude-remote/
├── setup.sh                  # Main entry point — runs all setup/ scripts in order
├── CLAUDE.md                 # Claude Code context — symlinked to ~/.claude/CLAUDE.md
├── MANUAL_TODOS.md           # Steps requiring human intervention
├── config/
│   ├── repos.json            # Repos to clone for the claude-remote user
│   └── claude-code-theme.json # Claude Code theme (replace with your export)
├── api/                      # claude-remote-api source (Elysia/Bun)
│   ├── src/
│   │   ├── index.ts          # App entry point
│   │   ├── clients/          # ntfy.ts, ticktick.ts
│   │   ├── routes/
│   │   │   ├── health.ts         # GET /health (unauthenticated)
│   │   │   ├── ntfy.ts           # POST /ntfy/send, GET /ntfy/topics|messages
│   │   │   ├── ticktick.ts       # CRUD /ticktick/* — task management
│   │   │   ├── ticktick-auth.ts  # OAuth flow /ticktick/auth/*
│   │   │   ├── uptime-kuma.ts    # GET /uptime-kuma/monitors|status
│   │   │   ├── github.ts         # Transparent proxy /github/api/* → api.github.com
│   │   │   └── docker.ts         # GET /docker/summary|containers|stats|logs/:name
│   │   ├── cron/             # Token refresh jobs
│   │   └── generated/        # TickTick OpenAPI SDK (auto-generated)
│   ├── Dockerfile
│   └── package.json
├── nanoclaw/                 # NanoClaw Telegram bot (vendored, customizable)
│   ├── src/                  # NanoClaw source (TypeScript)
│   │   ├── credential-proxy.ts # HTTP proxy — injects real OAuth token per request
│   │   ├── container-runner.ts # Spawns Claude agent containers via Docker
│   │   └── config.ts         # Includes toHostMountPath() for DinD bind mount fix
│   ├── container/
│   │   ├── Dockerfile        # nanoclaw-agent image (Node 22 + Chromium + Claude CLI)
│   │   ├── agent-runner/     # TypeScript agent runner compiled into each container
│   │   └── skills/           # NanoClaw-specific Claude skills (not shared with tmux)
│   ├── Dockerfile            # NanoClaw service image
│   └── entrypoint.sh        # Extracts OAuth token from credentials file at startup
├── docker/
│   └── docker-compose.yml   # Postgres, Valkey, api, nanoclaw, docker-proxy, vibekanban, electric, azurite
├── skills/                   # tmux + Vibekanban Claude Code skills
│   ├── api-bridge.md         # Symlinked to ~/.claude/skills/ by setup/09c
│   ├── notify.md
│   ├── commit.md
│   └── pr.md
├── scripts/
│   ├── notify.sh             # Quick NTFY notification sender
│   ├── dc-up.sh              # Docker Compose up (via Doppler)
│   └── dc-down.sh            # Docker Compose down
├── setup/
│   ├── 01-create-user.sh     # Create claude-remote system user
│   ├── 02-install-deps.sh    # nvm, Bun, tools (per-user for claude-remote)
│   ├── 03-install-claude.sh  # Claude Code CLI + theme
│   ├── 04-setup-doppler.sh   # Doppler CLI
│   ├── 05-setup-ssh-keys.sh  # SSH key for claude-remote user
│   ├── 06-setup-gh-cli.sh    # gh CLI (guided PAT setup)
│   ├── 07-clone-repos.sh     # Clone repos from config/repos.json
│   ├── 08-setup-shell-env.sh # zsh/bash config, tmux, shell aliases
│   ├── 09-docker-compose.sh  # Pull Docker images, build nanoclaw-agent
│   ├── 09b-vibekanban.sh     # Vibekanban repo clone + DB + MCP config
│   ├── 09c-setup-claude-config.sh # Symlink skills/ and CLAUDE.md into ~/.claude/
│   └── 10-verify.sh          # Verification checks (user, tools, stack, skills)
└── tmux/
    ├── tmux.conf             # tmux config (Ctrl+A prefix, hjkl nav, Claude popup)
    ├── launch.sh             # Session launcher (symlinked to ~/launch)
    └── layouts/
        └── default.sh        # 75/25 split: Claude Code + terminal + dev server
```

---

## Full Architecture Details

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the complete design, decisions, and rationale behind each component.
