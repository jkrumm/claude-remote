# Skill: /trigger-agent

Spawn a headless Claude Code agent on another repo via the claude-remote-api. Use this when you need background work done on a different project while your current session continues.

---

## Trigger a run

```bash
curl -s -X POST http://localhost:4000/api/agents/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "<repo-name>",
    "prompt": "<task description>",
    "worktree": true
  }'
```

**Fields:**
- `repo` — directory name under `~/SourceRoot/` (e.g. `basalt-ui`, `epos.student-enrolment`)
- `prompt` — full task description for the headless agent
- `worktree` — **always set `true`** for headless runs; creates an isolated git worktree to avoid conflicts with active tmux sessions

The response includes an `id` for status polling.

---

## Check status

```bash
curl -s http://localhost:4000/api/agents/status/<id> | jq
```

---

## Writing good prompts

Be explicit. The agent has no conversation history — it starts fresh.

Include:
- What to do (verb + scope)
- What to check first (files, tests, recent PRs)
- Success criteria (tests pass, PR created, notification sent)
- Whether to create a PR when done

Example:

```json
{
  "repo": "basalt-ui",
  "prompt": "Fix the failing TypeScript errors in src/components/Button.tsx. Run `bun typecheck` to confirm they're resolved. Create a branch fix/button-ts-errors and open a PR. Send a notification when done.",
  "worktree": true
}
```

---

## When to use

- Delegating a fix to a background agent while you continue interactive work
- Responding to a webhook/alert (e.g. Sentry error → trigger fix agent)
- Running a long-running task (PR review, daily triage) asynchronously
- Any task that requires file changes on a different repo
