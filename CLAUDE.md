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
- `/align-claude-remote` — full audit: fix OpenAPI schemas, align docs, deploy

See `.claude/skills/` for project skills and `~/.claude/skills/` for user-level skills.

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

## WatchDog — Agent Architecture & Strategy

### How agent context works

WatchDog spawns a fresh Docker container per message. Context loads from scratch on every spawn — there is no persistent in-memory state.

**Context each group type receives:**

| | Main group (`telegram_main`) | Non-main groups |
|-|-|-|
| Behavioral instructions | `groups/instructions/{folder}.md` injected as **system prompt append** (read-only mount) | `groups/global/CLAUDE.md` injected as **system prompt append** (read-only mount) |
| Agent memory CWD | `/workspace/group` → `~/watchdog-data/groups/{folder}/` (read-write, no CLAUDE.md) | Same |
| `/workspace/instructions` | Mounted read-only from `~/watchdog-data/groups/instructions/` | Not mounted |
| `/workspace/global` | Not mounted | Mounted read-only |
| `/workspace/project` | watchdog project root (read-only) | Not mounted |

**Key facts:**
- The agent's CWD (`/workspace/group`) contains only dynamic memory files — no CLAUDE.md lives there
- Instructions are injected via `systemPrompt: { type: 'preset', preset: 'claude_code', append: content }` — the agent cannot read or write the source file
- Credentials injected directly as env vars — no proxy hop

### VCS vs runtime — the clean split

```
watchdog/groups/instructions/{folder}.md  ← VCS only: behavioral instructions (never in agent's filesystem)
watchdog/groups/global/CLAUDE.md          ← VCS only: base context for non-main groups
~/watchdog-data/groups/{folder}/          ← runtime only: agent memory (conversations/, notes, etc.)
~/watchdog-data/groups/instructions/      ← runtime only: synced from VCS, mounted read-only
```

**To update agent instructions and sync to the live server:**
```bash
# 1. Edit the instructions file
vi watchdog/groups/instructions/telegram_main.md

# 2. Commit and push
git add watchdog/groups/instructions/telegram_main.md
git commit -m "docs(watchdog): ..."
git push

# 3. Pull on server and sync (no watchdog restart needed — read fresh per container spawn)
ssh cr "cd ~/SourceRoot/claude-remote && git pull && cp watchdog/groups/instructions/telegram_main.md ~/watchdog-data/groups/instructions/telegram_main.md"
```

**After changing agent-runner or container-runner source code**, the agent container image must be rebuilt:
```bash
ssh cr "cd ~/SourceRoot/claude-remote/watchdog && git pull && ./container/build.sh"
```

### The monitoring philosophy

The agent's primary purpose is HomeLab + VPS monitoring via Telegram. The core principle:

**Teach behavior, not setup.**

Infrastructure changes constantly — containers get added, services move, APIs evolve. Hardcoding specifics makes the agent confidently wrong. Teach *how* to discover and investigate instead.

| ✅ Teach (in `instructions/telegram_main.md`) | ❌ Never hardcode |
|-|-|
| Fetch `/openapi.json` fresh every session | Specific endpoint paths or schemas |
| Check restart counts, memory trends, log content | Expected container names or counts |
| Cover both homelab and VPS | Which services should be running |
| Cross-reference UptimeKuma vs Docker state | Normal baseline metrics |
| Lead with verdict, then evidence | VPS/homelab network topology |
| Send NTFY for urgent findings | Alert thresholds |

**Discovery over assumption:** The agent fetches `/openapi.json` to know what tools it has right now, then queries live state. Prior knowledge of the infrastructure is always treated as potentially stale.

**Investigation depth:** Surface health is not enough. A container with 50 restarts that's currently up is broken. The instructions teach the agent to probe deeper — logs, memory trends, timing, cross-source disagreements.

### Adding capabilities to the agent

When new routes are added to claude-remote-api: **no instruction changes needed.** The agent discovers new endpoints via `/openapi.json` automatically.

Only update `instructions/telegram_main.md` when:
- A new capability domain is added that needs conceptual framing
- A behavioral pattern needs adjustment
- Communication/formatting rules change

### The `/summary` endpoint

`GET /summary` aggregates UptimeKuma, Docker (homelab + VPS), NTFY (last 24h), GitHub notifications/open items, and TickTick overdue/due-soon tasks into a single parallel fetch. The watchdog agent calls it once at session start instead of querying sources piecemeal.

**When adding new integrations to claude-remote-api**, consider whether key context should also be included in `/summary` in `api/src/routes/summary.ts`.

### Proactive monitoring tasks

Three infrastructure tasks are defined in `api/src/routes/tasks.ts` and **seeded automatically at API startup**. No manual seeding step needed.

| ID | Schedule | Purpose |
|-|-|-|
| `monitoring-hourly` | `0 * * * *` | Silent health check — state-transition alerts via NTFY only |
| `monitoring-morning` | `30 7 * * *` | Morning digest — system status, overnight events, today's tasks |
| `monitoring-evening` | `0 23 * * *` | Evening wrap-up — shipped work, resolved incidents, tomorrow |

All three run as `context_mode: isolated` against the main Telegram group. State is persisted in `~/watchdog-data/groups/telegram_main/monitoring_state.json`.

**Task API** (managed via claude-remote-api, tag `Tasks` in `/openapi.json`):
- `GET /tasks` — list all tasks (infra + user-created)
- `POST /tasks` — create scheduled tasks
- `PATCH /tasks/:id` — reschedule (set `next_run`) or pause/resume (`status`)
- `DELETE /tasks/:id` — delete user-created tasks (infra tasks protected)

**Infra tasks are identified by their IDs** (`monitoring-*`) and cannot be deleted.

**To update infra task prompts:** edit `INFRA_TASKS` in `api/src/routes/tasks.ts`, then redeploy the API container. The API reseeds on startup but only inserts tasks that don't yet exist — so to update an existing prompt, delete the row first:
```bash
sqlite3 ~/watchdog-data/store/messages.db "DELETE FROM scheduled_tasks WHERE id='monitoring-hourly'"
# then restart the API container to reseed
```

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
