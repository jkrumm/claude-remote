import { Elysia, t } from 'elysia'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
const GITHUB_TOKEN_CLASSIC = process.env.GITHUB_TOKEN_CLASSIC ?? ''
const GITHUB_API = 'https://api.github.com'

const detail = (summary: string, description: string) => ({
  tags: ['GitHub'],
  summary,
  description,
  security: [{ BearerAuth: [] }],
})

async function proxyToGitHub(request: Request, path: string, token = GITHUB_TOKEN): Promise<Response> {
  const targetUrl = `${GITHUB_API}/${path}`
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', headers.get('Accept') ?? 'application/vnd.github+json')
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  headers.delete('host')

  const res = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  })

  const body = await res.text()
  return new Response(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}

function buildQuery(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, v)
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

export const githubRoutes = new Elysia({ prefix: '/github' })
  // --- Authenticated user ---
  .get(
    '/api/user',
    async ({ request }) => proxyToGitHub(request, 'user'),
    {
      detail: detail('Get authenticated user', 'Returns the authenticated GitHub user profile.'),
    },
  )
  .get(
    '/api/user/repos',
    async ({ request, query }) => proxyToGitHub(request, `user/repos${buildQuery(query)}`),
    {
      query: t.Object({
        type: t.Optional(t.String({ description: 'all | owner | public | private | member' })),
        sort: t.Optional(t.String({ description: 'created | updated | pushed | full_name' })),
        direction: t.Optional(t.String({ description: 'asc | desc' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List repos for authenticated user', 'Returns repositories the authenticated user has access to.'),
    },
  )

  // --- Repo ---
  .get(
    '/api/repos/:owner/:repo',
    async ({ request, params }) => proxyToGitHub(request, `repos/${params.owner}/${params.repo}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String() }),
      detail: detail('Get repository', 'Returns metadata for a specific repository.'),
    },
  )
  .get(
    '/api/repos/:owner/:repo/commits',
    async ({ request, params, query }) =>
      proxyToGitHub(request, `repos/${params.owner}/${params.repo}/commits${buildQuery(query)}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String() }),
      query: t.Object({
        sha: t.Optional(t.String({ description: 'Branch, tag, or commit SHA to start listing from' })),
        path: t.Optional(t.String({ description: 'Only commits touching this path' })),
        since: t.Optional(t.String({ description: 'ISO 8601 date — only commits after this date' })),
        until: t.Optional(t.String({ description: 'ISO 8601 date — only commits before this date' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List commits', 'Returns commits for a repository. Each item contains sha, commit.message, commit.author, and html_url.'),
    },
  )
  .get(
    '/api/repos/:owner/:repo/branches',
    async ({ request, params, query }) =>
      proxyToGitHub(request, `repos/${params.owner}/${params.repo}/branches${buildQuery(query)}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String() }),
      query: t.Object({
        protected: t.Optional(t.String({ description: 'true | false — filter by protection status' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List branches', 'Returns branch names and their HEAD commit SHAs.'),
    },
  )

  // --- Pull requests ---
  .get(
    '/api/repos/:owner/:repo/pulls',
    async ({ request, params, query }) =>
      proxyToGitHub(request, `repos/${params.owner}/${params.repo}/pulls${buildQuery(query)}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String() }),
      query: t.Object({
        state: t.Optional(t.String({ description: 'open | closed | all' })),
        head: t.Optional(t.String({ description: 'Filter by head branch (user:branch-name)' })),
        base: t.Optional(t.String({ description: 'Filter by base branch' })),
        sort: t.Optional(t.String({ description: 'created | updated | popularity | long-running' })),
        direction: t.Optional(t.String({ description: 'asc | desc' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List pull requests', 'Returns pull requests for a repository. Each item has number, title, state, user.login, head.ref, base.ref, and html_url.'),
    },
  )
  .get(
    '/api/repos/:owner/:repo/pulls/:pull_number',
    async ({ request, params }) =>
      proxyToGitHub(request, `repos/${params.owner}/${params.repo}/pulls/${params.pull_number}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String(), pull_number: t.String() }),
      detail: detail('Get pull request', 'Returns full detail for a single PR including body, review state, merge status, and diff stats.'),
    },
  )
  .get(
    '/api/repos/:owner/:repo/pulls/:pull_number/reviews',
    async ({ request, params, query }) =>
      proxyToGitHub(
        request,
        `repos/${params.owner}/${params.repo}/pulls/${params.pull_number}/reviews${buildQuery(query)}`,
      ),
    {
      params: t.Object({ owner: t.String(), repo: t.String(), pull_number: t.String() }),
      query: t.Object({
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List PR reviews', 'Returns reviews for a pull request. Each item has user.login, state (APPROVED, CHANGES_REQUESTED, COMMENTED), and body.'),
    },
  )
  .get(
    '/api/repos/:owner/:repo/pulls/:pull_number/comments',
    async ({ request, params, query }) =>
      proxyToGitHub(
        request,
        `repos/${params.owner}/${params.repo}/pulls/${params.pull_number}/comments${buildQuery(query)}`,
      ),
    {
      params: t.Object({ owner: t.String(), repo: t.String(), pull_number: t.String() }),
      query: t.Object({
        sort: t.Optional(t.String({ description: 'created | updated' })),
        direction: t.Optional(t.String({ description: 'asc | desc' })),
        since: t.Optional(t.String({ description: 'ISO 8601 date' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List PR review comments', 'Returns inline diff comments for a pull request. Each item has path, line, body, user.login, and created_at.'),
    },
  )

  // --- Issues ---
  .get(
    '/api/repos/:owner/:repo/issues',
    async ({ request, params, query }) =>
      proxyToGitHub(request, `repos/${params.owner}/${params.repo}/issues${buildQuery(query)}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String() }),
      query: t.Object({
        state: t.Optional(t.String({ description: 'open | closed | all' })),
        labels: t.Optional(t.String({ description: 'Comma-separated list of label names' })),
        sort: t.Optional(t.String({ description: 'created | updated | comments' })),
        direction: t.Optional(t.String({ description: 'asc | desc' })),
        since: t.Optional(t.String({ description: 'ISO 8601 date' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List issues', 'Returns issues for a repository. Note: GitHub returns PRs here too — filter by absence of pull_request key to get issues only.'),
    },
  )
  .get(
    '/api/repos/:owner/:repo/issues/:issue_number',
    async ({ request, params }) =>
      proxyToGitHub(request, `repos/${params.owner}/${params.repo}/issues/${params.issue_number}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String(), issue_number: t.String() }),
      detail: detail('Get issue', 'Returns full detail for a single issue including body, labels, assignees, and state.'),
    },
  )
  .get(
    '/api/repos/:owner/:repo/issues/:issue_number/comments',
    async ({ request, params, query }) =>
      proxyToGitHub(
        request,
        `repos/${params.owner}/${params.repo}/issues/${params.issue_number}/comments${buildQuery(query)}`,
      ),
    {
      params: t.Object({ owner: t.String(), repo: t.String(), issue_number: t.String() }),
      query: t.Object({
        since: t.Optional(t.String({ description: 'ISO 8601 date' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List issue comments', 'Returns comments for an issue. Each item has user.login, body, and created_at.'),
    },
  )

  // --- Actions ---
  .get(
    '/api/repos/:owner/:repo/actions/runs',
    async ({ request, params, query }) =>
      proxyToGitHub(request, `repos/${params.owner}/${params.repo}/actions/runs${buildQuery(query)}`),
    {
      params: t.Object({ owner: t.String(), repo: t.String() }),
      query: t.Object({
        branch: t.Optional(t.String({ description: 'Filter by branch name' })),
        status: t.Optional(t.String({ description: 'queued | in_progress | completed | success | failure | cancelled' })),
        event: t.Optional(t.String({ description: 'push | pull_request | schedule | workflow_dispatch' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('List workflow runs', 'Returns workflow_runs array. Each run has id, name, status, conclusion, head_branch, created_at, and html_url.'),
    },
  )

  // --- Contents ---
  .get(
    '/api/repos/:owner/:repo/contents/*',
    async ({ request, params, query }) => {
      const filePath = (params as Record<string, string>)['*'] ?? ''
      return proxyToGitHub(request, `repos/${params.owner}/${params.repo}/contents/${filePath}${buildQuery(query)}`)
    },
    {
      params: t.Object({ owner: t.String(), repo: t.String(), '*': t.String() }),
      query: t.Object({
        ref: t.Optional(t.String({ description: 'Branch, tag, or commit SHA' })),
      }),
      detail: detail(
        'Get file or directory contents',
        'Returns file metadata. For files: content field is base64-encoded — always decode before displaying. For directories: returns array of entries with name, path, type, and download_url.',
      ),
    },
  )

  // --- Search ---
  .get(
    '/api/search/code',
    async ({ request, query }) => proxyToGitHub(request, `search/code${buildQuery(query)}`),
    {
      query: t.Object({
        q: t.String({ description: 'Search query. Scope to a repo with repo:owner/name in the query.' }),
        sort: t.Optional(t.String({ description: 'indexed' })),
        order: t.Optional(t.String({ description: 'asc | desc' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('Search code', 'Returns total_count and items array. Each item has name, path, repository, and html_url. Use repo:owner/name in q to scope to a repository.'),
    },
  )
  .get(
    '/api/search/repositories',
    async ({ request, query }) => proxyToGitHub(request, `search/repositories${buildQuery(query)}`),
    {
      query: t.Object({
        q: t.String({ description: 'Search query (e.g. "user:jkrumm language:typescript")' }),
        sort: t.Optional(t.String({ description: 'stars | forks | help-wanted-issues | updated' })),
        order: t.Optional(t.String({ description: 'asc | desc' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail('Search repositories', 'Returns total_count and items array. Each item has full_name, description, stargazers_count, language, and html_url.'),
    },
  )

  // --- Notifications (requires classic PAT — fine-grained PATs don't support this scope) ---
  .get(
    '/api/notifications',
    async ({ request, query }) =>
      proxyToGitHub(request, `notifications${buildQuery(query)}`, GITHUB_TOKEN_CLASSIC),
    {
      query: t.Object({
        all: t.Optional(t.String({ description: 'true = include already-read notifications' })),
        participating: t.Optional(t.String({ description: 'true = only notifications where you are directly participating' })),
        since: t.Optional(t.String({ description: 'ISO 8601 date — only notifications updated after this time' })),
        before: t.Optional(t.String({ description: 'ISO 8601 date — only notifications updated before this time' })),
        per_page: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
      detail: detail(
        'List notifications',
        'Returns notifications for the authenticated user using the classic PAT (fine-grained PATs do not support the notifications scope). Each item has id, reason, unread, subject.title, subject.type, repository.full_name, and updated_at.',
      ),
    },
  )

  // --- Wildcard fallback for unlisted paths ---
  .all(
    '/api/*',
    async ({ request, params }) => {
      const path = (params as Record<string, string>)['*'] ?? ''
      const originalUrl = new URL(request.url)
      return proxyToGitHub(request, `${path}${originalUrl.search}`)
    },
  )
