import { Elysia, t } from 'elysia'
import { fetchMonitors } from '../clients/uptime-kuma'

export const uptimeKumaRoutes = new Elysia({ prefix: '/uptime-kuma' })

  .get(
    '/monitors',
    async () => {
      return fetchMonitors()
    },
    {
      response: t.Any({ description: 'All monitors with live status, ping, and uptime ratios' }),
      detail: {
        tags: ['UptimeKuma'],
        summary: 'Get all UptimeKuma monitors with live status and uptime',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .get(
    '/status',
    async () => {
      const monitors = await fetchMonitors()
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
