# Skill: /api-bridge — claude-remote-api

The claude-remote-api runs at `http://localhost:4000`. All `/api/*` routes require a Bearer token (`CLAUDE_REMOTE_API_SECRET`). Use curl to interact.

---

## Endpoints

### Health (no auth required)

```bash
curl -s http://localhost:4000/health | jq
```

### TickTick tasks

```bash
# List projects
curl -s http://localhost:4000/api/ticktick/projects \
  -H "Authorization: Bearer <CLAUDE_REMOTE_API_SECRET>" | jq

# Create a task
curl -s -X POST http://localhost:4000/api/ticktick/task \
  -H "Authorization: Bearer <CLAUDE_REMOTE_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Review PR #42", "dueDate": "2026-03-20"}'

# Complete a task
curl -s -X POST http://localhost:4000/api/ticktick/project/<projectId>/task/<taskId>/complete \
  -H "Authorization: Bearer <CLAUDE_REMOTE_API_SECRET>"
```

### Notifications (NTFY)

```bash
curl -s -X POST http://localhost:4000/api/notify \
  -H "Authorization: Bearer <CLAUDE_REMOTE_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Tests passed", "title": "CI", "priority": 3}'
```

`priority`: 1 (min) – 5 (urgent), default 3. `title` is optional.

---

## Get the secret

```bash
doppler secrets get CLAUDE_REMOTE_API_SECRET --project claude-remote --config prod --plain
```

---

## When to use

| Skill | Use case |
|-|-|
| `/notify` | Quick notification — prefer this over raw curl |
| `/trigger-agent` | Start a headless agent via Vibekanban |
| `/api-bridge` | Everything else: TickTick, health checks |
