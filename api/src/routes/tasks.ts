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
  { "title": "⚠️ {label}", "message": "Down since {first_seen formatted as HH:MM}", "priority": "high" }

NTFY resolve format:
  { "title": "✅ {label} resolved", "message": "Was down {duration, e.g. 23 min}", "priority": "default" }`

const MORNING_PROMPT = `Morning digest. Compose a concise Telegram message for Johannes.

Steps:
1. Fetch GET $CLAUDE_REMOTE_API_URL/summary (Bearer $CLAUDE_REMOTE_API_SECRET)
   → current system health, TickTick due-today + overdue, GitHub open PRs/notifications

2. Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json)
   → events_24h for overnight activity (since yesterday 23:00)

3. Format and send the following as your response (Telegram markdown rules apply):

🌅 Good morning — {DD.MM.YY}

**System** {one line: "All healthy" or "N issues: list them briefly"}
**Overnight** {events from events_24h since 23:00 yesterday, or "Quiet night"}
**Today** {TickTick tasks due today, max 5 — title + project, no padding}
**Backlog** {overdue count if any, open PRs count — skip section if both zero}

Rules:
- Under 20 lines total
- Skip sections that have no content
- Dates in German short format (18.03.)
- Use **bold** for section headers, bullet lists for items
- No markdown tables, no ## headings`

const EVENING_PROMPT = `Evening wrap-up. Compose a concise motivating Telegram message for Johannes.

Steps:
1. Fetch GET $CLAUDE_REMOTE_API_URL/summary (Bearer $CLAUDE_REMOTE_API_SECRET)
   → GitHub notifications, TickTick tasks

2. Fetch GET $CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm (Bearer $CLAUDE_REMOTE_API_SECRET)
   Then for active repos, check recent commits/PRs merged today:
   GET $CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm/{repo}/commits?since={today_00:00_ISO}

3. Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json)
   → events_24h for today's incidents (type: issue_detected or resolved)

4. Format and send the following as your response (Telegram markdown rules apply):

🌙 Day wrap — {DD.MM.YY}

**Shipped** {PRs merged today, notable commits — or "Quiet day"}
**Resolved** {monitoring issues fixed today from events_24h — skip if none}
**System** {current health one line: "All clear" or list issues}
**Tomorrow** {TickTick tasks due tomorrow, max 3 — title only}

Rules:
- Under 15 lines total
- Tone: direct, factual, briefly acknowledge what got done
- Skip sections with no content
- Dates in German short format (18.03.)
- Use **bold** for section headers, bullet lists for items
- No markdown tables, no ## headings`

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
