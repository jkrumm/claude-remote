import { Elysia, t } from 'elysia'

const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL ?? ''
const UPTIME_KUMA_API_KEY = process.env.UPTIME_KUMA_API_KEY ?? ''
const NTFY_BASE_URL = process.env.NTFY_BASE_URL ?? 'https://ntfy.jkrumm.com'
const NTFY_TOKEN = process.env.NTFY_TOKEN ?? ''

// UptimeKuma v2 exposes Prometheus metrics at /metrics with Basic auth.
// Username is empty, password is the API key.
async function fetchUptimeKumaMetrics(): Promise<string> {
  const credentials = Buffer.from(`:${UPTIME_KUMA_API_KEY}`).toString('base64')
  const base = UPTIME_KUMA_URL.replace(/\/$/, '')
  const res = await fetch(`${base}/metrics`, {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) throw new Error(`UptimeKuma ${res.status}: ${await res.text()}`)
  return res.text()
}

// Parse Prometheus text format into a list of monitor objects.
// Collects monitor_status and monitor_uptime_ratio (1d window) per monitor.
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

    // monitor_status{...} value
    const statusMatch = line.match(
      /^monitor_status\{monitor_id="([^"]+)",monitor_name="([^"]+)",monitor_type="([^"]+)",monitor_url="([^"]+)"[^}]*\}\s+([\d.]+)/,
    )
    if (statusMatch) {
      const [, id, name, type, url, val] = statusMatch
      statusMap.set(id, { id, name, type, url, status: Number(val) })
      continue
    }

    // monitor_uptime_ratio{...,window="1d"} value
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

export const homelabRoutes = new Elysia({ prefix: '/homelab' })
  .get(
    '/uptime-kuma/monitors',
    async () => {
      const metrics = await fetchUptimeKumaMetrics()
      return parseMonitors(metrics)
    },
    {
      response: t.Any({ description: 'All monitors with status and uptime ratios' }),
      detail: {
        tags: ['Homelab'],
        summary: 'Get all UptimeKuma monitors with status and uptime',
        security: [{ BearerAuth: [] }],
      },
    },
  )
  .get(
    '/uptime-kuma/status',
    async () => {
      const metrics = await fetchUptimeKumaMetrics()
      const monitors = parseMonitors(metrics)
      // Exclude group-type monitors from counts (they aggregate children)
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
        tags: ['Homelab'],
        summary: 'Get UptimeKuma monitor summary (up/down counts, groups excluded)',
        security: [{ BearerAuth: [] }],
      },
    },
  )
  .get(
    '/ntfy/topics',
    async () => {
      const res = await fetch(`${NTFY_BASE_URL}/v1/account`, {
        headers: NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {},
      })
      if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`)
      const account = (await res.json()) as {
        subscriptions?: Array<{ topic: string; display_name?: string | null }>
      }
      return (account.subscriptions ?? []).map((s) => s.topic)
    },
    {
      response: t.Any({ description: 'Array of subscribed ntfy topic names' }),
      detail: {
        tags: ['Homelab'],
        summary: 'List all subscribed ntfy topics for this account',
        security: [{ BearerAuth: [] }],
      },
    },
  )
  .get(
    '/ntfy/messages',
    async ({ query }) => {
      const topic = query.topic
      const res = await fetch(`${NTFY_BASE_URL}/${topic}/json?poll=1`, {
        headers: NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {},
      })
      if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`)
      // ntfy returns newline-delimited JSON — parse each line
      const text = await res.text()
      const messages = text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
      return messages
    },
    {
      query: t.Object({ topic: t.String() }),
      response: t.Any({ description: 'Array of ntfy messages from the topic' }),
      detail: {
        tags: ['Homelab'],
        summary: 'Fetch recent messages from an ntfy topic (poll, no streaming)',
        security: [{ BearerAuth: [] }],
      },
    },
  )
