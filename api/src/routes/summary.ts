import { Database } from 'bun:sqlite'
import { Elysia, t } from 'elysia'
import path from 'path'
import { fetchMonitors } from '../clients/uptime-kuma.js'
import { ticktickOps } from '../clients/ticktick.js'
import * as vk from '../clients/vibekanban.js'
import type { Project, Task } from '../generated/ticktick/types.gen.js'

const NTFY_BASE_URL = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'
const NTFY_TOKEN = process.env.NTFY_TOKEN ?? ''
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
const GITHUB_TOKEN_CLASSIC = process.env.GITHUB_TOKEN_CLASSIC ?? ''
const GITHUB_API = 'https://api.github.com'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DockerContainer {
  Id: string
  Names: string[]
  State: string
}

interface DockerInspect {
  RestartCount: number
  State: { Health?: { Status: string }; StartedAt: string }
}

interface DockerInfo {
  NCPU: number
  MemTotal: number
  ServerVersion: string
}

interface DockerSummary {
  host: { cpus: number; totalMemoryGB: number; dockerVersion: string }
  counts: { total: number; running: number; stopped: number }
  alerts: {
    unhealthyContainers: string[]
    highRestartContainers: Array<{ name: string; restarts: number }>
  }
}

interface TickTaskItem {
  id: string
  title: string
  dueDate: string
  projectName: string
  priority: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function settle<T>(r: PromiseSettledResult<T>): T | { error: string } {
  return r.status === 'fulfilled'
    ? r.value
    : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchDockerSummary(proxyUrl: string): Promise<DockerSummary> {
  if (!proxyUrl) throw new Error('Docker proxy URL not configured')

  async function dockerGet<T>(path: string): Promise<T> {
    const res = await fetch(`${proxyUrl}${path}`)
    if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`)
    return res.json() as Promise<T>
  }

  const [containers, dockerInfo] = await Promise.all([
    dockerGet<DockerContainer[]>('/containers/json?all=1'),
    dockerGet<DockerInfo>('/info'),
  ])

  const inspected = await Promise.all(
    containers.map(async (c) => {
      const name = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
      try {
        const inspect = await dockerGet<DockerInspect>(`/containers/${c.Id}/json`)
        return {
          name,
          state: c.State,
          health: inspect.State.Health?.Status ?? 'none',
          restartCount: inspect.RestartCount,
        }
      } catch {
        return { name, state: c.State, health: 'unknown', restartCount: -1 }
      }
    }),
  )

  const running = inspected.filter((c) => c.state === 'running')
  const stopped = inspected.filter((c) => c.state !== 'running')
  const unhealthy = running.filter((c) => c.health === 'unhealthy')
  const highRestarts = running.filter((c) => c.restartCount > 3)

  return {
    host: {
      cpus: dockerInfo.NCPU,
      totalMemoryGB: Math.round((dockerInfo.MemTotal / 1024 / 1024 / 1024) * 10) / 10,
      dockerVersion: dockerInfo.ServerVersion,
    },
    counts: { total: containers.length, running: running.length, stopped: stopped.length },
    alerts: {
      unhealthyContainers: unhealthy.map((c) => c.name),
      highRestartContainers: highRestarts.map((c) => ({ name: c.name, restarts: c.restartCount })),
    },
  }
}

async function fetchNtfySummary() {
  const headers: Record<string, string> = NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {}

  const accountRes = await fetch(`${NTFY_BASE_URL}/v1/account`, { headers })
  if (!accountRes.ok) throw new Error(`ntfy account ${accountRes.status}: ${await accountRes.text()}`)
  const account = (await accountRes.json()) as {
    subscriptions?: Array<{ topic: string }>
  }
  const topics = (account.subscriptions ?? []).map((s) => s.topic)

  const allMessages = await Promise.all(
    topics.map(async (topic) => {
      const res = await fetch(`${NTFY_BASE_URL}/${topic}/json?poll=1&since=24h`, { headers })
      if (!res.ok) return []
      const text = await res.text()
      return text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const msg = JSON.parse(line) as {
            topic?: string
            title?: string
            message?: string
            time?: number
            priority?: number
          }
          return {
            topic: msg.topic ?? topic,
            title: msg.title,
            message: msg.message ?? '',
            time: msg.time ?? 0,
            priority: msg.priority,
          }
        })
    }),
  )

  const messages = allMessages
    .flat()
    .sort((a, b) => b.time - a.time)
    .slice(0, 30)

  return { topics, messages }
}

async function fetchGitHubSummary() {
  async function ghFetch(path: string, token: string) {
    const res = await fetch(`${GITHUB_API}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) throw new Error(`GitHub ${path} ${res.status}: ${await res.text()}`)
    return res.json()
  }

  const [notificationsRaw, assignedRaw, createdRaw] = await Promise.all([
    ghFetch('notifications?all=false&per_page=20', GITHUB_TOKEN_CLASSIC),
    ghFetch('issues?state=open&filter=assigned&per_page=20', GITHUB_TOKEN),
    ghFetch('issues?state=open&filter=created&per_page=20', GITHUB_TOKEN),
  ])

  type GHNotification = {
    id: string
    subject: { title: string; type: string }
    repository: { full_name: string }
    reason: string
    updated_at: string
  }
  type GHIssue = {
    id: number
    number: number
    title: string
    state: string
    updated_at: string
    pull_request?: unknown
    repository?: { full_name: string }
    html_url?: string
  }

  const notifications = (notificationsRaw as GHNotification[]).map((n) => ({
    repo: n.repository.full_name,
    type: n.subject.type,
    title: n.subject.title,
    reason: n.reason,
    updatedAt: n.updated_at,
  }))

  const seenIds = new Set<number>()
  const openItems: Array<{
    repo: string
    number: number
    type: 'pr' | 'issue'
    title: string
    state: string
    updatedAt: string
  }> = []

  for (const item of [...(assignedRaw as GHIssue[]), ...(createdRaw as GHIssue[])]) {
    if (seenIds.has(item.id)) continue
    seenIds.add(item.id)
    const repoName =
      item.repository?.full_name ??
      (item.html_url ? item.html_url.replace('https://github.com/', '').split('/').slice(0, 2).join('/') : 'unknown')
    openItems.push({
      repo: repoName,
      number: item.number,
      type: item.pull_request ? 'pr' : 'issue',
      title: item.title,
      state: item.state,
      updatedAt: item.updated_at,
    })
    if (openItems.length >= 20) break
  }

  return {
    unreadCount: notifications.length,
    notifications,
    openItems,
  }
}

function fetchTasksSummary() {
  const dbPath =
    process.env.WATCHDOG_DB_PATH ??
    path.join(process.env.HOME!, 'watchdog-data/store/messages.db')
  const INFRA_IDS = new Set(['monitoring-hourly', 'monitoring-morning', 'monitoring-evening'])
  const db = new Database(dbPath, { readonly: true })
  try {
    const rows = db
      .query<
        { id: string; schedule_value: string; status: string; next_run: string | null; last_run: string | null },
        []
      >(
        `SELECT id, schedule_value, status, next_run, last_run
         FROM scheduled_tasks WHERE status != 'completed' ORDER BY created_at`,
      )
      .all()
    return rows.map((r) => ({ ...r, is_infra: INFRA_IDS.has(r.id) }))
  } finally {
    db.close()
  }
}

async function fetchTickTickSummary() {
  const projectsRes = await ticktickOps.getProjects()
  const projects = (projectsRes.data ?? []) as Project[]
  const projectMap = new Map(projects.map((p) => [p.id ?? '', p.name ?? '']))

  const projectDataList = await Promise.all(
    projects
      .filter((p) => p.id)
      .map((p) => ticktickOps.getProjectData(p.id!).catch(() => null)),
  )

  const allTasks: Task[] = []
  for (const res of projectDataList) {
    if (!res?.data) continue
    const data = res.data as { tasks?: Task[] }
    if (Array.isArray(data.tasks)) allTasks.push(...data.tasks)
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const in7 = new Date()
  in7.setUTCDate(in7.getUTCDate() + 7)
  const in7Str = in7.toISOString().slice(0, 10)

  const toItem = (task: Task): TickTaskItem => ({
    id: task.id ?? '',
    title: task.title ?? '',
    dueDate: (task.dueDate ?? '').slice(0, 10),
    projectName: projectMap.get(task.projectId ?? '') ?? task.projectId ?? '',
    priority: task.priority ?? 0,
  })

  const eligible = allTasks.filter(
    (t) => t.status !== 2 && t.dueDate && (t.dueDate ?? '').length >= 10,
  )

  const overdue = eligible
    .filter((t) => (t.dueDate ?? '').slice(0, 10) < todayStr)
    .map(toItem)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.priority - a.priority)

  const dueSoon = eligible
    .filter((t) => {
      const d = (t.dueDate ?? '').slice(0, 10)
      return d >= todayStr && d <= in7Str
    })
    .map(toItem)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.priority - a.priority)

  return { overdue, dueSoon }
}

async function fetchVibeKanbanSummary() {
  const orgs = await vk.getOrganizations()
  if (!orgs.length) return { organizations: [] }

  const orgSummaries = await Promise.all(
    orgs.map(async (org) => {
      const projects = await vk.getProjects(org.id)

      const projectSummaries = await Promise.all(
        projects.map(async (project) => {
          const [statuses, issues] = await Promise.all([
            vk.getProjectStatuses(project.id),
            vk.getIssues(project.id),
          ])

          const statusMap = new Map(statuses.map((s) => [s.id, s]))
          const openIssues = issues.filter((i) => !i.completed_at)

          const byStatus: Record<string, number> = {}
          for (const issue of openIssues) {
            const statusName = statusMap.get(issue.status_id)?.name ?? 'Unknown'
            byStatus[statusName] = (byStatus[statusName] ?? 0) + 1
          }

          const recentOpen = openIssues
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 10)
            .map((i) => ({
              simpleId: i.simple_id,
              title: i.title,
              priority: i.priority,
              status: statusMap.get(i.status_id)?.name ?? 'Unknown',
              updatedAt: i.updated_at.slice(0, 10),
            }))

          return {
            id: project.id,
            name: project.name,
            totalIssues: issues.length,
            openIssues: openIssues.length,
            byStatus,
            recentOpen,
          }
        }),
      )

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        projects: projectSummaries,
      }
    }),
  )

  return { organizations: orgSummaries }
}

// ─── Response Schema ─────────────────────────────────────────────────────────

const errSchema = t.Object({ error: t.String() })

const DockerSummarySchema = t.Object({
  host: t.Object({ cpus: t.Number(), totalMemoryGB: t.Number(), dockerVersion: t.String() }),
  counts: t.Object({ total: t.Number(), running: t.Number(), stopped: t.Number() }),
  alerts: t.Object({
    unhealthyContainers: t.Array(t.String()),
    highRestartContainers: t.Array(t.Object({ name: t.String(), restarts: t.Number() })),
  }),
})

const NtfyMessageSchema = t.Object({
  topic: t.String(),
  title: t.Optional(t.String()),
  message: t.String(),
  time: t.Number({ description: 'Unix timestamp' }),
  priority: t.Optional(t.Number({ description: '1=min 2=low 3=default 4=high 5=max' })),
})

const GHNotificationSchema = t.Object({
  repo: t.String(),
  type: t.String(),
  title: t.String(),
  reason: t.String(),
  updatedAt: t.String(),
})

const GHOpenItemSchema = t.Object({
  repo: t.String(),
  number: t.Number(),
  type: t.Union([t.Literal('pr'), t.Literal('issue')]),
  title: t.String(),
  state: t.String(),
  updatedAt: t.String(),
})

const TickTaskItemSchema = t.Object({
  id: t.String(),
  title: t.String(),
  dueDate: t.String({ description: 'YYYY-MM-DD' }),
  projectName: t.String(),
  priority: t.Number({ description: '0=none 1=low 3=medium 5=high' }),
})

const ScheduledTaskSchema = t.Object({
  id: t.String(),
  schedule_value: t.String(),
  status: t.String({ description: 'active | paused | completed' }),
  next_run: t.Union([t.String(), t.Null()]),
  last_run: t.Union([t.String(), t.Null()]),
  is_infra: t.Boolean({ description: 'true for monitoring-hourly/morning/evening (protected)' }),
})

const VKIssueSchema = t.Object({
  simpleId: t.Number(),
  title: t.String(),
  priority: t.String(),
  status: t.String(),
  updatedAt: t.String(),
})

const SummaryResponseSchema = t.Object({
  generatedAt: t.String({ description: 'ISO timestamp when summary was generated' }),
  uptimeKuma: t.Union([
    t.Object({
      up: t.Number(),
      down: t.Number(),
      maintenance: t.Number(),
      total: t.Number(),
      downMonitors: t.Array(
        t.Object({ name: t.String(), type: t.String(), uptime1d: t.Union([t.Number(), t.Null()]) }),
      ),
    }),
    errSchema,
  ]),
  dockerHomelab: t.Union([DockerSummarySchema, errSchema]),
  dockerVps: t.Union([DockerSummarySchema, errSchema]),
  ntfy: t.Union([
    t.Object({ topics: t.Array(t.String()), messages: t.Array(NtfyMessageSchema) }),
    errSchema,
  ]),
  github: t.Union([
    t.Object({
      unreadCount: t.Number(),
      notifications: t.Array(GHNotificationSchema),
      openItems: t.Array(GHOpenItemSchema),
    }),
    errSchema,
  ]),
  ticktick: t.Union([
    t.Object({ overdue: t.Array(TickTaskItemSchema), dueSoon: t.Array(TickTaskItemSchema) }),
    errSchema,
  ]),
  tasks: t.Union([t.Array(ScheduledTaskSchema), errSchema]),
  vibeKanban: t.Union([
    t.Object({
      organizations: t.Array(
        t.Object({
          id: t.String(),
          name: t.String(),
          slug: t.String(),
          projects: t.Array(
            t.Object({
              id: t.String(),
              name: t.String(),
              totalIssues: t.Number(),
              openIssues: t.Number(),
              byStatus: t.Record(t.String(), t.Number()),
              recentOpen: t.Array(VKIssueSchema),
            }),
          ),
        }),
      ),
    }),
    errSchema,
  ]),
})

// ─── Route ───────────────────────────────────────────────────────────────────

export const summaryRoute = new Elysia().get(
  '/summary',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (): Promise<any> => {
    const [kumaResult, dockerHLResult, dockerVPSResult, ntfyResult, githubResult, ticktickResult, tasksResult, vibeKanbanResult] =
      await Promise.allSettled([
        withTimeout(fetchMonitors().then((monitors) => {
          const nonGroup = monitors.filter((m) => m.type !== 'group')
          return {
            up: nonGroup.filter((m) => m.status === 1).length,
            down: nonGroup.filter((m) => m.status === 0).length,
            maintenance: nonGroup.filter((m) => m.status === 3).length,
            total: nonGroup.length,
            downMonitors: nonGroup
              .filter((m) => m.status === 0)
              .map((m) => ({ name: m.name, type: m.type, uptime1d: m.uptime1d })),
          }
        }), 10_000, 'uptimeKuma'),
        withTimeout(fetchDockerSummary(process.env.DOCKER_PROXY_URL_HOMELAB ?? 'http://docker-proxy:2375'), 10_000, 'dockerHomelab'),
        withTimeout(fetchDockerSummary(process.env.DOCKER_PROXY_URL_VPS ?? ''), 10_000, 'dockerVps'),
        withTimeout(fetchNtfySummary(), 10_000, 'ntfy'),
        withTimeout(fetchGitHubSummary(), 15_000, 'github'),
        withTimeout(fetchTickTickSummary(), 15_000, 'ticktick'),
        Promise.resolve(fetchTasksSummary()),
        withTimeout(fetchVibeKanbanSummary(), 10_000, 'vibeKanban'),
      ])

    return {
      generatedAt: new Date().toISOString(),
      uptimeKuma: settle(kumaResult),
      dockerHomelab: settle(dockerHLResult),
      dockerVps: settle(dockerVPSResult),
      ntfy: settle(ntfyResult),
      github: settle(githubResult),
      ticktick: settle(ticktickResult),
      tasks: settle(tasksResult!),
      vibeKanban: settle(vibeKanbanResult),
    }
  },
  {
    response: SummaryResponseSchema,
    detail: {
      tags: ['Summary'],
      summary: 'Aggregated health snapshot for all integrated services — single call for AI session context',
      security: [{ BearerAuth: [] }],
    },
  },
)
