# CLAUDE.md — claude-remote

## What This Is

You are running as the `claude-remote` user on a headless Ubuntu server. This is an isolated coding agent environment. You have access to a set of projects in `~/SourceRoot/` and a local API for notifications, task management, and spawning headless agents.

---

## Environment

| Service | URL / Location |
|-|-|
| claude-remote-api | `http://localhost:4000` |
| Postgres | `localhost:5432` (user: `claude-remote`, db: `claude-remote`) |
| Valkey | `localhost:6379` |
| Secrets | Doppler — use `doppler run -- <cmd>` or `doppler secrets get KEY --plain` |

**Database schemas**: each project uses its own Postgres schema. Always configure new projects with `?schema=<project-name>` or `search_path=<project-name>`. Never use the default `public` schema.

---

## Git Workflow

- **Never push directly to `main`, `master`, or `develop`**
- Always create a branch: `git checkout -b feature/<description>` or `fix/<description>`
- Create PRs: `gh pr create --base develop` (or `main` if no develop branch)
- Always run lint and tests before committing
- Headless agents must work in a git worktree, not the main checkout

---

## Available Skills

- `/commit` — conventional commits, no AI attribution
- `/pr` — create and manage GitHub PRs
- `/notify` — send a push notification via NTFY
- `/trigger-agent` — spawn a headless agent on another repo
- `/api-bridge` — interact with the claude-remote-api

See `~/.claude/skills/` for all skill files.

---

## Conventions

- **Runtime**: Bun (default), Node.js as fallback
- **Secrets**: always via Doppler — never hardcode, never use `.env` files
- **Commits**: conventional format (`feat:`, `fix:`, `chore:`, etc.), no AI attribution
- **Language**: English only in all code, comments, and documentation
- **TypeScript**: strict mode, no `any`

---

## Doppler

```bash
# Run a command with secrets injected as env vars
doppler run -- <command>

# Get a specific secret value
doppler secrets get KEY --plain

# Example: start a dev server with secrets
doppler run -- bun run dev
```

Secrets are scoped to the `claude-remote` project in Doppler.

---

## Nanoclaw Agent Context

Nanoclaw runs Claude agents in Docker containers. Each group gets its own container with isolated filesystem. Agent context is controlled via layered CLAUDE.md files:

| File | Scope | What it controls |
|-|-|-|
| `nanoclaw/groups/global/CLAUDE.md` | All groups | Identity, API access, formatting rules |
| `nanoclaw/groups/main/CLAUDE.md` | Main/admin group | Group management, container mounts, elevated ops |
| `nanoclaw/groups/telegram_main/CLAUDE.md` | Telegram main channel | Channel-specific formatting, session boot, infrastructure reporting |

**Runtime location:** `~/nanoclaw-data/groups/{group}/CLAUDE.md` (Docker bind mount: `/data/groups/`)

**Key facts:**
- The Dockerfile does NOT bake group CLAUDE.md files into the image — they are runtime state on the bind mount
- `groups/` is gitignored except for CLAUDE.md files (see `.gitignore` negation pattern)
- When updating a CLAUDE.md: edit the repo file, commit/push, then also apply to the live server file at `~/nanoclaw-data/groups/{group}/CLAUDE.md`
- `global/CLAUDE.md` is mounted read-only into every agent container at `/workspace/global/`
- The `telegram_main` group CLAUDE.md layers on top of `main/CLAUDE.md` (main admin template)

**To sync repo changes to the server:**
```bash
ssh cr "cat > ~/nanoclaw-data/groups/global/CLAUDE.md" < nanoclaw/groups/global/CLAUDE.md
```
No restart needed — CLAUDE.md is read fresh on each container spawn.

---

## Shell aliases

- `c` — `claude --dangerously-skip-permissions` — launches Claude Code without interactive permission prompts. Use this alias in tmux sessions and layout scripts.

---

## Database schemas

Each project must use its own Postgres schema. **Never use the default `public` schema.**

```
?schema=<project-name>         # Prisma connection string
search_path=<project-name>     # raw psql / Bun pg
```

Example: a project named `epos` connects with `postgres://...@localhost:5432/claude-remote?schema=epos`.
