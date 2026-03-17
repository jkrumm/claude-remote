# Skill: /notify

Send a push notification via NTFY through the claude-remote-api.

---

## Usage

```bash
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "<message>", "title": "<title>", "priority": 3}'
```

**Fields:**
- `message` (required) — notification body
- `title` (optional) — defaults to "ClaudeRemote"
- `priority` (optional) — 1 (min) to 5 (urgent), default 3

---

## When to notify

- **Task complete**: after finishing a significant piece of work
- **PR created**: include the PR URL in the message
- **Agent run done**: include success/failure and a brief summary
- **Blocking error**: when you need the user's attention to proceed

## Priority guidelines

| Priority | When |
|-|-|
| 1–2 | Informational (task done, low urgency) |
| 3 | Default — most completions |
| 4 | PR needs review, test failure |
| 5 | Urgent error, requires immediate attention |

## Examples

```bash
# Task complete
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Refactor complete. PR #17 ready for review.", "title": "basalt-ui"}'

# Error requiring attention
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Build failed in basalt-ui — tsc errors in Button.tsx", "title": "CI", "priority": 4}'
```
