import { Elysia, t } from 'elysia'
import { ticktickOps } from '../clients/ticktick'

const TZ = 'Europe/Berlin'

// ─── Inbound: accept YYYY-MM-DD, convert to TickTick's UTC-midnight ISO format ─

// Convert YYYY-MM-DD to midnight in the given timezone expressed as UTC,
// formatted as TickTick expects: "2026-03-10T23:00:00.000+0000".
// Always sets startDate = dueDate (TickTick requires both for all-day tasks).
function toTickTickISO(yyyymmdd: string, tz: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  // Sample noon UTC to find the timezone offset on this date (avoids DST boundary issues)
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12))
  const localNoon = noonUTC.toLocaleString('sv-SE', { timeZone: tz })
  const localHour = parseInt(localNoon.slice(11, 13)) // "2026-03-11 13:00:00" → 13
  const offsetMs = (localHour - 12) * 3_600_000
  return new Date(Date.UTC(y, m - 1, d) - offsetMs).toISOString().replace('Z', '+0000')
}

// Accept YYYY-MM-DD from clients and convert to TickTick ISO midnight + set isAllDay + startDate.
// This keeps all timezone logic on the server so any client just sends a plain date string.
function normalizeDueDate(body: Record<string, unknown>): Record<string, unknown> {
  const { dueDate } = body
  if (!dueDate || typeof dueDate !== 'string') return body
  const tz = typeof body.timeZone === 'string' ? body.timeZone : TZ
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const iso = toTickTickISO(dueDate, tz)
    return { ...body, dueDate: iso, startDate: iso, isAllDay: true }
  }
  // Full ISO string passed through — still ensure startDate and isAllDay are set
  return { ...body, startDate: body.startDate ?? dueDate, isAllDay: true }
}

// ─── Outbound: convert TickTick's UTC-midnight ISO back to plain YYYY-MM-DD ──

// TickTick stores all-day tasks as local-midnight UTC (e.g. a Berlin task due
// 2026-03-18 is stored as "2026-03-17T23:00:00.000+0000"). Convert back to a
// plain YYYY-MM-DD string in Europe/Berlin so clients never see the raw offset.
// Idempotent: YYYY-MM-DD input passes through unchanged.
function fromTickTickISO(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ })
}

function normalizeTaskDates(task: Record<string, unknown>): Record<string, unknown> {
  const result = { ...task }
  if (typeof result.dueDate === 'string' && result.dueDate) {
    result.dueDate = fromTickTickISO(result.dueDate)
  }
  if (typeof result.startDate === 'string' && result.startDate) {
    result.startDate = fromTickTickISO(result.startDate)
  }
  return result
}

// Normalize SDK response { data: T } where T is a task or project data with tasks array.
function normalizeSdkResponse(sdkResult: Record<string, unknown>): Record<string, unknown> {
  const data = sdkResult.data
  if (!data || typeof data !== 'object') return sdkResult
  const d = data as Record<string, unknown>
  if (Array.isArray(d.tasks)) {
    return { ...sdkResult, data: { ...d, tasks: d.tasks.map(t => normalizeTaskDates(t as Record<string, unknown>)) } }
  }
  if (typeof d.id === 'string') {
    return { ...sdkResult, data: normalizeTaskDates(d) }
  }
  return sdkResult
}

export const ticktickRoutes = new Elysia({ prefix: '/ticktick' })
  .get('/projects', () => ticktickOps.getProjects(), {
    response: t.Any({ description: 'Array of TickTick projects' }),
    detail: {
      tags: ['TickTick'],
      summary: 'Get all projects',
      security: [{ BearerAuth: [] }],
    },
  })
  .get(
    '/project/:projectId/data',
    async ({ params }) => normalizeSdkResponse(await ticktickOps.getProjectData(params.projectId) as Record<string, unknown>),
    {
      params: t.Object({ projectId: t.String() }),
      response: t.Any({ description: 'Project with tasks and columns' }),
      detail: {
        tags: ['TickTick'],
        summary: 'Get project with tasks and columns',
        security: [{ BearerAuth: [] }],
      },
    },
  )
  .post('/task', async ({ body }) => normalizeSdkResponse(await ticktickOps.createTask(normalizeDueDate(body as Record<string, unknown>)) as Record<string, unknown>), {
    body: t.Object(
      {
        title: t.String(),
        projectId: t.Optional(t.String()),
        dueDate: t.Optional(t.String({ description: 'YYYY-MM-DD or full ISO string. Server converts to ISO midnight UTC.' })),
        priority: t.Optional(t.Number({ description: '0=none, 1=low, 3=medium, 5=high' })),
        content: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        timeZone: t.Optional(t.String({ description: 'IANA timezone, e.g. Europe/Berlin. Defaults to Europe/Berlin.' })),
        isAllDay: t.Optional(t.Boolean()),
      },
      { additionalProperties: true },
    ),
    response: t.Any({ description: 'Created task object' }),
    detail: {
      tags: ['TickTick'],
      summary: 'Create a task',
      security: [{ BearerAuth: [] }],
    },
  })
  .post(
    '/task/:taskId',
    async ({ params, body }) => {
      const res = await ticktickOps.updateTask(params.taskId, normalizeDueDate(body as Record<string, unknown>))
      if (!res.ok) return new Response(await res.text(), { status: res.status })
      return normalizeTaskDates(await res.json() as Record<string, unknown>)
    },
    {
      params: t.Object({ taskId: t.String() }),
      body: t.Object(
        {
          title: t.Optional(t.String()),
          projectId: t.Optional(t.String()),
          dueDate: t.Optional(t.String({ description: 'YYYY-MM-DD or full ISO string' })),
          priority: t.Optional(t.Number({ description: '0=none, 1=low, 3=medium, 5=high' })),
          content: t.Optional(t.String()),
          status: t.Optional(t.Number({ description: '0=active, 2=completed' })),
        },
        { additionalProperties: true },
      ),
      response: t.Any({ description: 'Updated task object' }),
      detail: {
        tags: ['TickTick'],
        summary: 'Update a task',
        security: [{ BearerAuth: [] }],
      },
    },
  )
  .post(
    '/project/:projectId/task/:taskId/complete',
    ({ params }) => ticktickOps.completeTask(params.projectId, params.taskId),
    {
      params: t.Object({ projectId: t.String(), taskId: t.String() }),
      response: t.Any({ description: 'Completion result' }),
      detail: {
        tags: ['TickTick'],
        summary: 'Mark task as complete',
        security: [{ BearerAuth: [] }],
      },
    },
  )
  .delete(
    '/project/:projectId/task/:taskId',
    ({ params }) => ticktickOps.deleteTask(params.projectId, params.taskId),
    {
      params: t.Object({ projectId: t.String(), taskId: t.String() }),
      response: t.Any({ description: 'Deletion result' }),
      detail: {
        tags: ['TickTick'],
        summary: 'Delete a task',
        security: [{ BearerAuth: [] }],
      },
    },
  )
