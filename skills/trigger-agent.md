# Skill: /trigger-agent

Orchestrate a headless Claude Code agent via Vibekanban. Vibekanban handles worktrees, PR creation, and status tracking natively.

---

## Create an agent task in Vibekanban

**Via the UI** (recommended):
Access Vibekanban at `http://localhost:3000` via SSH tunnel:
```bash
ssh -L 3000:localhost:3000 homelab
```
Create a task in the kanban board — Vibekanban launches Claude in a git worktree, pushes a branch, and creates a PR when done.

**Via MCP** (from a Claude Code tmux session):
If you have the vibe-kanban MCP configured (see MANUAL_TODOS.md M-06), use MCP tools directly from your Claude Code session to create and monitor tasks.

---

## Writing good prompts

Be explicit. The agent starts fresh with no conversation history.

Include:
- What to do (verb + scope)
- What to check first (files, tests, recent PRs)
- Success criteria (tests pass, PR created, notification sent)
- Whether to create a PR when done

Example:
```
Fix the failing TypeScript errors in src/components/Button.tsx.
Run `bun typecheck` to confirm they're resolved.
Create a branch fix/button-ts-errors and open a PR.
Send a notification when done.
```

---

## When to use

- Delegating a fix to a background agent while you continue interactive work
- Running a long-running task (PR review, daily triage) asynchronously
- Any task that requires file changes on a different repo
