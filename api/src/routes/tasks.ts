import { Database } from 'bun:sqlite'
import { Elysia, t } from 'elysia'
import path from 'path'

const DB_PATH =
  process.env.NANOCLAW_DB ??
  path.join(process.env.HOME!, 'nanoclaw-data/store/messages.db')

function getDb() {
  return new Database(DB_PATH, { readonly: true })
}

interface ScheduledTaskRow {
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
}

const ScheduledTaskSchema = t.Object({
  id: t.String(),
  group_folder: t.String(),
  schedule_type: t.String(),
  schedule_value: t.String(),
  context_mode: t.String(),
  status: t.String(),
  next_run: t.Nullable(t.String()),
  last_run: t.Nullable(t.String()),
  last_result: t.Nullable(t.String()),
  created_at: t.String(),
})

export const tasksRoute = new Elysia({ prefix: '/tasks' })

  .get(
    '/',
    () => {
      const db = getDb()
      try {
        return db
          .query<ScheduledTaskRow, []>(
            `SELECT id, group_folder, schedule_type, schedule_value, context_mode,
                    status, next_run, last_run, last_result, created_at
             FROM scheduled_tasks
             ORDER BY group_folder, created_at`,
          )
          .all()
      } finally {
        db.close()
      }
    },
    {
      response: t.Array(ScheduledTaskSchema),
      detail: {
        tags: ['Tasks'],
        summary: 'List all scheduled tasks with their current state',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .patch(
    '/:id/next-run',
    ({ params, body }) => {
      const db = new Database(DB_PATH)
      try {
        const result = db
          .query<{ id: string; next_run: string }, [string, string]>(
            `UPDATE scheduled_tasks SET next_run = ? WHERE id = ? RETURNING id, next_run`,
          )
          .get(body.next_run, params.id)
        if (!result) return { error: `Task '${params.id}' not found` as const }
        return { id: result.id, next_run: result.next_run }
      } finally {
        db.close()
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ next_run: t.String({ description: 'ISO timestamp — set to now to trigger immediately' }) }),
      response: t.Union([
        t.Object({ id: t.String(), next_run: t.String() }),
        t.Object({ error: t.String() }),
      ]),
      detail: {
        tags: ['Tasks'],
        summary: 'Update next_run for a task — useful for triggering a task immediately',
        security: [{ BearerAuth: [] }],
      },
    },
  )
