# Group 6: Claude Code Skills & Project CLAUDE.md

## What You're Doing

Create all Claude Code skill files and finalize the project `CLAUDE.md`. These skills are installed on the server by `setup/03-install-claude.sh` and teach Claude Code how to interact with the local infrastructure (API, notifications, headless agents). Also create the `config/claude-code-theme.json` placeholder.

---

## Research & Exploration First

1. Read `IMPLEMENTATION_PLAN.md` sections 9.1–9.3 (API bridge, notify, other skills) in full
2. Read `IMPLEMENTATION_PLAN.md` section 7.7 for the CLAUDE.md content spec
3. Read the existing `CLAUDE.md` created in Group 1 — extend it rather than replacing
4. Read `IMPLEMENTATION_PLAN.md` section 12.2 for the full API endpoint list (needed in api-bridge.md)
5. Read `IMPLEMENTATION_PLAN.md` section 10.1–10.3 for the agent trigger endpoint (needed in trigger-agent.md)

---

## What to Implement

### 1. `skills/api-bridge.md`

Per IMPLEMENTATION_PLAN.md section 9.1. Teaches Claude Code all available endpoints on `http://localhost:4000`.

Include:
- All endpoints from section 12.2 (health, ticktick, notify, agents/trigger, agents/status, webhooks/generic)
- Auth: `localhost` — no bearer token needed (internal only)
- curl examples for each endpoint category
- When to use each endpoint

### 2. `skills/notify.md`

Per IMPLEMENTATION_PLAN.md section 9.2. A focused skill for sending NTFY push notifications.

Usage pattern: when Claude Code completes a task and wants to notify the user.
- Endpoint: `POST http://localhost:4000/api/notify`
- Body: `{ message, title?, priority? }` where priority is 1–5 (default 3)
- Example curl command
- When to use: after completing work, on errors, on PR creation

### 3. `skills/trigger-agent.md`

Teach Claude Code how to trigger a headless agent run via the API.

Usage: an interactive Claude Code session triggering a background agent on another repo.
- Endpoint: `POST http://localhost:4000/api/agents/trigger`
- Body: `{ repo, prompt, worktree?: boolean }`
- Status check: `GET http://localhost:4000/api/agents/status/:id`
- Example: trigger a fix on `basalt-ui` while working on a different project
- When to use worktree: true (always for headless — avoid conflicts with active sessions)

### 4. `skills/commit.md`

A concise skill for conventional commits in this environment:
- Format: `type(scope): description`
- Types: feat, fix, chore, refactor, docs, test
- No AI attribution (no Co-Authored-By footer)
- Always run tests/lint before committing
- Branch naming: `feature/<description>` or `fix/<description>`
- Never push to main/master/develop — always use PRs

### 5. `skills/pr.md`

A concise PR workflow skill for this environment:
- Always create branches before working
- Use `gh pr create --base develop` (or `main` if no develop branch)
- PR title: conventional commit style
- After PR created: send notification via `/notify`
- The `claude-remote` user only has deploy key access — remind to use HTTPS fallback if SSH fails for specific repos

### 6. `CLAUDE.md` — finalize

Read the existing `CLAUDE.md` from Group 1 and ensure it covers:
- Infrastructure URLs (Postgres, Valkey, claude-remote-api)
- Database schema convention (per section 6.4 — each app uses its own schema)
- Available skills list (now complete with all 5 skills)
- Git rules (no direct push to protected branches, worktrees for headless)
- Doppler usage patterns
- Note about the `c` alias (`claude --dangerously-skip-permissions`)

Update in place — do not rewrite from scratch.

### 7. `config/claude-code-theme.json`

Placeholder file — the user replaces this with their actual theme export. Content:

```json
{
  "_comment": "Replace this file with your Claude Code theme export. Run 'claude theme export > config/claude-code-theme.json' on your local machine.",
  "theme": "default"
}
```

---

## Validation

```bash
# Verify all skill files exist and are non-empty
for f in skills/api-bridge.md skills/notify.md skills/trigger-agent.md skills/commit.md skills/pr.md; do
  [ -s "$f" ] && echo "✓ $f" || echo "✗ $f missing or empty"
done
# Validate JSON
python3 -c "import json; json.load(open('config/claude-code-theme.json'))" && echo "✓ theme.json valid"
```

---

## Execute on Homelab

```bash
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)
ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

# Re-run Claude Code setup to copy new skills to claude-remote user
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/03-install-claude.sh"

# Verify skills installed
ssh homelab "sudo -u claude-remote ls ~/.claude/skills/"

# Verify CLAUDE.md is in the right place (for the claude-remote project, this lives in the repo)
# The setup should also copy/link it to ~/.claude/CLAUDE.md for the user
ssh homelab "sudo -u claude-remote cat ~/.claude/CLAUDE.md 2>/dev/null | head -5 || echo 'CLAUDE.md not installed as user-level file'"
```

---

## Commit

```
feat(skills): Claude Code skills for API bridge, notifications, agents, and git workflow
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
