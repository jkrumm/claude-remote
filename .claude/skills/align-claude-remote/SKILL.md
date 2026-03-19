---
name: align-claude-remote
description: Full audit of the claude-remote project — fix OpenAPI schemas (t.Any → typed), align CLAUDE.md with reality, trim duplication from watchdog instructions, validate and deploy
context: fork
agent: general-purpose
---

You are performing a full alignment audit of the `claude-remote` project at `/Users/johannes.krumm/SourceRoot/claude-remote/`.

## Phase 1 — Read key documentation

Read these files:
- `CLAUDE.md` — project-level context and conventions
- `watchdog/groups/instructions/telegram_main.md` — WatchDog behavioral instructions
- `watchdog/groups/global/CLAUDE.md` — Andy (non-main group) instructions
- `watchdog/CLAUDE.md` — WatchDog quick-context

Scan `README.md` if it exists for stale references.

## Phase 2 — Read and audit all route files

Read all files in `api/src/routes/`. For each endpoint:
- Record the response type: `t.Any()` = needs fix, typed = OK
- Note missing descriptions on numeric/enum fields
- Note nullable fields not wrapped in `t.Union([t.Type(), t.Null()])`

Prioritise in order: `summary.ts`, `docker.ts`, `ntfy.ts`, `ticktick.ts`.

## Phase 3 — Hit live endpoints (auth from Doppler)

Get the API secret:
```bash
doppler secrets get CLAUDE_REMOTE_API_SECRET --plain -p claude-remote -c prod
```

The API runs at `https://claude-remote-api.jkrumm.com` (use HTTPS externally).

For each endpoint with `t.Any()`, hit the live endpoint and observe the real response shape. Use GET endpoints only — never fire POST/PATCH/DELETE during audit.

**Do not fire:**
- `POST /ntfy/send` (sends real push to Johannes's phone)
- Any other mutation that has real side effects

## Phase 4 — Classify all issues

Use these labels:
- **SCHEMA** — endpoint uses `t.Any()`, should have `t.Object()`/`t.Array()`
- **DESCRIPTION** — numeric/enum field missing description
- **NULLABLE** — field can be null but not typed with `t.Union([t.Type(), t.Null()])`
- **DOC_DRIFT** — documentation describes something that no longer exists or has changed
- **DUPLICATION** — same information repeated across two files (CLAUDE.md + instructions + README)

## Phase 5 — Fix API schemas

Replace all `t.Any()` response schemas with proper typed schemas. Reference patterns from `uptime-kuma.ts` which has exemplary schemas (typed objects, nullable unions, enum descriptions).

**Key patterns:**
```ts
// Nullable field
startedAt: t.Union([t.String(), t.Null()])

// Enum description
status: t.Number({ description: '0=DOWN 1=UP 2=PENDING 3=MAINTENANCE' })
priority: t.Number({ description: '0=none 1=low 3=medium 5=high' })

// Settle pattern (used in summary.ts — each source is T | { error: string })
t.Union([SuccessSchema, t.Object({ error: t.String() })])
```

**Known constraint:** There is a pre-existing type error in `docker.ts:59` (Elysia generic mismatch on the `createDockerRoutes` return type). Do **not** try to fix this — it's a known upstream Elysia issue. Only fix `t.Any()` schemas.

**After each file**, run:
```bash
cd /Users/johannes.krumm/SourceRoot/claude-remote/api && bun run typecheck 2>&1 | grep -v "docker.ts:59"
```

## Phase 6 — Doc alignment

### CLAUDE.md
- Verify the WatchDog section accurately describes current architecture (container context, VCS vs runtime split, monitoring philosophy)
- Remove any stale references (e.g. nanoclaw name, old endpoint paths)
- Confirm skill list matches what actually exists in `.claude/skills/`

### telegram_main.md
- Verify all referenced endpoint patterns still exist (cross-check with `/openapi.json`)
- Remove anything already covered verbatim in CLAUDE.md to avoid duplication
- Monitoring task details (`monitoring-hourly`, etc.) should live in CLAUDE.md, not be duplicated in instructions

### global/CLAUDE.md (Andy)
- Contains `mcp__nanoclaw__send_message` — check if tool name has been updated
- Trim if it duplicates things covered in telegram_main.md

### Duplication targets to eliminate:
- Monitoring task schedules/descriptions: CLAUDE.md is source of truth
- `/summary` endpoint description: CLAUDE.md is source of truth
- VCS vs runtime split explanation: CLAUDE.md only

## Phase 7 — Validate

```bash
cd /Users/johannes.krumm/SourceRoot/claude-remote/api && bun run typecheck 2>&1 | grep -v "docker.ts:59"
```

Must pass with zero errors (excluding the known docker.ts:59 line).

## Phase 8 — Commit

Use conventional commits. Split if needed:
- `fix(api): replace t.Any() response schemas with typed schemas`
- `docs(watchdog): align CLAUDE.md and agent instructions with current reality`

No AI attribution. No Co-Authored-By footer.

## Phase 9 — Deploy

Deploy the API container:
```bash
ssh cr "cd ~/SourceRoot/claude-remote && git pull && cd docker && doppler run -p claude-remote -c prod -- docker compose build --no-cache claude-remote-api && doppler run -p claude-remote -c prod -- docker compose up -d claude-remote-api"
```

Sync watchdog instructions (no restart needed — read fresh per container spawn):
```bash
ssh cr "cd ~/SourceRoot/claude-remote && git pull && cp watchdog/groups/instructions/telegram_main.md ~/watchdog-data/groups/instructions/telegram_main.md"
```

## Phase 10 — Verify

Hit `GET /docs/json` on the live API and confirm no `{}` response schemas remain for the fixed endpoints.

## Final output

Return a concise summary:
- Endpoints fixed (file: endpoint → old schema → new schema)
- Doc changes made (file: what changed)
- Typecheck status
- Deploy status
- Any issues found but not fixed (with reason)

Keep the output under 3000 characters.
