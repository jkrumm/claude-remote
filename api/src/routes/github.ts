import { Elysia } from 'elysia'

const GITHUB_TOKEN = process.env.CLAUDE_REMOTE_API_GITHUB_TOKEN ?? ''
const GITHUB_API = 'https://api.github.com'

// Transparent passthrough proxy — injects Authorization header and forwards
// the request to https://api.github.com/*. Claude constructs any GitHub API
// path; the proxy injects the PAT so the token never leaves the server.
export const githubRoutes = new Elysia({ prefix: '/github' }).all(
  '/api/*',
  async ({ request, params }) => {
    const path = (params as Record<string, string>)['*'] ?? ''
    const originalUrl = new URL(request.url)
    const targetUrl = `${GITHUB_API}/${path}${originalUrl.search}`

    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${GITHUB_TOKEN}`)
    headers.set('Accept', headers.get('Accept') ?? 'application/vnd.github+json')
    headers.set('X-GitHub-Api-Version', '2022-11-28')
    // Remove host header so fetch sends to github.com
    headers.delete('host')

    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    })

    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      },
    })
  },
)
