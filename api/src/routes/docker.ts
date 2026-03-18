import { Elysia, t } from 'elysia'

const DOCKER_PROXY = process.env.DOCKER_PROXY_URL ?? 'http://docker-proxy:2375'

async function dockerGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DOCKER_PROXY}${path}`)
  if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

// Raw Docker container list entry (subset of fields we care about)
interface DockerContainer {
  Id: string
  Names: string[]
  Image: string
  State: string
  Status: string
  Created: number
  HostConfig: { RestartPolicy?: { Name?: string } }
  Labels: Record<string, string>
}

// Raw Docker inspect result (for restart count + health)
interface DockerInspect {
  RestartCount: number
  State: {
    Health?: { Status: string }
    StartedAt: string
  }
}

// Raw Docker stats result
interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number; percpu_usage?: number[] }
    system_cpu_usage: number
    online_cpus?: number
  }
  precpu_stats: {
    cpu_usage: { total_usage: number }
    system_cpu_usage: number
  }
  memory_stats: {
    usage: number
    limit: number
  }
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>
}

function calcCpuPercent(stats: DockerStats): number {
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
  const numCpus =
    stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage.percpu_usage?.length ?? 1
  if (systemDelta <= 0 || cpuDelta < 0) return 0
  return Math.round(((cpuDelta / systemDelta) * numCpus * 100) * 100) / 100
}

export const dockerRoutes = new Elysia({ prefix: '/docker' })

  // GET /docker/containers — all containers with health, uptime, restart count
  .get(
    '/containers',
    async () => {
      const containers = await dockerGet<DockerContainer[]>('/containers/json?all=1')

      const enriched = await Promise.all(
        containers.map(async (c) => {
          let restartCount = 0
          let health: string = 'none'
          let startedAt: string | null = null

          try {
            const inspect = await dockerGet<DockerInspect>(`/containers/${c.Id}/json`)
            restartCount = inspect.RestartCount
            health = inspect.State.Health?.Status ?? 'none'
            startedAt = inspect.State.StartedAt
          } catch {
            // best-effort — don't fail the whole list if one inspect fails
          }

          return {
            id: c.Id.slice(0, 12),
            name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
            image: c.Image,
            state: c.State,
            status: c.Status,
            health,
            startedAt,
            restartCount,
          }
        }),
      )

      return enriched
    },
    {
      response: t.Any({ description: 'All containers with state, health and restart info' }),
      detail: {
        tags: ['Docker'],
        summary: 'List all containers (running + stopped) with health and restart count',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  // GET /docker/stats — CPU + memory + network for all running containers
  .get(
    '/stats',
    async () => {
      const containers = await dockerGet<DockerContainer[]>('/containers/json')
      // Only running containers have meaningful stats

      const stats = await Promise.all(
        containers.map(async (c) => {
          try {
            const s = await dockerGet<DockerStats>(
              `/containers/${c.Id}/stats?stream=false`,
            )
            const memUsageMB = Math.round(s.memory_stats.usage / 1024 / 1024)
            const memLimitMB = Math.round(s.memory_stats.limit / 1024 / 1024)
            const netRx = Object.values(s.networks ?? {}).reduce(
              (sum, n) => sum + n.rx_bytes,
              0,
            )
            const netTx = Object.values(s.networks ?? {}).reduce(
              (sum, n) => sum + n.tx_bytes,
              0,
            )
            return {
              name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
              cpuPercent: calcCpuPercent(s),
              memUsageMB,
              memLimitMB,
              memPercent:
                memLimitMB > 0 ? Math.round((memUsageMB / memLimitMB) * 10000) / 100 : 0,
              netRxMB: Math.round((netRx / 1024 / 1024) * 100) / 100,
              netTxMB: Math.round((netTx / 1024 / 1024) * 100) / 100,
            }
          } catch {
            return {
              name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
              error: 'stats unavailable',
            }
          }
        }),
      )

      return stats
    },
    {
      response: t.Any({ description: 'CPU/memory/network stats for all running containers' }),
      detail: {
        tags: ['Docker'],
        summary: 'Resource usage (CPU%, memory MB, network I/O) for all running containers',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  // GET /docker/logs/:name?tail=100 — last N log lines for a container
  .get(
    '/logs/:name',
    async ({ params, query }) => {
      const tail = query.tail ?? '100'

      // Resolve name → ID first (names aren't accepted by logs endpoint as-is)
      const containers = await dockerGet<DockerContainer[]>('/containers/json?all=1')
      const match = containers.find(
        (c) =>
          c.Names.some((n) => n.replace(/^\//, '') === params.name) ||
          c.Id.startsWith(params.name),
      )
      if (!match) {
        throw new Error(`Container "${params.name}" not found`)
      }

      const res = await fetch(
        `${DOCKER_PROXY}/containers/${match.Id}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}`,
      )
      if (!res.ok) throw new Error(`Docker logs ${res.status}: ${await res.text()}`)

      // Docker multiplexes stdout/stderr with an 8-byte header per frame.
      // Strip the header bytes and decode to plain text.
      const buf = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const lines: string[] = []
      let i = 0
      while (i + 8 <= bytes.length) {
        const size =
          (bytes[i + 4] << 24) |
          (bytes[i + 5] << 16) |
          (bytes[i + 6] << 8) |
          bytes[i + 7]
        const payload = bytes.slice(i + 8, i + 8 + size)
        lines.push(new TextDecoder().decode(payload).replace(/\n$/, ''))
        i += 8 + size
      }

      return { container: params.name, tail: Number(tail), lines }
    },
    {
      params: t.Object({ name: t.String() }),
      query: t.Object({ tail: t.Optional(t.String()) }),
      response: t.Any({ description: 'Recent log lines for the container' }),
      detail: {
        tags: ['Docker'],
        summary: 'Fetch recent log lines for a container by name (default: last 100)',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  // GET /docker/summary — single high-level overview for nanoclaw context
  .get(
    '/summary',
    async () => {
      const [containers, dockerInfo] = await Promise.all([
        dockerGet<DockerContainer[]>('/containers/json?all=1'),
        dockerGet<{
          NCPU: number
          MemTotal: number
          Containers: number
          ContainersRunning: number
          ContainersStopped: number
          ContainersPaused: number
          ServerVersion: string
        }>('/info'),
      ])

      // Inspect all containers in parallel for health + restart
      const inspected = await Promise.all(
        containers.map(async (c) => {
          try {
            const inspect = await dockerGet<DockerInspect>(`/containers/${c.Id}/json`)
            return {
              name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
              image: c.Image.replace(/^sha256:/, '').slice(0, 40),
              state: c.State,
              status: c.Status,
              health: inspect.State.Health?.Status ?? 'none',
              restartCount: inspect.RestartCount,
              startedAt: inspect.State.StartedAt,
            }
          } catch {
            return {
              name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
              image: c.Image,
              state: c.State,
              status: c.Status,
              health: 'unknown',
              restartCount: -1,
              startedAt: null,
            }
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
        counts: {
          total: containers.length,
          running: running.length,
          stopped: stopped.length,
        },
        alerts: {
          unhealthyContainers: unhealthy.map((c) => c.name),
          highRestartContainers: highRestarts.map((c) => ({
            name: c.name,
            restarts: c.restartCount,
          })),
        },
        running: running.map((c) => ({
          name: c.name,
          health: c.health,
          restartCount: c.restartCount,
          startedAt: c.startedAt,
        })),
        stopped: stopped.map((c) => ({ name: c.name, status: c.status })),
      }
    },
    {
      response: t.Any({
        description: 'High-level Docker overview: host info, container health, alerts',
      }),
      detail: {
        tags: ['Docker'],
        summary:
          'Single-call overview: host resources, running/stopped containers, unhealthy + high-restart alerts',
        security: [{ BearerAuth: [] }],
      },
    },
  )
