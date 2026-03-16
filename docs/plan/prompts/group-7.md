# Group 7: Agent SDK & Headless Trigger System

## What You're Doing

Build the TypeScript agent system: the `agents/` package with the Agent SDK trigger handler, prompt templates, the `spawn-headless.sh` script, and the `notify.sh` helper. This is the most technically complex group — research the Agent SDK carefully before writing code.

---

## Research & Exploration First

1. Read `IMPLEMENTATION_PLAN.md` sections 10.1–10.4 (headless agent triggers, prompt templates, webhook support, NanoClaw delegation) in full
2. Read `IMPLEMENTATION_PLAN.md` section 13.1–13.3 (git worktree support, spawn-headless workflow)
3. **Research the Agent SDK** via Context7: resolve `@anthropic-ai/claude-agent-sdk` and read its current API. The spec uses `query()` — verify the current function name, import path, and options interface. This is critical — do not rely on training data for this API.
4. Check if `claude-agent-sdk` is part of `@anthropic-ai/sdk` or a separate package — the API may have changed
5. Look up the current `permissionMode` option name for bypassing permissions in the Agent SDK
6. Read `/Users/johannes.krumm/SourceRoot/homelab/homelab-api/src/` for Elysia patterns (the homelab-api uses the same Elysia framework — mirror its TypeScript and Bun config style)

---

## What to Implement

### 1. `agents/package.json`

```json
{
  "name": "claude-remote-agents",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

Use `latest` — then after writing, run `cd agents && bun install` to resolve actual versions. Update `package.json` with the resolved versions (pin them).

### 2. `agents/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. `agents/src/trigger-handler.ts`

The core agent runner. Per IMPLEMENTATION_PLAN.md section 10.1. Requirements:

```typescript
// Key interface (adapt based on actual Agent SDK API from research)
interface TriggerOptions {
  repo: string;
  prompt: string;
  worktree?: boolean;
  maxTurns?: number;
}

interface TriggerResult {
  success: boolean;
  branch?: string;
  prUrl?: string;
  error?: string;
}
```

Logic:
1. Resolve the repo path: `~/SourceRoot/<repo>`
2. If `worktree: true`, create a git worktree at `~/SourceRoot/.worktrees/<repo>/<branch>` where `branch = fix/agent-<timestamp>`
3. Run the Agent SDK with `permissionMode: 'bypassPermissions'` (or equivalent) and `cwd` set to the worktree/repo path
4. Stream results and collect output
5. After completion: push branch, create PR via `gh pr create`
6. Send NTFY notification via the API
7. If worktree was created: clean it up after push

Use `--max-turns 50` (or equivalent SDK option) to prevent runaway usage.

### 4. `agents/src/prompts/generic-fix.md`

A prompt template for fixing an error. Uses `{{variable}}` placeholders:
- `{{error_description}}` — the error to fix
- `{{repo}}` — repository name

Content: tell the agent to explore the codebase, fix the described error, run tests, commit, and create a PR. Include instructions to use conventional commits, no AI attribution, and to signal completion.

### 5. `agents/src/prompts/pr-review.md`

A prompt template for reviewing a PR:
- `{{pr_number}}` — PR number to review
- `{{repo}}` — repository name

Content: use `gh pr view` to read the diff, leave constructive review comments, check for common issues (types, error handling, security), approve or request changes.

### 6. `agents/src/prompts/daily-triage.md`

A prompt template for daily triage (no variables needed):
- Check open PRs needing attention
- Check for recent test failures
- Summarize as a short report
- Send the report via `POST http://localhost:4000/api/notify`

### 7. `scripts/spawn-headless.sh`

Per IMPLEMENTATION_PLAN.md section 13.2. A bash wrapper that invokes the TypeScript trigger handler via Bun.

```bash
#!/usr/bin/env bash
# Spawn a headless Claude agent in a git worktree
# Usage: spawn-headless.sh <repo> "<prompt>" [--no-worktree]
set -euo pipefail

REPO="${1:?Usage: spawn-headless.sh <repo> <prompt> [--no-worktree]}"
PROMPT="${2:?Prompt is required}"
USE_WORKTREE=true

[[ "${3:-}" == "--no-worktree" ]] && USE_WORKTREE=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="$(cd "$SCRIPT_DIR/../agents" && pwd)"

cd "$AGENTS_DIR"
exec bun run src/trigger-handler.ts \
  --repo "$REPO" \
  --prompt "$PROMPT" \
  --worktree "$USE_WORKTREE"
```

### 8. `scripts/notify.sh`

Quick NTFY notification helper (for use in other scripts or manually):

```bash
#!/usr/bin/env bash
# Usage: notify.sh "<message>" [title] [priority]
set -euo pipefail
MESSAGE="${1:?Usage: notify.sh <message> [title] [priority]}"
TITLE="${2:-ClaudeRemote}"
PRIORITY="${3:-3}"
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$MESSAGE\", \"title\": \"$TITLE\", \"priority\": $PRIORITY}"
```

---

## Validation

```bash
bash -n scripts/spawn-headless.sh
bash -n scripts/notify.sh
cd agents && bun install && bun run typecheck
```

The typecheck MUST pass before completing this group. Fix any type errors.

---

## Execute on Homelab

```bash
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)
ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

# Install agents dependencies as claude-remote user
ssh homelab "sudo -u claude-remote bash -c 'cd ~/SourceRoot/claude-remote/agents && bun install'"

# Run typecheck on homelab as well to confirm Bun + TypeScript environment works
ssh homelab "sudo -u claude-remote bash -c 'cd ~/SourceRoot/claude-remote/agents && bun run typecheck'" \
  && echo "Typecheck passed on homelab" \
  || echo "WARNING: typecheck failed on homelab — check Bun version"

# Verify spawn-headless.sh is executable
ssh homelab "ls -la ~/SourceRoot/claude-remote/scripts/spawn-headless.sh"
```

---

## Commit

```
feat(agents): Agent SDK trigger handler, prompt templates, and headless spawn script
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
