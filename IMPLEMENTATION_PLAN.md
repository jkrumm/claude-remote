# claude-remote: Implementation Plan

> An isolated, agnostic remote agent environment for any headless Ubuntu machine.
> Provides Claude Code interactive sessions (tmux), headless Agent SDK agents
> (API-triggered), NanoClaw for Telegram chat, and a bridge API — all sandboxed
> from the rest of the host.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites & assumptions](#3-prerequisites--assumptions)
4. [Repository structure](#4-repository-structure)
5. [Phase 1 — Foundation: user, tooling, shell env](#5-phase-1--foundation)
6. [Phase 2 — Docker Compose stack](#6-phase-2--docker-compose-stack)
7. [Phase 3 — Claude Code environment](#7-phase-3--claude-code-environment)
8. [Phase 4 — tmux session launchers](#8-phase-4--tmux-session-launchers)
9. [Phase 5 — Claude Code skills: API bridge](#9-phase-5--claude-code-skills)
10. [Phase 6 — Headless agent triggers via claude-remote-api](#10-phase-6--headless-agent-triggers)
11. [Phase 7 — NanoClaw setup](#11-phase-7--nanoclaw-setup)
12. [Phase 8 — claude-remote-api (migrated from homelab-api)](#12-phase-8--claude-remote-api)
13. [Phase 9 — Git worktree support for agent workflows](#13-phase-9--git-worktree-support)
14. [Phase 10 — Testing & validation](#14-phase-10--testing--validation)
15. [Security model summary](#15-security-model-summary)
16. [Doppler secrets reference](#16-doppler-secrets-reference)
17. [Open questions & decisions](#17-open-questions--decisions)

---

## 1. Project overview

### Goal

Set up an isolated, secure remote coding agent environment on a headless Ubuntu
server. The environment:

- Runs Claude Code interactively in tmux (SSH-accessible via Tailscale)
- Runs Claude Code headless agents triggered via the claude-remote-api
- Runs NanoClaw ("ClaudeRemote" bot) for Telegram-based chat
- Bridges to a custom API server for TickTick, NTFY, and future integrations
- Is fully isolated from other services on the host
- Uses dedicated SSH deploy keys with GitHub branch protection
- Uses Doppler for all secrets management (no .env files)
- Uses the Claude Code Max subscription (OAuth), not Anthropic API keys
- Is agnostic — any person can fork this repo, run `setup.sh`, and get a
  working isolated agent environment on their own machine

### Non-goals

- No n8n or heavy orchestration frameworks
- No Chrome browser / browser automation (headless server)
- No direct Docker management by the agent
- No merging or pushing to protected branches (PRs only)
- No MCP servers — use Claude Code skills for tool integration (more token-efficient)
- No Sentry-specific integration — generic webhook/task trigger endpoint instead
- No .env files — all secrets via Doppler

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  HOST MACHINE (headless Ubuntu, Tailscale already configured)   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Existing host services (host/homelab network)           │   │
│  │  Plex, Home Assistant, NTFY, other containers...         │   │
│  │  ← NO ACCESS from agent-net →                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ════════════════ network isolation boundary ════════════════    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AGENT SANDBOX                                           │   │
│  │                                                          │   │
│  │  claude-remote user (no sudo, restricted PATH)           │   │
│  │  ├── Claude Code interactive (tmux, --dangerously-skip)  │   │
│  │  ├── Claude Code headless (Agent SDK, API-triggered)     │   │
│  │  ├── Git worktrees for headless agent isolation           │   │
│  │  └── ~/SourceRoot/<project-name>                         │   │
│  │                                                          │   │
│  │  Docker network: agent-net                               │   │
│  │  ├── nanoclaw        (Telegram bot, container sandbox)   │   │
│  │  ├── claude-remote-api (bridge: agent-net ↔ host net)    │   │
│  │  ├── postgres         (latest, Watchtower-managed)       │   │
│  │  ├── valkey           (latest, Watchtower-managed)       │   │
│  │  └── watchtower       (auto-updates infra containers)    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Tailscale (pre-configured, mesh VPN)                           │
└─────────────────────────────────────────────────────────────────┘

Your MacBook (via Tailscale):
  - SSH as claude-remote → tmux sessions (Claude Code interactive)
  - CMUX locally for browser, additional terminal views
  - Zed remote SSH → edit code on server
  - DataGrip → SSH tunnel to Postgres

External services:
  - GitHub (push feature/fix branches, create PRs)
  - Anthropic (Claude Code Max subscription OAuth)
  - Telegram API (NanoClaw bot)
  - NTFY (via claude-remote-api bridge to host network)
  - Doppler (secrets management)
```

### Network flow

```
NanoClaw ──(agent-net)──→ claude-remote-api ──(host net)──→ NTFY
                                                          → TickTick
Claude Code ──(localhost)──→ claude-remote-api (port-mapped)
Webhooks ──(internet/tailscale)──→ claude-remote-api ──→ Agent SDK (spawns headless)
```

---

## 3. Prerequisites & assumptions

Already in place on the host:

- Ubuntu (headless, no GUI)
- Docker + Docker Compose v2
- Tailscale (configured, SSH access working)
- Git
- The user's main account has sudo
- NTFY instance running on the host network (or accessible on host network)

To be installed by setup.sh:

- nvm + Node.js (LTS)
- Bun
- Claude Code CLI
- GitHub CLI (`gh`)
- tmux
- Doppler CLI
- jq, fzf, ripgrep, fd-find, lazygit, git-worktree-tools (wtp)
- Matching shell aliases and tools from the user's local machine

---

## 4. Repository structure

```
claude-remote/
├── CLAUDE.md                       # Global CLAUDE.md for this project
├── README.md                       # Human-readable setup guide
├── setup.sh                        # Main idempotent setup script
├── setup/
│   ├── 01-create-user.sh           # Create claude-remote user (idempotent)
│   ├── 02-install-deps.sh          # nvm, node, bun, tmux, gh, jq, fzf, rg, fd, lazygit, wtp
│   ├── 03-install-claude.sh        # Claude Code CLI + auth
│   ├── 04-setup-doppler.sh         # Doppler CLI + project setup
│   ├── 05-setup-ssh-keys.sh        # Generate deploy key, configure git
│   ├── 06-setup-gh-cli.sh          # gh auth with fine-grained PAT
│   ├── 07-clone-repos.sh           # Clone into ~/SourceRoot/
│   ├── 08-setup-shell-env.sh       # .zshrc/.bashrc, aliases, theme
│   ├── 09-docker-compose.sh        # Start the Docker Compose stack
│   └── 10-verify.sh               # Run verification checks
├── docker/
│   ├── docker-compose.yml          # postgres, valkey, claude-remote-api, nanoclaw, watchtower
│   └── nanoclaw/
│       └── Dockerfile              # NanoClaw container build
├── tmux/
│   ├── launch.sh                   # Project session launcher
│   ├── tmux.conf                   # tmux config for claude-remote user
│   └── layouts/
│       └── default.sh              # 3/4 claude + 1/4 stacked (terminal, dev-server)
├── skills/                         # Claude Code skills (copied from user's local setup)
│   ├── api-bridge.md               # Skill: communicate with claude-remote-api
│   ├── commit.md                   # Skill: /commit
│   ├── pr.md                       # Skill: /pr
│   ├── notify.md                   # Skill: send NTFY notification
│   ├── trigger-agent.md            # Skill: spawn headless agent
│   └── ...                         # Additional skills from user's local machine
├── agents/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── trigger-handler.ts      # Receives trigger from API, spawns Agent SDK
│       └── prompts/
│           ├── generic-fix.md      # Generic error fix prompt
│           ├── pr-review.md        # PR review prompt
│           └── daily-triage.md     # Daily task/error triage prompt
├── config/
│   ├── repos.json                  # Repos to clone with SSH URLs
│   └── claude-code-theme.json      # Claude Code theme (synced from local)
└── scripts/
    ├── spawn-headless.sh           # Spawn headless agent in a worktree
    └── notify.sh                   # Quick NTFY notification helper
```

---

## 5. Phase 1 — Foundation

**Goal**: Create the isolated `claude-remote` user with a shell experience
matching the user's local MacBook setup. The setup.sh script is idempotent —
running it multiple times yields the same result.

### 5.1 Idempotent setup.sh (entrypoint)

```bash
#!/usr/bin/env bash
# setup.sh — Run as a user with sudo. Idempotent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== claude-remote setup ==="
echo "All steps are idempotent. Safe to re-run."
echo ""

for step in "$SCRIPT_DIR"/setup/[0-9]*.sh; do
  echo "--- Running $(basename "$step") ---"
  bash "$step"
  echo ""
done

echo "=== Setup complete ==="
```

### 5.2 Create user (01-create-user.sh)

```bash
#!/usr/bin/env bash
# Idempotent: skips if user already exists
set -euo pipefail

USERNAME="claude-remote"

if id "$USERNAME" &>/dev/null; then
  echo "User $USERNAME already exists, skipping creation."
else
  sudo useradd -m -s /bin/bash "$USERNAME"
  sudo passwd -l "$USERNAME"  # Lock password, SSH key only
  echo "Created user $USERNAME"
fi

# Allow admin to su without password (idempotent)
SUDOERS_FILE="/etc/sudoers.d/$USERNAME"
if [ ! -f "$SUDOERS_FILE" ]; then
  echo "$(whoami) ALL=($USERNAME) NOPASSWD: ALL" | sudo tee "$SUDOERS_FILE"
  sudo chmod 440 "$SUDOERS_FILE"
fi

# Create workspace dirs (idempotent)
sudo -u "$USERNAME" mkdir -p "/home/$USERNAME"/{SourceRoot,.config,.local/bin,.npm-global}

# Copy admin's authorized_keys for SSH access (idempotent)
sudo -u "$USERNAME" mkdir -p "/home/$USERNAME/.ssh"
sudo cp ~/.ssh/authorized_keys "/home/$USERNAME/.ssh/authorized_keys" 2>/dev/null || true
sudo chown "$USERNAME:$USERNAME" "/home/$USERNAME/.ssh/authorized_keys"
sudo chmod 600 "/home/$USERNAME/.ssh/authorized_keys"
```

### 5.3 Install dependencies (02-install-deps.sh)

Inspects the user's local .zshrc for tool inspiration. Installs:

- **nvm + Node.js LTS**: `nvm install --lts`
- **Bun**: `curl -fsSL https://bun.sh/install | bash`
- **tmux**: `sudo apt install -y tmux`
- **jq**: `sudo apt install -y jq`
- **fzf**: `sudo apt install -y fzf` (or git clone for latest)
- **ripgrep**: `sudo apt install -y ripgrep`
- **fd-find**: `sudo apt install -y fd-find`
- **lazygit**: install from GitHub releases
- **wtp (git worktree tools)**: install from source/releases
- **gh (GitHub CLI)**: install from GitHub's apt repo
- **zsh** (optional): if the user prefers zsh over bash

Each install is wrapped in an `if ! command -v <tool> &>/dev/null; then` guard
for idempotency.

### 5.4 Shell environment (08-setup-shell-env.sh)

This step reads from the user's **local machine** CLAUDE.md and .zshrc
(placed in `config/` during initial repo setup) and configures a matching
shell experience for `claude-remote`:

```bash
# /home/claude-remote/.bashrc (or .zshrc) — key parts:

# nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# npm global (no sudo needed)
export PATH="$HOME/.npm-global/bin:$PATH"

# local bin
export PATH="$HOME/.local/bin:$PATH"

# Aliases matching local MacBook
alias c='claude --dangerously-skip-permissions'
alias j='just'  # or whatever 'j' maps to locally
alias g='git'
alias lg='lazygit'
alias ll='ls -la'
alias gw='git worktree'

# Restricted PATH — explicitly exclude dangerous tools
# (docker, systemctl, apt, sudo not in PATH)
export PATH="$HOME/.npm-global/bin:$HOME/.bun/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/$(nvm current)/bin:/usr/bin:/bin:/usr/local/bin"

# Doppler: inject secrets into shell
eval "$(doppler configure --no-prompt 2>/dev/null || true)"

# Fuzzy search
[ -f /usr/share/doc/fzf/examples/key-bindings.bash ] && source /usr/share/doc/fzf/examples/key-bindings.bash
```

**Important**: The setup script copies and adapts from the user's config files
placed at `config/local-zshrc.reference` and `config/local-claude-md.reference`.
It strips person-specific content (names, emails, paths) and keeps the tool
config, aliases, and patterns. This makes the repo agnostic for other users
who bring their own reference configs.

---

## 6. Phase 2 — Docker Compose stack

**Goal**: Isolated infrastructure on `agent-net` with auto-updates.

### 6.1 Docker network design

```
agent-net (bridge):
  - postgres, valkey, claude-remote-api, nanoclaw
  - outbound internet (Telegram, Anthropic, Doppler)
  - NO connection to host's other containers

host network (or existing homelab network):
  - NTFY, Plex, Home Assistant, etc.
  - claude-remote-api is dual-homed (bridge between networks)
```

### 6.2 docker-compose.yml

```yaml
# docker/docker-compose.yml

networks:
  agent-net:
    driver: bridge
  homelab:
    external: true
    name: ${HOMELAB_NETWORK_NAME:-homelab}

services:
  # --- Infrastructure (always latest, Watchtower-managed) ---
  postgres:
    image: postgres:latest  # kept up to date by watchtower
    container_name: claude-remote-postgres
    restart: unless-stopped
    networks: [agent-net]
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_USER: claude-remote
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: claude-remote
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U claude-remote"]
      interval: 10s
      timeout: 5s
      retries: 5

  valkey:
    image: valkey/valkey:latest  # kept up to date by watchtower
    container_name: claude-remote-valkey
    restart: unless-stopped
    networks: [agent-net]
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # --- Bridge API ---
  claude-remote-api:
    build:
      context: ${CLAUDE_REMOTE_API_PATH:-../claude-remote-api}
      dockerfile: Dockerfile
    container_name: claude-remote-api
    restart: unless-stopped
    networks:
      - agent-net
      - homelab   # dual-homed: reaches NTFY, TickTick on host network
    ports:
      - "127.0.0.1:4000:4000"
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN_API}
    # Doppler injects all other env vars at runtime inside the container
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  # --- NanoClaw ---
  nanoclaw:
    build:
      context: ../nanoclaw
      dockerfile: Dockerfile
    container_name: claude-remote-nanoclaw
    restart: unless-stopped
    networks:
      - agent-net   # ONLY agent-net
    volumes:
      - nanoclaw-data:/data
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN_NANOCLAW}
    depends_on:
      claude-remote-api:
        condition: service_healthy

  # --- Watchtower (auto-update infra containers only, no notifications) ---
  watchtower:
    image: containrrr/watchtower:latest
    container_name: claude-remote-watchtower
    restart: unless-stopped
    networks: [agent-net]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      WATCHTOWER_CLEANUP: "true"
      WATCHTOWER_POLL_INTERVAL: "86400"  # check daily
      WATCHTOWER_LABEL_ENABLE: "false"
      WATCHTOWER_SCOPE: "claude-remote"
      WATCHTOWER_NO_STARTUP_MESSAGE: "true"
      WATCHTOWER_NOTIFICATIONS: "none"
    command: >
      claude-remote-postgres
      claude-remote-valkey
      claude-remote-watchtower

volumes:
  pgdata:
  nanoclaw-data:
```

### 6.3 Doppler integration for Docker

Instead of .env files, Doppler injects secrets. Two approaches:

**For claude-remote-api and nanoclaw**: Each container gets a
`DOPPLER_TOKEN` (service token) passed via docker-compose. Inside the
container, the Doppler CLI (installed in the Dockerfile) runs the app:

```dockerfile
# Example Dockerfile snippet for claude-remote-api
RUN curl -Ls https://cli.doppler.com/install.sh | sh
ENTRYPOINT ["doppler", "run", "--"]
CMD ["bun", "run", "start"]
```

**For the Docker Compose launch itself**: A thin wrapper script sources
the needed tokens from Doppler before running docker compose:

```bash
# scripts/dc-up.sh
#!/usr/bin/env bash
eval "$(doppler secrets download --project claude-remote --config docker --no-file --format env-no-quotes)"
docker compose -f docker/docker-compose.yml up -d
```

### 6.4 Database schema convention

Postgres user and database are both `claude-remote`. Each application uses
its own isolated schema:

- `epos_student_enrolment` schema for EPOS
- `basalt_ui` schema for Basalt
- etc.

Apps configure this via their own database URL with `?schema=<name>` or
via the `search_path` setting. This is documented in the global CLAUDE.md
so Claude Code always configures new projects correctly.

---

## 7. Phase 3 — Claude Code environment

**Goal**: Claude Code installed, authenticated with Max subscription,
matching the local machine experience.

### 7.1 Install Claude Code

```bash
# setup/03-install-claude.sh (idempotent)
if ! sudo -u claude-remote command -v claude &>/dev/null; then
  sudo -u claude-remote bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
fi
echo "Claude Code version: $(sudo -u claude-remote claude --version)"
```

### 7.2 Authentication

Claude Code uses the Max subscription OAuth. Authenticate interactively once:

```bash
sudo -u claude-remote -i
claude auth login
# Follow the browser-based OAuth flow
```

This stores the OAuth token in `~/.config/claude/`. The Agent SDK also uses
this same authentication — no separate API key needed.

### 7.3 Claude Code runs in --dangerously-skip-permissions mode always

The `c` alias handles this:

```bash
alias c='claude --dangerously-skip-permissions'
```

No permission allow/deny lists needed. The OS-level user restrictions
(no sudo, no docker, restricted PATH) are the security boundary, not
Claude Code's permission system.

### 7.4 Claude Code theme

Sync the Claude Code theme from the user's local machine. During initial
setup, copy the local theme config to `config/claude-code-theme.json`.
The setup script installs it:

```bash
# setup/03-install-claude.sh (theme section)
THEME_SRC="$SCRIPT_DIR/../config/claude-code-theme.json"
THEME_DST="/home/claude-remote/.config/claude/theme.json"
if [ -f "$THEME_SRC" ]; then
  sudo -u claude-remote cp "$THEME_SRC" "$THEME_DST"
fi
```

### 7.5 Claude Code skills

Skills are stored in `skills/` and symlinked or copied to Claude Code's
skill directory. These are the agnostic versions of the user's local skills:

```bash
# setup/03-install-claude.sh (skills section)
SKILLS_SRC="$SCRIPT_DIR/../skills"
SKILLS_DST="/home/claude-remote/.claude/skills"
sudo -u claude-remote mkdir -p "$SKILLS_DST"
for skill in "$SKILLS_SRC"/*.md; do
  sudo -u claude-remote cp "$skill" "$SKILLS_DST/$(basename "$skill")"
done
```

### 7.6 Tavily and Context7

Configure as Claude Code skills (not MCP) for token efficiency. The skill
files teach Claude Code how to use Tavily and Context7 APIs directly via
`curl` or the built-in WebFetch/WebSearch tools, with rules matching the
user's local setup.

If MCP is preferred for either, configure via:

```bash
sudo -u claude-remote claude mcp add tavily -- npx -y tavily-mcp
sudo -u claude-remote claude mcp add context7 -- npx -y @context7/mcp
```

Decision: start with skills, add MCP only if the skill approach is too
limited. Document the trade-off in CLAUDE.md.

### 7.7 Global CLAUDE.md

The root CLAUDE.md for the `claude-remote` project. This is NOT a
per-repo CLAUDE.md — repos bring their own. This is the global context
for the `claude-remote` setup itself:

```markdown
# CLAUDE.md — claude-remote

## What this is
An isolated remote coding agent environment. You are running as the
`claude-remote` user on a headless Ubuntu server.

## Environment
- Postgres: localhost:5432 (user: claude-remote, db: claude-remote)
  - Each project uses its own schema. Always configure accordingly.
- Valkey: localhost:6379
- claude-remote-api: http://localhost:4000
- Secrets: managed via Doppler (`doppler run -- <command>`)

## Git workflow
- NEVER push to `main`, `master`, or `develop` directly
- Create branches: `feature/<description>` or `fix/<description>`
- Create PRs: `gh pr create --base develop`
- Always run tests and lint before committing
- For headless agents: always work in a git worktree, not the main checkout

## Available skills
- /commit, /pr, /notify, /trigger-agent, /api-bridge
- See ~/.claude/skills/ for all available skills

## Conventions
- All code, commits, docs in English
- Conventional commits: feat:, fix:, chore:, refactor:, docs:, test:
- Use bun as the default runtime
- Use Doppler for all secrets, never hardcode or use .env files
```

---

## 8. Phase 4 — tmux session launchers

**Goal**: Per-project tmux sessions matching the user's CMUX workflow,
accessible via SSH from the MacBook.

### 8.1 Workflow

From your MacBook, you SSH into the homelab:

```bash
ssh claude-remote@homelab
# Then launch a project session:
~/launch epos.student-enrolment
```

Locally on your MacBook, you keep CMUX open for the browser, API docs,
and any local-only views. The tmux session on the server handles Claude Code
and terminals.

### 8.2 Layout: default

Vertical split: 3/4 Claude Code on the left, 1/4 right side with two
stacked panes (terminal on top, dev-server on bottom):

```
┌────────────────────────┬──────────┐
│                        │ Terminal  │
│     Claude Code        ├──────────┤
│     (3/4 width)        │ DevServer │
│                        │           │
└────────────────────────┴──────────┘
```

```bash
#!/usr/bin/env bash
# tmux/layouts/default.sh

tmux new-session -d -s "$SESSION" -c "$REPO_DIR"

# Pane 0: Claude Code (left, 75% width)
tmux send-keys -t "$SESSION:0.0" "c" Enter

# Pane 1: Terminal (right-top, 50% of the 25%)
tmux split-window -h -t "$SESSION:0.0" -c "$REPO_DIR" -p 25

# Pane 2: Dev server (right-bottom)
tmux split-window -v -t "$SESSION:0.1" -c "$REPO_DIR" -p 50

# Focus Claude Code pane
tmux select-pane -t "$SESSION:0.0"

tmux attach-session -t "$SESSION"
```

### 8.3 Launcher script

```bash
#!/usr/bin/env bash
# tmux/launch.sh — symlinked to ~/launch
# Usage: launch <project-name> [layout]

set -euo pipefail

PROJECT="${1:?Usage: launch <project-name> [layout]}"
LAYOUT="${2:-default}"
SESSION="dev-${PROJECT}"
REPO_DIR="$HOME/SourceRoot/${PROJECT}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAYOUT_SCRIPT="${SCRIPT_DIR}/layouts/${LAYOUT}.sh"

if [ ! -d "$REPO_DIR" ]; then
  echo "Error: repo not found at $REPO_DIR"
  echo "Available repos:"
  ls "$HOME/SourceRoot/"
  exit 1
fi

if [ ! -f "$LAYOUT_SCRIPT" ]; then
  echo "Error: layout not found: $LAYOUT"
  echo "Available layouts:"
  ls "${SCRIPT_DIR}/layouts/"
  exit 1
fi

# Attach if session already exists
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Attaching to existing session: $SESSION"
  tmux attach-session -t "$SESSION"
  exit 0
fi

# Create session and apply layout
source "$LAYOUT_SCRIPT"
```

### 8.4 tmux.conf

```bash
# tmux/tmux.conf → /home/claude-remote/.tmux.conf

set -g default-terminal "tmux-256color"
set -as terminal-overrides ",*:RGB"
set -g mouse on
set -g history-limit 50000
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -g escape-time 0
set -g focus-events on

# Status bar — minimal
set -g status-position bottom
set -g status-style "bg=default,fg=default"
set -g status-left "#[bold]#S "
set -g status-right "%H:%M"
set -g status-left-length 30

# Pane borders
set -g pane-border-style "fg=colour240"
set -g pane-active-border-style "fg=colour75"

# Prefix: Ctrl+A
set -g prefix C-a
unbind C-b
bind C-a send-prefix

# Navigation
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# Quick Claude popup (per-directory persistent session)
bind -r y run-shell '\
  SESSION="claude-$(echo #{pane_current_path} | md5sum | cut -c1-8)"; \
  tmux has-session -t "$SESSION" 2>/dev/null || \
  tmux new-session -d -s "$SESSION" -c "#{pane_current_path}" "c"; \
  tmux display-popup -w80% -h80% -E "tmux attach-session -t $SESSION"'
```

---

## 9. Phase 5 — Claude Code skills

**Goal**: Token-efficient skills for interacting with claude-remote-api.
No MCP overhead.

### 9.1 API bridge skill

```markdown
<!-- skills/api-bridge.md -->
# Skill: claude-remote-api

The claude-remote-api runs at http://localhost:4000. Use curl to interact.

## Available endpoints
- GET  /health
- GET  /api/ticktick/tasks
- POST /api/ticktick/tasks
- PATCH /api/ticktick/tasks/:id/complete
- POST /api/notify              — {message, title?, priority?}
- POST /api/agents/trigger      — {repo, prompt, worktree?: boolean}
- GET  /api/agents/status/:id

## Examples
```bash
# Get today's tasks
curl -s http://localhost:4000/api/ticktick/tasks | jq

# Send notification
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "PR ready for review", "title": "EPOS"}'

# Trigger headless agent on a repo
curl -s -X POST http://localhost:4000/api/agents/trigger \
  -H "Content-Type: application/json" \
  -d '{"repo": "epos.student-enrolment", "prompt": "Review and fix the latest test failures"}'
```
```

### 9.2 Notify skill

```markdown
<!-- skills/notify.md -->
# Skill: /notify

Send a push notification via NTFY.

Usage: /notify <message>

Implementation:
```bash
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$MESSAGE\", \"title\": \"Claude Remote\"}"
```
```

### 9.3 Other skills

Copy and adapt from the user's local `~/.claude/skills/` directory.
The setup script handles this:

```bash
# setup/08-setup-shell-env.sh (skills section)
# If config/local-skills/ exists, copy to claude-remote's skills dir
LOCAL_SKILLS="$SCRIPT_DIR/../config/local-skills"
if [ -d "$LOCAL_SKILLS" ]; then
  for skill in "$LOCAL_SKILLS"/*.md; do
    sudo -u claude-remote cp "$skill" "/home/claude-remote/.claude/skills/"
  done
fi
```

User prepares their skills by copying them into `config/local-skills/`
before running setup. The skill content is stripped of person-specific
references to remain agnostic.

---

## 10. Phase 6 — Headless agent triggers

**Goal**: The claude-remote-api can trigger headless Claude Agent SDK
runs via the Max subscription.

### 10.1 How it works

The claude-remote-api exposes `POST /api/agents/trigger`. When called
(by NanoClaw, by a webhook, by a scheduled task), it:

1. Validates the request: `{ repo, prompt, worktree?: boolean }`
2. If `worktree: true`, creates a git worktree for isolated execution
3. Spawns Claude Code headless via the Agent SDK (TypeScript):

```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';

const options: ClaudeAgentOptions = {
  cwd: worktreePath || repoPath,
  permissionMode: 'bypassPermissions',  // matches --dangerously-skip-permissions
};

for await (const msg of query(prompt, options)) {
  // Stream results, track progress
}
```

4. After completion: push branch, create PR, send NTFY notification
5. If worktree was created, optionally clean it up

### 10.2 Prompt templates (agents/src/prompts/)

These are markdown files with `{{variable}}` placeholders:

- **generic-fix.md**: Fix an error described in the prompt, run tests, PR
- **pr-review.md**: Review a PR diff, comment on issues
- **daily-triage.md**: Check for open issues, stale PRs, test failures

### 10.3 Webhook support

The claude-remote-api can receive webhooks from any error/uptime tool:

```
POST /api/webhooks/generic
Body: { source: string, event: string, details: object }
```

The API maps the webhook payload to a repo + prompt and triggers a headless
agent. This is source-agnostic — Sentry, Uptime Kuma, Grafana alerts, whatever.
The mapping is configured in Doppler or a config file.

### 10.4 NanoClaw → headless agent

NanoClaw can trigger headless agents via the API. Example Telegram message:

> "ClaudeRemote, fix the failing tests in basalt-ui"

NanoClaw calls `POST /api/agents/trigger` with `{ repo: "basalt-ui", prompt: "..." }`.
The agent runs, NanoClaw gets back the result, and responds in Telegram.

---

## 11. Phase 7 — NanoClaw setup

**Goal**: Fork NanoClaw, configure as "ClaudeRemote" Telegram bot.

### 11.1 Fork strategy

Fork `qwibitai/nanoclaw` into the claude-remote repo as a git submodule
or as a local copy in `nanoclaw/`. Local copy is preferred for customization.

### 11.2 Configuration

- Bot name: **ClaudeRemote**
- Trigger word: `@ClaudeRemote`
- Telegram bot token: stored in Doppler
- Connected to claude-remote-api via `HOMELAB_API_URL=http://claude-remote-api:4000`
- Runs on Anthropic Max subscription (same OAuth as Claude Code CLI)

### 11.3 Capabilities

Things NanoClaw handles directly:
- Casual chat, Q&A, brainstorming
- "What are my tasks today?" → claude-remote-api → TickTick
- "Send me a reminder at 3pm" → scheduled task → NTFY
- Web search, article summaries
- Daily briefings (NanoClaw's built-in scheduling)

Things NanoClaw delegates to headless agents:
- "Fix the failing tests in basalt-ui" → trigger API → Agent SDK
- "Review the latest PR on EPOS" → trigger API → Agent SDK
- Any task requiring filesystem/git access

### 11.4 NanoClaw isolation

NanoClaw runs in its own Docker container with:
- Only `agent-net` network access
- No Docker socket
- No host filesystem mounts
- Can reach: claude-remote-api, Telegram, Anthropic
- Cannot reach: host services, other containers, NTFY directly

---

## 12. Phase 8 — claude-remote-api

**Goal**: Migrate existing homelab-api to claude-remote-api, add agent
trigger endpoints.

### 12.1 Migration

The existing homelab-api at `~/SourceRoot/homelab/homelab-api/` gets:

1. Copied to a new repo: `claude-remote-api`
2. Dockerfile added (Bun runtime with Doppler CLI)
3. Connected to both `agent-net` and host network in Docker Compose
4. New endpoints added for agent management

### 12.2 Endpoints

Existing (migrated from homelab-api):
```
GET  /health
GET  /api/ticktick/tasks
POST /api/ticktick/tasks
PATCH /api/ticktick/tasks/:id/complete
```

New:
```
POST /api/notify              — bridge to NTFY on host network
POST /api/agents/trigger      — spawn headless Agent SDK run
GET  /api/agents/status/:id   — check agent run status
POST /api/webhooks/generic    — receive webhooks, dispatch to agents
```

Future (not now):
```
GET  /api/garmin/stats
GET  /api/garmin/sleep
```

### 12.3 NTFY bridge

```typescript
// POST /api/notify
app.post('/api/notify', async (req, res) => {
  const { message, title, priority = 3, tags = ['robot'] } = req.body;
  await fetch(`${NTFY_BASE_URL}/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: {
      'Title': title || 'ClaudeRemote',
      'Priority': String(priority),
      'Tags': tags.join(','),
    },
    body: message,
  });
  res.json({ ok: true });
});
```

---

## 13. Phase 9 — Git worktree support

**Goal**: Headless agents always work in isolated worktrees, never in the
main checkout where a tmux session might be active.

### 13.1 Why worktrees

If a headless agent and an interactive tmux session both work on the same
repo checkout simultaneously, they'll conflict on git state (staging area,
branch, unstaged changes). Worktrees solve this: each headless run gets
its own filesystem copy of the repo sharing the same `.git` directory.

### 13.2 Workflow

```bash
# scripts/spawn-headless.sh
REPO="$1"
PROMPT="$2"
REPO_DIR="$HOME/SourceRoot/$REPO"
BRANCH="fix/agent-$(date +%s)"
WORKTREE_DIR="$HOME/SourceRoot/.worktrees/$REPO/$BRANCH"

cd "$REPO_DIR"
git fetch origin
git worktree add "$WORKTREE_DIR" -b "$BRANCH" origin/develop

# Run headless agent in the worktree
cd "$WORKTREE_DIR"
claude -p "$PROMPT" --dangerously-skip-permissions --output-format json

# After completion: push, create PR, clean up
git push origin "$BRANCH"
gh pr create --base develop --title "fix: agent-generated fix" --body "..."

# Notify
curl -s -X POST http://localhost:4000/api/notify \
  -d "{\"message\": \"PR created: $BRANCH\"}"

# Clean up worktree
cd "$HOME"
git -C "$REPO_DIR" worktree remove "$WORKTREE_DIR" --force
```

### 13.3 wtp integration

Install `wtp` (worktree-pro or similar tool) for easier worktree management.
Claude Code can use it via the shell for interactive worktree workflows too.

---

## 14. Phase 10 — Testing & validation

### 14.1 Verification script (10-verify.sh)

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== User isolation ==="
sudo -u claude-remote docker ps 2>&1 | grep -qi "denied\|not found\|permission" \
  && echo "✓ docker blocked" || echo "✗ DOCKER ACCESSIBLE"
sudo -u claude-remote sudo whoami 2>&1 | grep -qi "denied\|not permitted\|not allowed" \
  && echo "✓ sudo blocked" || echo "✗ SUDO ACCESSIBLE"
sudo -u claude-remote ls ~/SourceRoot/ >/dev/null 2>&1 \
  && echo "✓ SourceRoot accessible" || echo "✗ SourceRoot not found"

echo ""
echo "=== Tools ==="
for cmd in claude gh bun node npm tmux jq fzf rg fd lazygit doppler; do
  sudo -u claude-remote command -v "$cmd" >/dev/null 2>&1 \
    && echo "✓ $cmd" || echo "✗ $cmd NOT FOUND"
done

echo ""
echo "=== Docker stack ==="
docker compose -f docker/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"

echo ""
echo "=== Connectivity ==="
curl -sf http://localhost:4000/health && echo "✓ claude-remote-api" || echo "✗ claude-remote-api"
curl -sf http://localhost:5432 2>&1 | head -1 && echo "✓ postgres responding" || echo "  postgres (expected: connection refused on HTTP)"
sudo -u claude-remote psql -h localhost -U claude-remote -d claude-remote -c "SELECT 1" 2>/dev/null \
  && echo "✓ postgres query works" || echo "⚠ postgres query (install psql?)"

echo ""
echo "=== Git ==="
sudo -u claude-remote ssh -T git@github.com 2>&1 | grep -qi "successfully\|Hi" \
  && echo "✓ GitHub SSH" || echo "✗ GitHub SSH failed"
sudo -u claude-remote gh auth status 2>&1 | grep -qi "logged in" \
  && echo "✓ gh CLI authenticated" || echo "✗ gh CLI not authenticated"

echo ""
echo "=== Doppler ==="
sudo -u claude-remote doppler secrets --project claude-remote --config dev ls 2>/dev/null | head -3 \
  && echo "✓ Doppler connected" || echo "✗ Doppler not connected"

echo ""
echo "=== Network isolation ==="
docker exec claude-remote-nanoclaw curl -sf --connect-timeout 2 http://claude-remote-api:4000/health \
  && echo "✓ nanoclaw → api (expected: works)" || echo "✗ nanoclaw → api FAILED"
# This SHOULD fail:
docker exec claude-remote-nanoclaw curl -sf --connect-timeout 2 http://ntfy:80 2>/dev/null \
  && echo "✗ nanoclaw → NTFY (SHOULD NOT WORK)" || echo "✓ nanoclaw → NTFY blocked (expected)"
```

### 14.2 End-to-end test scenarios

1. **Interactive coding**: SSH as claude-remote → `launch basalt-ui` →
   Claude Code edits a file → commit → push branch → create PR
2. **Headless agent**: POST to `/api/agents/trigger` with basalt-ui →
   verify worktree created → branch pushed → PR created → NTFY received
3. **NanoClaw**: Message @ClaudeRemote on Telegram → ask for TickTick
   tasks → ask it to trigger a headless agent → verify delegation works
4. **Doppler**: Change a secret in Doppler → restart container → verify
   new value is injected

---

## 15. Security model summary

| Concern | Mitigation |
|---------|------------|
| Agent modifies host services | Separate Docker network, no Docker socket for agents |
| Agent pushes to protected branches | GitHub branch protection, deploy key per-repo |
| Agent installs system packages | No sudo, restricted PATH |
| Agent accesses host filesystem | claude-remote user sees only ~/SourceRoot/ and ~/ |
| Agent manages Docker | `docker` not in PATH, no socket access |
| Agent reads other secrets | Doppler scoping: each service gets own service token |
| NanoClaw escapes container | No Docker socket, no host mounts, agent-net only |
| Simultaneous agent conflicts | Git worktrees for headless runs |
| Runaway token usage | Max subscription rate limits, --max-turns on headless |

---

## 16. Doppler secrets reference

Doppler project: `claude-remote`

### Configs (environments)

| Config | Used by | Contains |
|--------|---------|----------|
| `dev` | claude-remote user shell | GITHUB_TOKEN, general env |
| `docker` | docker-compose launch | POSTGRES_PASSWORD, DOPPLER_TOKEN_API, DOPPLER_TOKEN_NANOCLAW, HOMELAB_NETWORK_NAME |
| `api` | claude-remote-api | TICKTICK_API_KEY, NTFY_BASE_URL, NTFY_TOPIC, POSTGRES_URL |
| `nanoclaw` | nanoclaw container | TELEGRAM_BOT_TOKEN, HOMELAB_API_URL, Anthropic OAuth |

### Usage patterns

```bash
# Shell: run a command with secrets injected
doppler run --project claude-remote --config dev -- bun test

# Docker: compose up with secrets
doppler run --project claude-remote --config docker -- docker compose up -d

# In Claude Code: read a secret
doppler secrets get TICKTICK_API_KEY --project claude-remote --config api --plain

# Write a secret
doppler secrets set NEW_KEY=value --project claude-remote --config api
```

---

## 17. Open questions & decisions

1. **Test repo**: Clone `jkrumm/basalt-ui` as the initial test project.
   Confirm the GitHub deploy key is added as a write-access deploy key
   to that repo.

2. **homelab-api framework**: What framework does the current homelab-api
   use? (Hono? Express? Fastify?) Needed for adding new endpoints.

3. **NanoClaw auth**: Does NanoClaw work with Claude Code's OAuth token
   (Max subscription) or does it need its own Anthropic API key? Check
   current setup.

4. **Host Docker network name**: What is the actual Docker network name
   used by your existing containers (NTFY, etc.)? Needed for the
   `homelab` external network reference.

5. **Zed remote + Claude Code**: The ACP integration has a known bug on
   remote SSH sessions. Decision: use Claude Code in tmux terminal for
   now, revisit when the bug is fixed.

6. **CMUX vs tmux**: You'll use both — tmux on the server for Claude Code
   sessions, CMUX locally for browser/docs. The SSH session into the
   server tmux session appears as one pane in your local CMUX. Confirm
   this workflow feels right before building more complex layouts.

7. **Tavily: skill vs MCP**: Start with the skill approach. Switch to MCP
   if Claude Code frequently fails to follow the skill instructions for
   web search. Same for Context7.

8. **Daily triage scheduling**: Use NanoClaw's built-in scheduling for
   recurring tasks (daily briefings, error triage). Keep it simple —
   NanoClaw already has cron-like scheduling.
