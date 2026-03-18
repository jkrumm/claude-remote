import { Elysia, t } from 'elysia'

const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL ?? ''
const UPTIME_KUMA_API_KEY = process.env.UPTIME_KUMA_API_KEY ?? ''

async function fetchMetrics(): Promise<string> {
  const credentials = Buffer.from(`:${UPTIME_KUMA_API_KEY}`).toString('base64')
  const base = UPTIME_KUMA_URL.replace(/\/$/, '')
  const res = await fetch(`${base}/metrics`, {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) throw new Error(`UptimeKuma ${res.status}: ${await res.text()}`)
  return res.text()
}

function parseMonitors(metrics: string): Array<{
  id: string
  name: string
  type: string
  url: string
  status: number
  uptime1d: number | null
  uptime30d: number | null
}> {
  const statusMap = new Map<string, { id: string; name: string; type: string; url: string; status: number }>()
  const uptimeMap = new Map<string, { d1: number | null; d30: number | null }>()

  for (const line of metrics.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue

    const statusMatch = line.match(
      /^monitor_status\{monitor_id="([^"]+)",monitor_name="([^"]+)",monitor_type="([^"]+)"(?:,monitor_url="([^"]*)")?[^}]*\}\s+([\d.]+)/,
    )
    if (statusMatch) {
      const [, id, name, type, url, val] = statusMatch
      statusMap.set(id, { id, name, type, url: url ?? '', status: Number(val) })
      continue
    }

    const uptimeMatch = line.match(
      /^monitor_uptime_ratio\{monitor_id="([^"]+)"[^}]*,window="([^"]+)"\}\s+([\d.]+)/,
    )
    if (uptimeMatch) {
      const [, id, window, val] = uptimeMatch
      if (!uptimeMap.has(id)) uptimeMap.set(id, { d1: null, d30: null })
      const entry = uptimeMap.get(id)!
      if (window === '1d') entry.d1 = Number(val)
      if (window === '30d') entry.d30 = Number(val)
    }
  }

  return [...statusMap.values()].map((m) => ({
    ...m,
    uptime1d: uptimeMap.get(m.id)?.d1 ?? null,
    uptime30d: uptimeMap.get(m.id)?.d30 ?? null,
  }))
}

export const uptimeKumaRoutes = new Elysia({ prefix: '/uptime-kuma' })

  .get(
    '/monitors',
    async () => {
      const metrics = await fetchMetrics()
      return parseMonitors(metrics)
    },
    {
      response: t.Any({ description: 'All monitors with status and uptime ratios' }),
      detail: {
        tags: ['UptimeKuma'],
        summary: 'Get all UptimeKuma monitors with status and uptime',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .get(
    '/status',
    async () => {
      const metrics = await fetchMetrics()
      const monitors = parseMonitors(metrics)
      const real = monitors.filter((m) => m.type !== 'group')
      return {
        up: real.filter((m) => m.status === 1).length,
        down: real.filter((m) => m.status === 0).length,
        total: real.length,
      }
    },
    {
      response: t.Object({
        up: t.Number(),
        down: t.Number(),
        total: t.Number(),
      }),
      detail: {
        tags: ['UptimeKuma'],
        summary: 'Get UptimeKuma monitor summary (up/down counts, groups excluded)',
        security: [{ BearerAuth: [] }],
      },
    },
  )
