/**
 * Vibe Kanban API client.
 *
 * Auth: forges short-lived HS256 JWTs directly using the shared JWT secret +
 * a permanent service session pre-inserted in the vibe-kanban Postgres DB.
 * No refresh token rotation, no browser session dependency.
 *
 * Required env:
 *   VIBEKANBAN_BASE_URL         — internal Docker URL (http://vibekanban:8081)
 *   VIBEKANBAN_JWT_SECRET       — base64-encoded HS256 secret (same as vibe-kanban's)
 *   VIBEKANBAN_SERVICE_USER_ID  — UUID of the user row in the remote DB
 *   VIBEKANBAN_SERVICE_SESSION_ID — UUID of the permanent auth_sessions row
 */

import { createHmac } from 'crypto'

const BASE_URL = process.env.VIBEKANBAN_BASE_URL ?? 'http://vibekanban:8081'
const JWT_SECRET = process.env.VIBEKANBAN_JWT_SECRET ?? ''
const SERVICE_USER_ID = process.env.VIBEKANBAN_SERVICE_USER_ID ?? ''
const SERVICE_SESSION_ID = process.env.VIBEKANBAN_SERVICE_SESSION_ID ?? ''

// ─── JWT forging ──────────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function forgeAccessToken(): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        sub: SERVICE_USER_ID,
        session_id: SERVICE_SESSION_ID,
        iat: now,
        exp: now + 110, // 110s — server TTL is 120s with 60s leeway, keep well within
        aud: 'access',
      }),
    ),
  )
  const input = `${header}.${payload}`
  // Secret is base64-encoded per vibe-kanban's EncodingKey::from_base64_secret
  const secretBytes = Buffer.from(JWT_SECRET, 'base64')
  const sig = b64url(createHmac('sha256', secretBytes).update(input).digest())
  return `${input}.${sig}`
}

// Cache the token in memory — reuse until 10s before expiry
let cachedToken: string | null = null
let cachedTokenExpiresAt = 0

function getAccessToken(): string {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken
  cachedToken = forgeAccessToken()
  cachedTokenExpiresAt = Date.now() + 100_000 // refresh after 100s
  return cachedToken
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function vkFetch<T>(urlPath: string, options?: RequestInit): Promise<T> {
  if (!JWT_SECRET || !SERVICE_USER_ID || !SERVICE_SESSION_ID) {
    throw new Error('Vibe Kanban service credentials not configured')
  }
  const token = getAccessToken()
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
