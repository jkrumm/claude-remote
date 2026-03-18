import { Database } from 'bun:sqlite'
import { Elysia, t } from 'elysia'
import path from 'path'
import { fetchMonitors } from '../clients/uptime-kuma.js'
import { ticktickOps } from '../clients/ticktick.js'
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
    process.env.NANOCLAW_DB_PATH ??
    path.join(process.env.HOME!, 'nanoclaw-data/store/messages.db')
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

// ─── Route ───────────────────────────────────────────────────────────────────

export const summaryRoute = new Elysia().get(
  '/summary',
  async () => {
    const [kumaResult, dockerHLResult, dockerVPSResult, ntfyResult, githubResult, ticktickResult, tasksResult] =
      await Promise.allSettled([
        fetchMonitors().then((monitors) => {
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
        }),
        fetchDockerSummary(process.env.DOCKER_PROXY_URL_HOMELAB ?? 'http://docker-proxy:2375'),
        fetchDockerSummary(process.env.DOCKER_PROXY_URL_VPS ?? ''),
        fetchNtfySummary(),
        fetchGitHubSummary(),
        fetchTickTickSummary(),
        Promise.resolve(fetchTasksSummary()),
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
    }
  },
  {
    response: t.Any({ description: 'Aggregated health context: UptimeKuma, Docker, NTFY, GitHub, TickTick' }),
    detail: {
      tags: ['Summary'],
      summary: 'Aggregated health snapshot for all integrated services — single call for AI session context',
      security: [{ BearerAuth: [] }],
    },
  },
)
