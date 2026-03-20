import { Elysia, t } from 'elysia'
import { publish } from '../clients/ntfy.js'

type Priority = 1 | 2 | 3 | 4 | 5

const NTFY_BASE_URL = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'
const NTFY_TOKEN = process.env.NTFY_TOKEN ?? ''
const TOPIC = process.env.NTFY_TOPIC ?? 'claude-remote'

export const ntfyRoutes = new Elysia({ prefix: '/ntfy' })

  .post(
    '/send',
    async ({ body }) => {
      await publish(TOPIC, body.title ?? 'ClaudeRemote', body.message, body.priority as Priority | undefined, body.tags)
      return { ok: true as const }
    },
    {
      body: t.Object({
        message: t.String(),
        title: t.Optional(t.String()),
        priority: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
        tags: t.Optional(t.Array(t.String(), {
          description: 'Emoji shortcode tags shown on the notification (e.g. ["red_circle", "warning"]). Uses gemoji names.',
        })),
      }),
      response: t.Object({ ok: t.Literal(true) }),
      detail: {
        tags: ['Ntfy'],
        summary: 'Send an ntfy push notification to the default topic',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .get(
    '/topics',
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
      response: t.Array(t.String({ description: 'ntfy topic name' })),
      detail: {
        tags: ['Ntfy'],
        summary: 'List all subscribed ntfy topics for this account',
        security: [{ BearerAuth: [] }],
      },
    },
  )

  .get(
    '/messages',
    async ({ query }) => {
      const topic = query.topic
      const res = await fetch(`${NTFY_BASE_URL}/${topic}/json?poll=1`, {
        headers: NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {},
      })
      if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`)
      const text = await res.text()
      return text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    },
    {
      query: t.Object({ topic: t.String() }),
      response: t.Array(
        t.Object({
          id: t.Optional(t.String()),
          event: t.Optional(t.String()),
          time: t.Optional(t.Number({ description: 'Unix timestamp' })),
          topic: t.Optional(t.String()),
          title: t.Optional(t.String()),
          message: t.Optional(t.String()),
          priority: t.Optional(
            t.Number({ minimum: 1, maximum: 5, description: '1=min 2=low 3=default 4=high 5=max' }),
          ),
          tags: t.Optional(t.Array(t.String())),
        }),
      ),
      detail: {
        tags: ['Ntfy'],
        summary: 'Fetch recent messages from an ntfy topic (poll, no streaming)',
        security: [{ BearerAuth: [] }],
      },
    },
  )
