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

## Nanoclaw — Agent Architecture & Strategy

### How agent context actually works

Nanoclaw spawns a fresh Docker container per message. Context is loaded from scratch on every spawn.

**What each group type receives:**

| | Main group (`telegram_main`) | Non-main groups |
|-|-|-|
| CWD | `/workspace/group` → `telegram_main/CLAUDE.md` auto-loaded | `/workspace/group` → their own `CLAUDE.md` |
| `global/CLAUDE.md` | **NOT used** | Injected as system prompt append |
| `/workspace/global` | Not mounted | Mounted read-only |
| `/workspace/project` | nanoclaw project root (read-only) | Not mounted |

**`main/CLAUDE.md` is never loaded by the agent.** It is an upstream nanoclaw template artifact — its path is accessible inside the container at `/workspace/project/groups/main/CLAUDE.md` but is not in CWD or `additionalDirectories`, so the SDK never picks it up. It can be ignored.

**`telegram_main/CLAUDE.md` is the main agent's entire brain.** It must be fully self-contained — identity, purpose, all behavioral principles.

### VCS vs runtime state

```
nanoclaw/groups/{folder}/CLAUDE.md     ← VCS: static instructions we control
~/nanoclaw-data/groups/{folder}/       ← runtime: agent memory (conversations/, notes, etc.)
```

CLAUDE.md files are instructions. Everything else the agent creates in its workspace is dynamic memory. Only CLAUDE.md is committed.

Tracked in VCS:
- `nanoclaw/groups/telegram_main/CLAUDE.md` — the main agent's complete context (self-contained)
- `nanoclaw/groups/global/CLAUDE.md` — base context for any future non-main groups
- `nanoclaw/groups/main/CLAUDE.md` — upstream template reference only (not loaded by agent)

**To sync a CLAUDE.md change to the live server (no restart needed):**
```bash
ssh cr "cat > ~/nanoclaw-data/groups/telegram_main/CLAUDE.md" < nanoclaw/groups/telegram_main/CLAUDE.md
ssh cr "cat > ~/nanoclaw-data/groups/global/CLAUDE.md" < nanoclaw/groups/global/CLAUDE.md
```

### The monitoring philosophy

The agent's primary purpose is HomeLab + VPS monitoring via Telegram. The core design principle:

**Teach behavior, not setup.**

The infrastructure changes constantly — container names, services, endpoint paths all go stale. Hardcoding them into the agent's context makes it confidently wrong. Instead, the CLAUDE.md teaches *how* to discover and investigate.

| ✅ Teach | ❌ Don't hardcode |
|-|-|
| "Discover endpoints via `/openapi.json` every session" | Specific endpoint paths |
| "Check restart counts, memory trends, log content" | Expected container names |
| "Cover both homelab and VPS" | Which services should be running |
| "Cross-reference UptimeKuma with Docker state" | Normal baseline metrics |
| "Lead with verdict, then evidence" | VPS/homelab topology |

**Discovery over assumption:** Query current state rather than relying on memory. The agent fetches `/openapi.json` to know what tools exist right now, then queries live infrastructure.

**Investigation depth:** Surface health is not enough. The CLAUDE.md teaches the agent to probe restart counts, memory trends, log content, and source disagreements — not just whether containers are running.

### Adding capabilities

When new routes are added to claude-remote-api, no agent config changes are needed. The agent discovers new endpoints via `/openapi.json` automatically.

Only update `telegram_main/CLAUDE.md` when:
- A new capability domain is added that needs conceptual framing (e.g. "you now have access to GitHub Actions")
- A behavioral pattern needs adjustment
- Formatting or communication rules change

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
