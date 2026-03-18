/**
 * Vibe Kanban API client with automatic token refresh.
 *
 * Auth: JWT session tokens. Access token TTL = 120s. Refresh token TTL = 365 days.
 * The refresh token rotates on each use — the new token is persisted to SQLite so
 * container restarts don't require re-login.
 *
 * Required env: VIBEKANBAN_BASE_URL, VIBEKANBAN_REFRESH_TOKEN (seed value from Doppler)
 */

import { Database } from 'bun:sqlite'
import path from 'path'

const BASE_URL = process.env.VIBEKANBAN_BASE_URL ?? 'http://vibekanban:3000'
const DB_PATH =
  process.env.NANOCLAW_DB_PATH ??
  path.join(process.env.HOME!, 'nanoclaw-data/store/messages.db')

const CONFIG_KEY = 'vibekanban_refresh_token'

// ─── Token persistence ────────────────────────────────────────────────────────

function loadRefreshTokenFromDb(): string | null {
  try {
    const db = new Database(DB_PATH)
    db.exec('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    const row = db.query<{ value: string }, [string]>('SELECT value FROM config WHERE key = ?').get(CONFIG_KEY)
    db.close()
    return row?.value ?? null
  } catch {
    return null
  }
}

function persistRefreshTokenToDb(token: string): void {
  try {
    const db = new Database(DB_PATH)
    db.exec('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    db.query('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(CONFIG_KEY, token)
    db.close()
  } catch {
    // non-fatal — next restart will fall back to env var
  }
}

// ─── Token state ──────────────────────────────────────────────────────────────

// DB takes priority over env var so restarts pick up the rotated token
let currentRefreshToken: string =
  loadRefreshTokenFromDb() ?? process.env.VIBEKANBAN_REFRESH_TOKEN ?? ''
let accessToken: string | null = null
let accessTokenExpiresAt = 0

async function refreshAccessToken(): Promise<string> {
  if (!currentRefreshToken) throw new Error('VIBEKANBAN_REFRESH_TOKEN not configured')

  const res = await fetch(`${BASE_URL}/v1/tokens/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: currentRefreshToken }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Vibekanban token refresh failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { access_token: string; refresh_token: string }
  currentRefreshToken = data.refresh_token
  persistRefreshTokenToDb(data.refresh_token)
  accessToken = data.access_token
  accessTokenExpiresAt = Date.now() + 90_000 // treat as valid for 90s (server TTL = 120s)
  return data.access_token
}

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken
  return refreshAccessToken()
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function vkFetch<T>(urlPath: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${BASE_URL}/v1${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(
      `Vibekanban ${options?.method ?? 'GET'} ${urlPath} failed (${res.status}): ${await res.text()}`,
    )
  }
  return res.json() as Promise<T>
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VkOrganization {
  id: string
  name: string
  slug: string
  is_personal: boolean
  issue_prefix: string
}

export interface VkProject {
  id: string
  organization_id: string
  name: string
  color: string
  sort_order: number
}

export interface VkProjectStatus {
  id: string
  project_id: string
  name: string
  color: string
  sort_order: number
  hidden: boolean
}

export interface VkIssue {
  id: string
  project_id: string
  issue_number: number
  simple_id: string
  status_id: string
  title: string
  description: string | null
  priority: 'urgent' | 'high' | 'medium' | 'low' | null
  target_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─── API methods ──────────────────────────────────────────────────────────────

export async function getOrganizations(): Promise<VkOrganization[]> {
  const data = await vkFetch<{ organizations: VkOrganization[] }>('/organizations')
  return data.organizations
}

export async function getProjects(organizationId: string): Promise<VkProject[]> {
  const data = await vkFetch<{ projects: VkProject[] }>(
    `/projects?organization_id=${organizationId}`,
  )
  return data.projects
}

export async function getProjectStatuses(projectId: string): Promise<VkProjectStatus[]> {
  const data = await vkFetch<{ project_statuses: VkProjectStatus[] }>(
    `/project_statuses?project_id=${projectId}`,
  )
  return data.project_statuses
}

export async function getIssues(projectId: string): Promise<VkIssue[]> {
  const data = await vkFetch<{ issues: VkIssue[] }>(`/issues?project_id=${projectId}`)
  return data.issues
}

export async function createIssue(body: {
  project_id: string
  status_id: string
  title: string
  description?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  sort_order?: number
}): Promise<VkIssue> {
  return vkFetch<VkIssue>('/issues', {
    method: 'POST',
    body: JSON.stringify({ sort_order: 0, extension_metadata: {}, ...body }),
  })
}

export async function updateIssue(
  issueId: string,
  body: {
    status_id?: string
    title?: string
    description?: string | null
    priority?: 'urgent' | 'high' | 'medium' | 'low' | null
  },
): Promise<VkIssue> {
  return vkFetch<VkIssue>(`/issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
