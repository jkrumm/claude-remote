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
