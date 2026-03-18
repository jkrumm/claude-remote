import { Elysia, t } from 'elysia'
import * as vk from '../clients/vibekanban.js'

const detail = (summary: string, description: string) => ({
  tags: ['Vibe Kanban'],
  summary,
  description,
  security: [{ BearerAuth: [] }],
})

export const vibeKanbanRoutes = new Elysia({ prefix: '/vibekanban' })
  .get('/organizations', async () => vk.getOrganizations(), {
    detail: detail(
      'List organizations',
      'Returns all organizations the authenticated user belongs to. Each has id, name, slug, is_personal, issue_prefix.',
    ),
  })

  .get(
    '/projects',
    async ({ query }) => vk.getProjects(query.organization_id),
    {
      query: t.Object({ organization_id: t.String({ description: 'Organization UUID' }) }),
      detail: detail('List projects', 'Returns all projects/boards in the given organization.'),
    },
  )

  .get(
    '/project-statuses',
    async ({ query }) => vk.getProjectStatuses(query.project_id),
    {
      query: t.Object({ project_id: t.String({ description: 'Project UUID' }) }),
      detail: detail(
        'List project statuses',
        'Returns the status columns for a project (e.g. Todo, In Progress, Done). Use status IDs when creating or moving issues.',
      ),
    },
  )

  .get(
    '/issues',
    async ({ query }) => vk.getIssues(query.project_id),
    {
      query: t.Object({ project_id: t.String({ description: 'Project UUID' }) }),
      detail: detail(
        'List issues',
        'Returns all issues in a project. Each issue has id, simple_id, title, status_id, priority, target_date, completed_at. Issues with completed_at set are done.',
      ),
    },
  )

  .post(
    '/issues',
    async ({ body }) => vk.createIssue(body),
    {
      body: t.Object({
        project_id: t.String(),
        status_id: t.String({
          description: 'Status column ID — fetch from GET /vibekanban/project-statuses first',
        }),
        title: t.String(),
        description: t.Optional(t.String()),
        priority: t.Optional(
          t.Union([
            t.Literal('urgent'),
            t.Literal('high'),
            t.Literal('medium'),
            t.Literal('low'),
          ]),
        ),
        sort_order: t.Optional(t.Number()),
      }),
      detail: detail(
        'Create issue',
        'Creates a new issue on the board. Use sparingly — prefer TickTick for personal todos and NTFY for notifications. Only create board issues for meaningful tracked work items.',
      ),
    },
  )

  .patch(
    '/issues/:id',
    async ({ params, body }) => vk.updateIssue(params.id, body),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        status_id: t.Optional(
          t.String({ description: 'Move issue to a different status column' }),
        ),
        title: t.Optional(t.String()),
        description: t.Optional(t.Nullable(t.String())),
        priority: t.Optional(
          t.Nullable(
            t.Union([
              t.Literal('urgent'),
              t.Literal('high'),
              t.Literal('medium'),
              t.Literal('low'),
            ]),
          ),
        ),
      }),
      detail: detail(
        'Update issue',
        'Updates an issue — move between status columns, change title, description, or priority.',
      ),
    },
  )
