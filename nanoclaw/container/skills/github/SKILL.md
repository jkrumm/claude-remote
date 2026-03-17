---
name: github
description: Query GitHub — list repos, check notifications, view open PRs and issues, get recent activity. Calls the GitHub API via the claude-remote-api passthrough proxy (PAT is injected server-side). Use when the user asks about GitHub repos, PRs, issues, notifications, or code activity.
allowed-tools: Bash(curl:*)
---

# GitHub API via Proxy

The `claude-remote-api` provides a transparent proxy at `/github/api/*` that injects a GitHub PAT with `repo` and `notifications` scopes. Construct any GitHub REST API path and call it — no token needed in the request.

Base URL: `$CLAUDE_REMOTE_API_URL/github/api`
Auth: `Authorization: Bearer $CLAUDE_REMOTE_API_SECRET` (to the proxy, not GitHub)

## Common queries

### Authenticated user's repos
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/github/api/user/repos?per_page=30&sort=updated"
```

### Unread notifications
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/github/api/notifications"
```

### Recent activity (events)
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/github/api/users/jkrumm/events?per_page=20"
```

### Open PRs on a repo
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm/REPO/pulls?state=open"
```

### Open issues on a repo
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm/REPO/issues?state=open"
```

### Repo details
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm/REPO"
```

## Notes

- The proxy forwards all HTTP methods (GET, POST, PATCH, DELETE) — you can create/update resources too
- GitHub API docs: https://docs.github.com/en/rest
- Query strings are forwarded as-is (pagination, filters, etc.)
- Responses are raw GitHub API JSON
