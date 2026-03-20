/**
 * Task management route — read/write access to watchdog's scheduled_tasks table.
 *
 * Infrastructure tasks (IDs in INFRA_TASK_IDS) are seeded at API startup and
 * cannot be deleted. User-created tasks (created via POST /tasks) are fully
 * manageable.
 *
 * Requires WATCHDOG_DB_PATH env var pointing at watchdog's messages.db.
 */

import { Database } from 'bun:sqlite'
import { Cron } from 'croner'
import { Elysia, t } from 'elysia'
import path from 'path'

const DB_PATH =
  process.env.WATCHDOG_DB_PATH ??
  path.join(process.env.HOME!, 'watchdog-data/store/messages.db')

// Infrastructure task IDs — seeded at startup, protected from deletion
const INFRA_TASK_IDS = new Set([
  'monitoring-hourly',
  'monitoring-morning',
  'monitoring-evening',
])

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface TaskRow {
  id: string
  group_folder: string
  schedule_type: string
  schedule_value: string
  context_mode: string
  status: string
  next_run: string | null
  last_run: string | null
  last_result: string | null
  created_at: string
  is_infra: number
}

interface RegisteredGroupRow {
  jid: string
  folder: string
}

// ─── Prompts for infra tasks ──────────────────────────────────────────────────

const HOURLY_PROMPT = `Silent hourly health check. Steps:

1. Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json).
   If missing or invalid, initialise: { "last_check": null, "active_issues": {}, "events_24h": [] }

2. Fetch GET $CLAUDE_REMOTE_API_URL/summary with Authorization: Bearer $CLAUDE_REMOTE_API_SECRET
   If the fetch fails (network error, non-200, or the response body contains a top-level { error } field),
   send one NTFY alert and stop — do NOT write monitoring_state.json:
     POST $CLAUDE_REMOTE_API_URL/ntfy/send  Bearer $CLAUDE_REMOTE_API_SECRET
     { "title": "⚠️ Hourly check failed", "message": "Could not fetch /summary: {error details}", "priority": "high", "tags": ["rotating_light"] }

3. Determine current active issues from summary:
   - UptimeKuma monitors where status is not "up"
   - Docker containers (homelab + VPS) where restart_count > 5 or status is not "running"
   - NTFY alerts in the last hour with priority >= high

   Use a stable key for each issue, e.g. "uptimekuma:monitor-name" or "docker:homelab:container-name".

4. For each current issue:
   - Not in active_issues → add it with { label, first_seen: now, ntfy_sent: true }, send NTFY alert, append to events_24h
   - Already in active_issues → skip (already notified)

5. For each issue in active_issues no longer present in the current scan:
   - Calculate duration from first_seen to now
   - Send NTFY resolve notification
   - Append resolved event to events_24h
   - Remove from active_issues

6. Prune events_24h: remove entries older than 48 hours.

7. Set last_check to current ISO timestamp. Write updated monitoring_state.json to CWD.

8. DO NOT produce any text output. Use tool calls only (file read/write + POST /ntfy/send).
   Silence = healthy. The absence of output prevents Telegram messages.

NTFY alert format:
  POST $CLAUDE_REMOTE_API_URL/ntfy/send  Bearer $CLAUDE_REMOTE_API_SECRET
  { "title": "⚠️ {label}", "message": "Down since {first_seen formatted as HH:MM}", "priority": "high", "tags": ["red_circle"] }

NTFY resolve format:
  { "title": "✅ {label} resolved", "message": "Was down {duration, e.g. 23 min}", "priority": "default", "tags": ["green_circle"] }`

const MORNING_PROMPT = `Morning digest. Write a Telegram message that sets Johannes up for the day — what needs attention, what's achievable, what's already burning.

IMPORTANT: Your entire response is the Telegram message. Start directly with 🌅. No preamble.

── Data gathering ──────────────────────────────────────────────────────────────

1. Fetch GET $CLAUDE_REMOTE_API_URL/summary (Bearer $CLAUDE_REMOTE_API_SECRET)
   If fetch fails: send NTFY { "title": "⚠️ Morning digest failed", "message": "{error}", "priority": "high", "tags": ["rotating_light"] } and stop.

2. Fetch GET $CLAUDE_REMOTE_API_URL/ticktick/projects (Bearer $CLAUDE_REMOTE_API_SECRET)
   → list of all projects (id, name, closed). Skip closed projects.

   For each open project, fetch GET $CLAUDE_REMOTE_API_URL/ticktick/project/{id}/data
   From .data.tasks collect:
   - Overdue: dueDate < today AND status != 2 (not completed)
   - Due today: dueDate = today AND status != 2
   - Due this week: dueDate within next 7 days AND status != 2
   Sort by priority (5=high > 3=medium > 1=low > 0=none), then by dueDate.

3. Fetch GET $CLAUDE_REMOTE_API_URL/github/api/notifications (Bearer $CLAUDE_REMOTE_API_SECRET)
   → open PRs needing attention, review requests, mentions.
   Also fetch open PRs across active repos if notifications reference them.

4. Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json)
   → active_issues (currently open), events_24h since 23:00 yesterday (overnight events).

5. Read evening_context.json from CWD if it exists
   → what was flagged last night (don't re-explain things that haven't changed).

── Message format ───────────────────────────────────────────────────────────────

🌅 Good morning — {DD.MM.YY}

{One sentence framing the day: what's the shape of it? E.g. "Light on todos, good day to push on [project]." or "Heavy backlog — triage first."}

**Today** {Due today, sorted by priority — title + project. If none due today, skip to This Week section.}

**This Week** {Due in next 7 days if useful context — max 5, title + project. Skip if Today already has 5+ items.}

**Backlog** {Overdue count grouped by project if > 0. Top 2–3 most urgent by priority. Skip if none.}

**Open PRs** {GitHub PRs needing attention — title + repo. Skip if none.}

**Overnight** {monitoring events since 23:00 yesterday from events_24h. Skip if quiet.}

**System** {One line: "All clear ✅" or list active_issues with brief status.}

── Strategy (only when today has ≤ 2 tasks due) ──────────────────────────────
If Johannes has fewer than 3 tasks due today, add a short section:
**Focus suggestion** — look across all TickTick projects at high/medium priority tasks not yet due. Pick 1–2 that seem strategically valuable based on project and task content. Suggest them briefly: "{task title} ({project}) — could be a good one for today."

── Rules ───────────────────────────────────────────────────────────────────────
- Motivating but grounded — not cheerleader energy, just clarity
- Skip sections with no content
- Dates in German short format (19.03.)
- Bold section headers, bullets for items
- No tables, no ## headings`

const EVENING_PROMPT = `Evening wrap-up. Write a Telegram message that genuinely reflects Johannes's full day — code, tasks, infra, incidents. Not just GitHub. Everything.

IMPORTANT: Your entire response is the Telegram message. Start directly with 🌙. No preamble, no "Done!", no "Here is your report".

── Data gathering ──────────────────────────────────────────────────────────────
Gather ALL of the following before composing. Do not skip sources.

1. SYSTEM OVERVIEW
   GET $CLAUDE_REMOTE_API_URL/summary (Bearer $CLAUDE_REMOTE_API_SECRET)
   If fetch fails: send NTFY { "title": "⚠️ Evening report failed", "message": "{error}", "priority": "high", "tags": ["rotating_light"] } and stop.

2. GITHUB — what got shipped
   GET $CLAUDE_REMOTE_API_URL/github/api/user/repos?sort=pushed&per_page=100
   For every repo where pushed_at >= today 00:00:
     GET $CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm/{repo}/commits?since={today_00:00_ISO}&per_page=100
     GET $CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=20
   Collect: all commits today, PRs merged today (merged_at = today).
   Also check open PRs still pending: pulls?state=open — note which repos have PRs waiting.

3. TICKTICK — tasks done and still pending
   GET $CLAUDE_REMOTE_API_URL/ticktick/projects → all projects
   For each open project, GET $CLAUDE_REMOTE_API_URL/ticktick/project/{id}/data
   Collect from .data.tasks:
   - Completed today: completedTime >= today 00:00 AND status = 2
   - Still overdue: dueDate < today AND status != 2
   - Due tomorrow: dueDate = tomorrow AND status != 2
   - Due this week: dueDate within next 7 days AND status != 2
   Sort all pending by priority (5=high > 3=medium > 1=low), then dueDate.

4. DOCKER HEALTH
   GET $CLAUDE_REMOTE_API_URL/docker/homelab/containers
   GET $CLAUDE_REMOTE_API_URL/docker/vps/containers
   Note: containers with restart_count > 0, status not "running", or that recovered today.
   Compare with monitoring_state.json active_issues to identify improvements vs new problems.

5. NTFY — alerts today
   GET $CLAUDE_REMOTE_API_URL/ntfy/messages
   Note high-priority alerts that fired today. Distinguish: still open vs resolved.

6. MONITORING STATE
   Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json)
   → events_24h: all incidents that started or resolved today.

7. YESTERDAY'S CONTEXT
   Read evening_context.json from CWD if it exists.
   → What was flagged yesterday as pending/unresolved. Don't repeat unchanged things verbatim — either note they're still open or that they improved.

── Message format ───────────────────────────────────────────────────────────────

🌙 Day wrap — {DD.MM.YY}

{One sentence characterising the full day — based on total commits + tasks done + incidents. E.g. "Heavy infra day — 40 commits and a nasty debugging session." or "Good mix — code shipped, tasks cleared." Be specific, not generic.}

**Shipped** (skip if nothing committed today)
For each repo with commits, 2–4 lines:
• **{repo}** — {N commits}{, ✅ PR merged if applicable}
  {1–2 sentences: what did the work actually accomplish? Read commit messages and infer the arc. Don't list them — summarise the intent.}
If PRs are still open after today's work: mention them briefly at the end of the section.

**Tasks done** (skip if none completed today)
{Completed TickTick tasks today, grouped by project — title only. If many: "N tasks cleared across {projects}."}

**Still pending**
{Overdue tasks: count + top 2–3 by priority — title + project.}
{Due tomorrow: title + project, max 3.}
Skip entirely if nothing overdue and nothing due tomorrow.

**Incidents** (skip if none)
{Events from events_24h today. For resolved: what happened + duration. For ongoing: what's still open.}
{If something that was broken yesterday is now stable: note the improvement — e.g. "claude-remote-electric stable since 22:00 after 21 restarts."}

**System**
{Docker and UptimeKuma health. "All clear ✅" or specific containers with restart_count > 5 or down status. Note improvements explicitly.}

── Rules ───────────────────────────────────────────────────────────────────────
- Warm but not gushing. Like a colleague who actually watched the day unfold.
- If total commits > 20 across repos: call it out — that's serious output.
- Completed tasks count as real work, not a footnote.
- If infra was burning and got fixed: that's the story of the day, say so.
- Don't repeat things from yesterday's evening_context that haven't changed.
- Skip sections with nothing to show — don't pad with "Quiet" if quiet.
- Dates in German short format (19.03.)
- Bold section headers and repo names. No tables, no ## headings.

── After sending ────────────────────────────────────────────────────────────────
Save evening_context.json to CWD with:
{
  "date": "{today ISO date}",
  "commits_today": {total count},
  "repos_touched": ["{repo}", ...],
  "tasks_completed": ["{title}", ...],
  "open_issues": ["{key}", ...],  // from monitoring_state active_issues
  "pending_prs": ["{repo}: {title}", ...],
  "overdue_tasks": ["{title} ({project})", ...]
}`

interface InfraTaskDef {
  id: string
  prompt: string
  cron: string
}

const INFRA_TASKS: InfraTaskDef[] = [
  { id: 'monitoring-hourly', prompt: HOURLY_PROMPT, cron: '0 * * * *' },
  { id: 'monitoring-morning', prompt: MORNING_PROMPT, cron: '30 7 * * *' },
  { id: 'monitoring-evening', prompt: EVENING_PROMPT, cron: '0 23 * * *' },
]

// ─── Seed helper ──────────────────────────────────────────────────────────────

function getMainGroup(db: Database): RegisteredGroupRow | null {
  return db
    .query<RegisteredGroupRow, []>(
      `SELECT jid, folder FROM registered_groups WHERE is_main = 1 LIMIT 1`,
    )
    .get()
}

function seedInfraTasks(): void {
  let db: Database | undefined
  try {
    db = new Database(DB_PATH)
    const mainGroup = getMainGroup(db)
    if (!mainGroup) {
      console.warn('[tasks] No main group found — skipping infra task seed')
      return
    }

    const now = new Date().toISOString()
    for (const task of INFRA_TASKS) {
      const existing = db
        .query<{ id: string }, [string]>(`SELECT id FROM scheduled_tasks WHERE id = ?`)
        .get(task.id)
      if (existing) continue

      const nextRun = new Cron(task.cron).nextRun()?.toISOString() ?? null
      db.query(
        `INSERT INTO scheduled_tasks
           (id, group_folder, chat_jid, prompt, schedule_type, schedule_value,
            context_mode, next_run, status, created_at)
         VALUES (?, ?, ?, ?, 'cron', ?, 'isolated', ?, 'active', ?)`,
      ).run(
        task.id,
        mainGroup.folder,
        mainGroup.jid,
        task.prompt,
        task.cron,
        nextRun,
        now,
      )
      console.log(`[tasks] Seeded infra task: ${task.id} (next run: ${nextRun})`)
    }
  } catch (err) {
    // DB may not exist yet on first boot — nanoclaw creates it on startup
    console.warn('[tasks] Could not seed infra tasks:', err)
  } finally {
    db?.close()
  }
}

// Seed at module load — runs once when the API starts
seedInfraTasks()

// ─── Elysia schemas ───────────────────────────────────────────────────────────

const TaskSchema = t.Object({
  id: t.String(),
  group_folder: t.String(),
  schedule_type: t.String(),
  schedule_value: t.String(),
  context_mode: t.String(),
  status: t.String(),
  is_infra: t.Boolean({ description: 'True for infrastructure-owned tasks — cannot be deleted' }),
  next_run: t.Nullable(t.String()),
  last_run: t.Nullable(t.String()),
  last_result: t.Nullable(t.String()),
  created_at: t.String(),
})

// ─── Route ────────────────────────────────────────────────────────────────────

export const tasksRoute = new Elysia({ prefix: '/tasks' })

  .get(
    '/',
    () => {
      const db = new Database(DB_PATH, { readonly: true })
      try {
        const rows = db
          .query<TaskRow, []>(
            `SELECT id, group_folder, schedule_type, schedule_value, context_mode,
                    status, next_run, last_run, last_result, created_at
             FROM scheduled_tasks
             ORDER BY group_folder, created_at`,
          )
          .all()
        return rows.map((r) => ({ ...r, is_infra: INFRA_TASK_IDS.has(r.id) }))
      } finally {
        db.close()
      }
    },
    {
      response: t.Array(TaskSchema),
      detail: {
        tags: ['Tasks'],
        summary: 'List all scheduled tasks',
        description:
          'Returns all tasks including infrastructure-owned (is_infra: true) and user-created tasks. Infrastructure tasks are seeded at API startup and cannot be deleted.',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .post(
    '/',
    ({ body }) => {
      const db = new Database(DB_PATH)
      try {
        const mainGroup = getMainGroup(db)
        if (!mainGroup) throw new Error('No main group registered in watchdog')

        const id = `user-${Date.now()}`
        const now = new Date().toISOString()
        const nextRun =
          body.schedule_type === 'cron'
            ? (new Cron(body.schedule_value).nextRun()?.toISOString() ?? null)
            : null

        db.query(
          `INSERT INTO scheduled_tasks
             (id, group_folder, chat_jid, prompt, schedule_type, schedule_value,
              context_mode, next_run, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        ).run(
          id,
          mainGroup.folder,
          mainGroup.jid,
          body.prompt,
          body.schedule_type,
          body.schedule_value,
          body.context_mode ?? 'isolated',
          nextRun,
          now,
        )

        const row = db
          .query<TaskRow, [string]>(`SELECT * FROM scheduled_tasks WHERE id = ?`)
          .get(id)!
        return { ...row, is_infra: false as const }
      } finally {
        db.close()
      }
    },
    {
      body: t.Object({
        prompt: t.String({ description: 'The task prompt sent to the agent' }),
        schedule_type: t.Union([t.Literal('cron'), t.Literal('once')], {
          description: '"cron" for recurring tasks, "once" for one-off (set next_run manually via PATCH)',
        }),
        schedule_value: t.String({
          description: 'Cron expression (e.g. "0 9 * * 1") or a descriptive label for one-off tasks',
        }),
        context_mode: t.Optional(
          t.Union([t.Literal('isolated'), t.Literal('persistent')], {
            description: 'Default: isolated (fresh context per run)',
          }),
        ),
      }),
      response: TaskSchema,
      detail: {
        tags: ['Tasks'],
        summary: 'Create a user-defined scheduled task',
        description:
          'Creates a new scheduled task for the main group agent. Use schedule_type "cron" for recurring tasks — next_run is computed automatically. Use "once" + PATCH /:id to set an exact time.',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .patch(
    '/:id',
    ({ params, body, set }) => {
      const db = new Database(DB_PATH)
      try {
        const existing = db
          .query<{ id: string }, [string]>(`SELECT id FROM scheduled_tasks WHERE id = ?`)
          .get(params.id)
        if (!existing) {
          set.status = 404
          return { error: 'Task not found' }
        }

        const fields: string[] = []
        const values: unknown[] = []

        if (body.next_run !== undefined) {
          fields.push('next_run = ?')
          values.push(body.next_run)
        }
        if (body.status !== undefined) {
          fields.push('status = ?')
          values.push(body.status)
        }

        if (fields.length === 0) {
          set.status = 400
          return { error: 'No fields to update' }
        }

        values.push(params.id)
        db.query(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(
          ...(values as Parameters<ReturnType<Database['query']>['run']>),
        )

        const row = db
          .query<TaskRow, [string]>(`SELECT * FROM scheduled_tasks WHERE id = ?`)
          .get(params.id)!
        return { ...row, is_infra: INFRA_TASK_IDS.has(row.id) }
      } finally {
        db.close()
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        next_run: t.Optional(
          t.String({
            description:
              'ISO timestamp — set to new Date().toISOString() to trigger immediately',
          }),
        ),
        status: t.Optional(
          t.Union([t.Literal('active'), t.Literal('paused')], {
            description: 'Pause or resume a task',
          }),
        ),
      }),
      response: t.Union([TaskSchema, t.Object({ error: t.String() })]),
      detail: {
        tags: ['Tasks'],
        summary: 'Update a task — reschedule or pause/resume',
        description:
          'Update next_run (e.g. to trigger immediately) or status. Works on both infra and user tasks.',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .delete(
    '/:id',
    ({ params, set }) => {
      if (INFRA_TASK_IDS.has(params.id)) {
        set.status = 403
        return { error: 'Infrastructure tasks cannot be deleted' }
      }

      const db = new Database(DB_PATH)
      try {
        const existing = db
          .query<{ id: string }, [string]>(`SELECT id FROM scheduled_tasks WHERE id = ?`)
          .get(params.id)
        if (!existing) {
          set.status = 404
          return { error: 'Task not found' }
        }

        db.query(`DELETE FROM task_run_logs WHERE task_id = ?`).run(params.id)
        db.query(`DELETE FROM scheduled_tasks WHERE id = ?`).run(params.id)
        return { deleted: params.id }
      } finally {
        db.close()
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: t.Union([
        t.Object({ deleted: t.String() }),
        t.Object({ error: t.String() }),
      ]),
      detail: {
        tags: ['Tasks'],
        summary: 'Delete a user-created task',
        description: 'Deletes a task and its run logs. Infrastructure tasks (is_infra: true) cannot be deleted.',
        security: [{ BearerAuth: [] }],
      },
    },
  )
