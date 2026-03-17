import { Elysia, t } from 'elysia'

const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL ?? ''
const UPTIME_KUMA_API_KEY = process.env.UPTIME_KUMA_API_KEY ?? ''
const NTFY_BASE_URL = process.env.NTFY_BASE_URL ?? 'https://ntfy.jkrumm.com'
const NTFY_TOKEN = process.env.NTFY_TOKEN ?? ''

async function fetchUptimeKuma(path: string) {
  const url = `${UPTIME_KUMA_URL}${path}?apikey=${UPTIME_KUMA_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`UptimeKuma ${res.status}: ${await res.text()}`)
  return res.json()
}

export const homelabRoutes = new Elysia({ prefix: '/homelab' })
  .get(
    '/uptime-kuma/monitors',
    async () => {
      const data = await fetchUptimeKuma('/api/v1/monitor')
      return data
    },
    {
      response: t.Any({ description: 'All monitors with status and uptime' }),
      detail: {
        tags: ['Homelab'],
        summary: 'Get all UptimeKuma monitors',
        security: [{ BearerAuth: [] }],
      },
    },
  )
  .get(
    '/uptime-kuma/status',
    async () => {
      const data = (await fetchUptimeKuma('/api/v1/monitor')) as {
        data?: { monitorList?: Record<string, { active: boolean; status?: number }> }
      }
      const monitors = Object.values(data?.data?.monitorList ?? {})
      const up = monitors.filter((m) => m.active && m.status === 1).length
      const down = monitors.filter((m) => m.active && m.status === 0).length
      const paused = monitors.filter((m) => !m.active).length
      return { up, down, paused, total: monitors.length }
    },
    {
      response: t.Object({
        up: t.Number(),
        down: t.Number(),
        paused: t.Number(),
        total: t.Number(),
      }),
      detail: {
        tags: ['Homelab'],
        summary: 'Get UptimeKuma monitor summary (up/down/paused counts)',
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
