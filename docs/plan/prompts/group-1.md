# Group 1: Repository Skeleton

## What You're Doing

Create the repository skeleton: the main `setup.sh` entrypoint, `.gitignore`, a brief `README.md`, the project `CLAUDE.md`, and `.gitkeep` files to establish the directory tree. This group has no validation gate — subsequent groups fill in the structure.

---

## Research & Exploration First

1. Read `IMPLEMENTATION_PLAN.md` sections 4 (repository structure) and 5.1 (setup.sh entrypoint) in full
2. Read `IMPLEMENTATION_PLAN.md` section 7.7 for the exact CLAUDE.md content to install on the server
3. Check what already exists: `LICENSE` (MIT, do not touch), `IMPLEMENTATION_PLAN.md` (do not touch), `scripts/` (ralph.sh and ralph-reset.sh already exist — do not overwrite)

---

## What to Implement

### 1. `setup.sh` — main idempotent entrypoint

Per IMPLEMENTATION_PLAN.md section 5.1. Iterates over `setup/0*.sh` scripts in numerical order. Requirements:
- `set -euo pipefail`
- Print a banner showing what it is and that all steps are idempotent
- Check it's running as a non-root user with sudo access (`sudo -n true 2>/dev/null` check)
- Iterate and source each `setup/[0-9]*.sh` in order, printing the filename before each
- Print a completion message
- Make executable: `chmod +x setup.sh`

### 2. `.gitignore`

```
# RALPH state
.ralph-tasks.json
.ralph-logs/

# Node / Bun
node_modules/
dist/

# Secrets (should never be committed)
.env
.env.*
!.env.example

# OS
.DS_Store
*.swp
*.swo
Thumbs.db
```

### 3. `README.md` — concise setup guide

Structure:
- **What this is** (2–3 sentences from IMPLEMENTATION_PLAN.md section 1)
- **Prerequisites** (from section 3 — already in place + to be installed)
- **Quick start**: `git clone`, `./setup.sh`, then manual steps for Claude Code OAuth and Doppler
- **Post-setup manual steps** (Claude Code auth, Doppler auth, GitHub deploy key, add repos to `config/repos.json`)
- **Architecture** (one-liner pointing to `IMPLEMENTATION_PLAN.md` for full details)
- **Security model** (one paragraph summary from section 15)

Keep it tight — a motivated user should be able to start in 5 minutes of reading.

### 4. `CLAUDE.md` — project context for claude-remote user

This is loaded by Claude Code when running as the `claude-remote` user on the server. See IMPLEMENTATION_PLAN.md section 7.7 for the exact content. Expand it slightly to include:
- What this environment is
- Available infrastructure (Postgres, Valkey, claude-remote-api URLs)
- Git workflow rules (no direct push to main/master/develop)
- Available skills
- Conventions (Bun runtime, Doppler for secrets)

### 5. Directory placeholders

Create `.gitkeep` files in all directories that must exist in git but start empty:
- `setup/.gitkeep`
- `docker/nanoclaw/.gitkeep`
- `tmux/layouts/.gitkeep`
- `skills/.gitkeep`
- `agents/src/prompts/.gitkeep`
- `config/.gitkeep`

(Note: `scripts/` already has files; `docs/plan/` already has files — no .gitkeep needed there)

---

## Validation

```bash
bash -n setup.sh
```

No TypeScript yet — skip that check.

---

## Execute on Homelab

After committing and pushing:

```bash
# 1. Push to GitHub
git push origin master

# 2. Bootstrap: create SourceRoot and clone the repo on homelab
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)
ssh homelab "mkdir -p ~/SourceRoot"
ssh homelab "cd ~/SourceRoot && git clone git@github.com:jkrumm/claude-remote.git" \
  || ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

# 3. Verify clone
ssh homelab "ls ~/SourceRoot/claude-remote/"
```

If GitHub SSH fails (deploy key not set up yet), try HTTPS fallback:
```bash
ssh homelab "cd ~/SourceRoot && git clone https://github.com/jkrumm/claude-remote.git"
```

Add to `MANUAL_TODOS.md` if needed, but this group has no blockers beyond the clone itself.

---

## Commit

```
feat(scaffold): initial repository skeleton with setup entrypoint
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
