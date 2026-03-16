# claude-remote — Project Context

Read this at the start of each implementation session.

---

## What claude-remote Is

An isolated, agnostic remote agent environment for any headless Ubuntu machine. Provides:

1. **Isolated `claude-remote` user** — no sudo, restricted PATH, SSH key access only
2. **Docker Compose stack** — Postgres, Valkey, claude-remote-api, NanoClaw, Watchtower on `agent-net`
3. **Claude Code interactive sessions** — via tmux, accessible over Tailscale SSH
4. **Headless agent triggers** — claude-remote-api spawns Agent SDK runs in git worktrees
5. **NanoClaw** — Telegram bot ("ClaudeRemote") bridging to claude-remote-api
6. **Idempotent setup scripts** — `setup.sh` orchestrates `setup/0*.sh`, safe to re-run

Agnostic: any person can fork, run `setup.sh`, and get a working agent environment.

---

## Repository Layout (target state)

```
claude-remote/
├── CLAUDE.md
├── IMPLEMENTATION_PLAN.md          # Primary spec — do not modify
├── LICENSE
├── MANUAL_TODOS.md                 # Steps requiring manual intervention
├── README.md
├── setup.sh
├── setup/
│   ├── 01-create-user.sh
│   ├── 02-install-deps.sh
│   ├── 03-install-claude.sh
│   ├── 04-setup-doppler.sh
│   ├── 05-setup-ssh-keys.sh
│   ├── 06-setup-gh-cli.sh
│   ├── 07-clone-repos.sh
│   ├── 08-setup-shell-env.sh
│   ├── 09-docker-compose.sh
│   └── 10-verify.sh
├── docker/
│   ├── docker-compose.yml
│   └── nanoclaw/Dockerfile
├── tmux/
│   ├── launch.sh
│   ├── tmux.conf
│   └── layouts/default.sh
├── skills/
│   ├── api-bridge.md
│   ├── commit.md
│   ├── notify.md
│   ├── pr.md
│   └── trigger-agent.md
├── agents/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── trigger-handler.ts
│       └── prompts/
│           ├── generic-fix.md
│           ├── pr-review.md
│           └── daily-triage.md
├── config/
│   ├── repos.json
│   └── claude-code-theme.json
├── scripts/
│   ├── dc-up.sh
│   ├── notify.sh
│   └── spawn-headless.sh
└── docs/plan/                      # This directory — implementation guides
```

---

## Tech Stack

| Concern | Choice |
|-|-|
| Runtime | Bun |
| API server | Elysia (same as homelab-api) |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` |
| Setup scripts | Bash, `set -euo pipefail`, idempotent |
| Secrets | Doppler (no .env files) |
| Containers | Docker Compose v2 |
| Shell on server | zsh (Ubuntu 24.04) |

---

## Homelab Facts (verified)

| Fact | Value |
|-|-|
| SSH | `ssh homelab` → jkrumm@100.85.139.104 (Tailscale) |
| OS | Ubuntu 24.04.4 LTS |
| Sudo password | `doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain` |
| NTFY Docker network | `homelab_cloudflared` (not a generic "homelab" network) |
| homelab-api reference | `/Users/johannes.krumm/SourceRoot/homelab/homelab-api/` |
| Doppler on homelab | Installed (v3.75.3) |
| gh CLI on homelab | Not installed yet |
| ~/SourceRoot on homelab | Does not exist yet |
| GitHub remote | `git@github.com:jkrumm/claude-remote.git` |
| claude-remote Doppler | Project exists, `prod` config, currently empty |

**SSH to claude-remote user**: Not possible via Tailscale yet (needs ACL update — M-04 in MANUAL_TODOS.md). Workaround: `ssh homelab` then `sudo -u claude-remote -i`.

---

## Safety Rules

- Never modify existing homelab services, containers, or jkrumm's files
- Never `docker compose down` on the existing homelab stack
- Only create new things: `claude-remote` user, new Docker networks, new containers
- When unsure: add to `MANUAL_TODOS.md` and skip

---

## Coding Standards

- **Bash**: `set -euo pipefail`, idempotent (`if ! command -v X` guards, check before creating)
- **TypeScript**: strict mode, no `any`
- **Secrets**: never hardcode — Doppler or `${VAR:-default}` placeholders
- **No `.env` files**
- **English only** in code, comments, docs
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`

---

## Implementation Groups

| # | Group | Prompt |
|-|-|-|
| 1 | Repository Skeleton | `docs/plan/prompts/group-1.md` |
| 2 | User & System Setup (01-04) | `docs/plan/prompts/group-2.md` |
| 3 | Auth, Repos & Shell (05-08, 10) | `docs/plan/prompts/group-3.md` |
| 4 | Docker Compose Stack | `docs/plan/prompts/group-4.md` |
| 5 | tmux Configuration | `docs/plan/prompts/group-5.md` |
| 6 | Skills & CLAUDE.md | `docs/plan/prompts/group-6.md` |
| 7 | Agent SDK | `docs/plan/prompts/group-7.md` |
| 8 | README & Docs | `docs/plan/prompts/group-8.md` |
