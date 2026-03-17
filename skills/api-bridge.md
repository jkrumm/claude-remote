# Skill: /api-bridge — claude-remote-api

The claude-remote-api runs at `http://localhost:4000`. No authentication needed (internal only). Use curl to interact.

---

## Endpoints

### Health

```bash
curl -s http://localhost:4000/health | jq
```

### TickTick tasks

```bash
# List tasks
curl -s http://localhost:4000/api/ticktick/tasks | jq

# Create a task
curl -s -X POST http://localhost:4000/api/ticktick/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Review PR #42", "dueDate": "2026-03-20"}'

# Complete a task
curl -s -X PATCH http://localhost:4000/api/ticktick/tasks/<id>/complete
```

### Notifications (NTFY)

```bash
# Send push notification
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Tests passed", "title": "CI", "priority": 3}'
```

`priority`: 1 (min) – 5 (urgent), default 3. `title` is optional.

### Headless agents

```bash
# Trigger a headless agent run
curl -s -X POST http://localhost:4000/api/agents/trigger \
  -H "Content-Type: application/json" \
  -d '{"repo": "basalt-ui", "prompt": "Fix failing unit tests", "worktree": true}'

# Check run status
curl -s http://localhost:4000/api/agents/status/<id> | jq
```

`worktree: true` — always set for headless runs to avoid conflicts with active tmux sessions.

### Webhooks

```bash
# Receive webhook from external tool (Sentry, Uptime Kuma, etc.)
POST /api/webhooks/generic
Body: { "source": "sentry", "event": "error", "details": { ... } }
```

The API maps the webhook payload to a repo + prompt and triggers a headless agent.

---

## When to use

| Skill | Use case |
|-|-|
| `/notify` | Quick notification — prefer this over raw curl |
| `/trigger-agent` | Start a headless agent — prefer this |
| `/api-bridge` | Everything else: TickTick, health checks, webhook testing |
